import yfinance as yf
import pandas as pd
from diskcache import Cache
import os
from datetime import datetime, timedelta

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
        print(f"Fetching {symbol} from yfinance...")
        ticker = yf.Ticker(symbol)
        # Fetch a bit more data to ensure we have the start date
        df = ticker.history(start=start_date, end=end_date, auto_adjust=True)
        
        if df.empty:
            return df
            
        # Cache the result (expire in 24 hours)
        cache.set(cache_key, df, expire=86400)
        return df

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
