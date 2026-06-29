from .data_provider import DataProvider

# Sentinel to distinguish "not cached yet" from "cached as None (not found)"
_NOT_CACHED = object()

class SymbolResolver:
    # In-memory cache: {"RELIANCE": "RELIANCE.NS", "BADTICKER": None}
    _cache = {}

    @staticmethod
    def resolve(symbol: str) -> str:
        """
        Resolves a symbol to its NSE (.NS) or BSE (.BO) equivalent.
        Returns None if not found. Results are cached in memory.
        """
        key = symbol.upper().strip()
        
        # Check cache first
        cached = SymbolResolver._cache.get(key, _NOT_CACHED)
        if cached is not _NOT_CACHED:
            return cached
        
        # Resolve and cache the result
        result = SymbolResolver._resolve_uncached(key)
        SymbolResolver._cache[key] = result
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
