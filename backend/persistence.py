import hashlib
import json
import logging
import math
import time
import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)


def compute_row_hash(symbol: str, signal_date: str, entry_mode: str) -> str:
    raw = f"{symbol}|{signal_date}|{entry_mode}"
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
        self, upload_id: str, trades: list[TradeRecord]
    ) -> Optional[dict[str, Any]]:
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
    async def close(self) -> None:
        ...


class NullBackend(PersistenceBackend):
    async def save_upload(self, record: UploadRecord) -> Optional[str]:
        return None

    async def save_signals(
        self, upload_id: str, trades: list[TradeRecord]
    ) -> Optional[dict[str, Any]]:
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
        self, upload_id: str, trades: list[TradeRecord]
    ) -> Optional[dict[str, Any]]:
        payload = {"upload_id": upload_id, "signals": [asdict(t) for t in trades]}
        result = await self._post("/signals", payload)
        if result and "inserted" in result:
            return result
        return None

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

    async def close(self) -> None:
        try:
            await self._client.aclose()
        except Exception:
            pass


def _hash_password(password: str) -> str:
    return hashlib.sha256(f"{password}backtestbaba-salt-2026".encode()).hexdigest()


class CircuitBreaker:
    """Simple circuit breaker: after N failures, trips for `cooldown_sec` seconds."""
    def __init__(self, threshold: int = 3, cooldown_sec: int = 60):
        self._threshold = threshold
        self._cooldown = cooldown_sec
        self._failures = 0
        self._tripped_at = 0.0

    @property
    def is_tripped(self) -> bool:
        if self._failures >= self._threshold:
            if time.monotonic() - self._tripped_at > self._cooldown:
                self._failures = 0
                return False
            return True
        return False

    def record_failure(self):
        self._failures += 1
        if self._failures >= self._threshold:
            self._tripped_at = time.monotonic()

    def record_success(self):
        self._failures = 0


class PostgresBackend(PersistenceBackend):
    def __init__(self):
        self._pool = None
        self._circuit = CircuitBreaker(threshold=3, cooldown_sec=60)

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
            "INSERT INTO uploads (id, file_hash, filename, entry_mode, signal_count) VALUES ($1,$2,$3,$4,$5)",
            uid, record.file_hash, record.filename, record.entry_mode, record.signal_count
        )
        return uid if result else None

    async def save_signals(self, upload_id: str, trades: list[TradeRecord]) -> Optional[dict[str, Any]]:
        inserted = 0
        for t in trades:
            result = await self._execute(
                "INSERT INTO signal_hashes (id, upload_id, row_hash, symbol, signal_date, entry_date, entry_price, entry_mode, status, results_json) "
                "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (row_hash) DO NOTHING",
                str(uuid.uuid4()), upload_id, t.row_hash, t.symbol, t.signal_date,
                t.entry_date, t.entry_price, t.entry_mode, t.status, t.results_json
            )
            if result and "INSERT" in result:
                inserted += 1
        if inserted:
            await self._execute("UPDATE uploads SET trade_count = trade_count + $1 WHERE id = $2", inserted, upload_id)
        return {"inserted": inserted, "skipped": len(trades) - inserted}

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

    async def close(self) -> None:
        if self._pool:
            try:
                await self._pool.close()
            except Exception:
                pass
