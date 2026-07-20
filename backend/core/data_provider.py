import logging
import random
import time
from typing import Optional

import yfinance as yf
import pandas as pd
from diskcache import Cache
from datetime import datetime, timedelta

from ..config import Paths, CacheTTL, Limits

logger = logging.getLogger(__name__)

_RETRY_BASE_DELAY = 1.0

def _yf_retry(fn, *args, max_retries=3, **kwargs):
    for attempt in range(max_retries):
        try:
            return fn(*args, **kwargs)
        except Exception as e:
            if attempt == max_retries - 1:
                raise
            delay = _RETRY_BASE_DELAY * (2 ** attempt) + random.uniform(0, 0.5)
            logger.warning("yfinance call failed (attempt %d/%d): %s. Retrying in %.1fs...",
                          attempt + 1, max_retries, e, delay)
            time.sleep(delay)
    return None

cache = Cache(Paths.CACHE_DIR, size_limit=CacheTTL.DISKCACHE_SIZE_LIMIT_MB * 1024 * 1024)

CACHE_VERSION = "v1"

class DataProvider:
    _cache_stats = {"bulk_hits": 0, "row_hash_misses": 0}
    @staticmethod
    def _data_key(symbol: str) -> str:
        return f"sd_{CACHE_VERSION}_{symbol}"

    @staticmethod
    def _range_key(symbol: str) -> str:
        return f"sr_{CACHE_VERSION}_{symbol}"

    @staticmethod
    def persist_symbol_data(symbol: str, df: pd.DataFrame):
        """Cache per-symbol data with date range metadata.

        Called after bulk fetch to persist each symbol's slice.
        Skipped if existing cache already covers a wider range.
        """
        if df is None or df.empty:
            return
        # Normalize tz-aware index (from yfinance) to tz-naive for consistent comparison
        if df.index.tz is not None:
            df = df.copy()
            df.index = df.index.tz_localize(None)
        rkey = DataProvider._range_key(symbol)
        existing = cache.get(rkey)
        actual_start = df.index[0]
        actual_end = df.index[-1]

        # Seed latest_price cache if data ends within 3 trading days of now
        # (covers Friday→Monday gap, avoids yfinance timeout for every symbol)
        # Must run BEFORE early return so it fires even on range cache hits.
        # Uses last NON-NaN Close — yfinance may include non-trading days with NaN Close.
        days_since_last = (datetime.now() - actual_end).days
        if days_since_last <= 3:
            valid_closes = df['Close'].dropna()
            if not valid_closes.empty:
                last_close = valid_closes.iloc[-1]
                if last_close > 0:
                    last_valid_date = valid_closes.index[-1]
                    date_str = last_valid_date.strftime('%Y-%m-%d') if hasattr(last_valid_date, 'strftime') else str(last_valid_date)[:10]
                    cache.set(f"{symbol}_latest_price", (float(last_close), date_str),
                              expire=CacheTTL.LATEST_PRICE)

        if existing is not None:
            cached_start, cached_end = existing
            if hasattr(cached_start, 'tz') and cached_start.tz is not None:
                cached_start = cached_start.tz_localize(None)
            if hasattr(cached_end, 'tz') and cached_end.tz is not None:
                cached_end = cached_end.tz_localize(None)
            if cached_start <= actual_start and cached_end >= actual_end:
                return
        dkey = DataProvider._data_key(symbol)
        end_dt = actual_end if isinstance(actual_end, datetime) else pd.to_datetime(actual_end)
        if hasattr(end_dt, 'tz') and end_dt.tz is not None:
            end_dt = end_dt.tz_localize(None)
        is_recent = (datetime.now() - end_dt).days < CacheTTL.RECENT_CUTOFF_DAYS
        ttl = CacheTTL.TICKER_DATA_RECENT if is_recent else CacheTTL.TICKER_DATA_HISTORICAL
        cache.set(dkey, df, expire=ttl)
        cache.set(rkey, (actual_start, actual_end), expire=ttl)

        logger.debug("persist_symbol_data — cached %s [%s to %s] ttl=%ds",
                     symbol, actual_start.date(), actual_end.date(), ttl)

    @staticmethod
    def get_ticker_data(symbol: str, start_date: str, end_date: str) -> pd.DataFrame:
        """
        Fetches historical data for a symbol with range-aware caching.
        Checks per-symbol cache first; if cached range covers requested,
        returns a slice. Otherwise fetches full range and caches it.
        """
        # Legacy exact-range key (backward compat — versioned to avoid stale adjusted data)
        legacy_key = f"{symbol}_{start_date}_{end_date}_v{CACHE_VERSION}"
        if legacy_key in cache:
            return cache[legacy_key]

        # Per-symbol wide cache with range check
        rkey = DataProvider._range_key(symbol)
        range_meta = cache.get(rkey)
        if range_meta is not None:
            dkey = DataProvider._data_key(symbol)
            df_cached = cache.get(dkey)
            if df_cached is not None:
                cached_start, cached_end = range_meta
                if hasattr(cached_start, 'tz') and cached_start.tz is not None:
                    cached_start = cached_start.tz_localize(None)
                if hasattr(cached_end, 'tz') and cached_end.tz is not None:
                    cached_end = cached_end.tz_localize(None)
                req_start = pd.to_datetime(start_date)
                req_end = pd.to_datetime(end_date)
                if cached_start <= req_start and cached_end >= req_end:
                    logger.debug("get_ticker_data — cache HIT for %s (range %s to %s)",
                                 symbol, cached_start.date(), cached_end.date())
                    DataProvider._cache_stats["bulk_hits"] += 1
                    return df_cached.loc[str(req_start):str(req_end)]

        # Fetch from yfinance
        logger.debug("Fetching %s from yfinance", symbol)
        try:
            df = _yf_retry(lambda: yf.Ticker(symbol).history(start=start_date, end=end_date, auto_adjust=False))
        except Exception:
            logger.warning("get_ticker_data — yfinance failure for %s after retries", symbol, exc_info=True)
            return pd.DataFrame()

        if df.empty:
            return df

        # Normalize tz-aware index (from yfinance) to tz-naive before caching
        if df.index.tz is not None:
            df.index = df.index.tz_localize(None)

        # Cache with range metadata
        dkey = DataProvider._data_key(symbol)
        rkey = DataProvider._range_key(symbol)
        actual_start = df.index[0]
        actual_end = df.index[-1]
        cache.set(dkey, df)
        cache.set(rkey, (actual_start, actual_end))
        end_dt = end_date if isinstance(end_date, datetime) else pd.to_datetime(end_date)
        if hasattr(end_dt, 'tz') and end_dt.tz is not None:
            end_dt = end_dt.tz_localize(None)
        is_recent = (datetime.now() - end_dt).days < CacheTTL.RECENT_CUTOFF_DAYS
        ttl = CacheTTL.TICKER_DATA_RECENT if is_recent else CacheTTL.TICKER_DATA_HISTORICAL
        cache.set(legacy_key, df, expire=ttl)
        return df

    @staticmethod
    def get_bulk_ticker_data(symbols: list, start_date: str, end_date: str) -> pd.DataFrame:
        """
        Fetches historical data for multiple symbols concurrently via yf.download.
        Returns a single bulk DataFrame. Does not use diskcache for the bulk 
        blob due to highly variable date boundaries per file upload.
        """
        # --- yfinance I/O boundary ---
        # Isolates: network errors, rate limiting, bad-symbol batch poisoning,
        #           temporary outages. yf.download may fail entirely if any single
        #           symbol is invalid (depends on yfinance version).
        # Recovery: return empty DataFrame → caller falls back to per-symbol
        #           sequential fetch, isolating the bad symbol from the rest.
        logger.info("Fetching bulk data for %d symbols from yfinance", len(symbols))
        try:
            df = _yf_retry(lambda: yf.download(
                tickers=symbols,
                start=start_date,
                end=end_date,
                auto_adjust=False,
                group_by='ticker',
                progress=False,
                threads=True
            ))
            return df
        except Exception:
            logger.warning("get_bulk_ticker_data — yfinance failure for %d symbols after retries", len(symbols), exc_info=True)
            return pd.DataFrame()

    @staticmethod
    def get_ticker_info(symbol: str) -> dict:
        """
        Fetches sector and market cap metadata for a symbol.
        Uses a 7-day cache to aggressively minimize rate-limiting from Yahoo's .info endpoint.
        """
        cache_key = f"{symbol}_info"
        if cache_key in cache:
            return cache[cache_key]
            
        logger.debug("Fetching metadata for %s from yfinance", symbol)
        result = {"sector": None, "marketCap": None}
        
        try:
            info = _yf_retry(lambda: yf.Ticker(symbol).info)
            if info:
                result["sector"] = info.get("sector")
                result["marketCap"] = info.get("marketCap")
            
            cache.set(cache_key, result, expire=CacheTTL.TICKER_INFO)
            
        except Exception:
            logger.warning("Failed to fetch metadata for %s after retries", symbol, exc_info=True)
            # Do not cache failures so they can be retried later, just return the empty result.
            
        return result

    @staticmethod
    def get_cached_result(row_hash: str) -> dict:
        return cache.get(f"rh_{CACHE_VERSION}_{row_hash}")

    @staticmethod
    def set_cached_result(row_hash: str, result: dict):
        cache.set(f"rh_{CACHE_VERSION}_{row_hash}", result, expire=CacheTTL.ROW_HASH)

    @staticmethod
    def get_latest_price(symbol: str) -> float:
        """
        Gets the latest price for a symbol.
        """
        cache_key = f"{symbol}_latest"
        if cache_key in cache:
            return cache[cache_key]
            
        # --- yfinance I/O boundary ---
        # Isolates: network errors, rate limiting during symbol existence check.
        # Failure here causes a false negative in symbol resolution (valid symbol
        # marked "Symbol Not Found"), but recovers on next run because symbol
        # resolution cache is per-request.
        try:
            history = _yf_retry(lambda: yf.Ticker(symbol).history(period="1d"))
        except Exception:
            logger.warning("get_latest_price — yfinance failure for %s after retries", symbol, exc_info=True)
            return None
        if history.empty:
            return None
            
        price = history["Close"].iloc[-1]
        cache.set(cache_key, price, expire=CacheTTL.LATEST_PRICE)
        return price

    @staticmethod
    def get_latest_prices_batch(symbols: list[str]) -> dict[str, tuple[Optional[float], Optional[str]]]:
        """Fetch latest close prices for multiple symbols.
        
        Uses yf.download(period="5d", group_by='ticker') which returns daily bars.
        The last row's Close is the most recent COMPLETE trading day's close.
        This naturally handles the mid-day edge case — if market is open intraday,
        today's bar is not yet final so yesterday's close is returned.
        
        Bulk fetch is chunked to avoid yfinance overload (same chunk size as Phase B).
        Falls back to per-symbol yf.Ticker(s).history(period="5d") if bulk fails.
        Updates a 5-min diskcache per symbol for fast repeat access.
        
        Returns {symbol: (close_price, date_str)}.
        On failure for any symbol: (None, None) — never throws.
        """
        from ..config import Limits
        
        result: dict[str, tuple[Optional[float], Optional[str]]] = {}
        
        if not symbols:
            return result
        
        # Check diskcache first for each symbol (5min TTL)
        uncached = []
        for sym in symbols:
            cache_key = f"{sym}_latest_price"
            cached = cache.get(cache_key)
            if cached is not None:
                result[sym] = cached
            else:
                uncached.append(sym)
        
        if not uncached:
            return result
        
        # OHLCV cache fallback: seed {sym}_latest_price from persist_symbol_data cache
        # Handles re-upload (L1 HIT where Phase B was skipped) and cross-entry-mode scenarios.
        still_uncached = []
        for sym in uncached:
            rkey = DataProvider._range_key(sym)
            range_meta = cache.get(rkey)
            if range_meta is not None:
                _, cached_end = range_meta
                days_since = (datetime.now() - cached_end).days
                if days_since <= 3:
                    dkey = DataProvider._data_key(sym)
                    df_cached = cache.get(dkey)
                    if df_cached is not None and not df_cached.empty and 'Close' in df_cached.columns:
                        valid_closes = df_cached['Close'].dropna()
                        if not valid_closes.empty:
                            price = float(valid_closes.iloc[-1])
                            last_idx = valid_closes.index[-1]
                            date_str = last_idx.strftime('%Y-%m-%d') if hasattr(last_idx, 'strftime') else str(last_idx)[:10]
                            if price and price > 0:
                                entry = (price, date_str)
                                result[sym] = entry
                                cache.set(f"{sym}_latest_price", entry, expire=CacheTTL.LATEST_PRICE)
                                continue
            still_uncached.append(sym)
        
        uncached = still_uncached
        if not uncached:
            return result
        
        # Chunked bulk fetch (same chunk size as Phase B)
        chunk_size = Limits.BULK_FETCH_CHUNK
        chunks = [uncached[i:i + chunk_size] for i in range(0, len(uncached), chunk_size)]
        
        for chunk in chunks:
            try:
                df = _yf_retry(lambda: yf.download(
                    tickers=chunk,
                    period="5d",
                    auto_adjust=False,
                    group_by='ticker',
                    progress=False,
                    threads=True
                ))
                
                if df is not None and not df.empty:
                    if len(chunk) == 1:
                        sym = chunk[0]
                        if not df.empty:
                            last_row = df.iloc[-1]
                            price = float(last_row.get('Close', last_row.get('close', 0)))
                            date_str = df.index[-1].strftime('%Y-%m-%d') if hasattr(df.index[-1], 'strftime') else str(df.index[-1])[:10]
                            if price and price > 0:
                                entry = (price, date_str)
                                result[sym] = entry
                                cache.set(f"{sym}_latest_price", entry, expire=300)
                    else:
                        for sym in chunk:
                            if sym in df.columns.get_level_values(0):
                                sym_df = df[sym].dropna(how='all')
                                if not sym_df.empty:
                                    last_row = sym_df.iloc[-1]
                                    price = float(last_row.get('Close', last_row.get('close', 0)))
                                    date_str = sym_df.index[-1].strftime('%Y-%m-%d') if hasattr(sym_df.index[-1], 'strftime') else str(sym_df.index[-1])[:10]
                                    if price and price > 0:
                                        entry = (price, date_str)
                                        result[sym] = entry
                                        cache.set(f"{sym}_latest_price", entry, expire=300)
            except Exception:
                logger.warning("get_latest_prices_batch — bulk yfinance failed for %d symbols in chunk", len(chunk), exc_info=True)
        
        # Per-symbol fallback for symbols still uncached
        still_missing = [s for s in uncached if s not in result or result[s] is None]
        for sym in still_missing:
            try:
                hist = _yf_retry(lambda: yf.Ticker(sym).history(period="5d"))
                if hist is not None and not hist.empty:
                    last_row = hist.iloc[-1]
                    price = float(last_row.get('Close', last_row.get('close', 0)))
                    date_str = hist.index[-1].strftime('%Y-%m-%d') if hasattr(hist.index[-1], 'strftime') else str(hist.index[-1])[:10]
                    if price and price > 0:
                        entry = (price, date_str)
                        result[sym] = entry
                        cache.set(f"{sym}_latest_price", entry, expire=300)
            except Exception:
                logger.warning("get_latest_prices_batch — fallback failed for %s", sym, exc_info=True)
        
        # Ensure every input symbol has an entry
        for sym in symbols:
            if sym not in result:
                result[sym] = (None, None)
        
        return result

    @staticmethod
    def check_and_set_refresh(symbol: str, cooldown_minutes: int = 5) -> bool:
        """Check if a symbol is due for refresh and mark it.
        
        Returns True if caller should proceed with refresh.
        Uses diskcache with TTL=cooldown_minutes to prevent thundering herd.
        This is the diskcache-level guard (DB-level guard via next_refresh_at is in persistence layer).
        """
        key = f"refreshing_{symbol}"
        if key in cache:
            return False  # Another request recently refreshed or is refreshing
        cache.set(key, True, expire=cooldown_minutes * 60)
        return True

    @staticmethod
    def get_cache_stats() -> dict:
        return dict(DataProvider._cache_stats)
