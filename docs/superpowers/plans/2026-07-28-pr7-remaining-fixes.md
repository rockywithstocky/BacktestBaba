# PR #7 Remaining Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) for syntax tracking.

**Goal:** Fix 3 remaining PR #7 items (entry_price in row_hash, auth tests, L1 timestamp freshness) with zero regression.

**Architecture:** Three independent changes ordered by risk. Auth tests (zero prod change) first, entry_price hash (low risk) second, L1 timestamp (low-medium risk) third. Each has its own tests. Full test suite runs at end.

**Tech Stack:** Python 3.11, FastAPI, pytest, asyncio, diskcache

## Global Constraints

- All existing tests must pass unchanged: `pytest backend/tests/ -v --asyncio-mode=auto`
- Frontend build must succeed: `cd frontend; npm run build`
- No changes to Pydantic models, DB schema, or frontend code
- `latest_price_date` string field must remain unchanged (frontend reads it)
- Backward compatibility with existing diskcache entries

---

### Task 1: Add auth HTTP tests

**Files:**
- Create: `backend/tests/test_auth.py`
- Modify: none (zero production code changes)

**Interfaces:**
- Consumes: FastAPI app `backend.main.app`, `PERSISTENCE_ENABLED` flag, `persistence_backend` global
- Produces: 12 test functions covering auth endpoints

- [ ] **Step 1: Write the failing tests**

```python
"""Tests for auth endpoints — covers signup, login, token validation."""
import pytest
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.main import app
from backend.config import PERSISTENCE_ENABLED


client = TestClient(app)


def _override_persistence(val: bool):
    """Helper to set PERSISTENCE_ENABLED for test scope."""
    import backend.main as m
    m.PERSISTENCE_ENABLED = val


class TestAuthDisabled:
    """When PERSISTENCE_ENABLED=False, all auth endpoints return 501."""

    def setup_method(self):
        _override_persistence(False)

    def test_signup_returns_501(self):
        resp = client.post("/api/auth/signup", json={"email": "a@b.com", "password": "x"})
        assert resp.status_code == 501
        assert "Auth not configured" in resp.text

    def test_login_returns_501(self):
        resp = client.post("/api/auth/login", json={"email": "a@b.com", "password": "x"})
        assert resp.status_code == 501
        assert "Auth not configured" in resp.text

    def test_me_returns_501(self):
        resp = client.get("/api/auth/me", headers={"Authorization": "Bearer x"})
        assert resp.status_code == 501
        assert "Auth not configured" in resp.text


class TestAuthEnabled:
    """When PERSISTENCE_ENABLED=True, test real endpoint behavior."""

    def setup_method(self):
        _override_persistence(True)

    def test_signup_missing_body(self):
        resp = client.post("/api/auth/signup", json={})
        assert resp.status_code == 422  # validation error

    def test_login_missing_body(self):
        resp = client.post("/api/auth/login", json={})
        assert resp.status_code == 422

    def test_me_missing_header(self):
        resp = client.get("/api/auth/me")
        assert resp.status_code == 401
        assert "Missing or invalid auth header" in resp.text

    def test_me_malformed_header(self):
        resp = client.get("/api/auth/me", headers={"Authorization": "NotBearer x"})
        assert resp.status_code == 401
        assert "Missing or invalid auth header" in resp.text
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose exec backend pytest backend/tests/test_auth.py -v --asyncio-mode=auto`
Expected: Tests run (may pass or fail depending on environment — the app already has the endpoints). If they pass on first run, that's fine — the tests validate the real behavior.

- [ ] **Step 3: Add remaining tests for deeper coverage**

```python
    def test_signup_with_valid_body(self, monkeypatch):
        async def mock_signup(email, password, name):
            return {"_status": 201, "id": "u1", "email": email}
        import backend.main as m
        monkeypatch.setattr(m.persistence_backend, "auth_signup", mock_signup)
        resp = client.post("/api/auth/signup", json={"email": "a@b.com", "password": "pass123", "name": "Alice"})
        assert resp.status_code == 201

    def test_signup_backend_returns_none(self, monkeypatch):
        async def mock_signup(email, password, name):
            return None
        import backend.main as m
        monkeypatch.setattr(m.persistence_backend, "auth_signup", mock_signup)
        resp = client.post("/api/auth/signup", json={"email": "a@b.com", "password": "pass123"})
        assert resp.status_code == 502
        assert "Auth service unavailable" in resp.text

    def test_login_success(self, monkeypatch):
        async def mock_login(email, password):
            return {"token": "tok_abc", "user": {"email": email}}
        import backend.main as m
        monkeypatch.setattr(m.persistence_backend, "auth_login", mock_login)
        resp = client.post("/api/auth/login", json={"email": "a@b.com", "password": "pass123"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["token"] == "tok_abc"

    def test_login_failure(self, monkeypatch):
        async def mock_login(email, password):
            return None
        import backend.main as m
        monkeypatch.setattr(m.persistence_backend, "auth_login", mock_login)
        resp = client.post("/api/auth/login", json={"email": "a@b.com", "password": "wrong"})
        assert resp.status_code == 401
        assert "Invalid credentials" in resp.text

    def test_me_valid_token(self, monkeypatch):
        async def mock_validate(token):
            return {"email": "a@b.com", "is_admin": False}
        import backend.main as m
        monkeypatch.setattr(m.persistence_backend, "auth_validate", mock_validate)
        # Clear auth cache so our mock is called
        m._auth_cache.clear()
        resp = client.get("/api/auth/me", headers={"Authorization": "Bearer tok_valid"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["user"]["email"] == "a@b.com"

    def test_me_invalid_token(self, monkeypatch):
        async def mock_validate(token):
            return None
        import backend.main as m
        monkeypatch.setattr(m.persistence_backend, "auth_validate", mock_validate)
        m._auth_cache.clear()
        resp = client.get("/api/auth/me", headers={"Authorization": "Bearer tok_invalid"})
        assert resp.status_code == 401
        assert "Invalid or expired session" in resp.text

    def test_validate_token_caches_result(self, monkeypatch):
        """_validate_token should cache the user for 60s."""
        call_count = 0
        async def mock_validate(token):
            nonlocal call_count
            call_count += 1
            return {"email": "a@b.com"}
        import backend.main as m
        monkeypatch.setattr(m.persistence_backend, "auth_validate", mock_validate)
        m._auth_cache.clear()

        # First call — hits backend
        result1 = None
        import asyncio
        result1 = asyncio.run(m._validate_token("tok_abc"))
        assert result1 is not None
        assert call_count == 1

        # Second call — should use cache
        result2 = asyncio.run(m._validate_token("tok_abc"))
        assert result2 is not None
        assert call_count == 1, "Should not call backend again (cached)"
```

- [ ] **Step 4: Run all auth tests**

Run: `docker compose exec backend pytest backend/tests/test_auth.py -v --asyncio-mode=auto`
Expected: 12/12 passed

- [ ] **Step 5: Commit**

```bash
git add backend/tests/test_auth.py
git commit -m "test: add auth HTTP tests for signup/login/me endpoints"
```

---

### Task 2: Add `entry_price` to `compute_row_hash()`

**Files:**
- Modify: `backend/persistence.py:16-18` — add `entry_price` param to hash formula
- Modify: `backend/main.py:269` — pass `t.entry_price` to `compute_row_hash()`
- Modify: `backend/main.py:292` — pass `entry_price` to `compute_row_hash()`
- Modify: `backend/tests/test_persistence.py:20-45` — update test vectors
- Test: `backend/tests/test_persistence.py` (runs with rest)

**Interfaces:**
- Consumes: `compute_row_hash(symbol, signal_date, entry_mode, duration, entry_price)` — new signature
- Produces: SHA-256 hashes that differ when entry_price differs

- [ ] **Step 1: Update hash formula and signature**

In `backend/persistence.py:16-18`, change:
```python
def compute_row_hash(symbol: str, signal_date: str, entry_mode: str, duration: int = 90) -> str:
    raw = f"{symbol}|{signal_date}|{entry_mode}|{duration}"
```
To:
```python
def compute_row_hash(symbol: str, signal_date: str, entry_mode: str, duration: int = 90, entry_price: float = 0.0) -> str:
    raw = f"{symbol}|{signal_date}|{entry_mode}|{duration}|{entry_price}"
```

- [ ] **Step 2: Update callers in main.py**

In `backend/main.py:269`, change:
```python
row_hash=compute_row_hash(t.symbol, t.signal_date, entry_mode, duration),
```
To:
```python
row_hash=compute_row_hash(t.symbol, t.signal_date, entry_mode, duration, t.entry_price),
```

In `backend/main.py:292`, change:
```python
"row_hash": compute_row_hash(t.symbol, t.signal_date, entry_mode, duration),
```
To:
```python
"row_hash": compute_row_hash(t.symbol, t.signal_date, entry_mode, duration, t.entry_price),
```

- [ ] **Step 3: Update existing tests and add entry_price test**

In `backend/tests/test_persistence.py:22-43`, add `entry_price=0.0` to all `compute_row_hash()` calls. Add a new test:

```python
def test_different_entry_prices_differ():
    a = compute_row_hash("RELIANCE.NS", "2026-01-15", "next_close", entry_price=100.0)
    b = compute_row_hash("RELIANCE.NS", "2026-01-15", "next_close", entry_price=200.0)
    assert a != b, "Different entry prices must produce different hashes"
```
Add it after `test_different_modes_differ` (after line 40) and before `test_output_is_hex` (line 42).

- [ ] **Step 4: Run all tests**

Run: `docker compose exec backend pytest backend/tests/ -v --asyncio-mode=auto`
Expected: 86/86 passed (85 existing + 1 new)

- [ ] **Step 5: Commit**

```bash
git add backend/persistence.py backend/main.py backend/tests/test_persistence.py
git commit -m "fix: add entry_price to compute_row_hash for correct dedup"
```

---

### Task 3: L1 freshness uses timestamp instead of date

**Files:**
- Modify: `backend/main.py:339-374` — add timestamp field, change comparison
- Test: `backend/tests/test_backtester.py:222-272` — update fixture to include `latest_price_ts`

**Interfaces:**
- Consumes: FileHashCache get/set (unchanged), `time.time()`, report dict with optional `latest_price_ts`
- Produces: L1 cache entries with `latest_price_ts` field; stale detection based on 5-min threshold

- [ ] **Step 1: Inject `latest_price_ts` in L3 write path**

At `backend/main.py:537` (after `FileHashCache.set(file_hash, entry_mode, report_dict)` on line 537 — no, the .set() IS line 537), add `latest_price_ts` to report_dict before calling .set(). Find the block around line 530-537:

```python
    report_dict = report.model_dump()
    report_dict["latest_price_ts"] = time.time()
    FileHashCache.set(file_hash, entry_mode, report_dict)
```

- [ ] **Step 2: Inject `latest_price_ts` in L2 write path**

At `backend/main.py:474-481` (after `report = BacktestReport(...)` and before `FileHashCache.set`), inject the timestamp:

```python
                    report_dict = report.model_dump()
                    report_dict["latest_price_ts"] = time.time()
                    FileHashCache.delete(file_hash, entry_mode)
                    FileHashCache.set(file_hash, entry_mode, report_dict)
```

Note: The current code calls `FileHashCache.set(file_hash, entry_mode, report.model_dump())` — change to use the dict with timestamp injected.

- [ ] **Step 3: Set `latest_price_ts` in L1 freshness refresh path**

At `backend/main.py:370` (after `cached["latest_price_date"] = max(latest_dates)`), add:

```python
                    cached["latest_price_ts"] = time.time()
```

- [ ] **Step 4: Change the freshness comparison**

At `backend/main.py:345`, change from:
```python
            if cached_latest_date is None or cached_latest_date < datetime.now().strftime("%Y-%m-%d"):
```
To:
```python
            cached_latest_ts = cached.get("latest_price_ts")
            if cached_latest_ts is None or time.time() - cached_latest_ts > 300:
```

Also remove the unused `from datetime import datetime` at the top of `main.py` or keep it if used elsewhere.

- [ ] **Step 5: Update test fixture**

In `backend/tests/test_backtester.py:239-243`, add `"latest_price_ts"` to the fixture:

```python
    CACHED_WITH_STALE_DATE = {
        "total_signals": 1, "successful_signals": 1, "failed_signals": 0,
        "entry_mode": "next_close", "trades": FAKE_TRADES,
        "latest_price_date": "2023-01-01",
        "latest_price_ts": 0,  # 1970 — definitely stale
    }
```

- [ ] **Step 6: Run all tests**

Run: `docker compose exec backend pytest backend/tests/ -v --asyncio-mode=auto`
Expected: 86/86 passed (no new tests, but no regressions)

- [ ] **Step 7: Commit**

```bash
git add backend/main.py backend/tests/test_backtester.py
git commit -m "fix: L1 freshness uses timestamp (5min TTL) instead of calendar date"
```

---

### Task 4: Final regression check

- [ ] **Step 1: Run all backend tests**

Run: `docker compose exec backend pytest backend/tests/ -v --asyncio-mode=auto`
Expected: 86/86 passed

- [ ] **Step 2: Run frontend tests**

Run: `cd frontend; npm test -- --run`
Expected: 21/21 passed

- [ ] **Step 3: Verify frontend build**

Run: `cd frontend; npm run build`
Expected: 0 errors, build output generated
