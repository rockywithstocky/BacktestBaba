import pytest
import json
from unittest.mock import AsyncMock

from backend.persistence import (
    PersistenceBackend,
    NullBackend,
    D1WorkerBackend,
    UploadRecord,
    TradeRecord,
    compute_row_hash,
    _build_results_json,
)


# ---------------------------------------------------------------------------
# compute_row_hash
# ---------------------------------------------------------------------------

class TestComputeRowHash:
    def test_deterministic(self):
        a = compute_row_hash("RELIANCE.NS", "2026-01-15", "next_close")
        b = compute_row_hash("RELIANCE.NS", "2026-01-15", "next_close")
        assert a == b

    def test_different_symbols_differ(self):
        a = compute_row_hash("RELIANCE.NS", "2026-01-15", "next_close")
        b = compute_row_hash("TCS.NS", "2026-01-15", "next_close")
        assert a != b

    def test_different_dates_differ(self):
        a = compute_row_hash("RELIANCE.NS", "2026-01-15", "next_close")
        b = compute_row_hash("RELIANCE.NS", "2026-01-16", "next_close")
        assert a != b

    def test_different_modes_differ(self):
        a = compute_row_hash("RELIANCE.NS", "2026-01-15", "next_close")
        b = compute_row_hash("RELIANCE.NS", "2026-01-15", "next_open")
        assert a != b

    def test_output_is_hex(self):
        h = compute_row_hash("RELIANCE.NS", "2026-01-15", "next_close")
        assert len(h) == 64
        int(h, 16)  # raises if not valid hex


# ---------------------------------------------------------------------------
# _build_results_json
# ---------------------------------------------------------------------------

class FakeTrade:
    pass


def make_trade(**overrides):
    t = FakeTrade()
    defaults = {
        "return_7d": 5.23, "exit_price_7d": 152.30,
        "return_14d": 8.15, "exit_price_14d": 158.10,
        "return_30d": -2.45, "exit_price_30d": 142.80,
        "return_45d": 12.60, "exit_price_45d": 164.50,
        "return_60d": 18.90, "exit_price_60d": 173.20,
        "return_90d": 25.40, "exit_price_90d": 182.00,
        "max_high_90d": 185.00, "max_high_date": "2026-03-15",
        "max_low_90d": 135.20, "max_low_date": "2026-02-01",
        "signal_close_price": 145.00,
    }
    for k, v in {**defaults, **overrides}.items():
        setattr(t, k, v)
    return t


class TestBuildResultsJson:
    def test_returns_valid_json(self):
        raw = _build_results_json(make_trade())
        data = json.loads(raw)
        assert data["return_7d"] == 5.23
        assert data["return_90d"] == 25.4
        assert data["max_high_90d"] == 185.0

    def test_null_horizons_omitted(self):
        raw = _build_results_json(make_trade(return_7d=None, exit_price_7d=None))
        data = json.loads(raw)
        assert "return_7d" not in data
        assert "return_14d" in data

    def test_all_none_returns_empty_object(self):
        t = make_trade(
            return_7d=None, exit_price_7d=None,
            return_14d=None, exit_price_14d=None,
            return_30d=None, exit_price_30d=None,
            return_45d=None, exit_price_45d=None,
            return_60d=None, exit_price_60d=None,
            return_90d=None, exit_price_90d=None,
            max_high_90d=None, max_low_90d=None,
            max_high_date=None, max_low_date=None,
            signal_close_price=None,
        )
        data = json.loads(_build_results_json(t))
        assert data == {}

    def test_compact_format(self):
        raw = _build_results_json(make_trade())
        assert ", " not in raw
        assert ": " not in raw

    def test_nan_values_omitted(self):
        t = make_trade(return_7d=float("nan"), exit_price_7d=float("nan"))
        data = json.loads(_build_results_json(t))
        assert "return_7d" not in data
        assert "exit_price_7d" not in data
        assert "return_14d" in data

    def test_nan_max_high_omitted(self):
        t = make_trade(max_high_90d=float("nan"), max_low_90d=float("nan"))
        data = json.loads(_build_results_json(t))
        assert "max_high_90d" not in data
        assert "max_low_90d" not in data


# ---------------------------------------------------------------------------
# NullBackend
# ---------------------------------------------------------------------------

class TestNullBackend:
    @pytest.fixture
    def backend(self):
        return NullBackend()

    @pytest.mark.asyncio
    async def test_save_upload_returns_none(self, backend):
        result = await backend.save_upload(UploadRecord("h", "f.csv", "next_close", 10))
        assert result is None

    @pytest.mark.asyncio
    async def test_save_signals_returns_none(self, backend):
        result = await backend.save_signals("uid", [])
        assert result is None

    @pytest.mark.asyncio
    async def test_list_uploads_returns_empty(self, backend):
        result = await backend.list_uploads()
        assert result == []

    @pytest.mark.asyncio
    async def test_get_quota_returns_zero(self, backend):
        q = await backend.get_quota()
        assert q["total_writes"] == 0
        assert q["soft_blocked"] is False

    @pytest.mark.asyncio
    async def test_healthcheck_returns_false(self, backend):
        assert await backend.healthcheck() is False

    def test_is_instance(self, backend):
        assert isinstance(backend, PersistenceBackend)

    @pytest.mark.asyncio
    async def test_log_ingestion_returns_none(self, backend):
        result = await backend.log_ingestion("h", "f.csv", "f.csv", 100)
        assert result is None

    @pytest.mark.asyncio
    async def test_update_ingestion_status_returns_false(self, backend):
        result = await backend.update_ingestion_status("id", "completed")
        assert result is False

    @pytest.mark.asyncio
    async def test_lookup_signals_returns_empty(self, backend):
        result = await backend.lookup_signals(["hash1", "hash2"])
        assert result == []

    @pytest.mark.asyncio
    async def test_close_does_not_raise(self, backend):
        await backend.close()


# ---------------------------------------------------------------------------
# D1WorkerBackend (mocked HTTP)
# ---------------------------------------------------------------------------

class TestD1WorkerBackend:
    @pytest.fixture
    def worker_url(self):
        return "https://test-worker.workers.dev"

    @pytest.fixture
    def backend(self, worker_url):
        return D1WorkerBackend(worker_url, timeout=1.0)

    @pytest.mark.asyncio
    async def test_save_upload_success(self, backend):
        backend._post = AsyncMock(return_value={"id": "uuid-123", "status": "pending"})
        record = UploadRecord("abc123", "test.csv", "next_close", 50)
        result = await backend.save_upload(record)
        assert result == "uuid-123"
        backend._post.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_save_upload_returns_none_on_failure(self, backend):
        backend._post = AsyncMock(return_value=None)
        result = await backend.save_upload(UploadRecord("h", "f.csv", "next_close", 1))
        assert result is None

    @pytest.mark.asyncio
    async def test_save_upload_missing_id(self, backend):
        backend._post = AsyncMock(return_value={"status": "pending"})
        result = await backend.save_upload(UploadRecord("h", "f.csv", "next_close", 1))
        assert result is None

    @pytest.mark.asyncio
    async def test_save_signals_success(self, backend):
        backend._post = AsyncMock(
            return_value={"inserted": 10, "skipped": 0}
        )
        trades = [TradeRecord(f"row{i}", "RELIANCE.NS", "2026-01-15", None, None, "next_close", "Success", None) for i in range(10)]
        result = await backend.save_signals("upload-1", trades)
        assert result["inserted"] == 10
        assert result["skipped"] == 0
        backend._post.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_save_signals_returns_none_on_failure(self, backend):
        backend._post = AsyncMock(return_value=None)
        result = await backend.save_signals("upload-1", [])
        assert result is None

    @pytest.mark.asyncio
    async def test_list_uploads_success(self, backend):
        fake_results = [{"id": "u1", "filename": "a.csv"}]
        backend._get = AsyncMock(return_value={"results": fake_results, "total": 1})
        result = await backend.list_uploads(limit=10, offset=0)
        assert result == fake_results

    @pytest.mark.asyncio
    async def test_list_uploads_empty(self, backend):
        backend._get = AsyncMock(return_value=None)
        result = await backend.list_uploads()
        assert result == []

    @pytest.mark.asyncio
    async def test_get_quota_success(self, backend):
        backend._get = AsyncMock(
            return_value={"total_writes": 5000, "write_limit": 1000000, "percent_used": 0.5, "soft_blocked": False}
        )
        q = await backend.get_quota()
        assert q["total_writes"] == 5000

    @pytest.mark.asyncio
    async def test_get_quota_fallback(self, backend):
        backend._get = AsyncMock(return_value=None)
        q = await backend.get_quota()
        assert q["total_writes"] == 0

    @pytest.mark.asyncio
    async def test_healthcheck_ok(self, backend):
        backend._get = AsyncMock(return_value={"status": "ok"})
        assert await backend.healthcheck() is True

    @pytest.mark.asyncio
    async def test_healthcheck_fail(self, backend):
        backend._get = AsyncMock(return_value=None)
        assert await backend.healthcheck() is False

    @pytest.mark.asyncio
    async def test_healthcheck_non_ok(self, backend):
        backend._get = AsyncMock(return_value={"status": "error"})
        assert await backend.healthcheck() is False

    def test_base_url_trailing_slash(self):
        backend = D1WorkerBackend("https://example.com/", timeout=1.0)
        assert backend._base_url == "https://example.com/api"

    def test_base_url_no_trailing_slash(self):
        backend = D1WorkerBackend("https://example.com", timeout=1.0)
        assert backend._base_url == "https://example.com/api"

    @pytest.mark.asyncio
    async def test_log_ingestion_success(self, backend):
        backend._post = AsyncMock(return_value={"id": "ing-123"})
        result = await backend.log_ingestion("h", "f.csv", "f.csv", 100)
        assert result == "ing-123"

    @pytest.mark.asyncio
    async def test_log_ingestion_missing_id(self, backend):
        backend._post = AsyncMock(return_value={"status": "received"})
        result = await backend.log_ingestion("h", "f.csv", "f.csv", 100)
        assert result is None

    @pytest.mark.asyncio
    async def test_log_ingestion_returns_none_on_failure(self, backend):
        backend._post = AsyncMock(return_value=None)
        result = await backend.log_ingestion("h", "f.csv", "f.csv", 100)
        assert result is None

    @pytest.mark.asyncio
    async def test_update_ingestion_status_success(self, backend):
        backend._patch = AsyncMock(return_value={"ok": True})
        result = await backend.update_ingestion_status("ing-123", "completed")
        assert result is True

    @pytest.mark.asyncio
    async def test_update_ingestion_status_failure(self, backend):
        backend._patch = AsyncMock(return_value=None)
        result = await backend.update_ingestion_status("ing-123", "completed")
        assert result is False

    @pytest.mark.asyncio
    async def test_lookup_signals_success(self, backend):
        backend._post = AsyncMock(return_value={"existing": ["hash1"]})
        result = await backend.lookup_signals(["hash1", "hash2"])
        assert result == ["hash1"]

    @pytest.mark.asyncio
    async def test_lookup_signals_none(self, backend):
        backend._post = AsyncMock(return_value={"existing": []})
        result = await backend.lookup_signals(["new_hash"])
        assert result == []

    @pytest.mark.asyncio
    async def test_lookup_signals_failure(self, backend):
        backend._post = AsyncMock(return_value=None)
        result = await backend.lookup_signals(["hash1"])
        assert result == []

    @pytest.mark.asyncio
    async def test_lookup_signals_with_user_id(self, backend):
        backend._post = AsyncMock(return_value={"existing": []})
        await backend.lookup_signals(["hash1"], user_id="user-1")
        backend._post.assert_awaited_once_with("/signals/lookup", {"row_hashes": ["hash1"], "user_id": "user-1"})

    @pytest.mark.asyncio
    async def test_close_does_not_raise(self, backend):
        await backend.close()

    @pytest.mark.asyncio
    async def test_close_called_twice(self, backend):
        await backend.close()
        await backend.close()  # should not raise
