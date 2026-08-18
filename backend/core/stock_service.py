import logging
import asyncio
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, List
import pandas as pd
import yfinance as yf
from .data_provider import cache, _yf_retry, DataProvider
from ..config import CacheTTL

logger = logging.getLogger(__name__)

CACHE_TTL_FUNDAMENTAL = 86400 * 3  # 3 days
CACHE_TTL_BENCHMARK = 86400 * 1    # 1 day

class StockService:
    @staticmethod
    def get_stock_fundamentals(symbol: str) -> Dict[str, Any]:
        """Fetch rich stock fundamentals for NSE/BSE symbol with caching."""
        clean_sym = symbol.strip().upper()
        if not (clean_sym.endswith(".NS") or clean_sym.endswith(".BO")):
            ticker_sym = f"{clean_sym}.NS"
        else:
            ticker_sym = clean_sym

        cache_key = f"fund_v2_{ticker_sym}"
        cached = cache.get(cache_key)
        if cached is not None:
            return cached

        try:
            ticker = yf.Ticker(ticker_sym)
            info = _yf_retry(lambda: ticker.info) or {}
            
            # Fallback to .BO if .NS returned nothing useful
            if not info.get("currentPrice") and not info.get("regularMarketPrice") and ticker_sym.endswith(".NS"):
                ticker_bo = yf.Ticker(f"{clean_sym.replace('.NS', '')}.BO")
                bo_info = _yf_retry(lambda: ticker_bo.info) or {}
                if bo_info:
                    info = bo_info
                    ticker_sym = f"{clean_sym.replace('.NS', '')}.BO"

            price = info.get("currentPrice") or info.get("regularMarketPrice") or info.get("previousClose") or 0.0
            prev_close = info.get("previousClose") or price
            change = round(price - prev_close, 2) if price and prev_close else 0.0
            change_percent = round((change / prev_close) * 100, 2) if prev_close else 0.0

            # Formatting helper for Indian numbers (Cr/Lakh or B/T)
            market_cap_raw = info.get("marketCap")
            market_cap_str = "N/A"
            if market_cap_raw:
                if market_cap_raw >= 1e7:
                    market_cap_str = f"₹{round(market_cap_raw / 1e7, 2):,.2f} Cr"
                else:
                    market_cap_str = f"₹{market_cap_raw:,.0f}"

            result = {
                "symbol": clean_sym.replace(".NS", "").replace(".BO", ""),
                "ticker": ticker_sym,
                "name": info.get("longName") or info.get("shortName") or clean_sym,
                "price": float(price),
                "previousClose": float(prev_close),
                "change": float(change),
                "changePercent": float(change_percent),
                "sector": info.get("sector") or "General",
                "industry": info.get("industry") or "Diversified",
                "marketCap": market_cap_str,
                "marketCapRaw": market_cap_raw,
                "peRatio": round(info.get("trailingPE"), 2) if info.get("trailingPE") else None,
                "forwardPE": round(info.get("forwardPE"), 2) if info.get("forwardPE") else None,
                "eps": round(info.get("trailingEps"), 2) if info.get("trailingEps") else None,
                "beta": round(info.get("beta"), 2) if info.get("beta") else None,
                "dividendYield": round(info.get("dividendYield", 0) * 100, 2) if info.get("dividendYield") else None,
                "fiftyTwoWeekHigh": round(info.get("fiftyTwoWeekHigh"), 2) if info.get("fiftyTwoWeekHigh") else None,
                "fiftyTwoWeekLow": round(info.get("fiftyTwoWeekLow"), 2) if info.get("fiftyTwoWeekLow") else None,
                "profitMargins": round(info.get("profitMargins", 0) * 100, 2) if info.get("profitMargins") else None,
                "returnOnEquity": round(info.get("returnOnEquity", 0) * 100, 2) if info.get("returnOnEquity") else None,
                "debtToEquity": round(info.get("debtToEquity"), 2) if info.get("debtToEquity") else None,
                "description": info.get("longBusinessSummary") or f"{clean_sym} is listed on the National Stock Exchange of India (NSE).",
                "targetMeanPrice": round(info.get("targetMeanPrice"), 2) if info.get("targetMeanPrice") else None,
                "recommendationKey": (info.get("recommendationKey") or "hold").upper(),
            }

            cache.set(cache_key, result, expire=CACHE_TTL_FUNDAMENTAL)
            return result
        except Exception as e:
            logger.warning("Failed to fetch fundamentals for %s: %s", symbol, e)
            return {
                "symbol": clean_sym.replace(".NS", "").replace(".BO", ""),
                "ticker": ticker_sym,
                "name": clean_sym,
                "price": 0.0,
                "previousClose": 0.0,
                "change": 0.0,
                "changePercent": 0.0,
                "sector": "Unknown",
                "industry": "Unknown",
                "marketCap": "N/A",
                "marketCapRaw": None,
                "peRatio": None,
                "forwardPE": None,
                "eps": None,
                "beta": None,
                "dividendYield": None,
                "fiftyTwoWeekHigh": None,
                "fiftyTwoWeekLow": None,
                "profitMargins": None,
                "returnOnEquity": None,
                "debtToEquity": None,
                "description": f"Historical data and profile information for {clean_sym}.",
                "targetMeanPrice": None,
                "recommendationKey": "N/A",
            }

    @staticmethod
    def get_benchmark_series(start_date: str, end_date: str, benchmark: str = "^NSEI") -> List[Dict[str, Any]]:
        """Fetch daily closing series for benchmark (e.g. Nifty 50 '^NSEI') for comparative equity curve."""
        cache_key = f"bm_{benchmark}_{start_date}_{end_date}"
        cached = cache.get(cache_key)
        if cached is not None:
            return cached

        try:
            df = _yf_retry(lambda: yf.download(benchmark, start=start_date, end=end_date, progress=False))
            if df is None or df.empty:
                return []

            if isinstance(df.columns, pd.MultiIndex):
                df = df['Close']
            else:
                df = df[['Close']]

            if isinstance(df, pd.DataFrame) and benchmark in df.columns:
                series = df[benchmark].dropna()
            elif isinstance(df, pd.DataFrame) and 'Close' in df.columns:
                series = df['Close'].dropna()
            else:
                series = df.iloc[:, 0].dropna()

            if series.empty:
                return []

            base_val = float(series.iloc[0])
            result = []
            for date_idx, val in series.items():
                val_flt = float(val)
                date_str = date_idx.strftime("%Y-%m-%d") if hasattr(date_idx, "strftime") else str(date_idx)[:10]
                cum_ret = ((val_flt - base_val) / base_val) * 100 if base_val > 0 else 0.0
                result.append({
                    "date": date_str,
                    "close": round(val_flt, 2),
                    "return": round(cum_ret, 2)
                })

            cache.set(cache_key, result, expire=CACHE_TTL_BENCHMARK)
            return result
        except Exception as e:
            logger.warning("Failed to fetch benchmark %s: %s", benchmark, e)
            return []
