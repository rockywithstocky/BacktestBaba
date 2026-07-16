import asyncio
import logging
import os
import math
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, UploadFile, File, Form, Header, Depends, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
import pandas as pd
import io
from typing import List, Dict, Optional

from backend.logging_config import setup_logging
from backend.core.backtester import Backtester
from backend.core.data_provider import DataProvider
from backend.models.schemas import BacktestReport
from backend.config import Limits, Paths, is_render, PERSISTENCE_ENABLED, WORKER_URL, DATABASE_URL, PERSISTENCE_TIMEOUT
from backend.storage import FileHashCache, JobStorage, compute_file_hash, generate_run_id
from backend.persistence import (
    D1WorkerBackend, PostgresBackend, NullBackend, PersistenceBackend,
    UploadRecord, TradeRecord, compute_row_hash, _build_results_json,
)

setup_logging()
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    await _init_backend()
    yield
    await persistence_backend.close()


async def _init_backend():
    global persistence_backend
    if not PERSISTENCE_ENABLED:
        logger.info("Persistence disabled. Using NullBackend.")
    elif is_render():
        if WORKER_URL and WORKER_URL.startswith("https://"):
            persistence_backend = D1WorkerBackend(WORKER_URL, PERSISTENCE_TIMEOUT)
            logger.info("D1 persistence backend initialized (Worker: %s, timeout: %ss)", WORKER_URL, PERSISTENCE_TIMEOUT)
        else:
            logger.warning("is_render()=True but WORKER_URL is invalid. Falling back to NullBackend.")
    elif DATABASE_URL:
        try:
            persistence_backend = await PostgresBackend.create(DATABASE_URL)
            logger.info("PostgreSQL persistence backend initialized")
        except Exception:
            logger.exception("PostgresBackend init failed. Falling back to NullBackend.")
    else:
        logger.warning("PERSISTENCE_ENABLED=True but no backend configured. Falling back to NullBackend.")

app = FastAPI(title="Stock Screener Backtester Pro", lifespan=lifespan)

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
app.add_middleware(GZipMiddleware, minimum_size=1000)

Paths.ensure_dirs()

persistence_backend: PersistenceBackend = NullBackend()


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


@app.get("/api/prices/{symbol}")
async def get_symbol_prices(symbol: str, start: str = None, end: str = None):
    """Return daily OHLCV for a resolved symbol (e.g. 'ASIANHOTNR.NS').
    Cache-first via get_ticker_data(); yfinance fallback on miss.
    """
    candidates = [symbol]
    if not symbol.endswith(('.NS', '.BO')):
        candidates = [f"{symbol}.NS", f"{symbol}.BO"]

    for s in candidates:
        df = await asyncio.to_thread(DataProvider.get_ticker_data, s, start, end)
        if df is not None and not df.empty:
            prices = []
            for idx, row in df.iterrows():
                date_str = idx.strftime('%Y-%m-%d') if hasattr(idx, 'strftime') else str(idx)[:10]
                prices.append({
                    "date": date_str,
                    "open": round(float(row.get('Open', row.get('open', 0))), 2),
                    "high": round(float(row.get('High', row.get('high', 0))), 2),
                    "low": round(float(row.get('Low', row.get('low', 0))), 2),
                    "close": round(float(row.get('Close', row.get('close', 0))), 2),
                })
            return {"symbol": s, "prices": prices}

    return {"symbol": symbol, "prices": []}


def _clean_nan(obj):
    if isinstance(obj, float) and math.isnan(obj):
        return None
    if isinstance(obj, dict):
        return {k: _clean_nan(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_clean_nan(v) for v in obj]
    return obj


async def _persist_upload(
    file_hash: str,
    filename: str,
    entry_mode: str,
    report: BacktestReport,
    ingestion_id: str,
) -> None:
    try:
        record = UploadRecord(file_hash, filename, entry_mode, len(report.trades))
        upload_id = await persistence_backend.save_upload(record)
        if not upload_id:
            await persistence_backend.update_ingestion_status(ingestion_id, "failed")
            return

        trade_records = []
        for t in report.trades:
            trade_records.append(TradeRecord(
                row_hash=compute_row_hash(t.symbol, t.signal_date, entry_mode),
                symbol=t.symbol,
                signal_date=t.signal_date,
                entry_date=t.entry_date,
                entry_price=t.entry_price,
                entry_mode=entry_mode,
                status=t.status,
                results_json=_build_results_json(t),
            ))

        result = await persistence_backend.save_signals(upload_id, trade_records)
        status = "completed" if result else "failed"
    except Exception:
        logger.exception("Persistence failed after backtest (non-blocking)")
        status = "failed"

    try:
        await persistence_backend.update_ingestion_status(ingestion_id, status)
    except Exception:
        logger.exception("Failed to update ingestion status (non-blocking)")


async def _handle_backtest(
    data: bytes,
    entry_mode: str,
    progress_callback=None,
    filename: str = "upload",
):
    """Shared backtest logic for WS and HTTP endpoints."""
    _check_file_size(data)

    file_hash = compute_file_hash(data)

    cached = FileHashCache.get(file_hash, entry_mode)
    if cached is not None:
        logger.info("Returning cached report for file_hash=%s", file_hash[:12])
        if progress_callback is not None:
            trades = cached.get("trades", [])
            batch_size = Limits.BATCH_SIZE
            for i in range(0, len(trades), batch_size):
                batch = trades[i:i + batch_size]
                await progress_callback(
                    i, len(trades),
                    f"Loading {i + len(batch)}/{len(trades)} trades from cache...",
                    trades=batch
                )
        return BacktestReport(**cached) if progress_callback is not None else cached

    signals = parse_upload_data(data)

    ingestion_id = None
    if PERSISTENCE_ENABLED:
        try:
            ingestion_id = await persistence_backend.log_ingestion(
                file_hash=file_hash,
                filename=filename,
                original_filename=filename,
                file_size=len(data),
            )
        except Exception:
            logger.warning("Ingestion log write failed (non-blocking)")

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

    if PERSISTENCE_ENABLED and ingestion_id:
        try:
            await _persist_upload(file_hash, filename, entry_mode, report, ingestion_id)
        except Exception:
            logger.exception("Persistence failed after backtest (non-blocking)")

    return report


@app.websocket("/ws/backtest")
async def websocket_endpoint(websocket: WebSocket, entry_mode: str = "next_close"):
    await websocket.accept()
    stop_event = asyncio.Event()

    async def keepalive():
        while not stop_event.is_set():
            try:
                await asyncio.wait_for(stop_event.wait(), timeout=30)
            except asyncio.TimeoutError:
                try:
                    await websocket.send_json({"type": "ping"})
                except Exception:
                    break

    keepalive_task = asyncio.create_task(keepalive())

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
            try:
                await websocket.send_json(_clean_nan(msg))
            except Exception:
                pass

        try:
            report = await _handle_backtest(data, entry_mode, progress_callback=on_progress, filename="websocket_upload")
            report_dict = report.dict()
            report_dict.pop("trades", None)
            await websocket.send_json(_clean_nan({
                "type": "complete",
                "report": report_dict
            }))
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
    finally:
        stop_event.set()
        keepalive_task.cancel()


@app.post("/api/backtest", response_model=BacktestReport)
async def run_backtest_endpoint(file: UploadFile = File(...), entry_mode: str = Form("next_close")):
    """REST endpoint for backtest — no progress updates, returns full report."""
    try:
        contents = await file.read()
        report = await _handle_backtest(contents, entry_mode, filename=file.filename or "upload")
        return report
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("Unhandled error in REST endpoint")
        raise HTTPException(status_code=500, detail=str(e))


# ── Auth Cache ──────────────────────────────────────────────────────────────

_auth_cache: dict[str, tuple[dict, float]] = {}

async def _validate_token(token: str) -> Optional[dict]:
    now = time.time()
    if token in _auth_cache:
        user, expires_at = _auth_cache[token]
        if now < expires_at:
            return user
        del _auth_cache[token]

    if not PERSISTENCE_ENABLED:
        return None

    result = await persistence_backend.auth_validate(token)
    if result is None:
        return None

    user = result.get("user", result)
    _auth_cache[token] = (user, now + 60)
    return user


async def get_admin_user(authorization: str = Header(None)):
    if not PERSISTENCE_ENABLED:
        raise HTTPException(status_code=501, detail="Auth not configured")
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid auth header")

    token = authorization.removeprefix("Bearer ")
    user = await _validate_token(token)
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    if not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


# ── Auth Endpoints ──────────────────────────────────────────────────────────

@app.post("/api/auth/signup")
async def auth_signup(body: dict):
    if not PERSISTENCE_ENABLED:
        raise HTTPException(status_code=501, detail="Auth not configured")
    result = await persistence_backend.auth_signup(
        email=body.get("email", ""),
        password=body.get("password", ""),
        name=body.get("name", ""),
    )
    if result is None:
        raise HTTPException(status_code=502, detail="Auth service unavailable")
    return JSONResponse(content=result, status_code=result.get("_status", 201))


@app.post("/api/auth/login")
async def auth_login(body: dict):
    if not PERSISTENCE_ENABLED:
        raise HTTPException(status_code=501, detail="Auth not configured")
    result = await persistence_backend.auth_login(
        email=body.get("email", ""),
        password=body.get("password", ""),
    )
    if result is None:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return result


@app.get("/api/auth/me")
async def auth_me(authorization: str = Header(None)):
    if not PERSISTENCE_ENABLED:
        raise HTTPException(status_code=501, detail="Auth not configured")
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid auth header")

    token = authorization.removeprefix("Bearer ")
    user = await _validate_token(token)
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    return {"user": user}


# ── Quota Endpoint ─────────────────────────────────────────

@app.get("/api/quota")
async def get_quota():
    if not PERSISTENCE_ENABLED:
        raise HTTPException(status_code=501, detail="Persistence not configured")
    result = await persistence_backend.get_quota()
    if result is None:
        raise HTTPException(status_code=502, detail="Quota service unavailable")
    return result


# ── Uploads History ───────────────────────────────────────

@app.get("/api/uploads")
async def get_uploads(authorization: str = Header(None)):
    if not PERSISTENCE_ENABLED:
        raise HTTPException(status_code=501, detail="Persistence not configured")
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing auth header")

    token = authorization.removeprefix("Bearer ")
    user = await _validate_token(token)
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid or expired session")

    result = await persistence_backend.list_uploads(user_id=user["id"])
    if result is None:
        raise HTTPException(status_code=502, detail="Uploads service unavailable")
    return result


# ── Admin Endpoints ─────────────────────────────────────────────────────────

@app.get("/api/admin/users")
async def admin_list_users(admin=Depends(get_admin_user)):
    result = await persistence_backend.admin_list_users()
    if result is None:
        raise HTTPException(status_code=502, detail="Admin service unavailable")
    return result


@app.post("/api/admin/users/plan")
async def admin_set_plan(body: dict, admin=Depends(get_admin_user)):
    result = await persistence_backend.admin_set_plan(
        user_id=body.get("user_id", ""),
        plan=body.get("plan", ""),
    )
    if result is None:
        raise HTTPException(status_code=502, detail="Admin service unavailable")
    return result


@app.post("/api/admin/sessions/revoke")
async def admin_revoke_sessions(body: dict, admin=Depends(get_admin_user)):
    result = await persistence_backend.admin_revoke_sessions(
        user_id=body.get("user_id", ""),
    )
    if result is None:
        raise HTTPException(status_code=502, detail="Admin service unavailable")
    return result

