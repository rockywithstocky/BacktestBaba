"""Tests for Master Storage persistence layer (Phase 2)."""
import pytest

class TestPersistenceNewMethods:
    @pytest.mark.asyncio
    async def test_get_upload_by_user_and_hash_none(self):
        from backend.main import persistence_backend
        result = await persistence_backend.get_upload_by_user_and_hash(
            "nonexistent-user", "nonexistent-hash", "next_close"
        )
        assert result is None

    @pytest.mark.asyncio
    async def test_get_resolved_symbols_empty(self):
        from backend.main import persistence_backend
        result = await persistence_backend.get_resolved_symbols([])
        assert result == {}

    @pytest.mark.asyncio
    async def test_batch_upsert_signals_empty(self):
        from backend.main import persistence_backend
        result = await persistence_backend.batch_upsert_signals("test-user", [])
        assert result == 0

    @pytest.mark.asyncio
    async def test_get_upload_status_none(self):
        from backend.main import persistence_backend
        result = await persistence_backend.get_upload_status("nonexistent-id")
        assert result is None

    @pytest.mark.asyncio
    async def test_get_signals_for_upload_empty(self):
        from backend.main import persistence_backend
        result = await persistence_backend.get_signals_for_upload("nonexistent-id")
        assert result == []

    @pytest.mark.asyncio
    async def test_set_resolved_symbols_empty(self):
        from backend.main import persistence_backend
        result = await persistence_backend.set_resolved_symbols({})
        assert result == 0

    @pytest.mark.asyncio
    async def test_get_symbol_freshness_batch_empty(self):
        from backend.main import persistence_backend
        result = await persistence_backend.get_symbol_freshness_batch([])
        assert result == {}

    @pytest.mark.asyncio
    async def test_batch_update_latest_prices_empty(self):
        from backend.main import persistence_backend
        result = await persistence_backend.batch_update_latest_prices({})
        assert result == 0

    @pytest.mark.asyncio
    async def test_set_ingestion_user_none(self):
        from backend.main import persistence_backend
        result = await persistence_backend.set_ingestion_user("nonexistent-id", "test-user")
        assert result is False
