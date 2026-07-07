# Performance & Persistence Plan — Unbounded Scale

## Why the Current Architecture Crashes

The current pipeline is **monolithic**: `Read all → Process all → Send all → Render all`.
Every stage assumes infinite memory and instant API calls.

**18 crash points identified at scale** (see pre-mortem analysis below).

## Solution: Streaming Batch Pipeline

Process signals in **batches of 500**, keeping peak memory constant regardless of file size.

```
CSV → Chunk[0:500] → Resolve → Fetch Data → Compute → Write JSONL → Stream to WS → Free
     → Chunk[500:1000] → Resolve → Fetch Data → Compute → Write JSONL → Stream to WS → Free
     → ... (n batches)
     → Merge JSONLs → Compute aggregates → Cache report → Cleanup temp files
```

### Cache Layers (for repeated testing)

| Layer | Key | TTL | Purpose |
|-------|-----|-----|---------|
| **Full report** | `file_{sha256}_{mode}` | **30 days** | Same file upload = instant re-run |
| **Symbol resolution** | `resolve_{SYMBOL}` | 7 days | Per-symbol .NS/.BO resolution |
| **Ticker data (range-aware)** | `data_range_{SYMBOL}` | 30d/24h | Historical OHLC with delta fetch |
| **Batch results** | `.jobs/{run_id}/batch_n.jsonl` | cleaned after merge | Survives mid-processing crash |

### Delta Cache Pattern

Never re-fetch data already cached. Cache by symbol with range metadata:

```python
entry = {"start": "2023-01-01", "end": "2023-06-01", "data": df}
if entry["start"] <= requested_start and entry["end"] >= requested_end:
    # FULL HIT — slice from cache
else:
    # PARTIAL HIT — fetch only the gap
```

### Key Metrics

| Scenario | Time | API Calls |
|----------|------|-----------|
| First run (5000 sig, cold) | ~15 min | Batch resolve (2) + Data (5000) |
| Re-upload same file | **<1 sec** | **0** |
| Modified file (+200 sig) | ~2 min | Resolve (2) + Data (200) |
| New file, overlapping symbols | ~1 min | Data delta only |

---

## Implementation Plan (9 Task Groups)

### Task Group 1: Config
- Create `backend/config.py` with Limits class
- BATCH_SIZE=500, MAX_CONCURRENCY=10
- Render vs Docker graceful degradation
- All TTLs (30d historical, 24h recent, 7d resolution, 30d report)

### Task Group 2: CSV Streaming + File Hash Cache
- Chunked CSV reader (`chunksize=500`)
- SHA256 file hash before processing
- File hash cache check (HIT → return instantly)
- File hash cache write (after success)

### Task Group 3: Batch Symbol Resolution
- Replace per-symbol `Ticker().history()` with `yf.download(period="1d")`
- Batch all `.NS` symbols → `yf.download(batch_size=50)`  
- Remaining → `.BO` batch
- Persist to diskcache (currently in-memory only)

### Task Group 4: Range-Aware Data Cache
- Store data with range metadata (start, end)
- Check cached range vs requested range
- Delta fetch for partial hits
- 30d TTL for historical, 24h for recent

### Task Group 5: Streaming Batch Pipeline
- Process 500 signals per batch
- Write `batch_{n}.jsonl` to `.jobs/{run_id}/`
- Single-pass aggregation (all 6 horizons + best/worst)
- Stream results via progress callback

### Task Group 6: WebSocket Streaming
- Send trade batches as they complete (not one big JSON)
- Server keepalive pings every 30s
- Final stats message (no trades list in final message)

### Task Group 7: Frontend Streaming
- `api.js`: handle streaming WS messages (type: "trade_batch")
- `BacktesterPage.jsx`: incremental report building
- `Dashboard.jsx`: progressive stats (debounced, final only)

### Task Group 8: Timeouts + Error Handling
- WS timeout: 10s → dynamic (5min for cold start)
- HTTP timeout: configurable (Render: 55s, Docker: unlimited)
- Graceful error: "File too large for hosted tier, run via Docker"
- Server keepalive pings

### Task Group 9: Verification
- Run `pytest backend/tests/ -v --asyncio-mode=auto`
- Run `python backend/tests/verify_regression.py`
- Test with 5000+ signal CSV from Data/ChartInk
- Verify all cache layers (file hash hit → instant, delta fetch works)
- Verify Render limit errors display correctly

---

## Pre-Mortem Analysis

### Assumptions & Risks

| Assumption | Risk | Mitigation |
|------------|------|------------|
| `yf.download(period="1d")` batches 50+ symbols | yfinance may fail with 50+ | Chunk into 25-ticker batches; fallback to per-symbol |
| diskcache handles 500MB+ SQLite | Render 1GB disk limit | Set `size_limit=500MB` + regular cleanup |
| WebSocket streams 500-result batches | Frontend UI jank on each batch | Debounce stats to final message only |
| 30d TTL for historical OHLC | Corporate actions (splits, dividends) adjust prices | Acceptable for backtesting; user can clear cache |
| Batch processing sequential (not parallel) | Throughput limited by batch size | Each batch internally uses Semaphore(10) for API calls |
| CSV chunks exact 500 rows | Last chunk may be smaller | Handle partial chunk (works naturally with `chunksize`) |

### Failure Scenarios

1. **Server crash mid-batch**: Batch results on disk → file hash cache MISS → on retry, per-symbol caches provide partial hits (faster than first run)
2. **yfinance outage**: All data API calls fail → all signals marked "No Data" → report shows 0 success → user sees error
3. **Rate limiting**: Adaptive backoff → slower but completes eventually → user sees progress slowing down
4. **File exceeds Render limits**: Clear error message → "Run via Docker" → no crash or hang

---

## Render vs Docker

Same codebase, different limits file:

```python
class Limits:
    BATCH_SIZE = int(os.getenv("BATCH_SIZE", "500"))
    MAX_SIGNALS = int(os.getenv("MAX_SIGNALS", "5000" if os.getenv("RENDER") else "100000"))
    MAX_FILE_SIZE_MB = int(os.getenv("MAX_FILE_SIZE_MB", "5" if os.getenv("RENDER") else "10"))
```

On Render: capped at 5000 signals, 5MB files — clear error if exceeded.
On Docker: 100k signals, 10MB files — no artificial limits.

---

## How to Run

```bash
# Local (Docker or direct)
pytest backend/tests/ -v --asyncio-mode=auto
python backend/tests/verify_regression.py

# Test with ChartInk data
python -m uvicorn backend.main:app --reload --port 8000
# Upload Data/ChartInk/*.csv via frontend

# Render deployment
# Set env: RENDER=true, MAX_SIGNALS=5000, MAX_FILE_SIZE_MB=5
```
