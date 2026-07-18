"""Tests for get_latest_prices_batch and latest_price_return computation."""
import pytest
import pandas as pd
from datetime import datetime, timedelta

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

    def test_persist_symbol_data_seeds_latest_price_when_fresh(self):
        """Data ending today → {sym}_latest_price cache key is seeded."""
        from backend.core.data_provider import DataProvider, cache
        sym = "__test_seed_fresh__"
        cache_key = f"{sym}_latest_price"
        dates = pd.date_range(end=datetime.now(), periods=5, freq="B")
        df = pd.DataFrame({"Close": [100 + i for i in range(5)]}, index=dates)

        cache.delete(cache_key)
        DataProvider.persist_symbol_data(sym, df)

        result = cache.get(cache_key)
        assert result is not None, "latest_price should be seeded for fresh data"
        price, date_str = result
        assert price == 104.0
        assert isinstance(date_str, str) and len(date_str) == 10

    def test_persist_symbol_data_skips_latest_price_when_stale(self):
        """Data ending >3 days ago → {sym}_latest_price NOT seeded."""
        from backend.core.data_provider import DataProvider, cache
        sym = "__test_seed_stale__"
        cache_key = f"{sym}_latest_price"
        old_end = datetime.now() - timedelta(days=10)
        dates = pd.date_range(end=old_end, periods=5, freq="B")
        df = pd.DataFrame({"Close": [100 + i for i in range(5)]}, index=dates)

        cache.delete(cache_key)
        DataProvider.persist_symbol_data(sym, df)

        result = cache.get(cache_key)
        assert result is None, "latest_price should NOT be seeded for stale data"

    def test_persist_symbol_data_early_return_still_seeds_latest_price(self):
        """Second call with same range hits early return but MUST still seed latest_price."""
        from backend.core.data_provider import DataProvider, cache
        sym = "__test_early_return__"
        cache_key = f"{sym}_latest_price"
        dates = pd.date_range(end=datetime.now(), periods=5, freq="B")
        df = pd.DataFrame({"Close": [100 + i for i in range(5)]}, index=dates)

        cache.delete(cache_key)
        DataProvider.persist_symbol_data(sym, df)  # First call: caches OHLCV + seeds latest_price
        cache.delete(cache_key)  # Simulate old cache without latest_price
        DataProvider.persist_symbol_data(sym, df)  # Second call: early return on range

        result = cache.get(cache_key)
        assert result is not None, "early return path must also seed latest_price"

    def test_persist_symbol_data_nan_last_close_uses_prev_close(self):
        """Last row Close is NaN — must use second-to-last valid Close."""
        from backend.core.data_provider import DataProvider, cache
        import numpy as np
        sym = "__test_nan_close__"
        cache_key = f"{sym}_latest_price"
        dates = pd.date_range(end=datetime.now(), periods=5, freq="B")
        df = pd.DataFrame({"Close": [100, 101, 102, np.nan, np.nan]}, index=dates)

        cache.delete(cache_key)
        DataProvider.persist_symbol_data(sym, df)

        result = cache.get(cache_key)
        assert result is not None, "should seed from last valid Close, not NaN"
        price, date_str = result
        assert price == 102.0, f"expected 102.0, got {price}"

    def test_persist_symbol_data_all_nan_close_skips(self):
        """All NaN Close — must not seed latest_price."""
        from backend.core.data_provider import DataProvider, cache
        import numpy as np
        sym = "__test_all_nan__"
        cache_key = f"{sym}_latest_price"
        dates = pd.date_range(end=datetime.now(), periods=5, freq="B")
        df = pd.DataFrame({"Close": [np.nan] * 5}, index=dates)

        cache.delete(cache_key)
        DataProvider.persist_symbol_data(sym, df)

        result = cache.get(cache_key)
        assert result is None, "should NOT seed when all Close are NaN"

    def test_get_latest_prices_batch_ohlcv_fallback(self):
        """When {sym}_latest_price is missing but OHLCV cache is fresh, fallback reads from it."""
        from backend.core.data_provider import DataProvider, cache
        sym = "__test_ohlcv_fallback__"
        cache_key = f"{sym}_latest_price"
        cache.delete(cache_key)
        cache.delete(DataProvider._data_key(sym))
        cache.delete(DataProvider._range_key(sym))

        dates = pd.date_range(end=datetime.now(), periods=5, freq="B")
        df = pd.DataFrame({"Close": [100, 101, 102, 103, 104]}, index=dates)
        DataProvider.persist_symbol_data(sym, df)

        cache.delete(cache_key)
        assert cache.get(cache_key) is None, "must not have latest_price cache before test"

        result = DataProvider.get_latest_prices_batch([sym])

        assert sym in result
        price, date_str = result[sym]
        assert price == 104.0
        assert isinstance(date_str, str) and len(date_str) == 10

        entry = cache.get(cache_key)
        assert entry is not None, "must seed latest_price cache for next call"
        assert entry[0] == 104.0

    def test_get_latest_prices_batch_ohlcv_fallback_stale(self):
        """When OHLCV cache is stale (>3 days), fallback does NOT provide price."""
        from backend.core.data_provider import DataProvider, cache
        sym = "__test_ohlcv_stale__"
        cache_key = f"{sym}_latest_price"
        cache.delete(cache_key)
        cache.delete(DataProvider._data_key(sym))
        cache.delete(DataProvider._range_key(sym))

        old_end = datetime.now() - timedelta(days=10)
        dates = pd.date_range(end=old_end, periods=5, freq="B")
        df = pd.DataFrame({"Close": [100, 101, 102, 103, 104]}, index=dates)
        DataProvider.persist_symbol_data(sym, df)

        cache.delete(cache_key)
        assert cache.get(cache_key) is None, "must not have latest_price cache before test"

        result = DataProvider.get_latest_prices_batch([sym])

        assert sym in result
        price, date_str = result[sym]
        assert price is None, "stale OHLCV must not provide price"

        entry = cache.get(cache_key)
        assert entry is None, "must NOT cache stale price"
