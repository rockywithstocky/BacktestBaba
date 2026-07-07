from diskcache import Cache

from .data_provider import DataProvider
from ..config import Paths, CacheTTL

# Sentinel to distinguish "not cached yet" from "cached as None (not found)"
_NOT_CACHED = object()

_disk_cache = Cache(Paths.CACHE_DIR, size_limit=CacheTTL.DISKCACHE_SIZE_LIMIT_MB * 1024 * 1024)

class SymbolResolver:
    # In-memory cache: {"RELIANCE": "RELIANCE.NS", "BADTICKER": None}
    _mem_cache = {}

    @staticmethod
    def resolve(symbol: str) -> str:
        """
        Resolves a symbol to its NSE (.NS) or BSE (.BO) equivalent.
        Returns None if not found. Results are cached in memory and disk.
        """
        key = symbol.upper().strip()
        
        # Check memory cache first
        cached = SymbolResolver._mem_cache.get(key, _NOT_CACHED)
        if cached is not _NOT_CACHED:
            return cached
        
        # Check disk cache
        disk_key = f"resolve_{key}"
        if disk_key in _disk_cache:
            result = _disk_cache[disk_key]
            SymbolResolver._mem_cache[key] = result
            return result
        
        # Resolve from API and cache
        result = SymbolResolver._resolve_uncached(key)
        SymbolResolver._mem_cache[key] = result
        _disk_cache.set(disk_key, result, expire=CacheTTL.SYMBOL_RESOLUTION)
        return result
    
    @staticmethod
    def _resolve_uncached(symbol: str) -> str:
        """Actual resolution logic — called only on cache miss."""
        # If already has suffix, verify it
        if symbol.endswith(".NS") or symbol.endswith(".BO"):
            if SymbolResolver._check_exists(symbol):
                return symbol
            return None

        # Try NSE first
        ns_symbol = f"{symbol}.NS"
        if SymbolResolver._check_exists(ns_symbol):
            return ns_symbol
            
        # Try BSE
        bo_symbol = f"{symbol}.BO"
        if SymbolResolver._check_exists(bo_symbol):
            return bo_symbol
            
        return None

    @staticmethod
    def _check_exists(symbol: str) -> bool:
        """Check if a symbol exists on Yahoo Finance by fetching latest price."""
        try:
            price = DataProvider.get_latest_price(symbol)
            return price is not None
        except Exception:
            return False
