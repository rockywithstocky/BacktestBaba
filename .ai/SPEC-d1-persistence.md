# Design Specification: D1 Persistence Microservice

**Worker Base URL**: `https://backtestbaba-d1-proxy.rockywithstocky-ff8.workers.dev`

---

## 1. Schema — Cloudflare D1 (6 Tables)

### Table: `users`

```sql
CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,
  email           TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  name            TEXT NOT NULL DEFAULT '',
  plan            TEXT NOT NULL DEFAULT 'free'
                  CHECK (plan IN ('free', 'priority')),
  is_admin        INTEGER NOT NULL DEFAULT 0,
  max_signals     INTEGER NOT NULL DEFAULT 100,
  max_file_size_mb INTEGER NOT NULL DEFAULT 2,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
```

- `plan`: `free` (100 signals, 2MB) or `priority` (5000 signals, 10MB)
- `is_admin`: 0 = regular user, 1 = admin (access to /dashboard/admin)

### Table: `sessions`

```sql
CREATE TABLE IF NOT EXISTS sessions (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  token           TEXT NOT NULL UNIQUE,
  expires_at      TEXT NOT NULL,
  revoked         INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

- `token`: `crypto.randomUUID()` — collision-resistant, no library
- `expires_at`: 7 days from creation
- `revoked`: set to 1 by admin to force logout

### Table: `ingestion_log`

```sql
CREATE TABLE IF NOT EXISTS ingestion_log (
  id                TEXT PRIMARY KEY,
  user_id           TEXT,
  file_hash         TEXT NOT NULL,
  filename          TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  file_size         INTEGER NOT NULL,
  source_info       TEXT,
  status            TEXT NOT NULL DEFAULT 'received'
                    CHECK (status IN ('received', 'processing', 'completed', 'failed')),
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);
```

- `file_hash`: SHA-256 of bytes — sole content identity authority
- `original_filename`: raw, untrusted, as-received from browser — never cleaned, never used for dedup
- `filename`: path-normalized only (strip `../`, backslashes) — UI display, never identity
- Written BEFORE any processing — immutable audit trail

### Table: `uploads`

```sql
CREATE TABLE IF NOT EXISTS uploads (
  id              TEXT PRIMARY KEY,
  user_id         TEXT,
  file_hash       TEXT NOT NULL,
  filename        TEXT NOT NULL,
  entry_mode      TEXT NOT NULL DEFAULT 'next_close'
                  CHECK (entry_mode IN ('next_close', 'next_open')),
  signal_count    INTEGER NOT NULL DEFAULT 0,
  trade_count     INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'completed', 'partial', 'failed')),
  error_message   TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);
```

### Table: `signal_hashes`

```sql
CREATE TABLE IF NOT EXISTS signal_hashes (
  id              TEXT PRIMARY KEY,
  upload_id       TEXT NOT NULL,
  user_id         TEXT,
  row_hash        TEXT NOT NULL UNIQUE,
  symbol          TEXT NOT NULL,
  signal_date     TEXT NOT NULL,
  entry_date      TEXT,
  entry_price     REAL,
  entry_mode      TEXT NOT NULL,
  status          TEXT NOT NULL,
  results_json    TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (upload_id) REFERENCES uploads(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);
```

- `row_hash` = `SHA256(symbol + "|" + signal_date + "|" + entry_mode)` — input-derived, no yfinance
- `results_json` = JSON blob containing all 6 horizons + max_high/low (see §2)
- `INSERT OR IGNORE` used for dedup

### Table: `quota`

```sql
CREATE TABLE IF NOT EXISTS quota (
  id              INTEGER PRIMARY KEY CHECK (id = 1),
  total_writes    INTEGER NOT NULL DEFAULT 0,
  write_limit     INTEGER NOT NULL DEFAULT 1000000,
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO quota (id, total_writes, write_limit) VALUES (1, 0, 1000000);
```

- Singleton row. Incremented atomically on every D1 write.
- Pre-write check: `total_writes + batch_size > write_limit * 0.95` → return 429.

---

## 2. `results_json` Format

```json
{
  "return_7d": 5.23,
  "exit_price_7d": 152.30,
  "return_14d": 8.15,
  "exit_price_14d": 158.10,
  "return_30d": -2.45,
  "exit_price_30d": 142.80,
  "return_45d": 12.60,
  "exit_price_45d": 164.50,
  "return_60d": 18.90,
  "exit_price_60d": 173.20,
  "return_90d": 25.40,
  "exit_price_90d": 182.00,
  "max_high_90d": 185.00,
  "max_high_date": "2026-03-15",
  "max_low_90d": 135.20,
  "max_low_date": "2026-02-01",
  "signal_close_price": 145.00
}
```

- All values `float` or `null`. Dates `YYYY-MM-DD`.
- Horizon set: `[7, 14, 30, 45, 60, 90]`
- Compact JSON (no whitespace) — `json.dumps(data, separators=(",", ":"))`

---

## 3. Cloudflare Worker API Contract (15 Endpoints)

### Health

| Method | Path | Response |
|---|---|---|
| GET | `/api/health` | `{"status":"ok","database":"backtestbaba","version":"1.0.0","tables":6}` |

### Auth (Pillar 2)

| Method | Path | Request Body | Response |
|---|---|---|---|
| POST | `/api/auth/signup` | `{email, password, name?}` | `{user, token}` (201) |
| POST | `/api/auth/login` | `{email, password}` | `{user, token}` |
| GET | `/api/auth/validate?token=xxx` | — | `{user}` or 401 |

- Password hashing: SHA-256 + PASSWORD_SALT
- Token: `crypto.randomUUID()`, 7-day expiry
- Errors: `400` (missing fields), `401` (invalid/expired), `409` (email taken)

### Ingestion (Pillar 3)

| Method | Path | Request Body | Response |
|---|---|---|---|
| POST | `/api/ingestion` | `{file_hash, filename, original_filename, file_size, source_info?}` | `{id}` (201) |
| PATCH | `/api/ingestion` | `{id, status}` | `{ok: true}` |

- Written BEFORE FileHashCache check
- `file_hash` is the identity authority, not `filename`

### Uploads

| Method | Path | Request Body / Params | Response |
|---|---|---|---|
| POST | `/api/uploads` | `{file_hash, filename, entry_mode, signal_count, user_id?}` | `{id, status, write_quota_remaining}` (201) |
| GET | `/api/uploads` | `?user_id=&limit=20&offset=0` | `{results, total}` |

### Signals (Pillar 4 — Dual-Stage)

| Method | Path | Request Body | Response |
|---|---|---|---|
| POST | `/api/signals` | `{upload_id, signals: [...]}` | `{inserted, skipped, write_quota_remaining}` (201) |
| POST | `/api/signals/lookup` | `{row_hashes: [...], user_id?}` | `{existing: ["hash1", "hash2"]}` |

- `/api/signals`: batch INSERT OR IGNORE, quota 429 check, updates upload trade_count + quota
- `/api/signals/lookup`: bulk SELECT for dual-stage pre-filter. Multi-tenant: `WHERE user_id = ?` if provided

### Quota

| Method | Path | Response |
|---|---|---|
| GET | `/api/quota` | `{total_writes, write_limit, percent_used, soft_blocked}` |

### Admin (Pillar 2)

| Method | Path | Request Body | Response |
|---|---|---|---|
| GET | `/api/admin/users` | — | `{results: [...]}` |
| POST | `/api/admin/users/plan` | `{user_id, plan}` | `{ok: true}` |
| POST | `/api/admin/sessions/revoke` | `{user_id}` | `{ok: true}` |

- Admin operations require session token with `is_admin=1`
- Plan limits: `free` → 100 signals / 2MB. `priority` → 5000 signals / 10MB
- Revoke sets `sessions.revoked=1` for all user sessions

---

## 4. Python Abstraction Layer

### `backend/persistence.py`

Committed (updated in Phase B). Contains:
- `compute_row_hash()` / `_build_results_json()` helpers (+`_is_nan()` NaN guard)
- `UploadRecord`, `TradeRecord` dataclasses
- `PersistenceBackend` ABC (9 methods: save_upload, save_signals, list_uploads, get_quota, healthcheck, log_ingestion, update_ingestion_status, lookup_signals, close)
- `NullBackend` (all methods return None/False/[])
- `D1WorkerBackend` (HTTP to Worker, 3s timeout, +_patch for PATCH)

### Integration in `main.py`

**At module level** (new imports):
```python
from backend.config import PERSISTENCE_ENABLED, WORKER_URL, PERSISTENCE_TIMEOUT
from backend.persistence import (
    D1WorkerBackend, NullBackend, PersistenceBackend,
    UploadRecord, TradeRecord, compute_row_hash, _build_results_json,
)
```

**At startup** (after Paths.ensure_dirs — validated, logs which backend is active):
```python
persistence_backend: PersistenceBackend = NullBackend()
if PERSISTENCE_ENABLED:
    if not WORKER_URL:
        logger.warning("PERSISTENCE_ENABLED=True but WORKER_URL is not set. Falling back to NullBackend.")
    elif not WORKER_URL.startswith("https://"):
        logger.warning("WORKER_URL (%s) does not start with https://. Falling back to NullBackend.", WORKER_URL)
    else:
        persistence_backend = D1WorkerBackend(WORKER_URL, PERSISTENCE_TIMEOUT)
```

**In `_handle_backtest`** — ingestion log AFTER cache check (cache hits skip ingestion log entirely):
```python
file_hash = compute_file_hash(data)
cached = FileHashCache.get(file_hash, entry_mode)
if cached is not None:
    return cached report  # no ingestion log for cache hits

signals = parse_upload_data(data)

ingestion_id = None
if PERSISTENCE_ENABLED:
    ingestion_id = await persistence_backend.log_ingestion(
        file_hash=file_hash,
        filename=filename,
        original_filename=filename,
        file_size=len(data),
    )
```

**In `_handle_backtest`** — after FileHashCache.set, synchronous persist (NOT fire-and-forget):
```python
report_dict = report.dict()
FileHashCache.set(file_hash, entry_mode, report_dict)
job_store.cleanup()

if PERSISTENCE_ENABLED and ingestion_id:
    await _persist_upload(file_hash, filename, entry_mode, report, ingestion_id)

return report
```

---

## 5. Configuration

### `backend/config.py` additions

```python
PERSISTENCE_ENABLED: bool = os.getenv("PERSISTENCE_ENABLED", "false").lower() == "true"
WORKER_URL: Optional[str] = os.getenv("WORKER_URL")
PERSISTENCE_TIMEOUT: int = int(os.getenv("PERSISTENCE_TIMEOUT", "3"))
```

### `backend/.env.local` additions

```
WORKER_URL=https://backtestbaba-d1-proxy.rockywithstocky-ff8.workers.dev
PERSISTENCE_ENABLED=false
PERSISTENCE_TIMEOUT=3
```

`PERSISTENCE_ENABLED=false` by default — dead code until you flip it.

---

## 6. Dependencies

`httpx` is already present in `requirements.txt` (line 17: `httpx==0.28.1`). No new dependency required.

---

## 7. Zero Regression Guarantees — Detailed

| Concern | Mitigation |
|---|---|
| Existing tests break | `persistence.py` is a new file. No existing test imports it. `NullBackend` is the default. |
| Backtester math | Phase E dual-stage only reduces yfinance calls, never changes return calculation. Falls back to full fetch if D1 lookup fails. |
| WS delivery delayed | Persistence runs synchronously BEFORE `await websocket.send_json(complete)` — adds ~300-500ms. User sees report AFTER persistence finishes. |
| HTTP response slow | `POST /api/backtest` runs persistence synchronously. Adds ~300-500ms to response time. |
| No fire-and-forget tasks | Persistence is synchronous inside `_handle_backtest`. Zero background tasks. Zero task proliferation risk. |
| Import cycle | `persistence.py` imports only `abc`, `dataclasses`, `typing`, `httpx`, `hashlib`, `logging`. |
| Log noise | Worker failures log at WARNING, not ERROR. |
| Auth added | Auth is additive. Unauthenticated flows work until `AUTH_REQUIRED=True` flag. |
| Dual-stage failure | If `POST /signals/lookup` fails, backtest falls back to full yfinance fetch — identical to today's behavior. |
