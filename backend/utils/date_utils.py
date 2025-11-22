from datetime import datetime, timedelta
import pandas as pd

# Simple list of NSE holidays (can be expanded or fetched dynamically)
# For MVP, we will rely on data availability to determine trading days
# If data is missing for a date, we assume it's a holiday/weekend and look forward

def get_next_trading_day(date: datetime, data: pd.DataFrame, max_lookahead: int = 5) -> datetime:
    """
    Finds the next available trading day in the data starting from 'date'.
    """
    for i in range(max_lookahead + 1):
        target_date = date + timedelta(days=i)
        if target_date in data.index:
            return target_date
    return None

def parse_date(date_str: str) -> datetime:
    """
    Parses date string in various formats to datetime object.
    """
    formats = [
        "%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%m/%d/%Y", 
        "%Y/%m/%d", "%d-%b-%y", "%d-%b-%Y"
    ]
    
    for fmt in formats:
        try:
            return datetime.strptime(date_str, fmt)
        except ValueError:
            continue
            
    raise ValueError(f"Could not parse date: {date_str}")
