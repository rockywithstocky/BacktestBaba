from pydantic import BaseModel
from typing import List, Optional, Dict, Any

class BacktestRequest(BaseModel):
    # We will accept file upload, but for API testing we might want raw data
    # This model might be used if we parse CSV in frontend, but likely we parse in backend
    pass

class SignalResult(BaseModel):
    symbol: str
    signal_date: str
    signal_close_price: Optional[float] = None
    entry_date: Optional[str] = None
    entry_price: float
    entry_mode: str = "next_close"
    
    # Returns & Prices
    return_7d: Optional[float] = None
    exit_price_7d: Optional[float] = None
    
    return_14d: Optional[float] = None
    exit_price_14d: Optional[float] = None
    
    return_30d: Optional[float] = None
    exit_price_30d: Optional[float] = None
    
    return_45d: Optional[float] = None
    exit_price_45d: Optional[float] = None
    
    return_60d: Optional[float] = None
    exit_price_60d: Optional[float] = None
    
    return_90d: Optional[float] = None
    exit_price_90d: Optional[float] = None
    
    # Max High/Low in 90d
    max_high_90d: Optional[float] = None
    max_high_date: Optional[str] = None
    max_low_90d: Optional[float] = None
    max_low_date: Optional[str] = None
    
    # Metadata
    sector: Optional[str] = None
    market_cap: Optional[str] = None
    status: str # "Success", "Data Not Found", "Symbol Not Found"
    latest_price: Optional[float] = None
    latest_price_date: Optional[str] = None
    latest_price_return: Optional[float] = None

class BacktestReport(BaseModel):
    total_signals: int
    successful_signals: int
    failed_signals: int
    entry_mode: str = "next_close"
    
    # Aggregated Stats
    avg_return_7d: Optional[float] = None
    win_rate_7d: Optional[float] = None
    
    avg_return_14d: Optional[float] = None
    win_rate_14d: Optional[float] = None
    
    avg_return_30d: Optional[float] = None
    win_rate_30d: Optional[float] = None
    
    avg_return_45d: Optional[float] = None
    win_rate_45d: Optional[float] = None
    
    avg_return_60d: Optional[float] = None
    win_rate_60d: Optional[float] = None
    
    avg_return_90d: Optional[float] = None
    win_rate_90d: Optional[float] = None
    
    best_performer: Optional[SignalResult] = None
    worst_performer: Optional[SignalResult] = None
    
    trades: List[SignalResult]

    cache_stats: Optional[dict] = None
    latest_price_date: Optional[str] = None
    cache_source: Optional[str] = None
