import asyncio
import json
import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from backend.core.backtester import Backtester

async def main():
    # We will use an old date so that even 90d forward is in the past
    signals = [
        {"symbol": "RELIANCE", "date": "2023-01-05"}, # Normal trade day
        {"symbol": "TCS", "date": "2023-01-08"},      # Weekend signal (Sunday), should shift to Jan 9
        {"symbol": "FAKE_XYZ", "date": "2023-01-05"}, # Invalid symbol
        {"symbol": "INFY", "date": "2024-05-01"}      # Recent date (might not have 90d future data yet)
    ]
    
    # Run the backtest
    report = await Backtester.run_backtest_async(signals)
    
    # Print the raw JSON payload
    print(json.dumps(report.model_dump(), indent=2))

if __name__ == "__main__":
    asyncio.run(main())
