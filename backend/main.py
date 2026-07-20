import asyncio
import logging
import os
import math
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path

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
    # Run schema migrations for new tables (idempotent)
    try:
        if PERSISTENCE_ENABLED and not is_render() and DATABASE_URL:
            from backend.persistence import PostgresBackend
            if isinstance(persistence_backend, PostgresBackend):
                import asyncpg
                dsn = DATABASE_URL
                conn = await asyncpg.connect(dsn)
                schema_path = Path(__file__).parent / "schema.sql"
                await conn.execute(schema_path.read_text())
                await conn.close()
                logger.info("Schema migration executed (new tables created if not exist)")
    except Exception:
        logger.warning("Schema migration failed (non-blocking, tables may already exist)")
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


@app.exception_handler(Exception)
async def global_exception_handler(request, exc: Exception):
    logger.exception("Unhandled exception in %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error. Please try again later."}
    )


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
        df = await asyncio.wait_for(asyncio.to_thread(DataProvider.get_ticker_data, s, start, end), timeout=30)
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
    user_id: Optional[str] = None,
    duration: int = 90,
) -> None:
    try:
        record = UploadRecord(file_hash, filename, entry_mode, len(report.trades), user_id=user_id or "")
        upload_id = await persistence_backend.save_upload(record)
        if not upload_id:
            await persistence_backend.update_ingestion_status(ingestion_id, "failed")
            return

        if user_id and user_id != "anonymous":
            try:
                await persistence_backend.set_file_upload_map(user_id, file_hash, entry_mode, upload_id)
            except Exception:
                logger.exception("file_upload_map insert failed (non-blocking)")

        trade_records = []
        for t in report.trades:
            trade_records.append(TradeRecord(
                row_hash=compute_row_hash(t.symbol, t.signal_date, entry_mode, duration),
                symbol=t.symbol,
                signal_date=t.signal_date,
                entry_date=t.entry_date,
                entry_price=t.entry_price,
                entry_mode=entry_mode,
                status=t.status,
                results_json=_build_results_json(t),
            ))

        result = await persistence_backend.save_signals(upload_id, trade_records, user_id=user_id)
        if result:
            await persistence_backend.set_upload_status(upload_id, "completed")
        status = "completed" if result else "failed"

        # Also write to signal_results (new table) for Phase 2 L2 reads
        if result and user_id and user_id != "anonymous":
            try:
                signal_data = []
                for t in report.trades:
                    signal_data.append({
                        "id": str(uuid.uuid4()),
                        "user_id": user_id,
                        "row_hash": compute_row_hash(t.symbol, t.signal_date, entry_mode, duration),
                        "upload_id": upload_id,
                        "symbol": t.symbol,
                        "signal_date": t.signal_date,
                        "entry_date": t.entry_date,
                        "entry_price": t.entry_price,
                        "entry_mode": entry_mode,
                        "duration": duration,
                        "results_json": _build_results_json(t),
                        "max_high_90d": t.max_high_90d,
                        "max_low_90d": t.max_low_90d,
                        "sector": t.sector,
                        "market_cap": t.market_cap,
                        "status": t.status,
                        "latest_price": t.latest_price,
                        "latest_price_date": t.latest_price_date,
                    })
                await persistence_backend.batch_upsert_signals(user_id, signal_data)
            except Exception:
                logger.exception("signal_results dual-write failed (non-blocking)")

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
    user_id: Optional[str] = None,
):
    """Shared backtest logic for WS and HTTP endpoints."""
    _check_file_size(data)

    file_hash = compute_file_hash(data)

    cached = FileHashCache.get(file_hash, entry_mode)
    if cached is not None:
        logger.info("Returning cached report for file_hash=%s", file_hash[:12])

        # ── L1 freshness check: refresh latest prices if stale ──
        try:
            from backend.core.data_provider import DataProvider
            cached_latest_date = cached.get("latest_price_date")
            if progress_callback:
                await progress_callback(0, 1, "Refreshing latest prices...")
            if cached_latest_date is None or cached_latest_date < datetime.now().strftime("%Y-%m-%d"):
                logger.info("L1 cache stale — refreshing latest prices")
                all_symbols = list(set(t.get("symbol") for t in cached.get("trades", []) if t.get("status") == "Success"))
                if all_symbols:
                    fresh_prices = await asyncio.to_thread(DataProvider.get_latest_prices_batch, all_symbols)
                    latest_dates = []
                    for t in cached.get("trades", []):
                        if t.get("status") == "Success" and t.get("symbol") in fresh_prices:
                            price, date_str = fresh_prices[t["symbol"]]
                            if price is not None:
                                t["latest_price"] = price
                                t["latest_price_date"] = date_str
                                if t.get("entry_price") and t["entry_price"] > 0:
                                    t["latest_price_return"] = round(((price - t["entry_price"]) / t["entry_price"]) * 100, 2)
                                    logger.debug(
                                        "[DIAG L1] latest_price_return for %s: price=%s, entry_price=%s, return=%s",
                                        t.get("symbol"), price, t["entry_price"], t["latest_price_return"]
                                    )
                                else:
                                    logger.debug(
                                        "[DIAG L1] latest_price_return SKIPPED for %s: entry_price=%s (type=%s, truthy=%s)",
                                        t.get("symbol"), t.get("entry_price"), type(t.get("entry_price")).__name__, bool(t.get("entry_price"))
                                    )
                                latest_dates.append(date_str)
                    if latest_dates:
                        cached["latest_price_date"] = max(latest_dates)
                    cached["cache_source"] = "l1_diskcache"
                    FileHashCache.set(file_hash, entry_mode, cached)
        except Exception:
            logger.exception("L1 freshness check failed (non-blocking)")
        cached["cache_source"] = cached.get("cache_source", "l1_diskcache")

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

    # ── L2 cache check (DB) ─────────────────────────────────
    if PERSISTENCE_ENABLED and user_id and user_id != "anonymous":
        try:
            upload_data = await persistence_backend.get_upload_by_user_and_hash(user_id, file_hash, entry_mode)
            if upload_data and upload_data.get("status") == "completed":
                upload_id = upload_data["id"]
                logger.info("L2 cache HIT for file_hash=%s user=%s", file_hash[:12], user_id[:8])

                signals_data = await persistence_backend.get_signals_for_upload(upload_id)
                if signals_data:
                    # Reconstruct BacktestReport from stored signal_results
                    trades = []
                    for sd in signals_data:
                        results = {}
                        try:
                            import json
                            results = json.loads(sd.get("results_json", "{}"))
                        except (json.JSONDecodeError, TypeError):
                            pass
                        trade = {
                            "symbol": sd.get("symbol", ""),
                            "signal_date": sd.get("signal_date", ""),
                            "entry_date": sd.get("entry_date"),
                            "entry_price": sd.get("entry_price") or 0.0,
                            "entry_mode": sd.get("entry_mode", entry_mode),
                            "status": sd.get("status", "Success"),
                            "sector": sd.get("sector"),
                            "market_cap": sd.get("market_cap"),
                            "max_high_90d": sd.get("max_high_90d"),
                            "max_low_90d": sd.get("max_low_90d"),
                            "latest_price": sd.get("latest_price"),
                            "latest_price_date": str(sd.get("latest_price_date") or "")[:10] if sd.get("latest_price_date") else None,
                            "latest_price_return": None,
                        }
                        # Set horizon returns from results_json
                        for h in (7, 14, 30, 45, 60, 90):
                            ret_key = f"return_{h}d"
                            exit_key = f"exit_price_{h}d"
                            if ret_key in results:
                                trade[ret_key] = results[ret_key]
                            if exit_key in results:
                                trade[exit_key] = results[exit_key]
                        # Extract additional stored fields
                        for field in ("signal_close_price", "max_high_date", "max_low_date"):
                            if field in results:
                                trade[field] = results[field]
                        trades.append(trade)

                    # Refresh latest prices
                    from backend.core.data_provider import DataProvider
                    all_symbols = list(set(t["symbol"] for t in trades if t["status"] == "Success"))
                    if all_symbols:
                        fresh_prices = await asyncio.to_thread(DataProvider.get_latest_prices_batch, all_symbols)
                        latest_dates = []
                        for t in trades:
                            if t["status"] == "Success" and t["symbol"] in fresh_prices:
                                price, date_str = fresh_prices[t["symbol"]]
                                if price is not None:
                                    t["latest_price"] = price
                                    t["latest_price_date"] = date_str
                                    if t.get("entry_price") and t["entry_price"] > 0:
                                        t["latest_price_return"] = round(((price - t["entry_price"]) / t["entry_price"]) * 100, 2)
                                    latest_dates.append(date_str)

                    # Compute stats
                    successful_trades = [t for t in trades if t["status"] == "Success"]
                    total_signals = len(trades)
                    successful_count = len(successful_trades)
                    failed_count = total_signals - successful_count

                    # Build SignalResult objects with proper error handling
                    report_trades = []
                    for t in trades:
                        try:
                            from backend.models.schemas import SignalResult
                            report_trades.append(SignalResult(**t))
                        except Exception as e:
                            logger.warning("Trade %s failed validation in L2 reconstruction: %s", t.get("symbol", "?"), e)

                    report = BacktestReport(
                        total_signals=total_signals,
                        successful_signals=successful_count,
                        failed_signals=failed_count,
                        entry_mode=entry_mode,
                        trades=report_trades,
                        latest_price_date=max(latest_dates) if latest_dates else None,
                        cache_source="l2_db",
                        cache_stats=DataProvider.get_cache_stats(),
                    )

                    # Invalidate + rewrite L1 cache
                    FileHashCache.delete(file_hash, entry_mode)
                    FileHashCache.set(file_hash, entry_mode, report.model_dump())

                    if progress_callback is not None:
                        batch_size = Limits.BATCH_SIZE
                        for i in range(0, len(trades), batch_size):
                            batch_trades = trades[i:i + batch_size]
                            await progress_callback(
                                i, len(trades),
                                f"Loading {i + len(batch_trades)}/{len(trades)} trades from cache...",
                                trades=batch_trades
                            )

                    return report
        except Exception:
            logger.exception("L2 cache check failed (non-blocking, falling back to L3)")

    # ── L3: Full backtest computation ────────────────────────
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
            # Link ingestion to user
            if ingestion_id and user_id and user_id != "anonymous":
                try:
                    await persistence_backend.set_ingestion_user(ingestion_id, user_id)
                except Exception:
                    pass
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
        persistence_backend=persistence_backend if PERSISTENCE_ENABLED else None,
    )

    report_dict = report.model_dump()
    report.cache_source = "l3_compute"
    FileHashCache.set(file_hash, entry_mode, report_dict)
    job_store.cleanup()

    if PERSISTENCE_ENABLED and ingestion_id:
        try:
            await _persist_upload(file_hash, filename, entry_mode, report, ingestion_id, user_id=user_id)
        except Exception:
            logger.exception("Persistence failed after backtest (non-blocking)")

    return report


@app.websocket("/ws/backtest")
async def websocket_endpoint(websocket: WebSocket, entry_mode: str = "next_close"):
    await websocket.accept()
    stop_event = asyncio.Event()

    # ── Token validation ────────────────────────────────────
    user_id = "anonymous"
    token = websocket.query_params.get("token")
    if token:
        user = await _validate_token(token)
        if user is None:
            await websocket.close(code=4001, reason="Invalid or expired token")
            return
        user_id = user.get("id", "anonymous")

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
            report = await _handle_backtest(data, entry_mode, progress_callback=on_progress, filename="websocket_upload", user_id=user_id)
            report_dict = report.model_dump()

            # Build compact per-symbol latest_price map (3 fields per symbol, ~175KB for 1168 symbols)
            latest_prices = {}
            for t in report.trades:
                if t.status == "Success" and t.latest_price is not None:
                    latest_prices[t.symbol] = {
                        "latest_price": t.latest_price,
                        "latest_price_date": t.latest_price_date,
                        "latest_price_return": t.latest_price_return,
                    }

            report_dict.pop("trades", None)
            await websocket.send_json(_clean_nan({
                "type": "complete",
                "report": report_dict,
                "latest_prices": latest_prices,
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
async def run_backtest_endpoint(file: UploadFile = File(...), entry_mode: str = Form("next_close"), authorization: str = Header(None)):
    """REST endpoint for backtest — no progress updates, returns full report."""
    try:
        contents = await file.read()
        # Optional auth
        user_id = "anonymous"
        if authorization and authorization.startswith("Bearer "):
            token = authorization.removeprefix("Bearer ")
            user = await _validate_token(token)
            if user is not None:
                user_id = user.get("id", "anonymous")
        report = await _handle_backtest(contents, entry_mode, filename=file.filename or "upload", user_id=user_id)
        return report
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("Unhandled error in REST endpoint")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/backtest/sync")
async def sync_backtest_report(body: dict, authorization: str = Header(None)):
    """Receives synced backtest report from the frontend for persistence."""
    if not PERSISTENCE_ENABLED:
        return {"id": None, "synced": False}
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing auth header")
    token = authorization.removeprefix("Bearer ")
    user = await _validate_token(token)
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    local_id = body.get("localId")
    if local_id:
        logger.info("Backtest report sync received: localId=%s user=%s", local_id, user.get("id", "")[:8])
    return {"id": local_id, "synced": True}


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

