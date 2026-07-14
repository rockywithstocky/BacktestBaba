# Phase 1 — PostgreSQL Persistence (Local Docker)

**Branch:** `feat/d1-persistence` → new branch `feat/pg-persistence`
**Goal:** Replace Cloudflare D1 + Worker with local PostgreSQL for Docker dev, keeping D1 for production (Render). Zero behavior change to the backtest pipeline.

---

## Task 1 — Commit 4 Docker Fixes

**Why:** These are the uncommitted Docker fixes from the previous session.

| File | Change |
|------|--------|
| `Dockerfile.backend` | `COPY backend/ ./backend/` instead of whole project root |
| `backend/config.py` | Add `from typing import Optional` (missing — blocked startup) |
| `docker-compose.dev.yml` | Fix volume mount `./backend:/app/backend` + uvicorn cmd `backend.main:app` |
| `docker-compose.yml` | Remove obsolete `version: '3.8'` + `.env` file refs |

**Verify after:**
```
docker compose -f docker-compose.dev.yml build
docker compose -f docker-compose.dev.yml up -d
docker compose -f docker-compose.dev.yml logs backend   # Should start without ImportError
```

---

## Task 2 — Fix ABC Return Types

**Files:** `backend/persistence.py`
**Branch point:** Task 1 → `feat/pg-persistence`

### Changes

1. **`list_uploads` return type** (line 76-78): `list[dict]` → `dict`
   ```python
   async def list_uploads(self, user_id: Optional[str] = None, limit: int = 20, offset: int = 0) -> dict[str, Any]:
   ```
   Returns `{"results": [...], "total": N}` instead of bare list.

2. **`D1WorkerBackend.list_uploads`** (line 216-222): Remove unwrap
   ```python
   async def list_uploads(self, ...) -> dict[str, Any]:
       result = await self._get(f"/uploads?limit={limit}&offset={offset}")
       if result and "results" in result:
           return result   # ← return full dict, not result["results"]
       return {"results": [], "total": 0}
   ```

3. **`NullBackend.list_uploads`** (line 124-127):
   ```python
   async def list_uploads(self, ...) -> dict[str, Any]:
       return {"results": [], "total": 0}
   ```

4. **Add `user_id` param to ABC** — `D1WorkerBackend` appends `&user_id={user_id}` to query if provided.

5. **`main.py:get_uploads()`** (line 477-482): Remove `isinstance` guard, call `persistence_backend.list_uploads(user_id=user['id'])` — return shape already matches.

### Verify
```
pytest backend/tests/test_persistence.py -v --asyncio-mode=auto
# All existing tests must pass with the new return shapes
```

---

## Task 3 — Add 6 Auth/Admin ABC Methods

**Files:** `backend/persistence.py`

### New ABC Methods (after line 112)

```python
@abstractmethod
async def auth_signup(self, email: str, password: str, name: str = "") -> Optional[dict]:
    """Returns {"token": str, "user": {...}} or None on failure."""
    ...

@abstractmethod
async def auth_login(self, email: str, password: str) -> Optional[dict]:
    """Returns {"token": str, "user": {...}} or None on failure."""
    ...

@abstractmethod
async def auth_validate(self, token: str) -> Optional[dict]:
    """Returns {"user": {...}} or None."""
    ...

@abstractmethod
async def admin_list_users(self) -> Optional[dict]:
    """Returns {"results": [...]} or None."""
    ...

@abstractmethod
async def admin_set_plan(self, user_id: str, plan: str) -> Optional[dict]:
    """Returns {"ok": true} or None."""
    ...

@abstractmethod
async def admin_revoke_sessions(self, user_id: str) -> Optional[dict]:
    """Returns {"ok": true} or None."""
    ...
```

### NullBackend stubs (all return None or empty dict)
### D1WorkerBackend implementations

```python
async def auth_signup(self, email, password, name=""):
    return await self._post("/auth/signup", {"email": email, "password": password, "name": name})

async def auth_login(self, email, password):
    return await self._post("/auth/login", {"email": email, "password": password})

async def auth_validate(self, token):
    return await self._get(f"/auth/validate?token={token}")

async def admin_list_users(self):
    return await self._get("/admin/users")

async def admin_set_plan(self, user_id, plan):
    return await self._post("/admin/users/plan", {"user_id": user_id, "plan": plan})

async def admin_revoke_sessions(self, user_id):
    return await self._post("/admin/sessions/revoke", {"user_id": user_id})
```

### Verify
```
pytest backend/tests/test_persistence.py -v --asyncio-mode=auto
# 6 new NullBackend tests: each returns expected shape
```

---

## Task 4 — Replace 7 `isinstance` Guards with Polymorphic Calls

**Files:** `backend/main.py`

### The 7 guards to replace

| Line # | Current (`isinstance`) | Replaced with |
|--------|------------------------|---------------|
| 384-385 | `_validate_token`: `if not isinstance(persistence_backend, D1WorkerBackend): return None` → raw `_get` | `result = await persistence_backend.auth_validate(token)` |
| 417-418 | `auth_signup`: `if not isinstance(persistence_backend, D1WorkerBackend): raise 501` → raw `_post` | `result = await persistence_backend.auth_signup(**body)` |
| 429-430 | `auth_login`: same pattern | `result = await persistence_backend.auth_login(**body)` |
| 455-456 | `get_quota`: `if not isinstance(persistence_backend, D1WorkerBackend): raise 501` → raw `_get` | `result = await persistence_backend.get_quota()` |
| 477-478 | `get_uploads`: same pattern → raw `_get` | `result = await persistence_backend.list_uploads(user_id=user['id'])` |
| 489-490 | `admin_list_users`: same pattern → raw `_get` | `result = await persistence_backend.admin_list_users()` |
| 499-500 | `admin_set_plan`: same pattern → raw `_post` | `result = await persistence_backend.admin_set_plan(**body)` |
| 509-510 | `admin_revoke_sessions`: same pattern → raw `_post` | `result = await persistence_backend.admin_revoke_sessions(**body)` |

### `_validate_token` rewrite

```python
async def _validate_token(token: str) -> Optional[dict]:
    now = time.time()
    if token in _auth_cache:
        user, expires_at = _auth_cache[token]
        if now < expires_at:
            return user
        del _auth_cache[token]
    
    if not PERSISTENCE_ENABLED:
        return None
    
    result = await persistence_backend.auth_validate(token)
    if result is None:
        return None
    
    user = result.get("user", result)
    _auth_cache[token] = (user, now + 60)
    return user
```

### Remove `D1WorkerBackend` import from `main.py` (if no longer used directly)

Also update the import at the top: remove `from backend.persistence import NullBackend, PersistenceBackend, D1WorkerBackend` → just `from backend.persistence import NullBackend, PersistenceBackend` (D1WorkerBackend unused directly).

### Verify
```
pytest backend/tests/ -v --asyncio-mode=auto
# All tests pass — auth, admin, uploads, quota endpoints
```

---

## Task 5 — Create `backend/schema.sql`

**Files:** `backend/schema.sql` (new)

### Source: `worker/migrations/001_init.sql`

Port 6 tables from D1 SQLite to PostgreSQL syntax:

| Change | D1 (SQLite) | PostgreSQL |
|--------|-------------|------------|
| UUID generation | `TEXT PRIMARY KEY` (app-generated) | `UUID PRIMARY KEY DEFAULT gen_random_uuid()` (or app-generated) |
| Timestamps | `datetime('now')` | `NOW()` |
| Boolean | `INTEGER NOT NULL DEFAULT 0` | `BOOLEAN NOT NULL DEFAULT FALSE` |
| Insert-or-ignore | `INSERT OR IGNORE` | `INSERT ... ON CONFLICT DO NOTHING` |
| Auto-increment | `INTEGER PRIMARY KEY CHECK (id = 1)` | `INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY` with `CHECK (id = 1)` |

### Tables

1. `users` — id, email, password_hash, name, plan, is_admin, max_signals, max_file_size_mb, created_at, updated_at
2. `sessions` — id, user_id (FK), token, expires_at, revoked, created_at
3. `ingestion_log` — id, user_id (FK), file_hash, filename, original_filename, file_size, source_info, status, created_at
4. `uploads` — id, user_id (FK), file_hash, filename, entry_mode, signal_count, trade_count, status, error_message, created_at, updated_at
5. `signal_hashes` — id, upload_id (FK), user_id (FK), row_hash (UNIQUE), symbol, signal_date, entry_date, entry_price, entry_mode, status, results_json, created_at
6. `quota` — singleton row with total_writes, write_limit, updated_at

### Verify
```
# Manual check: schema.sql parses correctly with psql
# Or use pytest fixture that loads schema into temp PG
```

---

## Task 6 — Add `DATABASE_URL` + Selection Logic to Config

**Files:** `backend/config.py`

### Add

```python
DATABASE_URL: Optional[str] = os.getenv("DATABASE_URL")
```

### Rewrite selection in `main.py` (lines 51-61)

```python
persistence_backend: PersistenceBackend = NullBackend()

if not PERSISTENCE_ENABLED:
    logger.info("Persistence disabled. Using NullBackend.")
elif is_render():
    # Production (Render) → D1WorkerBackend via Worker URL
    if WORKER_URL and WORKER_URL.startswith("https://"):
        persistence_backend = D1WorkerBackend(WORKER_URL, PERSISTENCE_TIMEOUT)
        logger.info("D1 persistence backend initialized (Worker: %s)", WORKER_URL)
    else:
        logger.warning("is_render()=True but WORKER_URL is invalid. Falling back to NullBackend.")
else:
    # Local Docker → PostgresBackend
    if DATABASE_URL:
        persistence_backend = PostgresBackend(DATABASE_URL)
        logger.info("PostgreSQL persistence backend initialized")
    else:
        logger.warning("DATABASE_URL not set. Falling back to NullBackend.")
```

### Also add `from backend.persistence import PostgresBackend` (will be created in Task 7)

### Verify
```
# With is_render()=False, DATABASE_URL=postgresql://... → PostgresBackend
# With is_render()=True, WORKER_URL=https://... → D1WorkerBackend
# With PERSISTENCE_ENABLED=False → NullBackend
```

---

## Task 7 — Create `PostgresBackend` Class

**Files:** `backend/persistence.py` (add ~250 lines before NullBackend)

### Requirements

1. **Connection**: `asyncpg` connection pool. Created in `__init__`, closed in `close()`.
2. **Schema bootstrap**: In `__init__`, run `schema.sql` via `pool.execute()`.
3. **Password hashing**: Same as Worker: `SHA-256(password + "backtestbaba-salt-2026")` → hex digest.
4. **All 17 ABC methods** implemented.
5. **Error handling**: Every method returns `None` / default on SQL error (never crash the backtest).

### Key implementation details

```python
class PostgresBackend(PersistenceBackend):
    def __init__(self, dsn: str):
        import asyncpg
        self._pool = await asyncpg.create_pool(dsn, min_size=1, max_size=5)
        async with self._pool.acquire() as conn:
            schema = Path(__file__).parent / "schema.sql"
            await conn.execute(schema.read_text())
    
    async def auth_signup(self, email, password, name=""):
        import hashlib
        pw_hash = hashlib.sha256(f"{password}backtestbaba-salt-2026".encode()).hexdigest()
        uid = str(uuid4())
        async with self._pool.acquire() as conn:
            try:
                await conn.execute("""
                    INSERT INTO users (id, email, password_hash, name)
                    VALUES ($1, $2, $3, $4)
                """, uid, email.lower(), pw_hash, name)
                token = str(uuid4())
                await conn.execute("""
                    INSERT INTO sessions (id, user_id, token, expires_at)
                    VALUES ($1, $2, $3, NOW() + INTERVAL '7 days')
                """, str(uuid4()), uid, token)
                return {"token": token, "user": {"id": uid, "email": email, "name": name, "is_admin": False}}
            except asyncpg.UniqueViolationError:
                return None  # email already exists
    
    # ... 16 more methods with same pattern
```

### Verify
```
pytest backend/tests/test_persistence.py -v --asyncio-mode=auto
# With PostgresBackend test fixture
# Or: manual verification with Docker postgres + curl
```

---

## Task 8 — Add PostgreSQL Service to Docker Compose

**Files:** `docker-compose.yml`

### Changes

1. Remove `redis` service (unused)
2. Add `postgres` service:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: backtestbaba-db
    environment:
      POSTGRES_USER: backtest
      POSTGRES_PASSWORD: backtest
      POSTGRES_DB: backtestbaba
    volumes:
      - pg_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U backtest -d backtestbaba"]
      interval: 5s
      timeout: 5s
      retries: 5

  backend:
    depends_on:
      postgres:
        condition: service_healthy
    # ... rest unchanged

volumes:
  pg_data:
```

### Verify
```
docker compose up -d
docker compose exec postgres pg_isready -U backtest
# Should return "accepting connections"
```

---

## Task 9 — Update `.env.local`

**Files:** `backend/.env.local`

### Before
```
WORKER_URL=https://backtestbaba-d1-proxy.rockywithstocky-ff8.workers.dev
PERSISTENCE_ENABLED=true
```

### After
```
DATABASE_URL=postgresql://backtest:backtest@localhost:5432/backtestbaba
PERSISTENCE_ENABLED=true
```

### Keep `WORKER_URL` in production env (Render dashboard). The `is_render()` switch selects D1WorkerBackend for production.

### Verify
```
# Backend starts without errors
python -m backend.main:app --reload
# Check logs: "PostgreSQL persistence backend initialized"
```

---

## Task 10 — Verify End-to-End

### Tests
```powershell
cd backend
.\venv\Scripts\Activate.ps1
pytest tests/ -v --asyncio-mode=auto
```

Expected: All tests pass (update test_persistence.py to cover PostgresBackend if mocking asyncpg).

### Docker smoke test
```powershell
docker compose up -d --build
# Upload a CSV via Swagger at http://localhost:8000/docs
# Verify:
#   - Backtest runs and completes
#   - Report contains trade results
#   - Data persisted: query PostgreSQL
docker compose exec postgres psql -U backtest -d backtestbaba -c "SELECT COUNT(*) FROM uploads;"
docker compose exec postgres psql -U backtest -d backtestbaba -c "SELECT COUNT(*) FROM signal_hashes;"
```

### Upload history + auth
```powershell
# Signup via /api/auth/signup → get token
# Upload file with auth header
# GET /api/uploads with auth header → should list the upload
```

---

## Phase 2 Vision (Smart Refresh — Deferred)

**Not implemented in Phase 1. Architecture for reference:**

| Component | Change |
|-----------|--------|
| `storage.py` | Cross-session `FileHashCache` removed (in-memory only per request) |
| `data_provider.py` | New `bulk_gapfill(symbols, gap_start, gap_end)` — 1 `yf.download` call, appends to per-symbol cache |
| `persistence.py` | Add `get_report_by_hash(hash, mode) → dict` + `update_signal(id, new_results) → bool` |
| `main.py:_handle_backtest()` | Insert PostgreSQL check before backtest; if found, gapfill + recompute + update |
| `backtester.py` | Extract pure `recompute_signal(signal_result, df, entry_mode, duration) → SignalResult` |

The gapfill appends to `diskcache` using `pd.concat([existing, new])` + index dedup — no separate data file needed.
