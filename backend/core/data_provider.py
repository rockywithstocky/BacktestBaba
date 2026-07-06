import logging
import os

import yfinance as yf
import pandas as pd
from diskcache import Cache
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

# Initialize cache
CACHE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".cache")
cache = Cache(CACHE_DIR)

class DataProvider:
    @staticmethod
    def get_ticker_data(symbol: str, start_date: str, end_date: str) -> pd.DataFrame:
        """
        Fetches historical data for a symbol with caching.
        """
        cache_key = f"{symbol}_{start_date}_{end_date}"
        
        # Check cache
        if cache_key in cache:
            return cache[cache_key]
        
        # Fetch from yfinance
        logger.debug("Fetching %s from yfinance", symbol)
        ticker = yf.Ticker(symbol)
        # Fetch a bit more data to ensure we have the start date
        df = ticker.history(start=start_date, end=end_date, auto_adjust=True)
        
        if df.empty:
            return df
            
        # Cache the result (expire in 24 hours)
        cache.set(cache_key, df, expire=86400)
        return df

    @staticmethod
    def get_bulk_ticker_data(symbols: list, start_date: str, end_date: str) -> pd.DataFrame:
        """
        Fetches historical data for multiple symbols concurrently via yf.download.
        Returns a single bulk DataFrame. Does not use diskcache for the bulk 
        blob due to highly variable date boundaries per file upload.
        """
        logger.info("Fetching bulk data for %d symbols from yfinance", len(symbols))
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
            
            # Cache the result (expire in 7 days = 604800 seconds)
            cache.set(cache_key, result, expire=604800)
            
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
            
        ticker = yf.Ticker(symbol)
        history = ticker.history(period="1d")
        if history.empty:
            return None
            
        price = history["Close"].iloc[-1]
        cache.set(cache_key, price, expire=300) # 5 min cache for live price
        return price
