import logging
import os

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
import io

from backend.logging_config import setup_logging
from backend.core.backtester import Backtester
from backend.models.schemas import BacktestReport
from backend.config import Limits, Paths, is_render

setup_logging()
logger = logging.getLogger(__name__)

app = FastAPI(title="Stock Screener Backtester Pro")

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

Paths.ensure_dirs()

def parse_upload_data(data: bytes) -> pd.DataFrame:
    """Parse uploaded file bytes into a DataFrame with validation."""
    if len(data) > Limits.MAX_FILE_SIZE_BYTES:
        detail = (
            f"File too large ({len(data) // (1024 * 1024)}MB). "
            f"Maximum is {Limits.MAX_FILE_SIZE_MB}MB."
        )
        if is_render():
            detail += " For larger files, run locally via Docker."
        raise ValueError(detail)

    if len(data) == 0:
        raise ValueError("File is empty.")

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

    df.columns = [c.strip() for c in df.columns]

    col_lower = {c.lower(): c for c in df.columns}
    if 'signal_date' in col_lower and 'date' not in col_lower:
        df.rename(columns={col_lower['signal_date']: 'date'}, inplace=True)

    col_lower = {c.lower(): c for c in df.columns}
    has_symbol = 'symbol' in col_lower
    has_date = 'date' in col_lower

    if not has_symbol or not has_date:
        available = ', '.join(df.columns.tolist())
        raise ValueError(
            f"File must contain 'symbol' and 'date' columns. "
            f"Found columns: [{available}]"
        )

    if len(df) > Limits.MAX_SIGNALS:
        detail = (
            f"This file contains {len(df)} signals, which exceeds the "
            f"maximum of {Limits.MAX_SIGNALS}."
        )
        if is_render():
            detail += " To process larger files, run locally via Docker."
        raise ValueError(detail)

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
    except Exception as e:
        logger.exception("Unhandled error in WebSocket endpoint")
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
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

