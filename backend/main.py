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
from backend.config import Limits, Paths, is_render
from backend.storage import FileHashCache, JobStorage, compute_file_hash, generate_run_id

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


def _check_file_size(data: bytes):
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


def _validate_signal_count(count: int):
    if count > Limits.MAX_SIGNALS:
        detail = (
            f"This file contains {count} signals, which exceeds the "
            f"maximum of {Limits.MAX_SIGNALS}."
        )
        if is_render():
            detail += " To process larger files, run locally via Docker."
        raise ValueError(detail)


def _normalize_and_validate(df: pd.DataFrame):
    """Validates column structure and normalizes headers in-place."""
    df.columns = [c.strip() for c in df.columns]
    col_lower = {c.lower(): c for c in df.columns}
    if 'signal_date' in col_lower and 'date' not in col_lower:
        df.rename(columns={col_lower['signal_date']: 'date'}, inplace=True)
    col_lower = {c.lower(): c for c in df.columns}
    if 'symbol' not in col_lower or 'date' not in col_lower:
        raise ValueError(
            f"File must contain 'symbol' and 'date' columns. "
            f"Found columns: [{', '.join(df.columns)}]"
        )


def parse_csv_chunked(data: bytes) -> List[Dict]:
    """Streaming CSV parser. Validates on first chunk, returns signal list."""
    signals = []
    first = True
    for chunk in pd.read_csv(io.BytesIO(data), chunksize=Limits.BATCH_SIZE):
        if first:
            _normalize_and_validate(chunk)
            first = False
        else:
            chunk.columns = [c.strip() for c in chunk.columns]
        signals.extend(chunk.to_dict(orient="records"))
    if not signals:
        raise ValueError("File contains no data rows.")
    _validate_signal_count(len(signals))
    return signals


def parse_upload_data(data: bytes) -> List[Dict]:
    """Parse uploaded file bytes into signal dicts. CSV uses chunked reading."""
    _check_file_size(data)

    is_csv = True
    try:
        return parse_csv_chunked(data)
    except (pd.errors.ParserError, UnicodeDecodeError, ValueError) as e:
        if "must contain 'symbol' and 'date'" in str(e):
            raise
        is_csv = False

    if not is_csv:
        try:
            df = pd.read_excel(io.BytesIO(data))
        except Exception:
            raise ValueError("Could not parse file. Please upload a valid CSV or Excel file.")
        if df.empty:
            raise ValueError("File contains no data rows.")
        _normalize_and_validate(df)
        _validate_signal_count(len(df))
        return df.to_dict(orient="records")

    raise ValueError("Could not parse file. Please upload a valid CSV or Excel file.")


@app.get("/")
def read_root():
    return {"message": "Stock Screener Backtester Pro API is running"}


async def _handle_backtest(
    data: bytes,
    entry_mode: str,
    progress_callback=None,
):
    """Shared backtest logic for WS and HTTP endpoints."""
    _check_file_size(data)

    file_hash = compute_file_hash(data)

    cached = FileHashCache.get(file_hash, entry_mode)
    if cached is not None:
        logger.info("Returning cached report for file_hash=%s", file_hash[:12])
        return BacktestReport(**cached) if progress_callback is not None else cached

    signals = parse_upload_data(data)

    run_id = generate_run_id(file_hash, entry_mode)
    job_store = JobStorage(run_id)
    job_store.save_metadata({
        "file_hash": file_hash,
        "entry_mode": entry_mode,
        "signal_count": len(signals),
    })

    report = await Backtester.run_backtest_async(
        signals,
        progress_callback=progress_callback,
        entry_mode=entry_mode,
        run_id=run_id,
        job_store=job_store,
    )

    report_dict = report.dict()
    FileHashCache.set(file_hash, entry_mode, report_dict)
    job_store.cleanup()

    return report


@app.websocket("/ws/backtest")
async def websocket_endpoint(websocket: WebSocket, entry_mode: str = "next_close"):
    await websocket.accept()
    try:
        data = await websocket.receive_bytes()

        async def on_progress(current, total, symbol, **kwargs):
            msg = {
                "type": "progress",
                "current": current,
                "total": total,
                "symbol": symbol
            }
            if "trades" in kwargs:
                msg = {
                    "type": "trade_batch",
                    "batch": kwargs["trades"],
                    "current": current,
                    "total": total
                }
            await websocket.send_json(msg)

        try:
            report = await _handle_backtest(data, entry_mode, progress_callback=on_progress)
            await websocket.send_json({
                "type": "complete",
                "report": report.dict()
            })
        except ValueError as e:
            await websocket.send_json({"type": "error", "message": str(e)})

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
        report = await _handle_backtest(contents, entry_mode)
        return report
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("Unhandled error in REST endpoint")
        raise HTTPException(status_code=500, detail=str(e))

