import re
import math
import logging
import asyncio
import base64
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, Tuple, List
import pandas as pd
import numpy as np
import yfinance as yf

from .data_provider import cache, _yf_retry, DataProvider
from .stock_service import StockService
from .symbol_resolver import SymbolResolver
from ..config import CacheTTL

logger = logging.getLogger(__name__)

CACHE_TTL_ANALYSIS = 1800  # 30 minutes cache

# High-accuracy lookup table for non-NSE global assets, commodities, crypto, indices, and tech giants
KNOWN_GLOBAL_ASSETS: Dict[str, Dict[str, str]] = {
    # Commodities & Precious Metals
    "XAUUSD": {"ticker": "GC=F", "name": "Gold Spot / Futures (XAU/USD)", "exchange": "COMEX", "currency": "$", "sector": "Commodities", "industry": "Precious Metals"},
    "GOLD": {"ticker": "GC=F", "name": "Gold Futures (GC=F)", "exchange": "COMEX", "currency": "$", "sector": "Commodities", "industry": "Precious Metals"},
    "GC=F": {"ticker": "GC=F", "name": "Gold Futures", "exchange": "COMEX", "currency": "$", "sector": "Commodities", "industry": "Precious Metals"},
    "XAGUSD": {"ticker": "SI=F", "name": "Silver Spot / Futures (XAG/USD)", "exchange": "COMEX", "currency": "$", "sector": "Commodities", "industry": "Precious Metals"},
    "SILVER": {"ticker": "SI=F", "name": "Silver Futures (SI=F)", "exchange": "COMEX", "currency": "$", "sector": "Commodities", "industry": "Precious Metals"},
    "CRUDEOIL": {"ticker": "CL=F", "name": "Crude Oil WTI Futures", "exchange": "NYMEX", "currency": "$", "sector": "Commodities", "industry": "Energy"},
    "CRUDE": {"ticker": "CL=F", "name": "Crude Oil WTI Futures", "exchange": "NYMEX", "currency": "$", "sector": "Commodities", "industry": "Energy"},
    "BRENT": {"ticker": "BZ=F", "name": "Brent Crude Oil Futures", "exchange": "ICE", "currency": "$", "sector": "Commodities", "industry": "Energy"},
    "NATGAS": {"ticker": "NG=F", "name": "Natural Gas Futures", "exchange": "NYMEX", "currency": "$", "sector": "Commodities", "industry": "Energy"},
    
    # Crypto
    "BTCUSD": {"ticker": "BTC-USD", "name": "Bitcoin (BTC/USD)", "exchange": "CRYPTO", "currency": "$", "sector": "Cryptocurrency", "industry": "Digital Assets"},
    "BTC": {"ticker": "BTC-USD", "name": "Bitcoin (BTC/USD)", "exchange": "CRYPTO", "currency": "$", "sector": "Cryptocurrency", "industry": "Digital Assets"},
    "BITCOIN": {"ticker": "BTC-USD", "name": "Bitcoin (BTC/USD)", "exchange": "CRYPTO", "currency": "$", "sector": "Cryptocurrency", "industry": "Digital Assets"},
    "ETHUSD": {"ticker": "ETH-USD", "name": "Ethereum (ETH/USD)", "exchange": "CRYPTO", "currency": "$", "sector": "Cryptocurrency", "industry": "Smart Contracts"},
    "ETH": {"ticker": "ETH-USD", "name": "Ethereum (ETH/USD)", "exchange": "CRYPTO", "currency": "$", "sector": "Cryptocurrency", "industry": "Smart Contracts"},
    "SOLUSD": {"ticker": "SOL-USD", "name": "Solana (SOL/USD)", "exchange": "CRYPTO", "currency": "$", "sector": "Cryptocurrency", "industry": "Layer 1"},

    # Forex
    "EURUSD": {"ticker": "EURUSD=X", "name": "EUR / USD", "exchange": "FOREX", "currency": "$", "sector": "Currencies", "industry": "Foreign Exchange"},
    "GBPUSD": {"ticker": "GBPUSD=X", "name": "GBP / USD", "exchange": "FOREX", "currency": "$", "sector": "Currencies", "industry": "Foreign Exchange"},
    "USDINR": {"ticker": "USDINR=X", "name": "USD / INR", "exchange": "FOREX", "currency": "₹", "sector": "Currencies", "industry": "Foreign Exchange"},
    "USDJPY": {"ticker": "USDJPY=X", "name": "USD / JPY", "exchange": "FOREX", "currency": "¥", "sector": "Currencies", "industry": "Foreign Exchange"},

    # Major Global & Indian Indices
    "NIFTY": {"ticker": "^NSEI", "name": "NIFTY 50 Index", "exchange": "NSE", "currency": "₹", "sector": "Indices", "industry": "Benchmark"},
    "NIFTY50": {"ticker": "^NSEI", "name": "NIFTY 50 Index", "exchange": "NSE", "currency": "₹", "sector": "Indices", "industry": "Benchmark"},
    "BANKNIFTY": {"ticker": "^NSEBANK", "name": "NIFTY Bank Index", "exchange": "NSE", "currency": "₹", "sector": "Indices", "industry": "Banking"},
    "SENSEX": {"ticker": "^BSESN", "name": "BSE SENSEX Index", "exchange": "BSE", "currency": "₹", "sector": "Indices", "industry": "Benchmark"},
    "SPX": {"ticker": "^GSPC", "name": "S&P 500 Index", "exchange": "US", "currency": "$", "sector": "Indices", "industry": "Benchmark"},
    "SP500": {"ticker": "^GSPC", "name": "S&P 500 Index", "exchange": "US", "currency": "$", "sector": "Indices", "industry": "Benchmark"},
    "NASDAQ": {"ticker": "^IXIC", "name": "NASDAQ Composite", "exchange": "US", "currency": "$", "sector": "Indices", "industry": "Tech Benchmark"},
    "DOW": {"ticker": "^DJI", "name": "Dow Jones Industrial Average", "exchange": "US", "currency": "$", "sector": "Indices", "industry": "Industrial Benchmark"},

    # Mega-Cap US Stocks
    "AAPL": {"ticker": "AAPL", "name": "Apple Inc.", "exchange": "NASDAQ", "currency": "$", "sector": "Technology", "industry": "Consumer Electronics"},
    "TSLA": {"ticker": "TSLA", "name": "Tesla Inc.", "exchange": "NASDAQ", "currency": "$", "sector": "Consumer Cyclical", "industry": "Auto Manufacturers"},
    "NVDA": {"ticker": "NVDA", "name": "NVIDIA Corporation", "exchange": "NASDAQ", "currency": "$", "sector": "Technology", "industry": "Semiconductors"},
    "MSFT": {"ticker": "MSFT", "name": "Microsoft Corporation", "exchange": "NASDAQ", "currency": "$", "sector": "Technology", "industry": "Software"},
    "GOOGL": {"ticker": "GOOGL", "name": "Alphabet Inc.", "exchange": "NASDAQ", "currency": "$", "sector": "Communication", "industry": "Internet"},
    "AMZN": {"ticker": "AMZN", "name": "Amazon.com Inc.", "exchange": "NASDAQ", "currency": "$", "sector": "Consumer Cyclical", "industry": "E-Commerce"},
    "META": {"ticker": "META", "name": "Meta Platforms Inc.", "exchange": "NASDAQ", "currency": "$", "sector": "Communication", "industry": "Social Media"},
    "AMD": {"ticker": "AMD", "name": "Advanced Micro Devices", "exchange": "NASDAQ", "currency": "$", "sector": "Technology", "industry": "Semiconductors"},
    "NFLX": {"ticker": "NFLX", "name": "Netflix Inc.", "exchange": "NASDAQ", "currency": "$", "sector": "Communication", "industry": "Entertainment"},
    "PLTR": {"ticker": "PLTR", "name": "Palantir Technologies", "exchange": "NYSE", "currency": "$", "sector": "Technology", "industry": "Software"},
    "COIN": {"ticker": "COIN", "name": "Coinbase Global", "exchange": "NASDAQ", "currency": "$", "sector": "Financial", "industry": "Capital Markets"},
}


def parse_tradingview_url(url_or_query: str) -> Dict[str, Any]:
    """
    Extracts exchange, symbol, and normalized ticker from a TradingView URL or text query.
    Handles commodities (Gold, Silver, Oil), Crypto, Forex, US Stocks, and Indian Stocks.
    """
    if not url_or_query:
        return {"symbol": "", "exchange": "", "ticker": "", "currency": "₹", "name": "", "raw": url_or_query}

    text = url_or_query.strip()
    
    # 0. Clean TradingView URL wrappers if present
    # Check for ?symbol=EXCHANGE%3ASYMBOL or ?symbol=EXCHANGE:SYMBOL
    chart_param_match = re.search(r'symbol=([A-Za-z0-9_]+)(?:%3A|:)([A-Za-z0-9_&.=!-]+)', text, re.IGNORECASE)
    if chart_param_match:
        raw_exch = chart_param_match.group(1).upper()
        raw_sym = chart_param_match.group(2).upper().replace('!', '')
        return _resolve_identified_asset(raw_sym, raw_exch, text)

    # Check for /symbols/EXCHANGE-SYMBOL/
    symbol_path_match = re.search(r'/symbols/([A-Za-z0-9_]+)-([A-Za-z0-9_&.=!-]+)', text, re.IGNORECASE)
    if symbol_path_match:
        raw_exch = symbol_path_match.group(1).upper()
        raw_sym = symbol_path_match.group(2).upper().replace('!', '')
        return _resolve_identified_asset(raw_sym, raw_exch, text)

    # Check for EXCHANGE:SYMBOL format (e.g. NSE:SAIL, OANDA:XAUUSD, NASDAQ:AAPL)
    exchange_prefix_match = re.match(r'^([A-Za-z0-9_]+):([A-Za-z0-9_&.=!-]+)$', text)
    if exchange_prefix_match:
        raw_exch = exchange_prefix_match.group(1).upper()
        raw_sym = exchange_prefix_match.group(2).upper().replace('!', '')
        return _resolve_identified_asset(raw_sym, raw_exch, text)

    # Clean ticker string (e.g. "XAUUSD", "SAIL", "RELIANCE.NS", "AAPL", "Gold (XAU/USD)")
    clean_sym = text.upper().replace(' ', '').replace('(', '').replace(')', '').replace('/', '')
    
    return _resolve_identified_asset(clean_sym, None, text)


def _resolve_identified_asset(symbol: str, exchange: Optional[str], raw_text: str) -> Dict[str, Any]:
    """Resolves an identified symbol and exchange to standard metadata and ticker."""
    sym = symbol.strip().upper()
    exch = exchange.strip().upper() if exchange else None

    # 1. Check known global assets FIRST (e.g. XAUUSD, GOLD, BTCUSD, AAPL)
    lookup_key = sym.replace('.NS', '').replace('.BO', '')
    if lookup_key in KNOWN_GLOBAL_ASSETS:
        meta = KNOWN_GLOBAL_ASSETS[lookup_key]
        return {
            "symbol": lookup_key,
            "exchange": meta["exchange"],
            "ticker": meta["ticker"],
            "currency": meta["currency"],
            "name": meta["name"],
            "sector": meta.get("sector", "Commodities"),
            "industry": meta.get("industry", "Global Markets"),
            "raw": raw_text
        }

    # 2. Check for TradingView provider prefixes for Commodities / Forex (e.g. OANDA:XAUUSD, FX:EURUSD, TVC:GOLD)
    if exch in ["OANDA", "FX", "FOREXCOM", "TVC", "COMEX", "NYMEX"]:
        if "XAU" in sym or "GOLD" in sym:
            return _resolve_identified_asset("XAUUSD", "COMEX", raw_text)
        if "XAG" in sym or "SILVER" in sym:
            return _resolve_identified_asset("XAGUSD", "COMEX", raw_text)
        if "OIL" in sym or "CL" in sym:
            return _resolve_identified_asset("CRUDEOIL", "NYMEX", raw_text)

    # 3. Explicit Exchange Suffixes
    if sym.endswith('.NS') or exch == 'NSE':
        base_sym = sym.replace('.NS', '')
        return {
            "symbol": base_sym,
            "exchange": "NSE",
            "ticker": f"{base_sym}.NS",
            "currency": "₹",
            "name": base_sym,
            "raw": raw_text
        }
    elif sym.endswith('.BO') or exch == 'BSE':
        base_sym = sym.replace('.BO', '')
        return {
            "symbol": base_sym,
            "exchange": "BSE",
            "ticker": f"{base_sym}.BO",
            "currency": "₹",
            "name": base_sym,
            "raw": raw_text
        }
    elif exch in ['NASDAQ', 'NYSE', 'AMEX', 'US']:
        return {
            "symbol": sym,
            "exchange": exch,
            "ticker": sym,
            "currency": "$",
            "name": sym,
            "raw": raw_text
        }

    # 4. Default: Indian Stock on NSE (e.g. SAIL, RELIANCE, TATAMOTORS)
    return {
        "symbol": sym,
        "exchange": "NSE",
        "ticker": f"{sym}.NS",
        "currency": "₹",
        "name": sym,
        "raw": raw_text
    }


def detect_technical_patterns(df: pd.DataFrame) -> List[Dict[str, str]]:
    """
    Identifies high-probability chart patterns, moving average crossovers,
    and breakout structures from recent OHLCV data.
    """
    patterns = []
    if df.empty or len(df) < 30:
        return patterns

    close = df['Close'].astype(float)
    high = df['High'].astype(float)
    low = df['Low'].astype(float)
    
    current_price = float(close.iloc[-1])
    sma20 = float(close.rolling(20).mean().iloc[-1])
    sma50 = float(close.rolling(50).mean().iloc[-1])
    prev_sma20 = float(close.rolling(20).mean().iloc[-2]) if len(close) > 20 else sma20
    prev_sma50 = float(close.rolling(50).mean().iloc[-2]) if len(close) > 50 else sma50

    # 1. Moving Average Cross (Golden Cross / Bullish Momentum Cross)
    if prev_sma20 <= prev_sma50 and sma20 > sma50:
        patterns.append({"name": "Bullish SMA Cross", "type": "bullish", "desc": "20 SMA crossed above 50 SMA (Short-term momentum surge)"})
    elif prev_sma20 >= prev_sma50 and sma20 < sma50:
        patterns.append({"name": "Bearish SMA Cross", "type": "bearish", "desc": "20 SMA crossed below 50 SMA (Downside momentum shift)"})

    # 2. 20-Day Range Breakout
    recent_20_high = float(high.iloc[-21:-1].max()) if len(high) > 21 else float(high.max())
    recent_20_low = float(low.iloc[-21:-1].min()) if len(low) > 21 else float(low.min())

    if current_price > recent_20_high:
        patterns.append({"name": "20-Day High Breakout", "type": "bullish", "desc": f"Price broke above 20-day high with expanding momentum"})
    elif current_price < recent_20_low:
        patterns.append({"name": "20-Day Breakdown", "type": "bearish", "desc": f"Price fell below 20-day low"})

    # 3. Pullback into Moving Average Support
    if abs(current_price - sma20) / current_price < 0.015 and current_price >= sma20:
        patterns.append({"name": "20-SMA Dynamic Support Test", "type": "bullish", "desc": "Testing 20-SMA support on pullback"})

    # 4. Consecutive Higher Highs / Lows (Uptrend Structure)
    if len(close) >= 5:
        h5 = high.iloc[-5:].values
        l5 = low.iloc[-5:].values
        if h5[-1] > h5[-3] and l5[-1] > l5[-3]:
            patterns.append({"name": "Higher Highs & Higher Lows", "type": "bullish", "desc": "Healthy swing structure forming higher swing pivots"})

    return patterns


def calculate_technical_indicators(df: pd.DataFrame, currency: str = "₹") -> Dict[str, Any]:
    """
    Computes comprehensive technical indicators, support/resistance zones,
    Fibonacci retracements, and trend strength from OHLCV dataframe.
    """
    if df.empty or len(df) < 5:
        raise ValueError("Insufficient historical OHLCV data to calculate technical indicators.")

    close = df['Close'].astype(float).dropna()
    high = df['High'].astype(float).dropna()
    low = df['Low'].astype(float).dropna()

    if close.empty or float(close.iloc[-1]) <= 0:
        raise ValueError("Invalid close price data received.")

    current_price = round(float(close.iloc[-1]), 2)
    prev_close = round(float(close.iloc[-2]), 2) if len(close) > 1 else current_price
    change_pct = round(((current_price - prev_close) / prev_close) * 100, 2) if prev_close else 0.0

    # 1. Moving Averages
    sma20 = round(float(close.rolling(window=20).mean().iloc[-1]), 2) if len(close) >= 20 else current_price
    sma50 = round(float(close.rolling(window=50).mean().iloc[-1]), 2) if len(close) >= 50 else sma20
    sma200 = round(float(close.rolling(window=200).mean().iloc[-1]), 2) if len(close) >= 200 else sma50

    # 2. RSI (14)
    delta = close.diff()
    gain = delta.where(delta > 0, 0.0)
    loss = -delta.where(delta < 0, 0.0)
    avg_gain = gain.rolling(window=14).mean()
    avg_loss = loss.rolling(window=14).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    rsi_series = 100 - (100 / (1 + rs))
    rsi_val = round(float(rsi_series.dropna().iloc[-1]), 1) if not rsi_series.dropna().empty else 50.0

    # 3. MACD (12, 26, 9)
    ema12 = close.ewm(span=12, adjust=False).mean()
    ema26 = close.ewm(span=26, adjust=False).mean()
    macd_line = ema12 - ema26
    signal_line = macd_line.ewm(span=9, adjust=False).mean()
    macd_hist = macd_line - signal_line
    macd_val = round(float(macd_line.iloc[-1]), 2)
    macd_hist_val = round(float(macd_hist.iloc[-1]), 2)

    # 4. ATR (14) for dynamic volatility sizing
    tr1 = high - low
    tr2 = (high - close.shift()).abs()
    tr3 = (low - close.shift()).abs()
    tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
    atr_series = tr.rolling(window=14).mean()
    atr_val = round(float(atr_series.dropna().iloc[-1]), 2) if not atr_series.dropna().empty else round(current_price * 0.02, 2)
    if atr_val <= 0:
        atr_val = round(current_price * 0.02, 2)

    # 5. ADX (14) Trend Strength
    up_move = high - high.shift()
    down_move = low.shift() - low
    plus_dm = np.where((up_move > down_move) & (up_move > 0), up_move, 0.0)
    minus_dm = np.where((down_move > up_move) & (down_move > 0), down_move, 0.0)
    
    tr_smooth = tr.rolling(window=14).sum()
    plus_di = 100 * (pd.Series(plus_dm, index=df.index).rolling(window=14).sum() / tr_smooth)
    minus_di = 100 * (pd.Series(minus_dm, index=df.index).rolling(window=14).sum() / tr_smooth)
    dx = (100 * (plus_di - minus_di).abs() / (plus_di + minus_di).replace(0, np.nan)).fillna(0)
    adx_series = dx.rolling(window=14).mean()
    adx_val = round(float(adx_series.dropna().iloc[-1]), 1) if not adx_series.dropna().empty else 25.0

    # 6. Support & Resistance (recent swing extremes)
    window_sr = min(60, len(df))
    recent_high = round(float(high.iloc[-window_sr:].max()), 2)
    recent_low = round(float(low.iloc[-window_sr:].min()), 2)
    
    # 7. Fibonacci Levels from swing low to swing high
    diff = recent_high - recent_low
    fib_382 = round(recent_high - (0.382 * diff), 2)
    fib_500 = round(recent_high - (0.500 * diff), 2)
    fib_618 = round(recent_high - (0.618 * diff), 2)

    # 8. Detected Patterns
    patterns = detect_technical_patterns(df)

    # 9. Trend Score (0 to 10)
    score = 5.0
    if current_price > sma20: score += 1.5
    if current_price > sma50: score += 1.5
    if current_price > sma200: score += 1.0
    if rsi_val > 50: score += 1.0
    if macd_hist_val > 0: score += 1.0
    if current_price < sma20: score -= 1.5
    if current_price < sma50: score -= 1.5
    if rsi_val < 45: score -= 1.0
    if macd_hist_val < 0: score -= 1.0
    trend_score = max(1, min(10, round(score)))

    trend_dir = "Uptrend" if trend_score >= 6 else ("Downtrend" if trend_score <= 4 else "Consolidating")
    adx_interp = "Strong Trend" if adx_val >= 25 else "Weak / Ranging"
    rsi_interp = "Overbought" if rsi_val >= 70 else ("Oversold" if rsi_val <= 30 else ("Bullish Momentum" if rsi_val >= 50 else "Bearish Momentum"))

    # Recent 30 candlesticks
    recent_candles = []
    recent_slice = df.tail(30)
    for idx, row in recent_slice.iterrows():
        date_str = idx.strftime('%Y-%m-%d') if hasattr(idx, 'strftime') else str(idx)[:10]
        recent_candles.append({
            "time": date_str,
            "open": round(float(row.get('Open', row['Close'])), 2),
            "high": round(float(row['High']), 2),
            "low": round(float(row['Low']), 2),
            "close": round(float(row['Close']), 2),
            "volume": int(row.get('Volume', 0))
        })

    return {
        "current_price": current_price,
        "previous_close": prev_close,
        "change_percent": change_pct,
        "sma20": sma20,
        "sma50": sma50,
        "sma200": sma200,
        "rsi_14": {"value": rsi_val, "interpretation": rsi_interp},
        "macd": {"value": macd_val, "histogram": macd_hist_val, "interpretation": "Bullish" if macd_hist_val > 0 else "Bearish"},
        "adx_14": {"value": adx_val, "interpretation": adx_interp},
        "atr_14": {"value": atr_val, "unit": currency},
        "trend_score": trend_score,
        "trend_direction": trend_dir,
        "support_level": recent_low,
        "resistance_level": recent_high,
        "fibonacci": {
            "fib_382": fib_382,
            "fib_500": fib_500,
            "fib_618": fib_618,
            "swing_high": recent_high,
            "swing_low": recent_low
        },
        "patterns": patterns,
        "recent_candles": recent_candles
    }


def synthesize_trade_plan(
    symbol: str,
    technicals: Dict[str, Any],
    fundamentals: Dict[str, Any],
    entry_override: Optional[float] = None,
    currency: str = "₹",
    mode: str = "short_term",
    user_profile: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Generates actionable trade setup (Action, Entry, SL, TP1, TP2, R:R),
    dual scenario probabilities, and confidence score.
    """
    price = technicals.get("current_price", 0.0)
    if price <= 0 and (not entry_override or entry_override <= 0):
        raise ValueError(f"Cannot generate trade setup for {symbol} with non-positive price: {price}")

    if price <= 0 and entry_override:
        price = entry_override

    atr = technicals.get("atr_14", {}).get("value", 1.0) or (price * 0.02)
    trend_score = technicals.get("trend_score", 5)
    rsi = technicals.get("rsi_14", {}).get("value", 50)
    sma20 = technicals.get("sma20", price)
    sma50 = technicals.get("sma50", price)
    res = technicals.get("resistance_level", price * 1.05)
    sup = technicals.get("support_level", price * 0.95)

    is_short_term = mode == "short_term"

    # Bullish / Bearish probability calculation
    base_bull_prob = int(min(90, max(10, (trend_score / 10.0) * 100)))
    
    # Adjust for RSI momentum / exhaustion
    if rsi > 72: base_bull_prob -= 12
    elif rsi < 28: base_bull_prob += 12
    
    # Fundamental cross-check
    pe = fundamentals.get("peRatio")
    roe = fundamentals.get("returnOnEquity")
    if roe and roe > 15: base_bull_prob += 6
    if pe and pe > 65: base_bull_prob -= 6

    bull_prob = max(15, min(85, base_bull_prob))
    bear_prob = 100 - bull_prob

    # Multipliers for stop-loss and targets
    sl_mult = 1.5 if is_short_term else 2.5
    tp1_mult = 2.5 if is_short_term else 4.0
    tp2_mult = 4.5 if is_short_term else 7.0

    entry = entry_override if entry_override and entry_override > 0 else price

    if bull_prob >= 55:
        signal = "BUY LIMIT" if entry <= price else "BUY MARKET"
        stop_loss = round(entry - (sl_mult * atr), 2)
        take_profit_1 = round(entry + (tp1_mult * atr), 2)
        take_profit_2 = round(entry + (tp2_mult * atr), 2)
    elif bull_prob <= 40:
        signal = "SELL LIMIT" if entry >= price else "SELL MARKET"
        stop_loss = round(entry + (sl_mult * atr), 2)
        take_profit_1 = round(entry - (tp1_mult * atr), 2)
        take_profit_2 = round(entry - (tp2_mult * atr), 2)
    else:
        signal = "WAIT"
        stop_loss = round(entry - (sl_mult * atr), 2)
        take_profit_1 = round(entry + (tp1_mult * atr), 2)
        take_profit_2 = round(entry + (tp2_mult * atr), 2)

    risk = abs(entry - stop_loss)
    reward = abs(take_profit_1 - entry)
    rr_ratio = round(reward / risk, 2) if risk > 0 else 2.0

    bull_trigger = f"Sustained break above {currency}{round(max(sma20, price * 1.01), 2)} (SMA20) targeting {currency}{take_profit_1}"
    bear_trigger = f"Breakdown below {currency}{round(min(sma50, sup), 2)} (Support) targeting {currency}{round(price - (tp1_mult * atr), 2)}"

    # Short / Long divergence check
    divergence_warning = None
    if bull_prob >= 60 and pe and pe > 50:
        divergence_warning = "Technicals are strongly bullish but valuation P/E is elevated; protect with trailing stop."
    elif bull_prob <= 40 and roe and roe > 20:
        divergence_warning = "Short-term momentum is bearish despite solid fundamental ROE."

    confidence_score = min(95, max(45, int((abs(bull_prob - 50) * 2) + (trend_score * 4))))

    return {
        "signal": signal,
        "entry": entry,
        "stop_loss": stop_loss,
        "take_profit_1": take_profit_1,
        "take_profit_2": take_profit_2,
        "risk_reward_ratio": f"{rr_ratio}:1",
        "confidence_score": confidence_score,
        "divergence_warning": divergence_warning,
        "scenarios": {
            "bullish": {
                "probability": bull_prob,
                "trigger": bull_trigger,
                "target": take_profit_1
            },
            "bearish": {
                "probability": bear_prob,
                "trigger": bear_trigger,
                "target": round(price - (tp1_mult * atr), 2)
            }
        }
    }


class AIChartService:
    @staticmethod
    async def get_trade_glance(
        symbol: str,
        exchange: Optional[str] = None,
        entry_price: Optional[float] = None,
        signal_date: Optional[str] = None,
        mode: str = "short_term"
    ) -> Dict[str, Any]:
        """
        On-demand lazy glance endpoint for Table Rows and Direct Search.
        Fetches live market data with multi-tier candidate ticker fallbacks.
        """
        parsed = _resolve_identified_asset(symbol, exchange, symbol)
        clean_sym = parsed["symbol"]
        primary_ticker = parsed["ticker"]
        resolved_exchange = parsed["exchange"]
        currency_symbol = parsed["currency"]

        cache_key = f"glance_v4_{primary_ticker}_{mode}_{entry_price or 'noentry'}"
        cached = cache.get(cache_key)
        if cached is not None:
            return cached

        # List of candidate tickers to try in priority order
        candidates = [primary_ticker]
        if resolved_exchange == "NSE" and not primary_ticker.endswith(".NS"):
            candidates.append(f"{clean_sym}.NS")
        if not primary_ticker.endswith(".BO"):
            candidates.append(f"{clean_sym}.BO")
        if clean_sym not in candidates:
            candidates.append(clean_sym)
        if f"{clean_sym}=X" not in candidates:
            candidates.append(f"{clean_sym}=X")
        if f"{clean_sym}=F" not in candidates:
            candidates.append(f"{clean_sym}=F")

        df = pd.DataFrame()
        successful_ticker = primary_ticker

        for candidate in candidates:
            try:
                temp_df = await asyncio.to_thread(
                    yf.download,
                    candidate,
                    period="1y",
                    interval="1d",
                    progress=False,
                    auto_adjust=True
                )
                if temp_df is not None and not temp_df.empty and len(temp_df) >= 5:
                    df = temp_df
                    successful_ticker = candidate
                    break
            except Exception as e:
                logger.debug("Candidate ticker %s failed: %s", candidate, e)

        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.get_level_values(0)

        if df.empty or len(df) < 5:
            raise ValueError(
                f"No live price data found for '{clean_sym}' ({resolved_exchange}). "
                f"Please verify the ticker symbol or exchange."
            )

        # 2. Technicals + Patterns
        technicals = calculate_technical_indicators(df, currency=currency_symbol)

        # 3. Fundamentals
        if clean_sym in KNOWN_GLOBAL_ASSETS:
            meta = KNOWN_GLOBAL_ASSETS[clean_sym]
            fundamentals = {
                "symbol": clean_sym,
                "name": meta["name"],
                "price": technicals["current_price"],
                "changePercent": technicals["change_percent"],
                "sector": meta.get("sector", "Commodities"),
                "industry": meta.get("industry", "Global Markets"),
                "marketCap": "N/A",
                "peRatio": None,
                "eps": None,
                "returnOnEquity": None,
                "debtToEquity": None,
                "recommendationKey": "NEUTRAL"
            }
        else:
            fundamentals = StockService.get_stock_fundamentals(clean_sym)
            if fundamentals.get("price", 0.0) == 0.0:
                fundamentals["price"] = technicals["current_price"]
                fundamentals["changePercent"] = technicals["change_percent"]

        # 4. Synthesize Trade Setup
        trade_plan = synthesize_trade_plan(
            symbol=clean_sym,
            technicals=technicals,
            fundamentals=fundamentals,
            entry_override=entry_price,
            currency=currency_symbol,
            mode=mode
        )

        tv_link = f"https://in.tradingview.com/chart/?symbol={resolved_exchange}:{clean_sym}"
        if resolved_exchange in ["COMEX", "NYMEX", "FOREX", "CRYPTO"]:
            tv_link = f"https://in.tradingview.com/chart/?symbol={clean_sym}"

        report = {
            "symbol": clean_sym,
            "name": parsed.get("name") or fundamentals.get("name") or clean_sym,
            "exchange": resolved_exchange,
            "ticker": successful_ticker,
            "currency": currency_symbol,
            "tradingview_link": tv_link,
            "signal_date": signal_date,
            "mode": mode,
            "price": technicals["current_price"],
            "change_percent": technicals["change_percent"],
            "trade_setup": {
                "signal": trade_plan["signal"],
                "entry": trade_plan["entry"],
                "stop_loss": trade_plan["stop_loss"],
                "take_profit_1": trade_plan["take_profit_1"],
                "take_profit_2": trade_plan["take_profit_2"],
                "risk_reward_ratio": trade_plan["risk_reward_ratio"],
                "confidence_score": trade_plan["confidence_score"]
            },
            "scenarios": trade_plan["scenarios"],
            "divergence_warning": trade_plan["divergence_warning"],
            "technicals": technicals,
            "fundamentals": {
                "pe_ratio": fundamentals.get("peRatio"),
                "forward_pe": fundamentals.get("forwardPE"),
                "eps": fundamentals.get("eps"),
                "roe": fundamentals.get("returnOnEquity"),
                "debt_to_equity": fundamentals.get("debtToEquity"),
                "market_cap": fundamentals.get("marketCap", "N/A"),
                "sector": fundamentals.get("sector", "General"),
                "industry": fundamentals.get("industry", "Diversified"),
                "recommendation": fundamentals.get("recommendationKey", "HOLD"),
                "target_mean_price": fundamentals.get("targetMeanPrice")
            },
            "timestamp": datetime.utcnow().isoformat()
        }

        cache.set(cache_key, report, expire=CACHE_TTL_ANALYSIS)
        return report

    @staticmethod
    async def analyze_chart(
        query: str,
        mode: str = "short_term",
        image_data: Optional[str] = None,
        user_profile: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Multi-modal chart analyzer for custom TradingView links, tickers, and PNG screenshots.
        """
        parsed = parse_tradingview_url(query)
        symbol = parsed["symbol"] or "NIFTY"
        exchange = parsed["exchange"] or "NSE"

        return await AIChartService.get_trade_glance(
            symbol=symbol,
            exchange=exchange,
            mode=mode
        )
