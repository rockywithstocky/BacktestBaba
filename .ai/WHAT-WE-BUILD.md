# What We Build — D1 Persistence

---

## 1. Shopping List

| # | File | Action | New? |
|---|------|--------|------|
| 1 | `backend/persistence.py` | **New file** — ABC, NullBackend, D1WorkerBackend, dataclasses | ✅ New |
| 2 | `backend/tests/test_persistence.py` | **New file** — 29 tests for persistence layer | ✅ New |
| 3 | `backend/config.py` | **Add 3 lines** — PERSISTENCE_ENABLED, WORKER_URL, PERSISTENCE_TIMEOUT | 📝 Edit |
| 4 | `backend/main.py` | **Add ~20 lines** — import, init backend, fire-and-forget hook | 📝 Edit |
| 5 | `worker/src/index.js` | **New file** — Worker API: 5 endpoints | ✅ New |
| 6 | `worker/migrations/001_init.sql` | **New file** — DDL: 3 tables | ✅ New |
| 7 | `worker/wrangler.toml` | **New file** — D1 binding config | ✅ New |
| 8 | `worker/package.json` | **New file** — minimal package.json | ✅ New |
| 9 | `backend/tests/test_integration_d1.py` | **New file** — E2E test with real Worker | ✅ New |

---

## 2. Files That Do NOT Change

| File | Reason |
|------|--------|
| `backend/core/backtester.py` | Persistence runs AFTER backtest. Zero changes. |
| `backend/core/data_provider.py` | Data fetching is unchanged. |
| `backend/core/symbol_resolver.py` | Symbol resolution is unchanged. |
| `backend/models/schemas.py` | Same report model, just serialized to D1. |
| `backend/storage.py` | FileHashCache/JobStorage unchanged. Persistence is additive. |
| `frontend/*` | No frontend changes in this phase. |
| `backend/requirements.txt` | `httpx` already at `0.28.1`. No new dep. |

---

## 3. What Each File Does — Visual

### File 1: `backend/persistence.py`

```
┌─────────────────────────────────────────────────────┐
│                   persistence.py                     │
├─────────────────────────────────────────────────────┤
│ compute_row_hash(symbol, date, mode) → hex string   │
│ _build_results_json(trade) → JSON string            │
│                                                     │
│ UploadRecord(file_hash, filename, entry_mode, count) │
│ TradeRecord(row_hash, symbol, date, ..., results)   │
│                                                     │
│ PersistenceBackend (ABC)                            │
│  ├── save_upload(record) → id or None               │
│  ├── save_signals(upload_id, trades) → dict or None │
│  ├── list_uploads(limit, offset) → list             │
│  ├── get_quota() → dict                             │
│  └── healthcheck() → bool                           │
│                                                     │
│ NullBackend (all methods return None/false)         │
│ D1WorkerBackend (HTTP → Cloudflare Worker, 3s)      │
└─────────────────────────────────────────────────────┘
```

**Key detail**: `NullBackend` is the DEFAULT. `D1WorkerBackend` is only active when both `PERSISTENCE_ENABLED=True` AND `WORKER_URL` is set.

### File 3: `backend/config.py` — 3 new lines

```python
PERSISTENCE_ENABLED: bool = os.getenv("PERSISTENCE_ENABLED", "false").lower() == "true"
WORKER_URL: Optional[str] = os.getenv("WORKER_URL")
PERSISTENCE_TIMEOUT: int = int(os.getenv("PERSISTENCE_TIMEOUT", "3"))
```

Add after line 40 (end of `Limits` class) and before line 43 (start of `CacheTTL` class).

### File 4: `backend/main.py` — 2 changes

**Change A** — After import block (line 18), add 3 lines:

```python
from backend.config import Limits, Paths, is_render
from backend.storage import FileHashCache, JobStorage, compute_file_hash, generate_run_id
from backend.persistence import D1WorkerBackend, NullBackend  # ← NEW
```

**Change B** — After `Paths.ensure_dirs()` (line 37), add 8 lines:

```python
persistence_backend: PersistenceBackend = NullBackend()
if Config.PERSISTENCE_ENABLED and Config.WORKER_URL:
    persistence_backend = D1WorkerBackend(Config.WORKER_URL, Config.PERSISTENCE_TIMEOUT)
    logger.info("D1 persistence enabled: %s", Config.WORKER_URL)
```

**Change C** — In `_handle_backtest()`, after `FileHashCache.set()` (line 207) and before `job_store.cleanup()` (line 208), add:

```python
report_dict = report.dict()
FileHashCache.set(file_hash, entry_mode, report_dict)
# ↓ NEW: fire-and-forget persistence (runs after WS response is sent)
if Config.PERSISTENCE_ENABLED and not isinstance(persistence_backend, NullBackend):
    report_copy = report  # keep reference for background task
    asyncio.create_task(
        _schedule_persist(file_hash, filename, entry_mode, report_copy)
    )
job_store.cleanup()
```

**Change D** — Add `_schedule_persist()` function somewhere in `main.py`:

```python
async def _schedule_persist(file_hash: str, filename: str, entry_mode: str, report: BacktestReport):
    """Background task: save upload + trades to D1. Never blocks the response."""
    record = UploadRecord(
        file_hash=file_hash,
        filename=filename,
        entry_mode=entry_mode,
        signal_count=len(report.trades),
    )
    upload_id = await persistence_backend.save_upload(record)
    if upload_id:
        trades = [
            TradeRecord(
                row_hash=compute_row_hash(t.symbol, t.signal_date, entry_mode),
                symbol=t.symbol,
                signal_date=t.signal_date,
                entry_date=t.entry_date,
                entry_price=t.entry_price,
                entry_mode=entry_mode,
                status=t.status,
                results_json=_build_results_json(t),
            )
            for t in report.trades
        ]
        result = await persistence_backend.save_signals(upload_id, trades)
        if result:
            logger.info("Persisted %d trades to D1 (skipped %d)", result["inserted"], result["skipped"])
```

### Files 5-8: Worker (Cloudflare)

```
worker/
├── package.json            # minimal: name, version, main
├── wrangler.toml           # D1 binding DB → backtestbaba
├── migrations/
│   └── 001_init.sql        # 3 CREATE TABLE statements
└── src/
    └── index.js            # 5 endpoints + router + CORS
```

The Worker is a standalone HTTP service. 5 endpoints:

| Method | Path | What it does |
|--------|------|-------------|
| POST | /api/uploads | INSERT into uploads table, return id |
| POST | /api/signals | Batch INSERT OR IGNORE signal_hashes, update quota |
| GET | /api/uploads | List uploads with pagination |
| GET | /api/quota | Read quota counter |
| GET | /api/health | Return {"status": "ok"} |

---

## 4. Data Flow (In Plain English)

```
1. User uploads CSV via WebSocket
2. Backend runs backtest (unchanged — 3 phases)
3. Backend caches report in diskcache (unchanged)
4. Backend sends report to user via WebSocket (unchanged)
   ── User sees report in Dashboard immediately ──
5. BACKEND: "Oh, D1 persistence is enabled. Let me save this in background."
6. Backend calls Worker: POST /api/uploads
7. Worker: "Inserted upload row. Here's an ID."
8. Backend calls Worker: POST /api/signals (with all trades)
9. Worker: "INSERT OR IGNORE 2000 signal_hashes. 1980 inserted, 20 skipped (dupes). Quota updated."
10. ── Done. User may have already closed the tab. ──
```

If Worker is down at step 6:
```
5. Backend: "Worker didn't respond in 3 seconds. Log warning. Move on."
6. User never knows anything happened.
```

---

## 5. Fallback Scenarios — User Experience

| What breaks | What the USER sees | What the LOGS show |
|---|---|---|
| Worker URL not set | Normal report. No badges. | Nothing — NullBackend active |
| Worker timeout (>3s) | Normal report delivered via WS | `WARNING: D1 request failed: POST /api/uploads` |
| Worker returns 429 (quota 95%+) | Normal report delivered via WS | `WARNING: D1 quota exceeded: ...` |
| Worker returns 500 | Normal report delivered via WS | `WARNING: D1 request failed: POST /api/signals` |
| Everything works | Normal report + eventual D1 storage | `INFO: Persisted 1980 trades to D1 (skipped 20)` |

---

## 6. D1 Schema (What Lives in the Database)

```
┌─────────────────────────────────────────────────────────┐
│                     uploads                              │
├────────────┬──────────┬─────────────────────────────────┤
│ id (PK)    │ uuid     │ Unique upload identifier        │
│ file_hash  │ SHA256   │ Matches FileHashCache key       │
│ filename   │ "a.csv"  │ Original filename for audit     │
│ entry_mode │ "next_close" │ next_close or next_open     │
│ status     │ "completed" │ pending/completed/failed     │
└────────────┴──────────┴─────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                   signal_hashes                          │
├────────────┬──────────┬─────────────────────────────────┤
│ id (PK)    │ uuid     │ Unique signal identifier        │
│ upload_id  │ FK → uploads │ Which upload this belongs to│
│ row_hash   │ UNIQUE   │ SHA256(symbol|date|mode)        │
│ symbol     │ "RELIANCE.NS" │ Resolved ticker             │
│ entry_price│ 2450.50  │ Price at entry                  │
│ status     │ "Success"│ Same as SignalResult.status     │
│ results_json │ {...}  │ ALL horizon data as JSON blob  │
└────────────┴──────────┴─────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                     quota                                │
├────────────┬──────────┬─────────────────────────────────┤
│ id         │ 1 (only) │ Singleton row                    │
│ total_writes │ 42000  │ Counter incremented on every write│
│ write_limit  │ 1000000│ 1M writes/month budget           │
└────────────┴──────────┴─────────────────────────────────┘
```

---

## 7. What Persists vs What Does Not

| Data | Persisted to D1? | Why |
|---|---|---|
| Upload metadata (file_hash, filename, entry_mode) | ✅ uploads table | Required for history |
| Signal rows with all horizon returns | ✅ signal_hashes (results_json) | For AI analysis, history |
| Individual OHLCV prices | ❌ | Already in diskcache (30d TTL) |
| Sector/marketCap metadata | ❌ | Already in diskcache (7d TTL) |
| BacktestReport aggregates | ❌ | Recomputable from signal_hashes |
| User session / auth data | ❌ | Deferred to P1 |

---

## 8. Rollback — How to Undo Each Phase

| If this breaks... | Undo by... |
|---|---|
| Phase A committed, not merged | `git revert 5eaaf94` — removes persistence.py + tests |
| Phase B committed | `git revert <hash>` — removes 23 lines from config.py + main.py |
| Phase C deployed | `npx wrangler rollback` — reverts Worker to Hello World |
| All of it | `git checkout main; git branch -D feat/d1-persistence` |
