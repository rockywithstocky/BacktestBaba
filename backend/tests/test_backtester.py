import pytest
import asyncio
import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..'))

from backend.core.backtester import Backtester
from backend.core.symbol_resolver import SymbolResolver
from backend.core.data_provider import DataProvider
from backend.models.schemas import BacktestReport
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
    monkeypatch.setattr(SymbolResolver, "batch_resolve", lambda symbols: {s: None for s in symbols})
    
    signals = [
        {"symbol": "FAKESYMBOL", "date": "2023-01-01"}
    ]
    
    report = await Backtester.run_backtest_async(signals)
    
    assert report.total_signals == 1
    assert report.failed_signals == 1
    assert report.trades[0].status == "Symbol Not Found"


@pytest.mark.asyncio
async def test_cache_hit_streams_trades_via_progress(monkeypatch):
    """Regression: cache hit must stream cached trades as trade_batch
    via progress_callback before returning the report.
    If this fails, the user sees an empty dashboard on re-upload."""
    from backend.main import _handle_backtest

    FAKE_TRADES = [
        {"symbol": "RELIANCE.NS", "signal_date": "2023-01-01",
         "entry_price": 100.0, "status": "Success",
         "return_7d": 5.0, "return_14d": 8.0, "return_30d": 12.0,
         "return_45d": None, "return_60d": None, "return_90d": None,
         "exit_price_7d": 105.0, "exit_price_14d": 108.0, "exit_price_30d": 112.0,
         "exit_price_45d": None, "exit_price_60d": None, "exit_price_90d": None,
         "max_high_90d": None, "max_low_90d": None,
         "entry_mode": "next_close", "sector": None, "market_cap": None},
        {"symbol": "TCS.NS", "signal_date": "2023-06-01",
         "entry_price": 200.0, "status": "Success",
         "return_7d": -2.0, "return_14d": 3.0, "return_30d": 7.0,
         "return_45d": None, "return_60d": None, "return_90d": None,
         "exit_price_7d": 196.0, "exit_price_14d": 206.0, "exit_price_30d": 214.0,
         "exit_price_45d": None, "exit_price_60d": None, "exit_price_90d": None,
         "max_high_90d": None, "max_low_90d": None,
         "entry_mode": "next_close", "sector": None, "market_cap": None},
    ]
    CACHED_REPORT = {
        "total_signals": 2, "successful_signals": 2, "failed_signals": 0,
        "entry_mode": "next_close", "trades": FAKE_TRADES,
        "avg_return_7d": 1.5, "win_rate_7d": 50.0,
        "avg_return_14d": 5.5, "win_rate_14d": 100.0,
        "avg_return_30d": 9.5, "win_rate_30d": 100.0,
    }

    monkeypatch.setattr("backend.main.FileHashCache.get",
                        lambda fh, em: CACHED_REPORT)
    monkeypatch.setattr("backend.main.compute_file_hash",
                        lambda data: "testhash1234")
    monkeypatch.setattr("backend.main.parse_upload_data",
                        lambda data: [])  # should not be called

    collected_trades = []
    async def spy_progress(current, total, symbol, **kwargs):
        if "trades" in kwargs:
            collected_trades.extend(kwargs["trades"])

    report = await _handle_backtest(
        b"symbol,date\nRELIANCE,2023-01-01\nTCS,2023-06-01\n",
        "next_close", progress_callback=spy_progress
    )

    # All 2 cached trades were streamed via progress_callback
    assert len(collected_trades) == 2
    assert collected_trades[0]["symbol"] == "RELIANCE.NS"
    assert collected_trades[1]["symbol"] == "TCS.NS"

    # Returned report is correctly reconstructed
    assert isinstance(report, BacktestReport)
    assert report.total_signals == 2
    assert len(report.trades) == 2

    # Entry-mode-specific cache variant
    report_open = await _handle_backtest(
        b"symbol,date\nRELIANCE,2023-01-01\nTCS,2023-06-01\n",
        "next_open", progress_callback=spy_progress
    )
    assert isinstance(report_open, BacktestReport)


@pytest.mark.asyncio
async def test_cache_hit_empty_trades(monkeypatch):
    """Cache hit with empty trades list must not crash."""
    from backend.main import _handle_backtest
    monkeypatch.setattr("backend.main.FileHashCache.get",
                        lambda fh, em: {"total_signals": 0, "trades": [],
                                        "successful_signals": 0, "failed_signals": 0,
                                        "entry_mode": "next_close"})
    monkeypatch.setattr("backend.main.compute_file_hash",
                        lambda data: "emptyhash")

    collected = []
    async def spy(current, total, symbol, **kwargs):
        collected.append((current, total, symbol, kwargs.get("trades", [])))

    report = await _handle_backtest(b"symbol,date\nA,2023-01-01\n", "next_close", progress_callback=spy)
    assert report.total_signals == 0
    assert len(report.trades) == 0
    trades_sent = [c for c in collected if c[3]]
    assert len(trades_sent) == 0


@pytest.mark.asyncio
async def test_cache_hit_http_path(monkeypatch):
    """HTTP path (no progress_callback) must return dict directly."""
    from backend.main import _handle_backtest
    monkeypatch.setattr("backend.main.FileHashCache.get",
                        lambda fh, em: {"total_signals": 1, "trades": [],
                                        "successful_signals": 0, "failed_signals": 0,
                                        "entry_mode": "next_close"})
    monkeypatch.setattr("backend.main.compute_file_hash",
                        lambda data: "httpcache")

    result = await _handle_backtest(b"data", "next_close")
    assert isinstance(result, dict)
    assert result["total_signals"] == 1


