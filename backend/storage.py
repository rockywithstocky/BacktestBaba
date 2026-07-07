import hashlib
import json
import logging
import os
import time
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Optional, Any

from diskcache import Cache

from backend.config import Paths, CacheTTL, Limits

logger = logging.getLogger(__name__)

_cache = Cache(Paths.CACHE_DIR, size_limit=CacheTTL.DISKCACHE_SIZE_LIMIT_MB * 1024 * 1024)


def generate_run_id(file_hash: str, entry_mode: str) -> str:
    return f"{file_hash[:12]}_{entry_mode}"


def compute_file_hash(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


class FileHashCache:
    """Cache full backtest reports by file content hash + entry_mode."""

    @staticmethod
    def get(file_hash: str, entry_mode: str) -> Optional[Dict[str, Any]]:
        key = f"report_{file_hash}_{entry_mode}"
        if key in _cache:
            logger.info("File hash cache HIT: %s", key[:40])
            return _cache[key]
        logger.info("File hash cache MISS: %s", key[:40])
        return None

    @staticmethod
    def set(file_hash: str, entry_mode: str, report_dict: Dict[str, Any]):
        key = f"report_{file_hash}_{entry_mode}"
        num_trades = len(report_dict.get("trades", []))
        _cache.set(key, report_dict, expire=CacheTTL.FILE_HASH_REPORT)
        logger.info(
            "File hash cache SET: %s (%d trades, %ds TTL)",
            key[:40], num_trades, CacheTTL.FILE_HASH_REPORT
        )


class JobStorage:
    """Manages per-run temp files for batch processing results."""

    def __init__(self, run_id: str):
        self.run_id = run_id
        self.job_dir = Path(Paths.JOBS_DIR) / run_id
        self.job_dir.mkdir(parents=True, exist_ok=True)
        logger.debug("JobStorage initialized: %s", self.job_dir)

    def save_batch(self, batch_num: int, results: List[Dict[str, Any]]):
        file_path = self.job_dir / f"batch_{batch_num:04d}.jsonl"
        with open(file_path, "w", encoding="utf-8") as f:
            for r in results:
                f.write(json.dumps(r, default=str) + "\n")
        logger.debug("Batch %d saved: %d results -> %s", batch_num, len(results), file_path.name)

    def merge_results(self) -> List[Dict[str, Any]]:
        merged = []
        jsonl_files = sorted(self.job_dir.glob("batch_*.jsonl"))
        for fpath in jsonl_files:
            with open(fpath, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line:
                        merged.append(json.loads(line))
        logger.debug("Merged %d results from %d batch files", len(merged), len(jsonl_files))
        return merged

    def save_metadata(self, params: Dict[str, Any]):
        file_path = self.job_dir / "metadata.json"
        params["_saved_at"] = datetime.utcnow().isoformat()
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(params, f, default=str, indent=2)

    def load_metadata(self) -> Optional[Dict[str, Any]]:
        file_path = self.job_dir / "metadata.json"
        if file_path.exists():
            with open(file_path, "r", encoding="utf-8") as f:
                return json.load(f)
        return None

    def batch_count(self) -> int:
        return len(list(self.job_dir.glob("batch_*.jsonl")))

    def cleanup(self):
        import shutil
        if self.job_dir.exists():
            shutil.rmtree(self.job_dir)
            logger.debug("JobStorage cleaned up: %s", self.job_dir)

    @property
    def size_bytes(self) -> int:
        total = 0
        for fpath in self.job_dir.rglob("*"):
            if fpath.is_file():
                total += fpath.stat().st_size
        return total
