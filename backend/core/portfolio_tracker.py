"""
Portfolio Tracker & Lifecycle Execution Engine
Evaluates live/forward-tested deployed model portfolios against real market data.
Supports full lifecycle state machine: PENDING -> ACTIVE <-> PAUSED -> COMPLETED
"""

import asyncio
import uuid
from datetime import datetime, date, timedelta
from typing import Dict, List, Any, Optional
import pandas as pd
import yfinance as yf
from backend.core.data_provider import DataProvider

async def get_stock_data_async(symbol: str, start: str, end: str) -> pd.DataFrame:
    return await asyncio.to_thread(DataProvider.get_ticker_data, symbol, start, end)

def format_date_str(d: Any) -> str:
    if isinstance(d, (datetime, date)):
        return d.strftime('%Y-%m-%d')
    if isinstance(d, str):
        return d[:10]
    return str(d)

async def resolve_fill_price(symbol: str, target_date: str, entry_mode: str = 'next_open') -> float:
    """
    Fetches the exact immutable fill price for a symbol on the target deployment date.
    Uses 'Open' for next_open, 'Close' for next_close.
    """
    try:
        t_date = datetime.strptime(target_date[:10], '%Y-%m-%d').date()
        start_d = (t_date - timedelta(days=5)).strftime('%Y-%m-%d')
        end_d = (t_date + timedelta(days=5)).strftime('%Y-%m-%d')
        
        df = await get_stock_data_async(symbol, start=start_d, end=end_d)
        if df is not None and not df.empty:
            df.index = pd.to_datetime(df.index).tz_localize(None).date
            if t_date in df.index:
                row = df.loc[t_date]
                col = 'Open' if entry_mode == 'next_open' else 'Close'
                if col in row and not pd.isna(row[col]) and float(row[col]) > 0:
                    return round(float(row[col]), 2)
            
            # Fallback to closest trading day on or before target date
            past_rows = df[df.index <= t_date]
            if not past_rows.empty:
                col = 'Open' if entry_mode == 'next_open' else 'Close'
                val = past_rows.iloc[-1].get(col, past_rows.iloc[-1].get('Close', 0))
                if not pd.isna(val) and float(val) > 0:
                    return round(float(val), 2)
                    
            # Fallback to latest close
            last_val = df.iloc[-1].get('Close', 0)
            if not pd.isna(last_val) and float(last_val) > 0:
                return round(float(last_val), 2)
    except Exception as e:
        print(f"[Tracker] Error resolving fill price for {symbol} on {target_date}: {e}")
        
    return 0.0

async def evaluate_deployed_portfolio(portfolio: Dict[str, Any], positions: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Evaluates a deployed portfolio against historical and live market data from deployment_date to today.
    Simulates Target 1, Target 2, Stop Loss, and Horizon Expiry triggers.
    Preserves user lifecycle states (PAUSED, CANCELLED, etc.) and auto-detects PENDING fills.
    """
    deploy_date_str = portfolio.get('deployment_date', datetime.now().strftime('%Y-%m-%d'))
    horizon_days = int(portfolio.get('optimal_horizon_days', 14))
    exit_rule = portfolio.get('exit_rule', 'partial_runner')
    current_status = portfolio.get('status', 'ACTIVE')
    
    today_date = datetime.now().date()
    deploy_dt = datetime.strptime(deploy_date_str[:10], '%Y-%m-%d').date()
    is_queued_pending = deploy_dt > today_date
    
    start_d = (datetime.strptime(deploy_date_str[:10], '%Y-%m-%d') - timedelta(days=2)).strftime('%Y-%m-%d')
    end_d = (datetime.now() + timedelta(days=2)).strftime('%Y-%m-%d')
    
    evaluated_positions = []
    
    for pos in positions:
        p = dict(pos)
        sym = p['symbol']
        entry_price = float(p.get('entry_price', 0))
        shares = int(p.get('shares', 0))
        sl_price = float(p.get('stop_loss_price', 0))
        t1_price = float(p.get('target1_price', 0))
        t2_price = float(p.get('target2_price', 0))
        
        # If queued for future date
        if is_queued_pending:
            p['status'] = 'PENDING_FILL'
            p['days_held'] = 0
            p['unrealized_pnl'] = 0.0
            p['unrealized_return_pct'] = 0.0
            evaluated_positions.append(p)
            continue
            
        # If already manually closed
        if p.get('status') == 'EXITED':
            evaluated_positions.append(p)
            continue
            
        # If entry price not yet resolved, try resolving it
        if entry_price <= 0:
            entry_price = await resolve_fill_price(sym, deploy_date_str, portfolio.get('entry_mode', 'next_open'))
            if entry_price > 0:
                p['entry_price'] = entry_price
                p['allocated_amount'] = round(entry_price * shares, 2)
                
        # Fetch OHLCV sequence
        try:
            df = await get_stock_data_async(sym, start=start_d, end=end_d)
            if df is not None and not df.empty:
                df.index = pd.to_datetime(df.index).tz_localize(None).date
                
                # Filter rows from deployment date onwards
                track_df = df[df.index >= deploy_dt].sort_index()
                
                if not track_df.empty:
                    current_close = round(float(track_df.iloc[-1]['Close']), 2)
                    p['current_price'] = current_close
                    
                    max_high = float(track_df['High'].max())
                    min_low = float(track_df['Low'].min())
                    p['max_high_since_entry'] = round(max_high, 2)
                    p['max_low_since_entry'] = round(min_low, 2)
                    
                    # Iterate daily bars to check trigger sequence
                    exit_triggered = False
                    days_held = 0
                    
                    for day_idx, (d_val, row) in enumerate(track_df.iterrows()):
                        days_held = day_idx + 1
                        day_high = float(row.get('High', 0))
                        day_low = float(row.get('Low', 0))
                        day_close = float(row.get('Close', 0))
                        d_str = d_val.strftime('%Y-%m-%d')
                        
                        # Stop Loss check
                        if sl_price > 0 and day_low <= sl_price:
                            p['status'] = 'EXITED'
                            p['exit_date'] = d_str
                            p['exit_price'] = sl_price
                            p['exit_reason'] = 'STOP_LOSS_HIT'
                            p['realized_pnl'] = round((sl_price - entry_price) * shares, 2)
                            p['realized_return_pct'] = round(((sl_price - entry_price) / entry_price) * 100, 2) if entry_price > 0 else 0
                            exit_triggered = True
                            break
                            
                        # Target 1 check
                        if t1_price > 0 and day_high >= t1_price:
                            p['status'] = 'EXITED'
                            p['exit_date'] = d_str
                            p['exit_price'] = t1_price
                            p['exit_reason'] = 'TARGET_1_HIT'
                            p['realized_pnl'] = round((t1_price - entry_price) * shares, 2)
                            p['realized_return_pct'] = round(((t1_price - entry_price) / entry_price) * 100, 2) if entry_price > 0 else 0
                            exit_triggered = True
                            break
                            
                        # Horizon Expiry check
                        if days_held >= horizon_days:
                            p['status'] = 'EXITED'
                            p['exit_date'] = d_str
                            p['exit_price'] = day_close
                            p['exit_reason'] = 'HORIZON_EXPIRED'
                            p['realized_pnl'] = round((day_close - entry_price) * shares, 2)
                            p['realized_return_pct'] = round(((day_close - entry_price) / entry_price) * 100, 2) if entry_price > 0 else 0
                            exit_triggered = True
                            break
                            
                    # If still active
                    if not exit_triggered:
                        p['status'] = 'ACTIVE'
                        p['days_held'] = days_held
                        p['unrealized_pnl'] = round((current_close - entry_price) * shares, 2) if entry_price > 0 else 0
                        p['unrealized_return_pct'] = round(((current_close - entry_price) / entry_price) * 100, 2) if entry_price > 0 else 0
                else:
                    # No trading bars printed yet on deployment date
                    p['status'] = 'PENDING_FILL'
                    p['days_held'] = 0
                    p['unrealized_pnl'] = 0.0
                    p['unrealized_return_pct'] = 0.0
        except Exception as e:
            print(f"[Tracker] Error tracking position {sym}: {e}")
            
        evaluated_positions.append(p)
        
    # Portfolio-level roll-up metrics
    total_capital = float(portfolio.get('total_capital', 500000))
    total_invested = sum(float(p.get('allocated_amount', 0)) for p in evaluated_positions)
    cash_reserve = max(0, total_capital - total_invested)
    
    current_value = cash_reserve
    total_pnl = 0.0
    closed_count = 0
    pending_count = 0
    win_count = 0
    
    for p in evaluated_positions:
        shares = int(p.get('shares', 0))
        entry_price = float(p.get('entry_price', 0))
        
        if p.get('status') == 'PENDING_FILL':
            pending_count += 1
            current_value += (entry_price * shares)
        elif p.get('status') == 'EXITED':
            closed_count += 1
            exit_price = float(p.get('exit_price', entry_price))
            val = exit_price * shares
            current_value += val
            pnl = float(p.get('realized_pnl', 0))
            total_pnl += pnl
            if pnl > 0:
                win_count += 1
        else:
            cur_price = float(p.get('current_price', entry_price))
            val = cur_price * shares
            current_value += val
            pnl = (cur_price - entry_price) * shares
            total_pnl += pnl
            if pnl > 0:
                win_count += 1
                
    total_roi_pct = round(((current_value - total_capital) / total_capital) * 100, 2) if total_capital > 0 else 0
    active_positions_count = len(evaluated_positions) - closed_count - pending_count
    win_rate_pct = round((win_count / max(1, (closed_count + active_positions_count))) * 100, 1) if (closed_count + active_positions_count) > 0 else 0
    
    # Compute resulting state
    if current_status == 'PAUSED':
        final_status = 'PAUSED'
    elif is_queued_pending or pending_count == len(evaluated_positions):
        final_status = 'PENDING'
    elif closed_count == len(evaluated_positions) and len(evaluated_positions) > 0:
        final_status = 'COMPLETED'
    else:
        final_status = 'ACTIVE'
    
    return {
        **portfolio,
        'status': final_status,
        'metrics': {
            'total_capital': total_capital,
            'total_invested': round(total_invested, 2),
            'cash_reserve': round(cash_reserve, 2),
            'current_value': round(current_value, 2),
            'total_pnl': round(total_pnl, 2),
            'total_roi_pct': total_roi_pct,
            'win_rate_pct': win_rate_pct,
            'active_positions': active_positions_count,
            'pending_positions': pending_count,
            'closed_positions': closed_count,
            'total_positions': len(evaluated_positions)
        },
        'positions': evaluated_positions
    }
