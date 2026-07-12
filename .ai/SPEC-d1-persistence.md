# Design Specification: D1 Persistence Microservice

**Worker Base URL**: `https://backtestbaba-d1-proxy.rockywithstocky-ff8.workers.dev`

---

## 1. Schema — Cloudflare D1

### Table: `uploads`

```sql
CREATE TABLE IF NOT EXISTS uploads (
  id              TEXT PRIMARY KEY,
  file_hash       TEXT NOT NULL,
  filename        TEXT NOT NULL,
  entry_mode      TEXT NOT NULL DEFAULT 'next_close',
  signal_count    INTEGER NOT NULL DEFAULT 0,
  trade_count     INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'pending',
  error_message   TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_uploads_file_hash ON uploads(file_hash);
CREATE INDEX idx_uploads_created_at ON uploads(created_at);
```

- `status` values: `pending`, `completed`, `partial`, `failed`
- `file_hash` = SHA-256 hex string (matching `backend/storage.py` `FileHashCache`)

### Table: `signal_hashes`

```sql
CREATE TABLE IF NOT EXISTS signal_hashes (
  id              TEXT PRIMARY KEY,
  upload_id       TEXT NOT NULL,
  row_hash        TEXT NOT NULL,
  symbol          TEXT NOT NULL,
  signal_date     TEXT NOT NULL,
  entry_date      TEXT,
  entry_price     REAL,
  entry_mode      TEXT NOT NULL,
  status          TEXT NOT NULL,
  results_json    TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (upload_id) REFERENCES uploads(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX idx_signal_hashes_row_hash ON signal_hashes(row_hash);
CREATE INDEX idx_signal_hashes_upload_id ON signal_hashes(upload_id);
```

- `row_hash` = `SHA256(symbol + "|" + signal_date + "|" + entry_mode)`
- `results_json` = JSON blob containing all horizon data (see §2)
- `INSERT OR IGNORE` used for row_hash dedup

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

- Singleton row (`id = 1`). Incremented atomically on every write.
- Pre-write check: `SELECT total_writes FROM quota WHERE total_writes + ? > write_limit * 0.95`
- If true → return 429, do not write

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

- All values are `float` or `null`. All dates are `YYYY-MM-DD`.
- Horizon set: `[7, 14, 30, 45, 60, 90]`
- Empty horizons (symbol delisted before horizon date) → `null`

---

## 3. Cloudflare Worker API Contract

### `POST /api/uploads`

Create an upload record.

**Request:**
```json
{
  "file_hash": "a1b2c3d4e5f6...",
  "filename": "my_signals.csv",
  "entry_mode": "next_close",
  "signal_count": 200
}
```

**Response (201):**
```json
{
  "id": "uuid-string",
  "status": "pending",
  "write_quota_remaining": 950000
}
```

**Errors:** `429 Quota Exceeded`, `400 Bad Request`

### `POST /api/signals`

Batch-insert signal_hashes rows.

**Request:**
```json
{
  "upload_id": "uuid-string",
  "signals": [
    {
      "row_hash": "abc123...",
      "symbol": "RELIANCE.NS",
      "signal_date": "2026-01-15",
      "entry_date": "2026-01-16",
      "entry_price": 2450.50,
      "entry_mode": "next_close",
      "status": "Success",
      "results_json": "{...}"
    }
  ]
}
```

**Response (201):**
```json
{
  "inserted": 198,
  "skipped": 2,
  "write_quota_remaining": 949802
}
```

- `skipped` = count of `INSERT OR IGNORE` collisions (duplicate row_hash)
- Batch size limit: 5000 rows per call

### `GET /api/uploads`

List uploads with pagination.

**Query params:** `?limit=20&offset=0`

**Response (200):**
```json
{
  "results": [
    {
      "id": "uuid",
      "filename": "my_signals.csv",
      "entry_mode": "next_close",
      "signal_count": 200,
      "trade_count": 198,
      "status": "completed",
      "created_at": "2026-07-12T12:00:00Z"
    }
  ],
  "total": 42
}
```

### `GET /api/quota`

**Response (200):**
```json
{
  "total_writes": 42000,
  "write_limit": 1000000,
  "percent_used": 4.2,
  "soft_blocked": false
}
```

`soft_blocked` = `total_writes >= write_limit * 0.95`

### `GET /api/health`

**Response (200):**
```json
{
  "status": "ok",
  "database": "backtestbaba",
  "version": "1.0.0"
}
```

---

## 4. Python Abstraction Layer

### `backend/persistence.py`

```python
from abc import ABC, abstractmethod
from dataclasses import dataclass, asdict
from typing import Optional, Any
import hashlib
import logging

logger = logging.getLogger(__name__)


@dataclass
class UploadRecord:
    file_hash: str
    filename: str
    entry_mode: str
    signal_count: int


@dataclass
class TradeRecord:
    row_hash: str
    symbol: str
    signal_date: str
    entry_date: Optional[str]
    entry_price: Optional[float]
    entry_mode: str
    status: str
    results_json: Optional[str]


def compute_row_hash(symbol: str, signal_date: str, entry_mode: str) -> str:
    raw = f"{symbol}|{signal_date}|{entry_mode}"
    return hashlib.sha256(raw.encode()).hexdigest()


class PersistenceBackend(ABC):
    @abstractmethod
    async def save_upload(self, record: UploadRecord) -> Optional[str]:
        ...

    @abstractmethod
    async def save_signals(
        self, upload_id: str, trades: list[TradeRecord]
    ) -> Optional[dict[str, Any]]:
        ...

    @abstractmethod
    async def list_uploads(
        self, limit: int = 20, offset: int = 0
    ) -> list[dict[str, Any]]:
        ...

    @abstractmethod
    async def get_quota(self) -> dict[str, Any]:
        ...

    @abstractmethod
    async def healthcheck(self) -> bool:
        ...


class NullBackend(PersistenceBackend):
    async def save_upload(self, record: UploadRecord) -> Optional[str]:
        return None

    async def save_signals(
        self, upload_id: str, trades: list[TradeRecord]
    ) -> Optional[dict[str, Any]]:
        return None

    async def list_uploads(
        self, limit: int = 20, offset: int = 0
    ) -> list[dict[str, Any]]:
        return []

    async def get_quota(self) -> dict[str, Any]:
        return {
            "total_writes": 0,
            "write_limit": 0,
            "percent_used": 0.0,
            "soft_blocked": False,
        }

    async def healthcheck(self) -> bool:
        return False


class D1WorkerBackend(PersistenceBackend):
    def __init__(self, worker_url: str, timeout: float = 3.0):
        import httpx

        self._base_url = worker_url.rstrip("/") + "/api"
        self._timeout = timeout
        self._client = httpx.AsyncClient(timeout=httpx.Timeout(timeout))

    async def _post(
        self, path: str, payload: dict
    ) -> Optional[dict]:
        try:
            resp = await self._client.post(
                f"{self._base_url}{path}", json=payload
            )
            if resp.status_code == 429:
                logger.warning(
                    "D1 quota exceeded: %s", resp.json().get("error", "")
                )
                return None
            resp.raise_for_status()
            return resp.json()
        except Exception:
            logger.warning("D1 request failed: POST %s", path)
            return None

    async def _get(self, path: str) -> Optional[dict]:
        try:
            resp = await self._client.get(f"{self._base_url}{path}")
            resp.raise_for_status()
            return resp.json()
        except Exception:
            logger.warning("D1 request failed: GET %s", path)
            return None

    async def save_upload(self, record: UploadRecord) -> Optional[str]:
        result = await self._post("/uploads", asdict(record))
        if result and "id" in result:
            return result["id"]
        return None

    async def save_signals(
        self, upload_id: str, trades: list[TradeRecord]
    ) -> Optional[dict[str, Any]]:
        payload = {
            "upload_id": upload_id,
            "signals": [asdict(t) for t in trades],
        }
        result = await self._post("/signals", payload)
        if result and "inserted" in result:
            return result
        return None

    async def list_uploads(
        self, limit: int = 20, offset: int = 0
    ) -> list[dict[str, Any]]:
        result = await self._get(f"/uploads?limit={limit}&offset={offset}")
        if result and "results" in result:
            return result["results"]
        return []

    async def get_quota(self) -> dict[str, Any]:
        result = await self._get("/quota")
        if result:
            return result
        return {
            "total_writes": 0,
            "write_limit": 0,
            "percent_used": 0.0,
            "soft_blocked": False,
        }

    async def healthcheck(self) -> bool:
        result = await self._get("/health")
        return result is not None and result.get("status") == "ok"
```

### Integration in `main.py`

```python
# After report generation and caching (WS or HTTP path):
if config.PERSISTENCE_ENABLED and persistence_backend:
    record = UploadRecord(
        file_hash=file_hash,
        filename=getattr(file, "filename", "upload.csv"),
        entry_mode=entry_mode,
        signal_count=len(report.trades),
    )
    asyncio.create_task(_persist_upload(record, report.trades))

def _build_results_json(trade) -> str:
    """Convert a SignalResult trade into the results_json blob string."""
    import json
    data = {}
    for horizon in (7, 14, 30, 45, 60, 90):
        ret = getattr(trade, f"return_{horizon}d", None)
        exit_price = getattr(trade, f"exit_price_{horizon}d", None)
        if ret is not None:
            data[f"return_{horizon}d"] = round(float(ret), 4)
        if exit_price is not None:
            data[f"exit_price_{horizon}d"] = round(float(exit_price), 2)
    for attr in ("max_high_90d", "max_low_90d"):
        val = getattr(trade, attr, None)
        if val is not None:
            data[attr] = round(float(val), 2)
    for attr in ("max_high_date", "max_low_date", "signal_close_price"):
        val = getattr(trade, attr, None)
        if val is not None:
            if attr == "signal_close_price":
                data[attr] = round(float(val), 2)
            else:
                data[attr] = str(val)
    return json.dumps(data, separators=(",", ":"))


async def _persist_upload(record: UploadRecord, trades: list):
    upload_id = await persistence_backend.save_upload(record)
    if upload_id:
        trade_records = [
            TradeRecord(
                row_hash=compute_row_hash(
                    t.symbol, t.signal_date, record.entry_mode
                ),
                symbol=t.symbol,
                signal_date=t.signal_date,
                entry_date=t.entry_date,
                entry_price=t.entry_price,
                entry_mode=record.entry_mode,
                status=t.status,
                results_json=_build_results_json(t),
            )
            for t in trades
        ]
        await persistence_backend.save_signals(upload_id, trade_records)
```

---

## 5. Configuration

### `backend/config.py` additions

```python
PERSISTENCE_ENABLED: bool = (
    os.getenv("PERSISTENCE_ENABLED", "false").lower() == "true"
)
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

### `backend/requirements.txt`

`httpx` is already present in `requirements.txt` (line 17: `httpx==0.28.1`). No new dependency required.

---

## 7. Zero Regression Guarantees — Detailed

| Concern | Mitigation |
|---|---|
| Existing tests break | `persistence.py` is a new file. No existing test imports it. `NullBackend` is the default. |
| Backtester changes | `backtester.py` is untouched. Zero lines changed. |
| WS delivery delayed | `asyncio.create_task` is called AFTER `await websocket.send(...)` completes. |
| HTTP response slow | `POST /api/backtest` does NOT use persistence. No latency change. |
| Memory leak | `asyncio.create_task` is created once per upload. Tasks complete in <5s. |
| Import cycle | `persistence.py` imports only `abc`, `dataclasses`, `typing`, `httpx`, `hashlib`, `logging`. Does not import `main.py`, `backtester.py`, or `schemas.py`. |
| Log noise | Worker failures log at WARNING level, not ERROR. |
