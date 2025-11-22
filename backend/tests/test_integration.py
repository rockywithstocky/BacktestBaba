import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..'))

from backend.core.backtester import Backtester
from datetime import datetime, timedelta

def test_real_data():
    print("Running integration test with REAL data...")
    
    # Use a date from a few months ago to ensure we have 90d of data
    signals = [
        {"symbol": "TCS", "date": "2023-01-02"}, # TCS on 2nd Jan 2023
        {"symbol": "INFY", "date": "2023-06-01"}  # INFY on 1st June 2023
    ]
    
    try:
        report = Backtester.run_backtest(signals)
        
        print(f"Total Signals: {report.total_signals}")
        print(f"Successful: {report.successful_signals}")
        print(f"Failed: {report.failed_signals}")
        
        if report.successful_signals > 0:
            print("\nSample Trade Result:")
            trade = report.trades[0]
            print(f"Symbol: {trade.symbol}")
            print(f"Entry Price: {trade.entry_price}")
            print(f"7d Return: {trade.return_7d}%")
            print(f"90d Return: {trade.return_90d}%")
            print(f"Max High 90d: {trade.max_high_90d}")
            
            if trade.entry_price > 0 and trade.return_90d is not None:
                print("\nSUCCESS: Real data fetched and returns calculated!")
            else:
                print("\nFAILURE: Data fetched but values look wrong.")
        else:
            print("\nFAILURE: No signals were processed successfully.")
            for t in report.trades:
                print(f" - {t.symbol}: {t.status}")

    except Exception as e:
        print(f"\nEXCEPTION: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_real_data()
