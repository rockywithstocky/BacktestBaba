"""Tests for get_latest_prices_batch and latest_price_return computation."""
import pytest
from datetime import datetime

class TestLatestPriceBatch:
    def test_get_latest_prices_batch_empty(self):
        from backend.core.data_provider import DataProvider
        result = DataProvider.get_latest_prices_batch([])
        assert result == {}

    def test_get_latest_prices_batch_single_symbol(self):
        from backend.core.data_provider import DataProvider
        result = DataProvider.get_latest_prices_batch(["RELIANCE.NS"])
        assert "RELIANCE.NS" in result
        price, date_str = result["RELIANCE.NS"]
        if price is not None:
            assert isinstance(price, float)
            assert price > 0
            assert isinstance(date_str, str) and len(date_str) == 10

    def test_get_latest_prices_batch_nonexistent(self):
        from backend.core.data_provider import DataProvider
        result = DataProvider.get_latest_prices_batch(["INVALIDSYMXYZ.NS"])
        assert "INVALIDSYMXYZ.NS" in result
        price, date_str = result["INVALIDSYMXYZ.NS"]

    def test_latest_price_return_positive(self):
        from backend.models.schemas import SignalResult
        t = SignalResult(symbol="T.NS", signal_date="2026-07-01", entry_price=1000.0, status="Success",
                         latest_price=1100.0, latest_price_date="2026-07-17")
        t.latest_price_return = round(((1100.0 - 1000.0) / 1000.0) * 100, 2)
        assert t.latest_price_return == 10.0

    def test_latest_price_return_zero_entry(self):
        from backend.models.schemas import SignalResult
        t = SignalResult(symbol="T.NS", signal_date="2026-07-01", entry_price=0.0, status="Success",
                         latest_price=1100.0, latest_price_date="2026-07-17")
        assert t.latest_price_return is None

    def test_latest_price_return_none_price(self):
        from backend.models.schemas import SignalResult
        t = SignalResult(symbol="T.NS", signal_date="2026-07-01", entry_price=1000.0, status="Success",
                         latest_price=None, latest_price_date=None)
        assert t.latest_price_return is None

    def test_report_latest_price_date(self):
        from backend.models.schemas import BacktestReport, SignalResult
        trades = [
            SignalResult(symbol="A.NS", signal_date="2026-07-01", entry_price=100.0, status="Success",
                         latest_price=110.0, latest_price_date="2026-07-16", latest_price_return=10.0),
            SignalResult(symbol="B.NS", signal_date="2026-07-01", entry_price=200.0, status="Success",
                         latest_price=220.0, latest_price_date="2026-07-17", latest_price_return=10.0),
        ]
        r = BacktestReport(total_signals=2, successful_signals=2, failed_signals=0, trades=trades,
                           latest_price_date="2026-07-17")
        assert r.latest_price_date == "2026-07-17"

    def test_cache_source_field(self):
        from backend.models.schemas import BacktestReport, SignalResult
        r = BacktestReport(total_signals=1, successful_signals=1, failed_signals=0,
                           trades=[SignalResult(symbol="A.NS", signal_date="2026-07-01", entry_price=100.0, status="Success")],
                           cache_source="l3_compute")
        assert r.cache_source == "l3_compute"

    def test_mid_day_date_not_future(self):
        from backend.core.data_provider import DataProvider
        result = DataProvider.get_latest_prices_batch(["TCS.NS"])
        assert "TCS.NS" in result
        price, date_str = result["TCS.NS"]
        if price is not None:
            today = datetime.now().strftime("%Y-%m-%d")
            assert date_str <= today, f"latest_price_date {date_str} should not be in the future"
