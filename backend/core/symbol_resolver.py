import logging

import pandas as pd
import yfinance as yf
from diskcache import Cache

from .data_provider import DataProvider
from ..config import Paths, CacheTTL, Limits

logger = logging.getLogger(__name__)

_NOT_CACHED = object()

_disk_cache = Cache(Paths.CACHE_DIR, size_limit=CacheTTL.DISKCACHE_SIZE_LIMIT_MB * 1024 * 1024)

class SymbolResolver:
    _mem_cache = {}

    @staticmethod
    def resolve(symbol: str) -> str:
        """Resolve single symbol. Falls back to per-symbol check if uncached."""
        key = symbol.upper().strip()
        cached = SymbolResolver._mem_cache.get(key, _NOT_CACHED)
        if cached is not _NOT_CACHED:
            return cached
        disk_key = f"resolve_{key}"
        if disk_key in _disk_cache:
            result = _disk_cache[disk_key]
            SymbolResolver._mem_cache[key] = result
            return result
        result = SymbolResolver._resolve_uncached(key)
        SymbolResolver._mem_cache[key] = result
        _disk_cache.set(disk_key, result, expire=CacheTTL.SYMBOL_RESOLUTION)
        return result

    @staticmethod
    def batch_resolve(symbols: list) -> dict:
        """Resolve multiple symbols at once via batch yf.download.
        Returns dict: {original_symbol: resolved_symbol_or_None}
        Checks diskcache first, only hits API for uncached symbols.
        """
        seen_resolved = set()
        result = {}

        uncached_keys = []
        pre_suffixed = []
        for sym in symbols:
            key = sym.upper().strip()
            if not key:
                continue
            disk_key = f"resolve_{key}"
            if disk_key in _disk_cache:
                resolved = _disk_cache[disk_key]
                result[key] = resolved
                if resolved:
                    seen_resolved.add(resolved)
            elif key.endswith(".NS") or key.endswith(".BO"):
                pre_suffixed.append(key)
            else:
                uncached_keys.append(key)

        if not uncached_keys and not pre_suffixed:
            return result

        batch_size = Limits.BATCH_RESOLVE_CHUNK

        def _batch_check(suffix: str, keys: list) -> set:
            valid = set()
            suffixed = [f"{k}{suffix}" for k in keys]
            for i in range(0, len(suffixed), batch_size):
                chunk = suffixed[i:i + batch_size]
                try:
                    data = yf.download(
                        tickers=chunk, period="1d",
                        group_by='ticker', progress=False, threads=True
                    )
                    if data is None or data.empty:
                        continue
                    if isinstance(data.columns, pd.MultiIndex):
                        for sym in chunk:
                            if sym in data.columns.get_level_values(0):
                                col = data[sym].dropna(how='all')
                                if not col.empty and col["Close"].notna().any():
                                    valid.add(sym)
                    else:
                        valid.add(chunk[0])
                except Exception:
                    logger.debug("batch_resolve chunk failed for %d symbols", len(chunk), exc_info=True)
            return valid

        # Resolve pre-suffixed keys (e.g. "RELIANCE.NS") — check as-is
        if pre_suffixed:
            valid_pre = _batch_check("", pre_suffixed)
            for key in pre_suffixed:
                if key in valid_pre and key not in seen_resolved:
                    result[key] = key
                    seen_resolved.add(key)
                    _disk_cache.set(f"resolve_{key}", key, expire=CacheTTL.SYMBOL_RESOLUTION)
                else:
                    result[key] = None
                    _disk_cache.set(f"resolve_{key}", None, expire=CacheTTL.SYMBOL_RESOLUTION)

        # Resolve bare keys — try .NS then .BO
        if uncached_keys:
            valid_ns = _batch_check(".NS", uncached_keys)
            remaining = [k for k in uncached_keys if f"{k}.NS" not in valid_ns]
            valid_bo = _batch_check(".BO", remaining) if remaining else set()

            for key in uncached_keys:
                ns = f"{key}.NS"
                bo = f"{key}.BO"
                if ns in valid_ns and ns not in seen_resolved:
                    result[key] = ns
                    seen_resolved.add(ns)
                    _disk_cache.set(f"resolve_{key}", ns, expire=CacheTTL.SYMBOL_RESOLUTION)
                elif bo in valid_bo and bo not in seen_resolved:
                    result[key] = bo
                    seen_resolved.add(bo)
                    _disk_cache.set(f"resolve_{key}", bo, expire=CacheTTL.SYMBOL_RESOLUTION)
                else:
                    result[key] = None
                    _disk_cache.set(f"resolve_{key}", None, expire=CacheTTL.SYMBOL_RESOLUTION)

        return result

    @staticmethod
    def _resolve_uncached(symbol: str) -> str:
        if symbol.endswith(".NS") or symbol.endswith(".BO"):
            if SymbolResolver._check_exists(symbol):
                return symbol
            return None
        ns_symbol = f"{symbol}.NS"
        if SymbolResolver._check_exists(ns_symbol):
            return ns_symbol
        bo_symbol = f"{symbol}.BO"
        if SymbolResolver._check_exists(bo_symbol):
            return bo_symbol
        return None

    @staticmethod
    def _check_exists(symbol: str) -> bool:
        try:
            price = DataProvider.get_latest_price(symbol)
            return price is not None
        except Exception:
            return False
