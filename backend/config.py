import os
from pathlib import Path

BACKEND_DIR = Path(__file__).parent


def is_render() -> bool:
    return os.getenv("RENDER", "").lower() in ("true", "1")


class Limits:
    BATCH_SIZE = int(os.getenv("BATCH_SIZE", "500"))

    MAX_CONCURRENCY_RESOLVE = int(os.getenv("MAX_CONCURRENCY_RESOLVE", "5"))
    MAX_CONCURRENCY_DATA = int(os.getenv("MAX_CONCURRENCY_DATA", "10"))
    MAX_CONCURRENCY_METADATA = int(os.getenv("MAX_CONCURRENCY_METADATA", "10"))

    MAX_FILE_SIZE_MB = int(os.getenv(
        "MAX_FILE_SIZE_MB",
        "5" if is_render() else "10"
    ))
    MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024

    MAX_SIGNALS = int(os.getenv(
        "MAX_SIGNALS",
        "5000" if is_render() else "100000"
    ))

    BATCH_RESOLVE_CHUNK = int(os.getenv("BATCH_RESOLVE_CHUNK", "50"))
    BULK_FETCH_CHUNK = int(os.getenv(
        "BULK_FETCH_CHUNK",
        "25" if is_render() else "100"
    ))
    RATE_LIMIT_BACKOFF_SEC = float(os.getenv("RATE_LIMIT_BACKOFF_SEC", "1.0"))

    WS_TIMEOUT_SEC = int(os.getenv("WS_TIMEOUT_SEC", "300"))
    HTTP_TIMEOUT_SEC = int(os.getenv("HTTP_TIMEOUT_SEC", "55" if is_render() else "600"))
    KEEPALIVE_INTERVAL_SEC = int(os.getenv("KEEPALIVE_INTERVAL_SEC", "30"))

    PROGRESS_THROTTLE_EVERY_N = int(os.getenv("PROGRESS_THROTTLE_EVERY_N", "50"))


class CacheTTL:
    TICKER_DATA_HISTORICAL = int(os.getenv("CACHE_TTL_DATA_HISTORICAL", "2592000"))  # 30 days
    TICKER_DATA_RECENT = int(os.getenv("CACHE_TTL_DATA_RECENT", "86400"))  # 24 hours
    RECENT_CUTOFF_DAYS = int(os.getenv("RECENT_CUTOFF_DAYS", "7"))

    SYMBOL_RESOLUTION = int(os.getenv("CACHE_TTL_RESOLUTION", "604800"))  # 7 days
    TICKER_INFO = int(os.getenv("CACHE_TTL_INFO", "604800"))  # 7 days
    LATEST_PRICE = int(os.getenv("CACHE_TTL_LATEST", "300"))  # 5 min

    FILE_HASH_REPORT = int(os.getenv("CACHE_TTL_REPORT", "2592000"))  # 30 days

    DISKCACHE_SIZE_LIMIT_MB = int(os.getenv("DISKCACHE_SIZE_LIMIT_MB", "500"))


class Paths:
    CACHE_DIR = os.getenv("CACHE_DIR", str(BACKEND_DIR / ".cache"))
    JOBS_DIR = os.getenv("JOBS_DIR", str(BACKEND_DIR / ".jobs"))
    TEMP_DIR = os.getenv("TEMP_DIR", str(BACKEND_DIR / ".temp"))

    @classmethod
    def ensure_dirs(cls):
        for d in (cls.CACHE_DIR, cls.JOBS_DIR, cls.TEMP_DIR):
            Path(d).mkdir(parents=True, exist_ok=True)


PERSISTENCE_ENABLED: bool = os.getenv("PERSISTENCE_ENABLED", "false").lower() == "true"
WORKER_URL: Optional[str] = os.getenv("WORKER_URL")
PERSISTENCE_TIMEOUT: int = int(os.getenv("PERSISTENCE_TIMEOUT", "3"))
