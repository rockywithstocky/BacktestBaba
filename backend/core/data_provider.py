import logging

import yfinance as yf
import pandas as pd
from diskcache import Cache
from datetime import datetime, timedelta

from ..config import Paths, CacheTTL, Limits

logger = logging.getLogger(__name__)

cache = Cache(Paths.CACHE_DIR, size_limit=CacheTTL.DISKCACHE_SIZE_LIMIT_MB * 1024 * 1024)

class DataProvider:
    @staticmethod
    def _data_key(symbol: str) -> str:
        return f"sd_{symbol}"

    @staticmethod
    def _range_key(symbol: str) -> str:
        return f"sr_{symbol}"

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
        # Legacy exact-range key (backward compat)
        legacy_key = f"{symbol}_{start_date}_{end_date}"
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
                    return df_cached.loc[str(req_start):str(req_end)]

        # Fetch from yfinance
        logger.debug("Fetching %s from yfinance", symbol)
        try:
            ticker = yf.Ticker(symbol)
            df = ticker.history(start=start_date, end=end_date, auto_adjust=True)
        except Exception:
            logger.warning("get_ticker_data — yfinance failure for %s", symbol, exc_info=True)
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
            df = yf.download(
                tickers=symbols, 
                start=start_date, 
                end=end_date, 
                auto_adjust=True, 
                group_by='ticker', 
                progress=False,
                threads=True
            )
            return df
        except Exception:
            logger.warning("get_bulk_ticker_data — yfinance failure for %d symbols", len(symbols), exc_info=True)
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
            ticker = yf.Ticker(symbol)
            info = ticker.info
            if info:
                result["sector"] = info.get("sector")
                result["marketCap"] = info.get("marketCap")
            
            cache.set(cache_key, result, expire=CacheTTL.TICKER_INFO)
            
        except Exception:
            logger.warning("Failed to fetch metadata for %s", symbol, exc_info=True)
            # Do not cache failures so they can be retried later, just return the empty result.
            
        return result

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
            ticker = yf.Ticker(symbol)
            history = ticker.history(period="1d")
        except Exception:
            logger.warning("get_latest_price — yfinance failure for %s", symbol, exc_info=True)
            return None
        if history.empty:
            return None
            
        price = history["Close"].iloc[-1]
        cache.set(cache_key, price, expire=CacheTTL.LATEST_PRICE)
        return price
