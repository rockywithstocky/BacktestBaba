import asyncio
import hashlib
import logging
import time

import pandas as pd
from datetime import datetime, timedelta
from typing import List, Dict, Optional

from .data_provider import DataProvider
from .symbol_resolver import SymbolResolver
from ..utils.date_utils import parse_date, get_next_trading_day, get_future_trading_day
from ..models.schemas import SignalResult, BacktestReport
from ..config import Limits
from ..persistence import PersistenceBackend

logger = logging.getLogger(__name__)

_METADATA_KEYS = {
    'sector': ('sector', 'industry', 'sector_name'),
    'marketCap': ('marketcap', 'market_cap', 'marketcapname', 'market cap', 'mktcap'),
}


def _extract_csv_metadata(signal: dict) -> dict:
    """Extract sector and marketCap from CSV columns if present.
    Returns dict with keys 'sector' and 'marketCap' (None if not found).
    """
    result = {"sector": None, "marketCap": None}
    for target_key, candidates in _METADATA_KEYS.items():
        for c in candidates:
            val = signal.get(c) or signal.get(c.title()) or signal.get(c.upper())
            if val is not None and str(val).strip():
                result[target_key] = str(val).strip()
                break
    return result


class Backtester:
    @staticmethod
    async def run_backtest_async(
        signals: List[Dict[str, str]],
        progress_callback=None,
        duration: int = 90,
        entry_mode: str = "next_close",
        run_id: Optional[str] = None,
        job_store=None,
        persistence_backend: Optional[PersistenceBackend] = None,
    ) -> BacktestReport:
        results: List[SignalResult] = []
        total = len(signals)
        duration = min(max(duration, 7), 180)

        # Progress spans Phase A (resolution) and Phase C (computation)
        total_steps = total * 2

        if progress_callback:
            await progress_callback(0, total_steps, "Initializing...")

        phase_start = time.monotonic()
        logger.info("Phase A — Resolving %d signals (duration=%d, entry_mode=%s)", total, duration, entry_mode)

        # ── Phase A: Resolution & Bounds Calculation ──────────────────────
        # Pass 1: collect unique raw symbols for batch resolution
        unique_raw = []
        seen_raw = set()
        for signal in signals:
            raw = (signal.get("symbol") or signal.get("Symbol") or "").strip().upper()
            if raw and raw not in seen_raw:
                seen_raw.add(raw)
                unique_raw.append(raw)

        if progress_callback:
            await progress_callback(1, total_steps, f"Batch resolving {len(unique_raw)} symbols...")

        resolved_map = {}
        for batch_i in range(0, len(unique_raw), Limits.BATCH_RESOLVE_CHUNK):
            batch = unique_raw[batch_i:batch_i + Limits.BATCH_RESOLVE_CHUNK]
            chunk_result = await asyncio.wait_for(asyncio.to_thread(SymbolResolver.batch_resolve, batch), timeout=30)
            resolved_map.update(chunk_result)
            if progress_callback:
                await progress_callback(
                    1, total_steps,
                    f"Batch resolving {len(resolved_map)}/{len(unique_raw)} symbols..."
                )

        # Pass 2: process each signal with pre-resolved symbols
        parsed_signals = []
        unique_resolved_symbols = []
        seen_symbols = set()
        global_start = None
        global_end = None

        for i, signal in enumerate(signals):
            raw_symbol = signal.get("symbol") or signal.get("Symbol")
            date_str = signal.get("date") or signal.get("Date")

            if progress_callback and (i % Limits.PROGRESS_THROTTLE_EVERY_N == 0 or i == len(signals) - 1):
                await progress_callback(i + 1, total_steps, f"Processing: {raw_symbol}")

            if not raw_symbol or not date_str:
                parsed_signals.append({"status": "Invalid Input", "raw": str(raw_symbol), "date": str(date_str)})
                continue

            key = raw_symbol.strip().upper()
            resolved_symbol = resolved_map.get(key)
            if not resolved_symbol:
                parsed_signals.append({"status": "Symbol Not Found", "raw": raw_symbol, "date": date_str})
                continue

            try:
                signal_date = parse_date(date_str)
            except ValueError:
                parsed_signals.append({"status": "Invalid Date", "raw": resolved_symbol, "date": date_str})
                continue

            start_date = signal_date
            end_date = signal_date + timedelta(days=duration + 10)

            if global_start is None or start_date < global_start:
                global_start = start_date
            if global_end is None or end_date > global_end:
                global_end = end_date

            csv_meta = _extract_csv_metadata(signal)

            parsed_signals.append({
                "status": "Valid",
                "raw": raw_symbol,
                "resolved": resolved_symbol,
                "date_str": date_str,
                "signal_date": signal_date,
                "start_date": start_date,
                "end_date": end_date,
                "csv_metadata": csv_meta,
            })

            if resolved_symbol not in seen_symbols:
                seen_symbols.add(resolved_symbol)
                unique_resolved_symbols.append(resolved_symbol)

        phase_a_time = time.monotonic() - phase_start
        valid_count = sum(1 for p in parsed_signals if p["status"] == "Valid")
        invalid_by_status = {}
        for p in parsed_signals:
            s = p["status"]
            if s != "Valid":
                invalid_by_status[s] = invalid_by_status.get(s, 0) + 1
        status_summary = ", ".join(f"{k}={v}" for k, v in sorted(invalid_by_status.items())) if invalid_by_status else "none"
        logger.info(
            "Phase A completed — total=%d, valid=%d, unique_symbols=%d, invalid=[%s], elapsed=%.2fs",
            total, valid_count, len(unique_resolved_symbols), status_summary, phase_a_time
        )

        # Recalculate total_steps to include Phase B chunks
        chunk_size = Limits.BULK_FETCH_CHUNK
        num_chunks = (len(unique_resolved_symbols) + chunk_size - 1) // chunk_size if unique_resolved_symbols else 0
        total_steps = total + num_chunks + total

        # --- Phase B: Bulk Fetching & Enrichment ---
        total_chunks = 0
        chunks_with_data = 0

        if unique_resolved_symbols and global_start and global_end:
            logger.info("Phase B — Chunked fetch for %d unique symbols from %s to %s (chunk_size=%d)",
                        len(unique_resolved_symbols),
                        global_start.strftime("%Y-%m-%d"),
                        global_end.strftime("%Y-%m-%d"),
                        Limits.BULK_FETCH_CHUNK)

            chunk_size = Limits.BULK_FETCH_CHUNK
            syms = unique_resolved_symbols
            chunks = [syms[i:i + chunk_size] for i in range(0, len(syms), chunk_size)]
            total_chunks = len(chunks)

            if progress_callback:
                await progress_callback(total, total_steps, f"Fetching data in {total_chunks} batches...")

            for chunk_idx, chunk in enumerate(chunks):
                if progress_callback:
                    await progress_callback(
                        total + chunk_idx + 1, total_steps,
                        f"Fetching batch {chunk_idx + 1}/{total_chunks} ({len(chunk)} symbols)..."
                    )

                chunk_df = await asyncio.wait_for(asyncio.to_thread(
                    DataProvider.get_bulk_ticker_data,
                    chunk,
                    global_start.strftime("%Y-%m-%d"),
                    global_end.strftime("%Y-%m-%d")
                ), timeout=60)

                if chunk_df is not None and not chunk_df.empty:
                    chunks_with_data += 1
                    for sym in chunk:
                        try:
                            if isinstance(chunk_df.columns, pd.MultiIndex):
                                if sym in chunk_df.columns.get_level_values(0):
                                    slice_df = chunk_df[sym].dropna(how='all')
                                    if not slice_df.empty:
                                        DataProvider.persist_symbol_data(sym, slice_df)
                                else:
                                    logger.debug("Phase B chunk %d — %s not in data, skipping cache",
                                                 chunk_idx + 1, sym)
                            else:
                                DataProvider.persist_symbol_data(sym, chunk_df.copy())
                        except Exception:
                            logger.debug("Phase B chunk %d — Failed to cache slice for %s",
                                         chunk_idx + 1, sym, exc_info=True)

                del chunk_df

        phase_b_time = time.monotonic() - phase_start
        logger.info("Phase B — Chunked fetch completed (%d/%d chunks with data), elapsed=%.2fs",
                    chunks_with_data, total_chunks, phase_b_time)

        # Build metadata from CSV first, then fetch missing from API
        metadata_map = {}
        csv_meta_symbols = set()
        for p in parsed_signals:
            if p["status"] == "Valid":
                sym = p["resolved"]
                csv_m = p.get("csv_metadata", {})
                if csv_m and (csv_m.get("sector") or csv_m.get("marketCap")):
                    if sym not in metadata_map:
                        metadata_map[sym] = csv_m
                        csv_meta_symbols.add(sym)

        symbols_needing_api = [s for s in unique_resolved_symbols if s not in csv_meta_symbols]

        if symbols_needing_api:
            if progress_callback:
                await progress_callback(total, total_steps,
                                        f"Fetching metadata for {len(symbols_needing_api)} symbols...")

            logger.info("Phase B — Enriching metadata for %d symbols (CSV provided %d, API needed %d)",
                        len(unique_resolved_symbols), len(csv_meta_symbols), len(symbols_needing_api))
            sem = asyncio.Semaphore(Limits.MAX_CONCURRENCY_METADATA)

            async def fetch_meta(sym):
                async with sem:
                    try:
                        result = await asyncio.wait_for(
                            asyncio.to_thread(DataProvider.get_ticker_info, sym),
                            timeout=10
                        )
                        return sym, result
                    except asyncio.TimeoutError:
                        logger.warning("Metadata timeout for %s", sym)
                        return sym, {"sector": None, "marketCap": None}

            meta_results = await asyncio.gather(*(fetch_meta(s) for s in symbols_needing_api))
            for sym, meta in meta_results:
                if sym not in metadata_map:
                    metadata_map[sym] = meta

        meta_time = time.monotonic() - phase_start
        api_count = len(symbols_needing_api)
        logger.info("Phase B — Metadata enrichment completed, %d symbols (%d from API), elapsed=%.2fs",
                    len(metadata_map), api_count, meta_time)

        # --- Phase C: Calculation Loop ---
        fallback_count = 0
        phase_c_start = time.monotonic()
        logger.info("Phase C — Computing returns for %d signals", len(parsed_signals))

        batch_num = 0
        batch_results = []

        # Online single-pass aggregation accumulators
        horizons = [7, 14, 30, 45, 60, 90]
        agg = {h: {"sum": 0.0, "count": 0, "wins": 0} for h in horizons}
        best_performer = None
        worst_performer = None

        async def _flush_batch():
            nonlocal batch_num, batch_results, best_performer, worst_performer, num_chunks
            if not batch_results:
                return
            if job_store:
                dicts = [r.model_dump() for r in batch_results]
                job_store.save_batch(batch_num, dicts)
                batch_num += 1
            if progress_callback:
                await progress_callback(total + num_chunks + batch_num - 1, total_steps,
                                        f"Batch {batch_num}: {len(batch_results)} trades",
                                        trades=[r.model_dump() for r in batch_results])
            batch_results = []

        for i, p_sig in enumerate(parsed_signals):
            if progress_callback and (i % Limits.PROGRESS_THROTTLE_EVERY_N == 0 or i == len(parsed_signals) - 1):
                await progress_callback(total + num_chunks + i + 1, total_steps,
                                        f"Computing: {p_sig.get('raw') or 'Unknown'}")

            if p_sig["status"] != "Valid":
                # Normalize date to YYYY-MM-DD for failed signals too
                raw_date = p_sig.get("date", "Unknown")
                try:
                    normalized_date = parse_date(raw_date).strftime("%Y-%m-%d") if raw_date != "Unknown" else raw_date
                except (ValueError, AttributeError):
                    normalized_date = raw_date
                results.append(SignalResult(
                    symbol=p_sig.get("raw", "Unknown"),
                    signal_date=normalized_date,
                    entry_price=0.0,
                    status=p_sig["status"]
                ))
                continue
                
            resolved_symbol = p_sig["resolved"]
            signal_date = p_sig["signal_date"]
            date_str = p_sig["date_str"]

            # ── Row-hash cache: skip yfinance + computation if this signal was already computed ──
            row_hash_input = f"{resolved_symbol}|{date_str}|{entry_mode}|{duration}"
            row_hash = hashlib.sha256(row_hash_input.encode()).hexdigest()
            cached_result = DataProvider.get_cached_result(row_hash)
            horizons = sorted(list(set([7, 14, 30, 45, 60, 90, duration])))
            horizon_deltas = {h: timedelta(days=h) for h in horizons}
            duration_delta = timedelta(days=duration)

            if cached_result is not None:
                res = SignalResult(**cached_result)
                logger.debug("Row-hash HIT for %s (%s)", resolved_symbol, date_str)
            else:
                # Data path: Phase B populated per-symbol cache via persist_symbol_data().
                # get_ticker_data() checks this cache first (0 API cost on cache hit),
                # falls back to yfinance API only if cache miss or insufficient range.
                df = await asyncio.wait_for(asyncio.to_thread(
                    DataProvider.get_ticker_data,
                    resolved_symbol,
                    p_sig["start_date"].strftime("%Y-%m-%d"),
                    p_sig["end_date"].strftime("%Y-%m-%d")
                ), timeout=30)

                if df is None or df.empty:
                    results.append(SignalResult(
                        symbol=resolved_symbol,
                        signal_date=signal_date.strftime("%Y-%m-%d"),
                        entry_price=0.0,
                        status="No Data"
                    ))
                    continue

                if persistence_backend is not None:
                    try:
                        last_date = df.index[-1]
                        if hasattr(last_date, 'strftime'):
                            data_recency = last_date.strftime("%Y-%m-%d")
                        else:
                            data_recency = str(last_date)
                        await persistence_backend.upsert_symbol_freshness(
                            symbol=resolved_symbol,
                            last_fetched=datetime.now().strftime("%Y-%m-%d"),
                            data_recency=data_recency
                        )
                    except Exception as e:
                        logger.warning("upsert_symbol_freshness failed for %s: %s", resolved_symbol, e)

                # 4. Calculate Returns
                # Ensure index is datetime
                df.index = pd.to_datetime(df.index).tz_localize(None)

                # Signal Close Price (nearest trading day to signal_date)
                signal_trading_day = get_next_trading_day(signal_date, df)
                signal_close_price = (df.loc[signal_trading_day]["Close"]
                                      if signal_trading_day is not None
                                      else None)

                # Entry Date (always NEXT trading day after signal_date)
                entry_date = get_future_trading_day(signal_date, df)
                if not entry_date:
                     results.append(SignalResult(
                        symbol=resolved_symbol,
                        signal_date=signal_date.strftime("%Y-%m-%d"),
                        entry_price=0.0,
                        entry_mode=entry_mode,
                        status="No Entry Data"
                    ))
                     continue

                # Entry Price (mode-dependent)
                if entry_mode == "next_open":
                    entry_price = df.loc[entry_date]["Open"]
                else:
                    entry_price = df.loc[entry_date]["Close"]

                normalized_signal_date = signal_date.strftime("%Y-%m-%d")
                res = SignalResult(
                    symbol=resolved_symbol,
                    signal_date=normalized_signal_date,
                    signal_close_price=round(signal_close_price, 2) if signal_close_price is not None else None,
                    entry_date=entry_date.strftime("%Y-%m-%d"),
                    entry_price=round(entry_price, 2),
                    entry_mode=entry_mode,
                    sector=metadata_map.get(resolved_symbol, {}).get("sector"),
                    market_cap=str(metadata_map.get(resolved_symbol, {}).get("marketCap")) if metadata_map.get(resolved_symbol, {}).get("marketCap") is not None else None,
                    status="Success"
                )

                # Calculate forward returns dynamically
                for h in horizons:
                    if h > duration: continue

                    target_date = entry_date + horizon_deltas[h]
                    exit_date = get_next_trading_day(target_date, df)

                    if exit_date:
                        exit_price = df.loc[exit_date]["Close"]
                        if pd.notna(exit_price) and pd.notna(entry_price) and entry_price != 0:
                            ret = ((exit_price - entry_price) / entry_price) * 100

                            if h in horizons:
                                setattr(res, f"return_{h}d", round(ret, 2))
                                setattr(res, f"exit_price_{h}d", round(exit_price, 2))
                                agg[h]["sum"] += round(ret, 2)
                                agg[h]["count"] += 1
                                if ret > 0:
                                    agg[h]["wins"] += 1

                # Max High/Low in Duration
                window_end = entry_date + duration_delta
                window_df = df[entry_date:window_end]

                if not window_df.empty:
                    max_high = window_df["High"].max()
                    max_low = window_df["Low"].min()
                    if pd.notna(max_high):
                        res.max_high_90d = round(max_high, 2)
                        max_high_idx = window_df["High"].idxmax()
                        if pd.notna(max_high_idx):
                            res.max_high_date = max_high_idx.strftime("%Y-%m-%d")
                    if pd.notna(max_low):
                        res.max_low_90d = round(max_low, 2)
                        max_low_idx = window_df["Low"].idxmin()
                        if pd.notna(max_low_idx):
                            res.max_low_date = max_low_idx.strftime("%Y-%m-%d")

                DataProvider.set_cached_result(row_hash, res.model_dump())

            # Aggregation for cached results (computed results already updated above)
            if cached_result is not None:
                for h in horizons:
                    ret = getattr(res, f"return_{h}d", None)
                    if ret is not None:
                        agg[h]["sum"] += ret
                        agg[h]["count"] += 1
                        if ret > 0:
                            agg[h]["wins"] += 1

            # Online best/worst tracking (shared: both cached and computed)
            ret_90 = res.return_90d
            if ret_90 is not None:
                if best_performer is None or ret_90 > getattr(best_performer, "return_90d", -999):
                    best_performer = res
                if worst_performer is None or ret_90 < getattr(worst_performer, "return_90d", 999):
                    worst_performer = res

            results.append(res)
            batch_results.append(res)
            if len(batch_results) >= Limits.BATCH_SIZE:
                await _flush_batch()

        await _flush_batch()
        phase_c_time = time.monotonic() - phase_c_start
        logger.info("Phase C completed — %d signals computed, %d fallbacks, elapsed=%.2fs",
                    len(parsed_signals), fallback_count, phase_c_time)

        # 5. Aggregate Report (single-pass aggregation)
        successful = [r for r in results if r.status == "Success"]

        report = BacktestReport(
            total_signals=len(signals),
            successful_signals=len(successful),
            failed_signals=len(signals) - len(successful),
            entry_mode=entry_mode,
            trades=results
        )

        if successful:
            for h in horizons:
                a = agg[h]
                if a["count"] > 0:
                    setattr(report, f"avg_return_{h}d", round(a["sum"] / a["count"], 2))
                    setattr(report, f"win_rate_{h}d", round((a["wins"] / a["count"]) * 100, 2))

            report.best_performer = best_performer
            report.worst_performer = worst_performer

        total_time = time.monotonic() - phase_start
        status_counts = {}
        for r in results:
            status_counts[r.status] = status_counts.get(r.status, 0) + 1
        status_summary = ", ".join(f"{k}={v}" for k, v in sorted(status_counts.items()))
        logger.info(
            "Backtest complete — total=%d, successful=%d, failed=%d, elapsed=%.2fs | %s",
            total, len(successful), total - len(successful), total_time, status_summary
        )

        report.cache_stats = DataProvider.get_cache_stats()
        report.cache_source = "l3_compute"

        # ── Latest Price Integration ──────────────────────────────
        if successful:
            try:
                all_symbols = list(set(r.symbol for r in successful))
                latest_prices = await asyncio.to_thread(DataProvider.get_latest_prices_batch, all_symbols)
                latest_dates = []
                for r in results:
                    if r.status == "Success" and r.symbol in latest_prices:
                        price, date_str = latest_prices[r.symbol]
                        r.latest_price = price
                        r.latest_price_date = date_str
                        if price is not None and date_str is not None:
                            latest_dates.append(date_str)
                            if r.entry_price and r.entry_price > 0:
                                r.latest_price_return = round(((price - r.entry_price) / r.entry_price) * 100, 2)
                                logger.debug(
                                    "[DIAG] latest_price_return for %s: price=%s, entry_price=%s, return=%s",
                                    r.symbol, price, r.entry_price, r.latest_price_return
                                )
                            else:
                                r.latest_price_return = None
                                logger.debug(
                                    "[DIAG] latest_price_return SKIPPED for %s: entry_price=%s (type=%s)",
                                    r.symbol, r.entry_price, type(r.entry_price).__name__
                                )
                if latest_dates:
                    report.latest_price_date = max(latest_dates)
            except Exception:
                logger.exception("Latest price integration failed (non-blocking)")

        return report







