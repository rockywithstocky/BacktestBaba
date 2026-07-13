import hashlib
import json
import logging
import math
from abc import ABC, abstractmethod
from dataclasses import dataclass, asdict
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
        self, limit: int = 20, offset: int = 0
    ) -> list[dict[str, Any]]:
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

    async def close(self) -> None:
        try:
            await self._client.aclose()
        except Exception:
            pass
