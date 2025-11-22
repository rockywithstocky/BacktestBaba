import pytest
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
    monkeypatch.setattr(SymbolResolver, "resolve", mock_resolve)

def test_backtester_run(mock_dependencies):
    signals = [
        {"symbol": "RELIANCE", "date": "2023-01-01"},
        {"symbol": "TCS", "date": "2023-01-01"}
    ]
    
    report = Backtester.run_backtest(signals)
    
    assert report.total_signals == 2
    assert report.successful_signals == 2
    assert len(report.trades) == 2
    
    # Check return calculation
    # Entry at 2023-01-02 (next business day) -> Price 100 (approx, based on mock)
    # 7d later -> 2023-01-09 -> Price should be higher
    
    trade = report.trades[0]
    assert trade.status == "Success"
    assert trade.return_7d is not None
    assert trade.return_7d > 0 # Since price goes up in mock

def test_backtester_invalid_symbol():
    # Test with real resolver (mocking only data provider if needed, but here we want to test resolver failure logic)
    # Actually, we mocked resolver to always succeed above. Let's override for this test.
    pass 
