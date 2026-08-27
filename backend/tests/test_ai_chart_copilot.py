import pytest
import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..'))

import pandas as pd
import numpy as np
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

from backend.main import app
from backend.core.ai_chart_service import (
    parse_tradingview_url,
    calculate_technical_indicators,
    synthesize_trade_plan,
    detect_technical_patterns,
    AIChartService
)

client = TestClient(app)


def test_parse_tradingview_url_and_global_assets():
    # 1. Gold / Commodities mapping
    p_gold = parse_tradingview_url("XAUUSD")
    assert p_gold["symbol"] == "XAUUSD"
    assert p_gold["ticker"] == "GC=F"
    assert p_gold["currency"] == "$"
    assert p_gold["exchange"] == "COMEX"

    # 2. Crypto mapping
    p_btc = parse_tradingview_url("BTCUSD")
    assert p_btc["symbol"] == "BTCUSD"
    assert p_btc["ticker"] == "BTC-USD"
    assert p_btc["currency"] == "$"

    # 3. US Tech Stocks
    p_aapl = parse_tradingview_url("AAPL")
    assert p_aapl["symbol"] == "AAPL"
    assert p_aapl["currency"] == "$"
    assert p_aapl["exchange"] == "NASDAQ"

    # 4. Indian Stock via TV URL
    p_sail = parse_tradingview_url("https://in.tradingview.com/chart/gnW9XoUU/?symbol=NSE%3ASAIL")
    assert p_sail["symbol"] == "SAIL"
    assert p_sail["ticker"] == "SAIL.NS"
    assert p_sail["currency"] == "₹"
    assert p_sail["exchange"] == "NSE"


def test_calculate_technical_indicators_real_values():
    dates = pd.date_range("2026-01-01", periods=60, freq="B")
    prices = np.linspace(2500, 2700, 60)
    df = pd.DataFrame({
        "Open": prices - 5.0,
        "High": prices + 15.0,
        "Low": prices - 10.0,
        "Close": prices,
        "Volume": [200000] * 60
    }, index=dates)

    tech = calculate_technical_indicators(df, currency="$")

    assert tech["current_price"] == 2700.0
    assert tech["trend_score"] >= 6
    assert tech["atr_14"]["unit"] == "$"
    assert tech["fibonacci"]["swing_high"] > tech["fibonacci"]["swing_low"]


def test_synthesize_trade_plan_gold_currency():
    technicals = {
        "current_price": 2750.0,
        "trend_score": 8,
        "rsi_14": {"value": 62.0},
        "sma20": 2720.0,
        "sma50": 2680.0,
        "resistance_level": 2790.0,
        "support_level": 2690.0,
        "atr_14": {"value": 25.0}
    }
    fundamentals = {
        "peRatio": None,
        "returnOnEquity": None
    }

    plan = synthesize_trade_plan(
        symbol="XAUUSD",
        technicals=technicals,
        fundamentals=fundamentals,
        currency="$",
        mode="short_term"
    )

    assert plan["signal"] in ["BUY LIMIT", "BUY MARKET"]
    assert "$" in plan["scenarios"]["bullish"]["trigger"]
    assert plan["stop_loss"] < plan["entry"]
    assert plan["take_profit_1"] > plan["entry"]


@patch("yfinance.download")
def test_api_glance_endpoint_xauusd(mock_yf):
    dates = pd.date_range("2026-01-01", periods=30, freq="B")
    prices = np.linspace(2700, 2760, 30)
    mock_df = pd.DataFrame({
        "Open": prices - 2,
        "High": prices + 10,
        "Low": prices - 5,
        "Close": prices,
        "Volume": [10000] * 30
    }, index=dates)
    mock_yf.return_value = mock_df

    response = client.post("/api/ai/glance", json={
        "symbol": "XAUUSD",
        "mode": "short_term"
    })

    assert response.status_code == 200
    data = response.json()
    assert data["symbol"] == "XAUUSD"
    assert data["currency"] == "$"
    assert data["price"] == 2760.0
    assert data["exchange"] == "COMEX"
