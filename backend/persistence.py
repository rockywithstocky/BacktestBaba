import hashlib
import json
import logging
import math
import random
import time
import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)


def compute_row_hash(symbol: str, signal_date: str, entry_mode: str, duration: int = 90) -> str:
    raw = f"{symbol}|{signal_date}|{entry_mode}|{duration}"
    return hashlib.sha256(raw.encode()).hexdigest()


def _is_nan(value) -> bool:
    return isinstance(value, float) and math.isnan(value)


def _build_results_json(trade) -> str:
    data = {}
    for horizon in (7, 14, 30, 45, 60, 90):
        ret = getattr(trade, f"return_{horizon}d", None)
        exit_price = getattr(trade, f"exit_price_{horizon}d", None)
        if ret is not None and not _is_nan(ret):
            data[f"return_{horizon}d"] = round(float(ret), 4)
        if exit_price is not None and not _is_nan(exit_price):
            data[f"exit_price_{horizon}d"] = round(float(exit_price), 2)
    for attr in ("max_high_90d", "max_low_90d"):
        val = getattr(trade, attr, None)
        if val is not None and not _is_nan(val):
            data[attr] = round(float(val), 2)
    for attr in ("max_high_date", "max_low_date", "signal_close_price"):
        val = getattr(trade, attr, None)
        if val is not None and not _is_nan(val):
            if attr == "signal_close_price":
                data[attr] = round(float(val), 2)
            else:
                data[attr] = str(val)
    return json.dumps(data, separators=(",", ":"))


@dataclass
class UploadRecord:
    file_hash: str
    filename: str
    entry_mode: str
    signal_count: int
    user_id: str = ""


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


class PersistenceBackend(ABC):
    @abstractmethod
    async def save_upload(self, record: UploadRecord) -> Optional[str]:
        ...

    @abstractmethod
    async def save_signals(
        self, upload_id: str, trades: list[TradeRecord], user_id: Optional[str] = None
    ) -> Optional[dict[str, Any]]:
        ...

    @abstractmethod
    async def set_upload_status(self, upload_id: str, status: str) -> Optional[dict]:
        ...

    @abstractmethod
    async def list_uploads(
        self, user_id: Optional[str] = None, limit: int = 20, offset: int = 0
    ) -> dict[str, Any]:
        ...

    @abstractmethod
    async def get_quota(self) -> dict[str, Any]:
        ...

    @abstractmethod
    async def healthcheck(self) -> bool:
        ...

    @abstractmethod
    async def log_ingestion(
        self,
        file_hash: str,
        filename: str,
        original_filename: str,
        file_size: int,
        source_info: Optional[str] = None,
    ) -> Optional[str]:
        ...

    @abstractmethod
    async def update_ingestion_status(self, id: str, status: str) -> bool:
        ...

    @abstractmethod
    async def lookup_signals(
        self, row_hashes: list[str], user_id: Optional[str] = None
    ) -> list[str]:
        ...

    @abstractmethod
    async def auth_signup(self, email: str, password: str, name: str = "") -> Optional[dict]:
        ...

    @abstractmethod
    async def auth_login(self, email: str, password: str) -> Optional[dict]:
        ...

    @abstractmethod
    async def auth_validate(self, token: str) -> Optional[dict]:
        ...

    @abstractmethod
    async def admin_list_users(self) -> Optional[dict]:
        ...

    @abstractmethod
    async def admin_set_plan(self, user_id: str, plan: str) -> Optional[dict]:
        ...

    @abstractmethod
    async def admin_revoke_sessions(self, user_id: str) -> Optional[dict]:
        ...

    @abstractmethod
    async def upsert_symbol_freshness(self, symbol: str, last_fetched: str, data_recency: str) -> None:
        ...

    @abstractmethod
    async def set_file_upload_map(self, user_id: str, file_hash: str, entry_mode: str, upload_id: str) -> bool:
        ...

    @abstractmethod
    async def get_upload_by_user_and_hash(self, user_id: str, file_hash: str, entry_mode: str) -> Optional[dict]:
        ...

    @abstractmethod
    async def get_signals_for_upload(self, upload_id: str) -> list[dict]:
        ...

    @abstractmethod
    async def batch_upsert_signals(self, user_id: str, signals: list[dict]) -> int:
        ...

    @abstractmethod
    async def get_resolved_symbols(self, input_symbols: list[str]) -> dict[str, Optional[str]]:
        ...

    @abstractmethod
    async def set_resolved_symbols(self, mapping: dict[str, str]) -> int:
        ...

    @abstractmethod
    async def get_symbol_freshness_batch(self, symbols: list[str]) -> dict[str, dict]:
        ...

    @abstractmethod
    async def batch_update_latest_prices(self, updates: dict[str, tuple[float, str]]) -> int:
        ...

    @abstractmethod
    async def get_upload_status(self, upload_id: str) -> Optional[str]:
        ...

    @abstractmethod
    async def set_ingestion_user(self, ingestion_id: str, user_id: str) -> bool:
        ...

    @abstractmethod
    async def close(self) -> None:
        ...


class NullBackend(PersistenceBackend):
    async def save_upload(self, record: UploadRecord) -> Optional[str]:
        return None

    async def save_signals(
        self, upload_id: str, trades: list[TradeRecord], user_id: Optional[str] = None
    ) -> Optional[dict[str, Any]]:
        return None

    async def set_upload_status(self, upload_id: str, status: str) -> Optional[dict]:
        return None

    async def list_uploads(
        self, user_id: Optional[str] = None, limit: int = 20, offset: int = 0
    ) -> dict[str, Any]:
        return {"results": [], "total": 0}

    async def get_quota(self) -> dict[str, Any]:
        return {
            "total_writes": 0,
            "write_limit": 0,
            "percent_used": 0.0,
            "soft_blocked": False,
        }

    async def healthcheck(self) -> bool:
        return False

    async def log_ingestion(
        self,
        file_hash: str,
        filename: str,
        original_filename: str,
        file_size: int,
        source_info: Optional[str] = None,
    ) -> Optional[str]:
        return None

    async def update_ingestion_status(self, id: str, status: str) -> bool:
        return False

    async def lookup_signals(
        self, row_hashes: list[str], user_id: Optional[str] = None
    ) -> list[str]:
        return []

    async def auth_signup(self, email: str, password: str, name: str = "") -> Optional[dict]:
        return None

    async def auth_login(self, email: str, password: str) -> Optional[dict]:
        return None

    async def auth_validate(self, token: str) -> Optional[dict]:
        return None

    async def admin_list_users(self) -> Optional[dict]:
        return None

    async def admin_set_plan(self, user_id: str, plan: str) -> Optional[dict]:
        return None

    async def admin_revoke_sessions(self, user_id: str) -> Optional[dict]:
        return None

    async def set_file_upload_map(self, user_id: str, file_hash: str, entry_mode: str, upload_id: str) -> bool:
        return False

    async def upsert_symbol_freshness(self, symbol: str, last_fetched: str, data_recency: str) -> None:
        pass

    async def get_upload_by_user_and_hash(self, user_id: str, file_hash: str, entry_mode: str) -> Optional[dict]:
        return None

    async def get_signals_for_upload(self, upload_id: str) -> list[dict]:
        return []

    async def batch_upsert_signals(self, user_id: str, signals: list[dict]) -> int:
        return 0

    async def get_resolved_symbols(self, input_symbols: list[str]) -> dict[str, Optional[str]]:
        return {}

    async def set_resolved_symbols(self, mapping: dict[str, str]) -> int:
        return 0

    async def get_symbol_freshness_batch(self, symbols: list[str]) -> dict[str, dict]:
        return {}

    async def batch_update_latest_prices(self, updates: dict[str, tuple[float, str]]) -> int:
        return 0

    async def get_upload_status(self, upload_id: str) -> Optional[str]:
        return None

    async def set_ingestion_user(self, ingestion_id: str, user_id: str) -> bool:
        return False

    async def close(self) -> None:
        pass


class D1WorkerBackend(PersistenceBackend):
    def __init__(self, worker_url: str, timeout: float = 3.0):
        import httpx

        self._base_url = worker_url.rstrip("/") + "/api"
        self._timeout = timeout
        self._client = httpx.AsyncClient(timeout=httpx.Timeout(timeout))

    async def _post(self, path: str, payload: dict) -> Optional[dict]:
        try:
            resp = await self._client.post(f"{self._base_url}{path}", json=payload)
            if resp.status_code == 429:
                body = resp.json()
                logger.warning("D1 quota exceeded: %s", body.get("error", ""))
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

    async def _patch(self, path: str, payload: dict) -> Optional[dict]:
        try:
            resp = await self._client.patch(f"{self._base_url}{path}", json=payload)
            resp.raise_for_status()
            return resp.json()
        except Exception:
            logger.warning("D1 request failed: PATCH %s", path)
            return None

    async def save_upload(self, record: UploadRecord) -> Optional[str]:
        result = await self._post("/uploads", asdict(record))
        if result and "id" in result:
            return result["id"]
        return None

    async def save_signals(
        self, upload_id: str, trades: list[TradeRecord], user_id: Optional[str] = None
    ) -> Optional[dict[str, Any]]:
        payload = {"upload_id": upload_id, "signals": [asdict(t) for t in trades]}
        if user_id:
            payload["user_id"] = user_id
        result = await self._post("/signals", payload)
        if result and "inserted" in result:
            return result
        return None

    async def set_upload_status(self, upload_id: str, status: str) -> Optional[dict]:
        return await self._patch(f"/uploads/{upload_id}/status", {"status": status})

    async def list_uploads(
        self, user_id: Optional[str] = None, limit: int = 20, offset: int = 0
    ) -> dict[str, Any]:
        query = f"/uploads?limit={limit}&offset={offset}"
        if user_id:
            query += f"&user_id={user_id}"
        result = await self._get(query)
        if result and "results" in result:
            return result
        return {"results": [], "total": 0}

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

    async def log_ingestion(
        self,
        file_hash: str,
        filename: str,
        original_filename: str,
        file_size: int,
        source_info: Optional[str] = None,
    ) -> Optional[str]:
        result = await self._post("/ingestion", {
            "file_hash": file_hash,
            "filename": filename,
            "original_filename": original_filename,
            "file_size": file_size,
            "source_info": source_info,
        })
        if result and "id" in result:
            return result["id"]
        return None

    async def update_ingestion_status(self, id: str, status: str) -> bool:
        result = await self._patch("/ingestion", {"id": id, "status": status})
        return result is not None

    async def lookup_signals(
        self, row_hashes: list[str], user_id: Optional[str] = None
    ) -> list[str]:
        payload: dict[str, Any] = {"row_hashes": row_hashes}
        if user_id:
            payload["user_id"] = user_id
        result = await self._post("/signals/lookup", payload)
        if result and "existing" in result:
            return result["existing"]
        return []

    async def auth_signup(self, email: str, password: str, name: str = "") -> Optional[dict]:
        return await self._post("/auth/signup", {"email": email, "password": password, "name": name})

    async def auth_login(self, email: str, password: str) -> Optional[dict]:
        return await self._post("/auth/login", {"email": email, "password": password})

    async def auth_validate(self, token: str) -> Optional[dict]:
        return await self._get(f"/auth/validate?token={token}")

    async def admin_list_users(self) -> Optional[dict]:
        return await self._get("/admin/users")

    async def admin_set_plan(self, user_id: str, plan: str) -> Optional[dict]:
        return await self._post("/admin/users/plan", {"user_id": user_id, "plan": plan})

    async def admin_revoke_sessions(self, user_id: str) -> Optional[dict]:
        return await self._post("/admin/sessions/revoke", {"user_id": user_id})

    async def set_file_upload_map(self, user_id: str, file_hash: str, entry_mode: str, upload_id: str) -> bool:
        return False

    async def upsert_symbol_freshness(self, symbol: str, last_fetched: str, data_recency: str) -> None:
        pass

    async def get_upload_by_user_and_hash(self, user_id: str, file_hash: str, entry_mode: str) -> Optional[dict]:
        return None

    async def get_signals_for_upload(self, upload_id: str) -> list[dict]:
        return []

    async def batch_upsert_signals(self, user_id: str, signals: list[dict]) -> int:
        return 0

    async def get_resolved_symbols(self, input_symbols: list[str]) -> dict[str, Optional[str]]:
        return {}

    async def set_resolved_symbols(self, mapping: dict[str, str]) -> int:
        return 0

    async def get_symbol_freshness_batch(self, symbols: list[str]) -> dict[str, dict]:
        return {}

    async def batch_update_latest_prices(self, updates: dict[str, tuple[float, str]]) -> int:
        return 0

    async def get_upload_status(self, upload_id: str) -> Optional[str]:
        return None

    async def set_ingestion_user(self, ingestion_id: str, user_id: str) -> bool:
        return False

    async def close(self) -> None:
        try:
            await self._client.aclose()
        except Exception:
            pass


def _hash_password(password: str) -> str:
    return hashlib.sha256(f"{password}backtestbaba-salt-2026".encode()).hexdigest()


class CircuitBreaker:
    """Circuit breaker with half-open state and exponential backoff with jitter.

    - Trips after `threshold` consecutive failures.
    - Cooldown doubles on each trip (exponential backoff), capped at `max_cooldown`.
    - Random jitter (±10%) prevents thundering herd on recovery.
    - Half-open: after cooldown, the next request is allowed as a probe.
      If it succeeds, the circuit closes. If it fails, it re-opens for another
      cooldown cycle.
    """
    def __init__(self, threshold: int = 3, base_cooldown: int = 60, max_cooldown: int = 600):
        self._threshold = threshold
        self._base_cooldown = base_cooldown
        self._max_cooldown = max_cooldown
        self._failures = 0
        self._tripped_at = 0.0
        self._trip_count = 0

    @property
    def is_tripped(self) -> bool:
        if self._failures >= self._threshold:
            elapsed = time.monotonic() - self._tripped_at
            cooldown = min(self._base_cooldown * (2 ** self._trip_count), self._max_cooldown)
            jitter = random.uniform(0, cooldown * 0.1)
            if elapsed < cooldown + jitter:
                return True
            # Half-open: allow probe. Reset timer so if probe fails,
            # we don't immediately re-allow.
            self._tripped_at = time.monotonic()
            return False
        return False

    def record_failure(self):
        self._failures += 1
        if self._failures >= self._threshold:
            self._tripped_at = time.monotonic()
            self._trip_count += 1

    def record_success(self):
        self._failures = 0
        self._trip_count = 0


class PostgresBackend(PersistenceBackend):
    def __init__(self):
        self._pool = None
        self._circuit = CircuitBreaker(threshold=3, base_cooldown=60)

    @classmethod
    async def create(cls, dsn: str) -> "PostgresBackend":
        import asyncpg
        self = cls()
        try:
            self._pool = await asyncpg.create_pool(dsn, min_size=1, max_size=5)
            async with self._pool.acquire() as conn:
                schema_path = Path(__file__).parent / "schema.sql"
                await conn.execute(schema_path.read_text())
            logger.info("PostgreSQL persistence backend initialized (pool: 1–5, dsn=%s)", dsn)
        except Exception:
            logger.exception("PostgreSQL connection failed. Falling back to degraded mode.")
            self._pool = None
        return self

    async def _execute(self, query: str, *args) -> Optional[Any]:
        if self._circuit.is_tripped:
            logger.warning("Circuit breaker tripped. Skipping PostgreSQL query.")
            return None
        if self._pool is None:
            return None
        try:
            async with self._pool.acquire() as conn:
                result = await conn.execute(query, *args, timeout=3)
            self._circuit.record_success()
            return result
        except Exception:
            self._circuit.record_failure()
            logger.warning("PostgreSQL query failed (failure #%d)", self._circuit._failures)
            return None

    async def _fetchrow(self, query: str, *args) -> Optional[dict]:
        if self._circuit.is_tripped:
            return None
        if self._pool is None:
            return None
        try:
            async with self._pool.acquire() as conn:
                row = await conn.fetchrow(query, *args, timeout=3)
            self._circuit.record_success()
            return dict(row) if row else None
        except Exception:
            self._circuit.record_failure()
            return None

    async def save_upload(self, record: UploadRecord) -> Optional[str]:
        uid = str(uuid.uuid4())
        result = await self._execute(
            "INSERT INTO uploads (id, user_id, file_hash, filename, entry_mode, signal_count) VALUES ($1,$2,$3,$4,$5,$6)",
            uid, record.user_id, record.file_hash, record.filename, record.entry_mode, record.signal_count
        )
        return uid if result else None

    async def save_signals(self, upload_id: str, trades: list[TradeRecord], user_id: Optional[str] = None) -> Optional[dict[str, Any]]:
        inserted = 0
        effective_user = user_id or ""
        for t in trades:
            result = await self._execute(
                "INSERT INTO signal_hashes (id, upload_id, user_id, row_hash, symbol, signal_date, entry_date, entry_price, entry_mode, status, results_json) "
                "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (user_id, row_hash) DO NOTHING",
                str(uuid.uuid4()), upload_id, effective_user, t.row_hash, t.symbol, t.signal_date,
                t.entry_date, t.entry_price, t.entry_mode, t.status, t.results_json
            )
            if result and "INSERT" in result:
                inserted += 1
        if inserted:
            await self._execute("UPDATE uploads SET trade_count = trade_count + $1 WHERE id = $2", inserted, upload_id)
        return {"inserted": inserted, "skipped": len(trades) - inserted}

    async def set_upload_status(self, upload_id: str, status: str) -> Optional[dict]:
        result = await self._execute("UPDATE uploads SET status=$1, updated_at=NOW() WHERE id=$2", status, upload_id)
        return {"updated": True} if result else None

    async def list_uploads(self, user_id: Optional[str] = None, limit: int = 20, offset: int = 0) -> dict[str, Any]:
        if user_id:
            rows = await self._fetchrow(
                "SELECT json_agg(json_build_object('id',id,'filename',filename,'entry_mode',entry_mode,'signal_count',signal_count,'trade_count',trade_count,'status',status,'created_at',created_at) ORDER BY created_at DESC) AS results, "
                "(SELECT COUNT(*) FROM uploads WHERE user_id=$3) AS total FROM uploads WHERE user_id=$3 LIMIT $1 OFFSET $2",
                limit, offset, user_id
            )
        else:
            rows = await self._fetchrow(
                "SELECT json_agg(json_build_object('id',id,'filename',filename,'entry_mode',entry_mode,'signal_count',signal_count,'trade_count',trade_count,'status',status,'created_at',created_at) ORDER BY created_at DESC) AS results, "
                "(SELECT COUNT(*) FROM uploads) AS total FROM uploads LIMIT $1 OFFSET $2",
                limit, offset
            )
        if rows:
            return {"results": rows.get("results") or [], "total": rows.get("total") or 0}
        return {"results": [], "total": 0}

    async def get_quota(self) -> dict[str, Any]:
        row = await self._fetchrow("SELECT total_writes, write_limit FROM quota WHERE id=1")
        if row:
            return {"total_writes": row["total_writes"], "write_limit": row["write_limit"], "percent_used": round(row["total_writes"] / max(row["write_limit"], 1), 4), "soft_blocked": False}
        return {"total_writes": 0, "write_limit": 1000000, "percent_used": 0.0, "soft_blocked": False}

    async def healthcheck(self) -> bool:
        row = await self._fetchrow("SELECT 1 AS ok")
        return row is not None

    async def log_ingestion(self, file_hash: str, filename: str, original_filename: str, file_size: int, source_info: Optional[str] = None) -> Optional[str]:
        uid = str(uuid.uuid4())
        result = await self._execute(
            "INSERT INTO ingestion_log (id, file_hash, filename, original_filename, file_size, source_info) VALUES ($1,$2,$3,$4,$5,$6)",
            uid, file_hash, filename, original_filename, file_size, source_info
        )
        return uid if result else None

    async def update_ingestion_status(self, id: str, status: str) -> bool:
        result = await self._execute("UPDATE ingestion_log SET status=$1 WHERE id=$2", status, id)
        return result is not None

    async def lookup_signals(self, row_hashes: list[str], user_id: Optional[str] = None) -> list[str]:
        if user_id:
            rows = await self._fetchrow("SELECT json_agg(row_hash) AS existing FROM signal_hashes WHERE row_hash = ANY($1) AND user_id=$2", row_hashes, user_id)
        else:
            rows = await self._fetchrow("SELECT json_agg(row_hash) AS existing FROM signal_hashes WHERE row_hash = ANY($1)", row_hashes)
        return rows.get("existing") or [] if rows else []

    async def auth_signup(self, email: str, password: str, name: str = "") -> Optional[dict]:
        uid = str(uuid.uuid4())
        pw_hash = _hash_password(password)
        result = await self._execute(
            "INSERT INTO users (id, email, password_hash, name) VALUES ($1,$2,$3,$4) ON CONFLICT (email) DO NOTHING",
            uid, email.lower(), pw_hash, name
        )
        if not result:
            return None
        token = str(uuid.uuid4())
        await self._execute(
            "INSERT INTO sessions (id, user_id, token, expires_at) VALUES ($1,$2,$3,NOW() + INTERVAL '7 days')",
            str(uuid.uuid4()), uid, token
        )
        return {"token": token, "user": {"id": uid, "email": email, "name": name, "is_admin": False}}

    async def auth_login(self, email: str, password: str) -> Optional[dict]:
        pw_hash = _hash_password(password)
        row = await self._fetchrow("SELECT id, email, name, is_admin FROM users WHERE email=$1 AND password_hash=$2", email.lower(), pw_hash)
        if not row:
            return None
        token = str(uuid.uuid4())
        await self._execute(
            "INSERT INTO sessions (id, user_id, token, expires_at) VALUES ($1,$2,$3,NOW() + INTERVAL '7 days')",
            str(uuid.uuid4()), row["id"], token
        )
        return {"token": token, "user": {"id": row["id"], "email": row["email"], "name": row["name"], "is_admin": row["is_admin"]}}

    async def auth_validate(self, token: str) -> Optional[dict]:
        row = await self._fetchrow(
            "SELECT u.id, u.email, u.name, u.is_admin FROM sessions s JOIN users u ON s.user_id=u.id WHERE s.token=$1 AND s.revoked=FALSE AND s.expires_at > NOW()",
            token
        )
        return {"user": dict(row)} if row else None

    async def admin_list_users(self) -> Optional[dict]:
        rows = await self._fetchrow("SELECT json_agg(json_build_object('id',id,'email',email,'name',name,'plan',plan,'is_admin',is_admin,'created_at',created_at)) AS results FROM users ORDER BY created_at DESC")
        return {"results": rows.get("results") or []} if rows else None

    async def admin_set_plan(self, user_id: str, plan: str) -> Optional[dict]:
        result = await self._execute("UPDATE users SET plan=$1, updated_at=NOW() WHERE id=$2", plan, user_id)
        return {"ok": True} if result else None

    async def admin_revoke_sessions(self, user_id: str) -> Optional[dict]:
        result = await self._execute("UPDATE sessions SET revoked=TRUE WHERE user_id=$1", user_id)
        return {"ok": True} if result else None

    async def upsert_symbol_freshness(self, symbol: str, last_fetched: str, data_recency: str) -> None:
        await self._execute(
            "INSERT INTO symbol_freshness (symbol, last_fetched, data_recency) "
            "VALUES ($1, $2, $3) "
            "ON CONFLICT (symbol) "
            "DO UPDATE SET last_fetched = $2, data_recency = $3, updated_at = NOW()",
            symbol, last_fetched, data_recency
        )

    async def set_file_upload_map(self, user_id: str, file_hash: str, entry_mode: str, upload_id: str) -> bool:
        result = await self._execute(
            "INSERT INTO file_upload_map (user_id, file_hash, entry_mode, upload_id) "
            "VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING",
            user_id, file_hash, entry_mode, upload_id
        )
        return result is not None

    async def get_upload_by_user_and_hash(self, user_id: str, file_hash: str, entry_mode: str) -> Optional[dict]:
        row = await self._fetchrow(
            "SELECT u.id, u.file_hash, u.filename, u.entry_mode, u.signal_count, u.trade_count, u.status, u.created_at "
            "FROM uploads u "
            "JOIN file_upload_map f ON f.upload_id = u.id "
            "WHERE f.user_id = $1 AND f.file_hash = $2 AND f.entry_mode = $3",
            user_id, file_hash, entry_mode
        )
        return dict(row) if row else None

    async def get_signals_for_upload(self, upload_id: str) -> list[dict]:
        row = await self._fetchrow(
            "SELECT json_agg(json_build_object("
            "'id', id, 'user_id', user_id, 'row_hash', row_hash, 'symbol', symbol, "
            "'signal_date', signal_date, 'entry_date', entry_date, 'entry_price', entry_price, "
            "'entry_mode', entry_mode, 'duration', duration, 'results_json', results_json, "
            "'max_high_90d', max_high_90d, 'max_low_90d', max_low_90d, "
            "'sector', sector, 'market_cap', market_cap, 'status', status, "
            "'latest_price', latest_price, 'latest_price_date', latest_price_date"
            ") ORDER BY created_at ASC) AS results "
            "FROM signal_results WHERE upload_id = $1",
            upload_id
        )
        if row and row.get("results"):
            return row["results"]
        return []

    async def batch_upsert_signals(self, user_id: str, signals: list[dict]) -> int:
        """Multi-row INSERT ON CONFLICT. Uses extended timeout (30s) for large batches."""
        if not signals:
            return 0
        if self._circuit.is_tripped or self._pool is None:
            return 0
        try:
            async with self._pool.acquire() as conn:
                values = []
                params = []
                idx = 1
                for s in signals:
                    values.append(
                        f"(${idx},${idx+1},${idx+2},${idx+3},${idx+4},${idx+5},${idx+6},${idx+7},${idx+8},${idx+9},${idx+10},${idx+11},${idx+12},${idx+13},${idx+14},${idx+15})"
                    )
                    params.extend([
                        s.get("id", str(uuid.uuid4())),
                        user_id,
                        s.get("row_hash", ""),
                        s.get("upload_id", ""),
                        s.get("symbol", ""),
                        s.get("signal_date", ""),
                        s.get("entry_date"),
                        s.get("entry_price"),
                        s.get("entry_mode", "next_close"),
                        s.get("duration", 90),
                        s.get("results_json", "{}"),
                        s.get("max_high_90d"),
                        s.get("max_low_90d"),
                        s.get("sector"),
                        s.get("market_cap"),
                        s.get("status", "Success"),
                    ])
                    idx += 16
                query = (
                    "INSERT INTO signal_results "
                    "(id, user_id, row_hash, upload_id, symbol, signal_date, entry_date, entry_price, "
                    "entry_mode, duration, results_json, max_high_90d, max_low_90d, sector, market_cap, status) "
                    f"VALUES {','.join(values)} "
                    "ON CONFLICT (user_id, row_hash, duration) DO UPDATE SET "
                    "updated_at = NOW(), "
                    "results_json = EXCLUDED.results_json, "
                    "status = EXCLUDED.status, "
                    "entry_price = EXCLUDED.entry_price, "
                    "max_high_90d = EXCLUDED.max_high_90d, "
                    "max_low_90d = EXCLUDED.max_low_90d, "
                    "sector = EXCLUDED.sector, "
                    "market_cap = EXCLUDED.market_cap, "
                    "latest_price = EXCLUDED.latest_price, "
                    "latest_price_date = EXCLUDED.latest_price_date "
                )
                result = await conn.execute(query, *params, timeout=30)
            self._circuit.record_success()
            if result:
                import re
                match = re.search(r'INSERT\s+0\s+(\d+)', result)
                if match:
                    return int(match.group(1))
            return len(signals)
        except Exception:
            self._circuit.record_failure()
            logger.warning("batch_upsert_signals failed for %d signals (failure #%d)", len(signals), self._circuit._failures)
            return 0

    async def get_resolved_symbols(self, input_symbols: list[str]) -> dict[str, Optional[str]]:
        if not input_symbols:
            return {}
        row = await self._fetchrow(
            "SELECT json_agg(json_build_object('input_symbol', input_symbol, 'resolved_symbol', resolved_symbol)) AS results "
            "FROM resolved_symbols WHERE input_symbol = ANY($1)",
            input_symbols
        )
        result = {}
        if row and row.get("results"):
            for r in row["results"]:
                result[r["input_symbol"]] = r["resolved_symbol"]
        return result

    async def set_resolved_symbols(self, mapping: dict[str, str]) -> int:
        if not mapping:
            return 0
        items = list(mapping.items())
        values = []
        params = []
        idx = 1
        for inp, resolved in items:
            values.append(f"(${idx},${idx+1})")
            params.extend([inp, resolved])
            idx += 2
        result = await self._execute(
            f"INSERT INTO resolved_symbols (input_symbol, resolved_symbol) "
            f"VALUES {','.join(values)} ON CONFLICT (input_symbol) DO NOTHING",
            *params
        )
        return len(mapping) if result else 0

    async def get_symbol_freshness_batch(self, symbols: list[str]) -> dict[str, dict]:
        if not symbols:
            return {}
        row = await self._fetchrow(
            "SELECT json_agg(json_build_object("
            "'symbol', symbol, 'data_start_date', data_start_date, 'data_end_date', data_end_date, "
            "'latest_price', latest_price, 'latest_price_date', latest_price_date, "
            "'last_fetched', last_fetched, 'next_refresh_at', next_refresh_at, "
            "'fetch_count', fetch_count"
            ")) AS results "
            "FROM symbol_data_freshness WHERE symbol = ANY($1)",
            symbols
        )
        result = {}
        if row and row.get("results"):
            for r in row["results"]:
                result[r["symbol"]] = r
        return result

    async def batch_update_latest_prices(self, updates: dict[str, tuple[float, str]]) -> int:
        """Updates: {symbol: (price, date_str)}. Sets next_refresh_at to NOW()+5min to prevent thundering herd."""
        if not updates:
            return 0
        items = [(sym, price, date_str) for sym, (price, date_str) in updates.items() if price is not None]
        if not items:
            return 0
        if self._circuit.is_tripped or self._pool is None:
            return 0
        try:
            async with self._pool.acquire() as conn:
                values = []
                params = []
                idx = 1
                for sym, price, date_str in items:
                    values.append(f"(${idx}::TEXT, ${idx+1}::REAL, ${idx+2}::DATE)")
                    params.extend([sym, price, date_str])
                    idx += 3
                query = (
                    "UPDATE symbol_data_freshness AS t SET "
                    "latest_price = v.price, "
                    "latest_price_date = v.date, "
                    "next_refresh_at = NOW() + INTERVAL '5 minutes', "
                    "fetch_count = fetch_count + 1 "
                    f"FROM (VALUES {','.join(values)}) AS v(symbol, price, date) "
                    "WHERE t.symbol = v.symbol"
                )
                await conn.execute(query, *params, timeout=10)
            self._circuit.record_success()
            return len(items)
        except Exception:
            self._circuit.record_failure()
            logger.warning("batch_update_latest_prices failed for %d symbols (failure #%d)", len(items), self._circuit._failures)
            return 0

    async def get_upload_status(self, upload_id: str) -> Optional[str]:
        row = await self._fetchrow(
            "SELECT status FROM uploads WHERE id = $1", upload_id
        )
        return row["status"] if row else None

    async def set_ingestion_user(self, ingestion_id: str, user_id: str) -> bool:
        result = await self._execute(
            "UPDATE ingestion_log SET user_id = $1 WHERE id = $2",
            user_id, ingestion_id
        )
        return result is not None

    async def close(self) -> None:
        if self._pool:
            try:
                await self._pool.close()
            except Exception:
                pass
