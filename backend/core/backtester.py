import pandas as pd
from datetime import datetime, timedelta
from typing import List, Dict
from .data_provider import DataProvider
from .symbol_resolver import SymbolResolver
from ..utils.date_utils import parse_date, get_next_trading_day
from ..models.schemas import SignalResult, BacktestReport

class Backtester:
    @staticmethod
    async def run_backtest_async(signals: List[Dict[str, str]], progress_callback=None) -> BacktestReport:
        results: List[SignalResult] = []
        total = len(signals)
        
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
                
            # 3. Fetch Data (Signal Date to +95 days to cover 90d + holidays)
            start_date = signal_date
            end_date = signal_date + timedelta(days=100) 
            
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
            
            # Calculate forward returns
            horizons = [7, 14, 30, 45, 60, 90]
            
            for h in horizons:
                target_date = entry_date + timedelta(days=h)
                exit_date = get_next_trading_day(target_date, df)
                
                if exit_date:
                    exit_price = df.loc[exit_date]["Close"]
                    ret = ((exit_price - entry_price) / entry_price) * 100
                    setattr(res, f"return_{h}d", round(ret, 2))
                    setattr(res, f"exit_price_{h}d", round(exit_price, 2))
            
            # Max High/Low in 90d
            window_end = entry_date + timedelta(days=90)
            window_df = df[entry_date:window_end]
            
            if not window_df.empty:
                res.max_high_90d = round(window_df["High"].max(), 2)
                res.max_low_90d = round(window_df["Low"].min(), 2)
                
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
            # 7d Stats
            rets_7d = [r.return_7d for r in successful if r.return_7d is not None]
            if rets_7d:
                report.avg_return_7d = round(sum(rets_7d) / len(rets_7d), 2)
                report.win_rate_7d = round((len([x for x in rets_7d if x > 0]) / len(rets_7d)) * 100, 2)
                
            # 30d Stats
            rets_30d = [r.return_30d for r in successful if r.return_30d is not None]
            if rets_30d:
                report.avg_return_30d = round(sum(rets_30d) / len(rets_30d), 2)
                report.win_rate_30d = round((len([x for x in rets_30d if x > 0]) / len(rets_30d)) * 100, 2)

            # 90d Stats
            rets_90d = [r.return_90d for r in successful if r.return_90d is not None]
            if rets_90d:
                report.avg_return_90d = round(sum(rets_90d) / len(rets_90d), 2)
                report.win_rate_90d = round((len([x for x in rets_90d if x > 0]) / len(rets_90d)) * 100, 2)
                
            # Best/Worst (based on 30d for now, or max gain)
            if rets_30d:
                report.best_performer = max(successful, key=lambda x: x.return_30d if x.return_30d is not None else -999)
                report.worst_performer = min(successful, key=lambda x: x.return_30d if x.return_30d is not None else 999)

        return report
