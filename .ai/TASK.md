# Task Tracker — D1 Persistence Microservice

## Phase B: Integration in `main.py` (Active)

**Goal**: Wire persistence into the backtest flow with a disabled-by-default config flag.

---

### B-01: Config vars ⏳ Pending

| | |
|---|---|
| **File** | `backend/config.py` |
| **Change** | Add `Persistence` class after `class CacheTTL` (~8 lines) |
| **Detail** | `PERSISTENCE_ENABLED` (bool, default false), `WORKER_URL` (Optional[str]), `PERSISTENCE_TIMEOUT` (int, default 3) |
| **Gate** | `from backend.config import Persistence` works |
| **Status** | Not started |

### B-02: Import + init ⏳ Pending

| | |
|---|---|
| **File** | `backend/main.py` |
| **Change** | After `Paths.ensure_dirs()` (line 37), add conditional persistence backend init |
| **Detail** | If `Persistence.PERSISTENCE_ENABLED`, init `D1WorkerBackend(Persistence.WORKER_URL, Persistence.PERSISTENCE_TIMEOUT)`. Otherwise `NullBackend()`. Store in module-level `persistence_backend`. |
| **Gate** | `python -m uvicorn backend.main:app` starts without error |
| **Status** | Not started |

### B-03: Fire-and-forget hook ⏳ Pending

| | |
|---|---|
| **File** | `backend/main.py` |
| **Change** | Add `_build_results_json()` and `_persist_upload()` helpers; hook into WS endpoint after `await websocket.send_json(...)` |
| **Detail** | `_build_results_json(trade)` ≅ same logic as `persistence.py:_build_results_json`. `_persist_upload(record, trades)` calls `save_upload` → `save_signals`. Invoked via `asyncio.create_task(...)` after line 258. |
| **Gate** | Backtest via WS returns normally. `PERSISTENCE_ENABLED=false` → no D1 calls. |
| **Status** | Not started |

---

### Gate B

```powershell
pytest backend/tests/ -v --asyncio-mode=auto          # all pass
```

Manual: start server, upload CSV via WS — report returns normally with `PERSISTENCE_ENABLED=false` (default).

---

## Phase C: Cloudflare Worker Code (Upcoming)

- ~~C-01..C-07~~ No tasks active

## Phase D: End-to-End Integration (Upcoming)

- ~~D-01..D-02~~ No tasks active
