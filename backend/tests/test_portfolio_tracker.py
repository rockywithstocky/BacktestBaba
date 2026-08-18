import pytest
import pytest_asyncio
from unittest.mock import patch, MagicMock
import pandas as pd
import numpy as np
from datetime import datetime, timedelta

from backend.core.portfolio_tracker import evaluate_deployed_portfolio, resolve_fill_price

@pytest.mark.asyncio
async def test_evaluate_deployed_portfolio_target_hit():
    portfolio = {
        "id": "p-123",
        "name": "Test Swing",
        "deployment_date": "2026-08-10",
        "optimal_horizon_days": 14,
        "entry_mode": "next_open",
        "exit_rule": "partial_runner",
        "total_capital": 500000
    }
    positions = [
        {
            "id": "pos-1",
            "symbol": "TATACHEM.NS",
            "entry_price": 1000.0,
            "shares": 50,
            "allocated_amount": 50000.0,
            "weight_pct": 10.0,
            "stop_loss_price": 950.0,
            "target1_price": 1080.0,
            "target2_price": 1150.0,
            "status": "ACTIVE"
        }
    ]
    
    # Mock data provider to return price action that hits target 1 on day 2
    dates = pd.date_range(start="2026-08-10", periods=5, freq="B")
    mock_df = pd.DataFrame({
        "Open": [1000.0, 1020.0, 1070.0, 1085.0, 1090.0],
        "High": [1015.0, 1095.0, 1080.0, 1090.0, 1100.0],  # Day 2 hits 1095 >= 1080
        "Low": [995.0, 1010.0, 1060.0, 1075.0, 1080.0],
        "Close": [1010.0, 1085.0, 1075.0, 1080.0, 1095.0]
    }, index=dates)
    
    with patch("backend.core.portfolio_tracker.get_stock_data_async", return_value=mock_df):
        evaluated = await evaluate_deployed_portfolio(portfolio, positions)
        
        assert evaluated["status"] == "COMPLETED"
        pos = evaluated["positions"][0]
        assert pos["status"] == "EXITED"
        assert pos["exit_reason"] == "TARGET_1_HIT"
        assert pos["exit_price"] == 1080.0
        assert pos["realized_pnl"] == (1080.0 - 1000.0) * 50
        assert pos["realized_return_pct"] == 8.0

@pytest.mark.asyncio
async def test_evaluate_deployed_portfolio_stop_loss_hit():
    portfolio = {
        "id": "p-124",
        "name": "Test SL",
        "deployment_date": "2026-08-10",
        "optimal_horizon_days": 14,
        "entry_mode": "next_open",
        "exit_rule": "partial_runner",
        "total_capital": 500000
    }
    positions = [
        {
            "id": "pos-2",
            "symbol": "POLYCAB.NS",
            "entry_price": 5000.0,
            "shares": 10,
            "allocated_amount": 50000.0,
            "weight_pct": 10.0,
            "stop_loss_price": 4750.0,
            "target1_price": 5500.0,
            "target2_price": 6000.0,
            "status": "ACTIVE"
        }
    ]
    
    dates = pd.date_range(start="2026-08-10", periods=4, freq="B")
    mock_df = pd.DataFrame({
        "Open": [5000.0, 4900.0, 4800.0, 4700.0],
        "High": [5050.0, 4950.0, 4850.0, 4750.0],
        "Low": [4950.0, 4700.0, 4650.0, 4600.0],  # Day 2 hits 4700 <= 4750
        "Close": [4980.0, 4720.0, 4680.0, 4650.0]
    }, index=dates)
    
    with patch("backend.core.portfolio_tracker.get_stock_data_async", return_value=mock_df):
        evaluated = await evaluate_deployed_portfolio(portfolio, positions)
        
        assert evaluated["status"] == "COMPLETED"
        pos = evaluated["positions"][0]
        assert pos["status"] == "EXITED"
        assert pos["exit_reason"] == "STOP_LOSS_HIT"
        assert pos["exit_price"] == 4750.0
        assert pos["realized_pnl"] == (4750.0 - 5000.0) * 10
        assert pos["realized_return_pct"] == -5.0
