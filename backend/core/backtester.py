import asyncio
import pandas as pd
from datetime import datetime, timedelta
from typing import List, Dict
from .data_provider import DataProvider
from .symbol_resolver import SymbolResolver
from ..utils.date_utils import parse_date, get_next_trading_day, get_future_trading_day
from ..models.schemas import SignalResult, BacktestReport

class Backtester:
    @staticmethod
    async def run_backtest_async(signals: List[Dict[str, str]], progress_callback=None, duration: int = 90, entry_mode: str = "next_close") -> BacktestReport:
        results: List[SignalResult] = []
        total = len(signals)
        duration = min(max(duration, 7), 180)
        
        # --- Phase A: Resolution & Bounds Calculation ---
        parsed_signals = [] 
        unique_resolved_symbols = [] # Deterministic ordering
        seen_symbols = set()
        
        global_start = None
        global_end = None
        
        # Progress spans Phase A (resolution) and Phase C (computation)
        total_steps = total * 2
        
        # If progress callback exists, notify we are resolving
        if progress_callback:
            await progress_callback(0, total_steps, "Initializing...")
            
        for i, signal in enumerate(signals):
            raw_symbol = signal.get("symbol") or signal.get("Symbol")
            date_str = signal.get("date") or signal.get("Date")
            
            if progress_callback:
                # Phase A takes up the first half of the progress bar
                await progress_callback(i + 1, total_steps, f"Resolving: {raw_symbol}")
                
            if not raw_symbol or not date_str:
                parsed_signals.append({"status": "Invalid Input", "raw": str(raw_symbol), "date": str(date_str)})
                continue
                
            resolved_symbol = await asyncio.to_thread(SymbolResolver.resolve, raw_symbol)
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
                
            parsed_signals.append({
                "status": "Valid",
                "raw": raw_symbol,
                "resolved": resolved_symbol,
                "date_str": date_str,
                "signal_date": signal_date,
                "start_date": start_date,
                "end_date": end_date
            })
            
            if resolved_symbol not in seen_symbols:
                seen_symbols.add(resolved_symbol)
                unique_resolved_symbols.append(resolved_symbol)

        # --- Phase B: Bulk Fetching & Enrichment ---
        bulk_df = None
        if progress_callback:
            await progress_callback(total, total_steps, "Fetching historical data...")
            
        if unique_resolved_symbols and global_start and global_end:
            print(f"[BATCH] Fetching {len(unique_resolved_symbols)} unique symbols from {global_start.strftime('%Y-%m-%d')} to {global_end.strftime('%Y-%m-%d')}...")
            # We fetch everything in one go. If list is massive (>100), yfinance chunks internally anyway.
            bulk_df = await asyncio.to_thread(
                DataProvider.get_bulk_ticker_data,
                unique_resolved_symbols,
                global_start.strftime("%Y-%m-%d"),
                global_end.strftime("%Y-%m-%d")
            )
            
        metadata_map = {}
        if unique_resolved_symbols:
            if progress_callback:
                await progress_callback(total, total_steps, "Enriching metadata...")
                
            print(f"[ENRICHMENT] Fetching metadata for {len(unique_resolved_symbols)} symbols...")
            sem = asyncio.Semaphore(10)
            
            async def fetch_meta(sym):
                async with sem:
                    return sym, await asyncio.to_thread(DataProvider.get_ticker_info, sym)
                    
            meta_results = await asyncio.gather(*(fetch_meta(s) for s in unique_resolved_symbols))
            metadata_map = dict(meta_results)
            
        # --- Phase C: Calculation Loop ---
        fallback_count = 0
        
        for i, p_sig in enumerate(parsed_signals):
            if progress_callback:
                # Phase C takes the second half of the progress bar
                await progress_callback(total + i + 1, total_steps, f"Computing: {p_sig.get('raw') or 'Unknown'}")

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
            
            df = None
            
            # Slicing Logic
            # yf.download(group_by='ticker') always returns MultiIndex, even for 1 symbol
            if bulk_df is not None and not bulk_df.empty:
                try:
                    if isinstance(bulk_df.columns, pd.MultiIndex):
                        if resolved_symbol in bulk_df.columns.get_level_values(0):
                            df = bulk_df[resolved_symbol].dropna(how='all')
                        else:
                            print(f"[SLICE MISS] {resolved_symbol} not found in bulk_df columns")
                    else:
                        # Flat index fallback (shouldn't happen with group_by='ticker')
                        print(f"[SLICE INFO] Flat index detected for {resolved_symbol}, using bulk_df directly")
                        df = bulk_df.copy()
                except Exception as e:
                    print(f"[SLICE ERROR] {resolved_symbol}: {e} | columns_type={type(bulk_df.columns).__name__}")
                    df = None
            
            # Fallback path (the old sequential logic)
            if df is None or df.empty:
                fallback_count += 1
                print(f"[FALLBACK] Triggered sequential fetch for {resolved_symbol}...")
                df = await asyncio.to_thread(
                    DataProvider.get_ticker_data,
                    resolved_symbol,
                    p_sig["start_date"].strftime("%Y-%m-%d"),
                    p_sig["end_date"].strftime("%Y-%m-%d")
                )
            
            if df is None or df.empty:
                results.append(SignalResult(
                    symbol=resolved_symbol,
                    signal_date=signal_date.strftime("%Y-%m-%d"),
                    entry_price=0.0,
                    status="No Data"
                ))
                continue
                
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
            # Standard horizons + custom duration if not present
            horizons = sorted(list(set([7, 14, 30, 45, 60, 90, duration])))
            
            for h in horizons:
                if h > duration: continue
                
                target_date = entry_date + timedelta(days=h)
                exit_date = get_next_trading_day(target_date, df)
                
                if exit_date:
                    exit_price = df.loc[exit_date]["Close"]
                    ret = ((exit_price - entry_price) / entry_price) * 100
                    
                    # Dynamically set attributes if they exist in schema, otherwise just add to a dict if we were using one
                    # For now, we stick to the fixed schema fields but ensure 'duration' specific logic is handled
                    # The schema supports 7d, 30d, 90d. If duration is custom (e.g. 60), we might need to add it to schema or just use it for chart limits.
                    # For this iteration, we will populate standard fields and ensure data is fetched up to 'duration'.
                    # The schema supports 7d, 14d, 30d, 45d, 60d, 90d.
                    
                    if h in [7, 14, 30, 45, 60, 90]:
                        setattr(res, f"return_{h}d", round(ret, 2))
                        setattr(res, f"exit_price_{h}d", round(exit_price, 2))
            
            # Max High/Low in Duration
            window_end = entry_date + timedelta(days=duration)
            window_df = df[entry_date:window_end]
            
            if not window_df.empty:
                res.max_high_90d = round(window_df["High"].max(), 2) # Reusing field name for max high in period
                res.max_low_90d = round(window_df["Low"].min(), 2)   # Reusing field name for max low in period
                
                # Find dates of max high and max low
                max_high_idx = window_df["High"].idxmax()
                max_low_idx = window_df["Low"].idxmin()
                res.max_high_date = max_high_idx.strftime("%Y-%m-%d")
                res.max_low_date = max_low_idx.strftime("%Y-%m-%d")
                
            results.append(res)
            
        # 5. Aggregate Report
        successful = [r for r in results if r.status == "Success"]
        
        report = BacktestReport(
            total_signals=len(signals),
            successful_signals=len(successful),
            failed_signals=len(signals) - len(successful),
            entry_mode=entry_mode,
            trades=results
        )
        
        if successful:
            # Helper to calc stats
            def calc_stats(horizon):
                rets = [getattr(r, f"return_{horizon}d") for r in successful if getattr(r, f"return_{horizon}d") is not None]
                if rets:
                    avg = round(sum(rets) / len(rets), 2)
                    win_rate = round((len([x for x in rets if x > 0]) / len(rets)) * 100, 2)
                    setattr(report, f"avg_return_{horizon}d", avg)
                    setattr(report, f"win_rate_{horizon}d", win_rate)

            calc_stats(7)
            calc_stats(14)
            calc_stats(30)
            calc_stats(45)
            calc_stats(60)
            calc_stats(90)
                
            # Best/Worst (based on 30d for now, or max gain)
            rets_30d = [r.return_30d for r in successful if r.return_30d is not None]
            if rets_30d:
                report.best_performer = max(successful, key=lambda x: x.return_30d if x.return_30d is not None else -999)
                report.worst_performer = min(successful, key=lambda x: x.return_30d if x.return_30d is not None else 999)

        return report
