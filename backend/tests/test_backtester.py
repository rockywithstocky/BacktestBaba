import pytest
import asyncio
import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..'))

from backend.core.backtester import Backtester
from backend.core.symbol_resolver import SymbolResolver
from backend.core.data_provider import DataProvider
import pandas as pd
from datetime import datetime

# Mock DataProvider to avoid network calls during tests
def mock_get_ticker_data(symbol, start, end):
    # Create a dummy dataframe
    dates = pd.date_range(start=start, end=end, freq='B') # Business days
    data = pd.DataFrame(index=dates)
    data['Close'] = [100 + i for i in range(len(dates))] # Price goes up by 1 every day
    data['High'] = data['Close'] + 5
    data['Low'] = data['Close'] - 5
    return data

def mock_resolve(symbol):
    return f"{symbol}.NS"

@pytest.fixture
def mock_dependencies(monkeypatch):
    monkeypatch.setattr(DataProvider, "get_ticker_data", mock_get_ticker_data)
    monkeypatch.setattr(DataProvider, "get_bulk_ticker_data", lambda symbols, start, end: pd.DataFrame())
    monkeypatch.setattr(SymbolResolver, "resolve", mock_resolve)

@pytest.mark.asyncio
async def test_backtester_run(mock_dependencies):
    signals = [
        {"symbol": "RELIANCE", "date": "2023-01-01"},
        {"symbol": "TCS", "date": "2023-01-01"}
    ]
    
    report = await Backtester.run_backtest_async(signals)
    
    assert report.total_signals == 2
    assert report.successful_signals == 2
    assert len(report.trades) == 2
    
    # Check return calculation
    # Entry at 2023-01-02 (next business day) -> Price 100 (approx, based on mock)
    # 7d later -> 2023-01-09 -> Price should be higher
    
    trade = report.trades[0]
    assert trade.status == "Success"
    
    # Assert all 6 horizons are populated and strictly positive (since mock price goes up daily)
    horizons = [7, 14, 30, 45, 60, 90]
    for h in horizons:
        val = getattr(trade, f"return_{h}d")
        assert val is not None, f"return_{h}d is missing"
        assert val > 0, f"return_{h}d should be > 0"
        
        exit_price = getattr(trade, f"exit_price_{h}d")
        assert exit_price is not None, f"exit_price_{h}d is missing"
        
        # Verify aggregates exist in report
        avg_ret = getattr(report, f"avg_return_{h}d")
        assert avg_ret is not None, f"avg_return_{h}d aggregate missing"
        
        win_rate = getattr(report, f"win_rate_{h}d")
        assert win_rate == 100.0, f"win_rate_{h}d aggregate incorrect"

@pytest.mark.asyncio
async def test_backtester_invalid_symbol(monkeypatch):
    """Test that unresolvable symbols are handled gracefully."""
    monkeypatch.setattr(DataProvider, "get_ticker_data", mock_get_ticker_data)
    monkeypatch.setattr(SymbolResolver, "resolve", lambda s: None)  # Always fail
    
    signals = [
        {"symbol": "FAKESYMBOL", "date": "2023-01-01"}
    ]
    
    report = await Backtester.run_backtest_async(signals)
    
    assert report.total_signals == 1
    assert report.failed_signals == 1
    assert report.trades[0].status == "Symbol Not Found"
