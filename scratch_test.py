import requests
import json
import sys

file_path = r"C:\Users\DELL\Downloads\Backtest Intraday btst below 11 days trade- (5).csv"

try:
    with open(file_path, 'rb') as f:
        files = {'file': ('test.csv', f, 'text/csv')}
        # The frontend defaults to next_close, let's use that
        data = {'entry_mode': 'next_close'}
        print("Sending POST request to http://localhost:8000/api/backtest...")
        response = requests.post('http://localhost:8000/api/backtest', files=files, data=data)
        
        if response.status_code == 200:
            result = response.json()
            print(f"Success! Status Code: 200")
            print(f"Total Signals: {result.get('total_signals')}")
            print(f"Successful Signals (Data Available): {result.get('successful_signals')}")
            print(f"Win Rate (7d): {result.get('win_rate_7d')}%")
            print(f"Average Return (7d): {result.get('avg_return_7d')}%")
            print("Preview of first trade:")
            if result.get('results') and len(result['results']) > 0:
                print(json.dumps(result['results'][0], indent=2))
        else:
            print(f"Error! Status Code: {response.status_code}")
            print(response.text)
except Exception as e:
    print(f"Exception occurred: {e}")
