import logging
import os

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
import io
from typing import List, Dict

from backend.logging_config import setup_logging
from backend.core.backtester import Backtester
from backend.models.schemas import BacktestReport

setup_logging()
logger = logging.getLogger(__name__)

app = FastAPI(title="Stock Screener Backtester Pro")

# CORS — configure via CORS_ORIGINS env var (comma-separated), defaults to localhost + production for dev
cors_origins = os.environ.get(
    "CORS_ORIGINS",
    "http://localhost:5173,http://localhost:5174,https://chartchampion.vercel.app"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in cors_origins],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Maximum upload size: 10MB
MAX_FILE_SIZE = 10 * 1024 * 1024

def parse_upload_data(data: bytes) -> pd.DataFrame:
    """Parse uploaded file bytes into a DataFrame with validation."""
    # Size check
    if len(data) > MAX_FILE_SIZE:
        raise ValueError(f"File too large ({len(data) // (1024*1024)}MB). Maximum is 10MB.")
    
    if len(data) == 0:
        raise ValueError("File is empty.")
    
    # Try CSV first, then Excel
    df = None
    try:
        df = pd.read_csv(io.BytesIO(data))
    except (pd.errors.EmptyDataError, pd.errors.ParserError, UnicodeDecodeError):
        pass
    
    if df is None or df.empty:
        try:
            df = pd.read_excel(io.BytesIO(data))
        except Exception:
            raise ValueError("Could not parse file. Please upload a valid CSV or Excel file.")
    
    if df.empty:
        raise ValueError("File contains no data rows.")
    
    # Normalize column headers
    df.columns = [c.strip() for c in df.columns]
    
    # Validate required columns (case-insensitive)
    col_lower = {c.lower(): c for c in df.columns}
    has_symbol = 'symbol' in col_lower
    has_date = 'date' in col_lower or 'signal_date' in col_lower
    
    if not has_symbol or not has_date:
        available = ', '.join(df.columns.tolist())
        raise ValueError(
            f"File must contain 'symbol' and 'date' columns. "
            f"Found columns: [{available}]"
        )
    
    return df

@app.get("/")
def read_root():
    return {"message": "Stock Screener Backtester Pro API is running"}

@app.websocket("/ws/backtest")
async def websocket_endpoint(websocket: WebSocket, entry_mode: str = "next_close"):
    await websocket.accept()
    try:
        # Receive file content as bytes
        data = await websocket.receive_bytes()
        
        try:
            df = parse_upload_data(data)
        except ValueError as e:
            await websocket.send_json({"type": "error", "message": str(e)})
            return

        signals = df.to_dict(orient="records")
        
        # Progress callback
        async def on_progress(current, total, symbol):
            await websocket.send_json({
                "type": "progress",
                "current": current,
                "total": total,
                "symbol": symbol
            })

        # Run Backtest
        report = await Backtester.run_backtest_async(signals, on_progress, entry_mode=entry_mode)
        
        # Send final report
        await websocket.send_json({
            "type": "complete",
            "report": report.dict()
        })
        
    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected")
    except Exception:
        logger.exception("Unhandled error in WebSocket endpoint")
        try:
            await websocket.send_json({"type": "error", "message": "Internal server error"})
        except Exception:
            pass

@app.post("/api/backtest", response_model=BacktestReport)
async def run_backtest_endpoint(file: UploadFile = File(...), entry_mode: str = Form("next_close")):
    """REST endpoint for backtest — no progress updates, returns full report."""
    try:
        contents = await file.read()
        df = parse_upload_data(contents)
        signals = df.to_dict(orient="records")
        
        # Run Backtest (no progress callback for HTTP)
        report = await Backtester.run_backtest_async(signals, entry_mode=entry_mode)
        return report
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("Unhandled error in REST endpoint")
        raise HTTPException(status_code=500, detail=str(e))

