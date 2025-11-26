import pandas as pd
from datetime import datetime, timedelta
from typing import List, Dict
from .data_provider import DataProvider
from .symbol_resolver import SymbolResolver
from ..utils.date_utils import parse_date, get_next_trading_day
from ..models.schemas import SignalResult, BacktestReport

class Backtester:
    @staticmethod
    async def run_backtest_async(signals: List[Dict[str, str]], progress_callback=None, duration: int = 90) -> BacktestReport:
        results: List[SignalResult] = []
        total = len(signals)
        
        # Cap duration at 180 days
        duration = min(max(duration, 7), 180)
        
        for i, signal in enumerate(signals):
            # Report progress
            if progress_callback:
                await progress_callback(i + 1, total, signal.get("symbol") or "Unknown")

            raw_symbol = signal.get("symbol") or signal.get("Symbol")
            date_str = signal.get("date") or signal.get("Date")
            
            if not raw_symbol or not date_str:
                continue
                
            # 1. Resolve Symbol
            resolved_symbol = SymbolResolver.resolve(raw_symbol)
            if not resolved_symbol:
                results.append(SignalResult(
                    symbol=raw_symbol,
                    signal_date=date_str,
                    entry_price=0.0,
                    status="Symbol Not Found"
                ))
                continue
                
            # 2. Parse Date
            try:
                signal_date = parse_date(date_str)
            except ValueError:
                results.append(SignalResult(
                    symbol=resolved_symbol,
                    signal_date=date_str,
                    entry_price=0.0,
                    status="Invalid Date"
                ))
                continue
                
            # 3. Fetch Data (Signal Date to +duration + buffer days)
            start_date = signal_date
            end_date = signal_date + timedelta(days=duration + 10) 
            
            df = DataProvider.get_ticker_data(resolved_symbol, start_date.strftime("%Y-%m-%d"), end_date.strftime("%Y-%m-%d"))
            
            if df.empty:
                results.append(SignalResult(
                    symbol=resolved_symbol,
                    signal_date=date_str,
                    entry_price=0.0,
                    status="No Data"
                ))
                continue
                
            # 4. Calculate Returns
            # Ensure index is datetime
            df.index = pd.to_datetime(df.index).tz_localize(None)
            
            # Find Entry Price (Nearest trading day to signal date)
            entry_date = get_next_trading_day(signal_date, df)
            if not entry_date:
                 results.append(SignalResult(
                    symbol=resolved_symbol,
                    signal_date=date_str,
                    entry_price=0.0,
                    status="No Entry Data"
                ))
                 continue
                 
            entry_price = df.loc[entry_date]["Close"]
            
            res = SignalResult(
                symbol=resolved_symbol,
                signal_date=entry_date.strftime("%Y-%m-%d"),
                entry_price=entry_price,
                status="Success"
            )
            
            # Calculate forward returns dynamically
            # Standard horizons + custom duration if not present
            horizons = sorted(list(set([7, 30, 90, duration])))
            
            for h in horizons:
                if h > duration: continue
                
                target_date = entry_date + timedelta(days=h)
                exit_date = get_next_trading_day(target_date, df)
                
                if exit_date:
                    exit_price = df.loc[exit_date]["Close"]
                    ret = ((exit_price - entry_price) / entry_price) * 100
                    
                    # Dynamically set attributes if they exist in schema, otherwise just add to a dict if we were using one
                    # For now, we stick to the fixed schema fields but ensure 'duration' specific logic is handled
                    # The schema supports 7d, 30d, 90d. If duration is custom (e.g. 60), we might need to add it to schema or just use it for chart limits.
                    # For this iteration, we will populate standard fields and ensure data is fetched up to 'duration'.
                    
                    if h in [7, 30, 90]:
                        setattr(res, f"return_{h}d", round(ret, 2))
                        setattr(res, f"exit_price_{h}d", round(exit_price, 2))
            
            # Max High/Low in Duration
            window_end = entry_date + timedelta(days=duration)
            window_df = df[entry_date:window_end]
            
            if not window_df.empty:
                res.max_high_90d = round(window_df["High"].max(), 2) # Reusing field name for max high in period
                res.max_low_90d = round(window_df["Low"].min(), 2)   # Reusing field name for max low in period
                
                # Find dates of max high and max low
                max_high_idx = window_df["High"].idxmax()
                max_low_idx = window_df["Low"].idxmin()
                res.max_high_date = max_high_idx.strftime("%Y-%m-%d")
                res.max_low_date = max_low_idx.strftime("%Y-%m-%d")
                
            results.append(res)
            
        # 5. Aggregate Report
        successful = [r for r in results if r.status == "Success"]
        
        report = BacktestReport(
            total_signals=len(signals),
            successful_signals=len(successful),
            failed_signals=len(signals) - len(successful),
            trades=results
        )
        
        if successful:
            # Helper to calc stats
            def calc_stats(horizon):
                rets = [getattr(r, f"return_{horizon}d") for r in successful if getattr(r, f"return_{horizon}d") is not None]
                if rets:
                    avg = round(sum(rets) / len(rets), 2)
                    win_rate = round((len([x for x in rets if x > 0]) / len(rets)) * 100, 2)
                    setattr(report, f"avg_return_{horizon}d", avg)
                    setattr(report, f"win_rate_{horizon}d", win_rate)

            calc_stats(7)
            calc_stats(30)
            calc_stats(90)
                
            # Best/Worst (based on 30d for now, or max gain)
            rets_30d = [r.return_30d for r in successful if r.return_30d is not None]
            if rets_30d:
                report.best_performer = max(successful, key=lambda x: x.return_30d if x.return_30d is not None else -999)
                report.worst_performer = min(successful, key=lambda x: x.return_30d if x.return_30d is not None else 999)

        return report
