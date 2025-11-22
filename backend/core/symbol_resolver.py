from .data_provider import DataProvider

class SymbolResolver:
    @staticmethod
    def resolve(symbol: str) -> str:
        """
        Resolves a symbol to its NSE (.NS) or BSE (.BO) equivalent.
        Returns None if not found.
        """
        symbol = symbol.upper().strip()
        
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
        # We check existence by trying to fetch 1 day of data
        # This is a bit expensive if not cached, but necessary
        # We can optimize by checking metadata if possible, but history is reliable
        try:
            price = DataProvider.get_latest_price(symbol)
            return price is not None
        except Exception:
            return False
