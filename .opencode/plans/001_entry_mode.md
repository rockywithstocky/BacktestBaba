# 001 — Entry Mode: Next Candle Open / Close

**Priority**: P1 (Active)
**Status**: Design Complete — Ready for Implementation
**Dependencies**: None

---

## 1. Problem Statement

### Current Behavior (Broken)

```mermaid
flowchart LR
    A["User CSV: signal_date"] --> B["parse_date()"]
    B --> C["get_next_trading_day(signal_date, df)"]
    C --> D{"signal_date in data?"}
    D -->|Yes| E["entry_date = signal_date"]
    D -->|No| F["entry_date = next trading day"]
    E --> G["entry_price = df[entry_date]['Close']"]
    F --> G
    G --> H["SignalResult.signal_date = entry_date"]
    H --> I["❌ Original signal_date LOST"]
    G --> J["❌ Always Close — no Open option"]
    E --> K["❌ Same-day entry — unrealistic for swing"]
```

Three issues:
1. **`signal_date` is overwritten** with `entry_date` in the result — user loses the original signal date
2. **Entry always uses Close price** — no option to use Open price of next candle
3. **Entry can be same-day** if `signal_date` is a trading day — unrealistic for swing trading (signal arrives at market close, cannot trade same day)

### Desired Behavior

```mermaid
flowchart LR
    A["User CSV: signal_date"] --> B["parse_date()"]
    B --> C["signal_trading_day = get_next_trading_day(signal_date, df)"]
    C --> D["signal_close_price = df[signal_trading_day]['Close']"]
    B --> E["entry_date = get_future_trading_day(signal_date, df)"]
    E --> F{"entry_date found?"}
    F -->|No| G["status = No Entry Data"]
    F -->|Yes| H{"entry_mode?"}
    H -->|"next_open"| I["entry_price = df[entry_date]['Open']"]
    H -->|"next_close"| J["entry_price = df[entry_date]['Close']"]
    I --> K["SignalResult { signal_date, signal_close_price, entry_date, entry_price, entry_mode }"]
    J --> K
    C --> K
```

Key changes:
- `signal_date` = original user date (preserved)
- `signal_close_price` = Close on nearest trading day to signal_date
- `entry_date` = always the **next** trading day (never same-day)
- `entry_price` = Open or Close of entry_date based on `entry_mode`
- `entry_mode` = tracked in the result for transparency

---

## 2. Architecture Overview

### 2.1 System Context

```mermaid
graph TB
    subgraph Frontend
        UC["UploadCard<br/>entry_mode selector"]
        BP["BacktesterPage<br/>state: entryMode"]
        API["api.js<br/>WebSocket + HTTP"]
        DASH["Dashboard<br/>trade log + charts"]
        MODAL["StockChartModal"]
    end

    subgraph Backend
        MAIN["main.py<br/>REST + WS endpoints"]
        BT["backtester.py<br/>run_backtest_async()"]
        DP["data_provider.py<br/>bulk fetch"]
        SR["symbol_resolver.py"]
        DU["date_utils.py<br/>get_future_trading_day()"]
        SCHEMA["schemas.py<br/>SignalResult"]
    end

    subgraph External
        YH["yahoo finance<br/>(yfinance)"]
    end

    UC -->|"entryMode prop"| BP
    BP -->|"entryMode param"| API
    API -->|"ws://host/ws?entry_mode="| MAIN
    API -->|"POST /api/backtest<br/>FormData: entry_mode"| MAIN
    MAIN -->|"entry_mode="| BT
    BT -->|"get_future_trading_day()"| DU
    BT -->|"bulk_df | fallback"| DP
    BT -->|"SignalResult { entry_mode }"| SCHEMA
    DP --> YH
    MAIN -->|"JSON response<br/>BacktestReport"| API
    API -->|"report"| BP
    BP -->|"report prop"| DASH
    BP -->|"report prop"| MODAL
    DASH -->|"entry_date fallback"| MODAL
```

### 2.2 Component Tree — Frontend

```mermaid
graph TB
    APP["App.jsx"]
    APP --> BT_PAGE["BacktesterPage<br/>entryMode state"]
    
    subgraph "BacktesterPage View"
        direction TB
        BT_PAGE --> UC["UploadCard<br/>props: entryMode, onEntryModeChange"]
        BT_PAGE --> DASH["Dashboard<br/>reads: trade.entry_date"]
        BT_PAGE --> ERR["Error display"]
    end
    
    subgraph "UploadCard Internal"
        UC --> DZ["DropZone"]
        UC --> EMS["EntryModeSelector<br/>segmented control"]
        EMS --> O["Next Open button"]
        EMS --> C["Next Close button"]
        UC --> SB["Run Backtest button"]
        UC --> PB["ProgressBar"]
    end
    
    subgraph "Dashboard Internal"
        DASH --> TL["TradeLogTable"]
        TL --> COL_SYM["Symbol"]
        TL --> COL_SIG["Signal Date"]
        TL --> COL_SC["Signal Close 🆕"]
        TL --> COL_ED["Entry Date 🆕"]
        TL --> COL_EP["Entry Price"]
        TL --> COL_MD["Mode 🆕"]
        TL --> COL_RET["Returns (dynamic)"]
        
        DASH --> ST["StatsTable"]
        DASH --> HPC["HoldingPeriodChart"]
        DASH --> SECTOR["SectorEdgeChart"]
        DASH --> MODAL["StockChartModal"]
    end
```

---

## 3. Data Flow & Sequence

### 3.1 Full Backtest Sequence

```mermaid
sequenceDiagram
    participant User
    participant UC as UploadCard
    participant BP as BacktesterPage
    participant API as api.js
    participant WS as WebSocket
    participant BT as backtester.py
    participant DU as date_utils.py
    participant YH as yfinance
    participant DB as Dashboard

    User->>UC: Select file
    User->>UC: Click "Next Open"
    UC->>BP: onEntryModeChange("next_open")
    User->>UC: Click "Run Backtest"
    UC->>BP: onUpload(file)
    BP->>API: runBacktestWS(file, "next_open")
    
    Note over API,WS: WebSocket URL: ws://host/ws/backtest?entry_mode=next_open
    
    API->>WS: connect
    WS->>API: accept
    API->>WS: send file bytes
    
    WS->>WS: parse_upload_data()
    WS->>BT: run_backtest_async(signals, entry_mode="next_open")
    
    Note over BT: Phase A: Resolution
    
    loop Each signal
        BT->>BT: resolve symbol, parse date
        BT->>DU: get_next_trading_day(signal_date, df)
        DU-->>BT: signal_trading_day
        Note right of BT: Used for signal_close_price
    end
    
    Note over BT: Phase B: Bulk Fetch
    BT->>YH: yf.download(tickers, start, end)
    YH-->>BT: MultiIndex DataFrame
    
    Note over BT: Phase C: Computation
    
    loop Each valid signal
        BT->>DU: get_next_trading_day(signal_date, df)
        DU-->>BT: signal_trading_day
        BT->>BT: signal_close_price = df[signal_trading_day]["Close"]
        
        BT->>DU: get_future_trading_day(signal_date, df)
        DU-->>BT: entry_date or None
        
        alt entry_date is None
            BT->>BT: status = "No Entry Data"
            Note right of BT: Recent signal, market not open yet
        else entry_date found
            alt entry_mode == "next_open"
                BT->>BT: entry_price = df[entry_date]["Open"]
            else entry_mode == "next_close"
                BT->>BT: entry_price = df[entry_date]["Close"]
            end
            
            Note over BT: Compute forward returns
            loop Each horizon (7,14,30,45,60,90)
                BT->>BT: exit_price = df[exit_date]["Close"]
                BT->>BT: ret% = (exit - entry) / entry * 100
            end
            
            Note over BT: Compute max high/low in duration window
            BT->>BT: window_df = df[entry_date : entry_date + duration]
        end
        
        BT->>BT: Build SignalResult { signal_date, signal_close_price, entry_date, entry_price, entry_mode }
    end
    
    BT->>BT: Aggregate BacktestReport
    BT-->>WS: report JSON
    
    WS->>API: {"type": "complete", "report": {...}}
    API->>BP: onComplete(report)
    BP->>DB: render Dashboard(report)
    
    Note over DB: Dashboard renders trade log with:<br/>Signal Date, Signal Close,<br/>Entry Date, Entry Price, Mode
```

### 3.2 Entry Price Decision Tree

```mermaid
flowchart TD
    A["signal_date from CSV"] --> B["get_next_trading_day(signal_date, df)"]
    B --> C["signal_trading_day<br/>(nearest trading day to signal_date)"]
    C --> D["signal_close_price = df[signal_trading_day]['Close']"]
    
    A --> E["get_future_trading_day(signal_date, df)<br/>(starts search from date+1)"]
    E --> F{"entry_date found?"}
    
    F -->|"No (no future data)"| G["entry_price = 0.0<br/>status = 'No Entry Data'"]
    F -->|"Yes"| H{entry_mode}
    
    H -->|"next_open"| I["entry_price = df[entry_date]['Open']"]
    H -->|"next_close (default)"| J["entry_price = df[entry_date]['Close']"]
    
    I --> K["forward_returns = calc(entry_date, entry_price)"]
    J --> K
    G --> L["Trade marked as failed"]
    K --> M["Trade successful"]
```

### 3.3 Date Lookup Comparison

```mermaid
timeline
    title Signal Date = Monday (Trading Day)
    
    section Current Behavior
        get_next_trading_day : Returns Monday
        entry_date : Monday
        entry_price : Monday Close
        signal_date : Monday (overwritten)
    
    section New Behavior (next_close)
        get_next_trading_day : Returns Monday
        signal_close_price : Monday Close ✅
        get_future_trading_day : Returns Tuesday
        entry_date : Tuesday
        entry_price : Tuesday Close
        signal_date : Monday (preserved) ✅
    
    section New Behavior (next_open)
        get_next_trading_day : Returns Monday
        signal_close_price : Monday Close ✅
        get_future_trading_day : Returns Tuesday
        entry_date : Tuesday
        entry_price : Tuesday Open
        signal_date : Monday (preserved) ✅
```

```mermaid
timeline
    title Signal Date = Saturday (Weekend / Holiday)
    
    section Current Behavior
        get_next_trading_day : Returns Monday
        entry_date : Monday
        entry_price : Monday Close
        signal_date : Monday (overwritten)
    
    section New Behavior (next_close)
        get_next_trading_day : Returns Monday
        signal_close_price : Monday Close ✅
        get_future_trading_day : Returns Tuesday
        entry_date : Tuesday
        entry_price : Tuesday Close
        signal_date : Saturday (preserved) ✅
        Note: signal_close_price = entry_price(prev) to allow gap comparison
```

---

## 4. Specification

### 4.1 Schema Changes (`backend/models/schemas.py`)

```mermaid
classDiagram
    class SignalResult_Old {
        +str symbol
        +str signal_date
        +float entry_price
        +float return_7d
        +float exit_price_7d
        +... horizon fields
        +float max_high_90d
        +str max_high_date
        +float max_low_90d
        +str max_low_date
        +str sector
        +str market_cap
        +str status
        ~~
        -signal_date overwritten
        -no entry_date
        -no entry_mode
        -no signal_close_price
    }
    
    class SignalResult_New {
        +str symbol
        +str signal_date          ← preserved original
        +Optional~float~ signal_close_price  ← NEW
        +Optional~str~ entry_date            ← NEW
        +float entry_price
        +str entry_mode           ← NEW: "next_open"|"next_close"
        +float return_7d
        +float exit_price_7d
        +... horizon fields (unchanged)
        +float max_high_90d
        +str max_high_date
        +float max_low_90d
        +str max_low_date
        +str sector
        +str market_cap
        +str status
    }
    
    class BacktestReport_Old {
        +int total_signals
        +int successful_signals
        +int failed_signals
        +float avg_return_7d
        +... stat fields
        +List~SignalResult~ trades
        ~~
        -no entry_mode at report level
    }
    
    class BacktestReport_New {
        +int total_signals
        +int successful_signals
        +int failed_signals
        +str entry_mode           ← NEW: report-level metadata
        +float avg_return_7d
        +... stat fields (unchanged)
        +List~SignalResult~ trades
    }
    
    SignalResult_Old --|> SignalResult_New : migrate
    BacktestReport_Old --|> BacktestReport_New : migrate
```

**Exact field additions**:

```python
# SignalResult — add these fields (order matters for Pydantic)
signal_close_price: Optional[float] = None   # Close on/nearest to signal_date
entry_date: Optional[str] = None             # Actual trading day used for entry
entry_mode: str = "next_close"               # "next_open" | "next_close"

# BacktestReport — add this field
entry_mode: str = "next_close"               # Report-level metadata
```

**Why `Optional` for `entry_date` and `signal_close_price`**?
- Failed trades (status != "Success") won't have these — `entry_price=0.0` and no entry
- Old saved reports won't have these fields — frontend must handle `None` gracefully

### 4.2 Date Utils (`backend/utils/date_utils.py`)

**New function**:

```python
def get_future_trading_day(date: datetime, data: pd.DataFrame, max_lookahead: int = 5) -> datetime | None:
    """
    Finds the NEXT trading day AFTER 'date'.
    Unlike get_next_trading_day, this ALWAYS skips the current date.
    Used to ensure entry is always the next candle (never same-day).
    
    | Input Date    | get_next_trading_day  | get_future_trading_day  |
    |---------------|----------------------|------------------------|
    | Mon (trading) | Mon ✅               | Tue ✅                  |
    | Sat (holiday) | Mon                   | Tue                     |
    | Recent (no    | signal_date (last    | None ❌ (no data)       |
    |   future data)|  available day)      |                         |
    """
    for i in range(1, max_lookahead + 1):
        target_date = date + timedelta(days=i)
        if target_date in data.index:
            return target_date
    return None
```

**Behavior matrix**:

```mermaid
flowchart LR
    subgraph get_next_trading_day
        A["date=Monday<br/>data has Mon..Fri"] --> A1["returns Monday"]
        B["date=Saturday<br/>data has Mon..Fri"] --> B1["returns Monday"]
        C["date=Friday<br/>data has Mon..Fri"] --> C1["returns Friday"]
    end
    
    subgraph get_future_trading_day
        D["date=Monday<br/>data has Mon..Fri"] --> D1["returns Tuesday"]
        E["date=Saturday<br/>data has Mon..Fri"] --> E1["returns Monday"]
        F["date=Friday<br/>data has Mon..Fri"] --> F1["returns Monday(next week)"]
        G["date=Friday<br/>data ends at Friday"] --> G1["returns None"]
    end
```

### 4.3 Backtester Logic (`backend/core/backtester.py`)

```mermaid
flowchart TD
    subgraph Parameters
        P1["signals: List[Dict]"]
        P2["entry_mode: str = 'next_close'"]
        P3["duration: int = 90"]
        P4["progress_callback"]
    end

    P1 --> PHASE_A["Phase A: Resolution"]
    P2 --> PHASE_C
    
    PHASE_A --> PHASE_B["Phase B: Bulk Fetch"]
    PHASE_B --> PHASE_C
    
    subgraph PHASE_C ["Phase C: Per-Signal Computation"]
        direction TB
        
        V{"p_sig['status'] == 'Valid'?"}
        V -->|No| FAILED["Create SignalResult<br/>entry_price=0.0<br/>status=p_sig['status']"]
        
        V -->|Yes| NORM["Normalize df index<br/>pd.to_datetime().tz_localize(None)"]
        
        NORM --> SC["signal_trading_day =<br/>get_next_trading_day(signal_date, df)"]
        SC --> SC2{"found?"}
        SC2 -->|No| SC_NONE["signal_close_price = None"]
        SC2 -->|Yes| SC_VAL["signal_close_price =<br/>df[signal_trading_day]['Close']"]
        
        NORM --> ED["entry_date =<br/>get_future_trading_day(signal_date, df)"]
        ED --> ED_CHECK{"found?"}
        ED_CHECK -->|No| NO_ENTRY["SignalResult<br/>entry_price=0.0<br/>status='No Entry Data'"]
        ED_CHECK -->|Yes| EP{"entry_mode?"}
        
        EP -->|"next_open"| EP_O["entry_price =<br/>df[entry_date]['Open']"]
        EP -->|"next_close"| EP_C["entry_price =<br/>df[entry_date]['Close']"]
        
        EP_O --> BUILD
        EP_C --> BUILD
        
        subgraph BUILD ["Build SignalResult"]
            BR1["signal_date = date_str (original)"]
            BR2["signal_close_price = signal_close_price"]
            BR3["entry_date = entry_date.strftime()"]
            BR4["entry_price = entry_price"]
            BR5["entry_mode = entry_mode"]
            BR6["status = 'Success'"]
        end
        
        BUILD --> RETURNS["Forward Returns Loop"]
        
        subgraph RETURNS ["Forward Returns"]
            HORIZONS["horizons = [7,14,30,45,60,90,duration]"]
            HORIZONS --> LOOP{"for h in horizons:"}
            LOOP --> H_CHECK{"h <= duration?"}
            H_CHECK -->|No| SKIP["skip"]
            H_CHECK -->|Yes| TD["target_date =<br/>entry_date + timedelta(days=h)"]
            TD --> EXIT_D["exit_date =<br/>get_next_trading_day(target_date, df)"]
            EXIT_D --> EXIT_CHECK{"found?"}
            EXIT_CHECK -->|No| EXIT_SKIP["skip horizon"]
            EXIT_CHECK -->|Yes| EXIT_P["exit_price =<br/>df[exit_date]['Close']"]
            EXIT_P --> RET["ret% = (exit - entry) / entry * 100"]
            RET --> ATTR["setattr(res, return_{h}d, ret)<br/>setattr(res, exit_price_{h}d, exit_price)"]
            ATTR --> LOOP
        end
        
        RETURNS --> MAX_HL["Max High/Low Window"]
        
        subgraph MAX_HL ["Max High/Low"]
            W_END["window_end =<br/>entry_date + timedelta(days=duration)"]
            W_DF["window_df = df[entry_date:window_end]"]
            W_DF --> W_CHECK{"empty?"}
            W_CHECK -->|No| W_VALS["max_high = window_df['High'].max()<br/>max_low = window_df['Low'].min()"]
        end
    end
    
    PHASE_C --> AGG["Aggregate Report"]
    AGG --> DONE["Return BacktestReport"]
```

**Key code changes** — current lines 173-197 become:

```python
# Line ~173: df.index already normalized from earlier

# --- Signal Close Price (nearest trading day to signal_date) ---
signal_trading_day = get_next_trading_day(signal_date, df)
signal_close_price = (df.loc[signal_trading_day]["Close"]
                      if signal_trading_day is not None
                      else None)

# --- Entry Date (always NEXT trading day) ---
entry_date = get_future_trading_day(signal_date, df)
if not entry_date:
    results.append(SignalResult(
        symbol=resolved_symbol,
        signal_date=date_str,                    # ← original date preserved
        signal_close_price=signal_close_price,
        entry_price=0.0,
        entry_mode=entry_mode,
        status="No Entry Data"
    ))
    continue

# --- Entry Price (mode-dependent) ---
if entry_mode == "next_open":
    entry_price = df.loc[entry_date]["Open"]
else:  # "next_close" (default)
    entry_price = df.loc[entry_date]["Close"]

# --- Build result ---
res = SignalResult(
    symbol=resolved_symbol,
    signal_date=date_str,                        # ← original date, NOT overwritten
    signal_close_price=round(signal_close_price, 2) if signal_close_price else None,
    entry_date=entry_date.strftime("%Y-%m-%d"),
    entry_price=round(entry_price, 2),
    entry_mode=entry_mode,
    sector=metadata_map.get(resolved_symbol, {}).get("sector"),
    market_cap=...,
    status="Success"
)
```

### 4.4 API Changes (`backend/main.py`)

```mermaid
flowchart LR
    subgraph REST ["POST /api/backtest"]
        direction LR
        REST_REQ["multipart/form-data<br/>- file: UploadFile<br/>- entry_mode: str = 'next_close'"]
        REST_REQ --> REST_HANDLER["run_backtest_endpoint()"]
        REST_HANDLER --> REST_BT["Backtester.run_backtest_async(<br/>signals, entry_mode=entry_mode)"]
        REST_BT --> REST_RES["BacktestReport (JSON)"]
    end
    
    subgraph WS ["WebSocket /ws/backtest"]
        direction LR
        WS_REQ["ws://host/ws/backtest?entry_mode=next_open"]
        WS_REQ --> WS_HANDLER["websocket_endpoint(<br/>entry_mode='next_open')"]
        WS_HANDLER --> WS_BT["Backtester.run_backtest_async(<br/>signals, on_progress, entry_mode=entry_mode)"]
        WS_BT --> WS_RES["JSON messages: progress + complete"]
    end
```

**REST endpoint**:
```python
@app.post("/api/backtest", response_model=BacktestReport)
async def run_backtest_endpoint(
    file: UploadFile = File(...),
    entry_mode: str = Form("next_close")        # ← NEW
):
    contents = await file.read()
    df = parse_upload_data(contents)
    signals = df.to_dict(orient="records")
    report = await Backtester.run_backtest_async(signals, entry_mode=entry_mode)
    return report
```

**WebSocket endpoint**:
```python
@app.websocket("/ws/backtest")
async def websocket_endpoint(
    websocket: WebSocket,
    entry_mode: str = "next_close"              # ← NEW (from query string)
):
    await websocket.accept()
    data = await websocket.receive_bytes()
    df = parse_upload_data(data)
    signals = df.to_dict(orient="records")

    async def on_progress(current, total, symbol):
        await websocket.send_json({"type": "progress", "current": current, "total": total, "symbol": symbol})

    report = await Backtester.run_backtest_async(signals, on_progress, entry_mode=entry_mode)
    await websocket.send_json({"type": "complete", "report": report.dict()})
```

### 4.5 Frontend API (`frontend/src/services/api.js`)

```mermaid
flowchart TD
    subgraph runBacktestWS ["runBacktestWS(file, onProgress, onComplete, onError, entryMode)"]
        direction TB
        WS_URL[("WS_URL + '/backtest?entry_mode=' + entryMode")]
        WS_URL --> WS_CONNECT["new WebSocket(wsUrl)"]
        WS_CONNECT --> WS_SEND["ws.send(file bytes)"]
        WS_SEND --> WS_WAIT["wait for messages"]
        WS_WAIT --> WS_PROG["onProgress(data)"]
        WS_WAIT --> WS_DONE["onComplete(data.report)"]
        WS_WAIT --> WS_ERR["onError(data.message)"]
    end
    
    subgraph runBacktestHTTPFallback ["runBacktestHTTPFallback(file, ...)"]
        direction TB
        FORM["FormData()<br/>append 'file'<br/>append 'entry_mode'"]
        FORM --> POST["axios.post(API_URL + '/backtest', formData)"]
        POST --> POST_DONE["onComplete(response.data)"]
        POST --> POST_ERR["onError(error)"]
    end

    WS_TIMEOUT["10s timeout"] -->|"no response"| runBacktestHTTPFallback
    WS_ERROR["ws.onerror"] --> runBacktestHTTPFallback
```

### 4.6 UploadCard — Entry Mode Selector

```mermaid
stateDiagram-v2
    [*] --> Idle
    
    Idle --> FileSelected: user drops/picks file
    FileSelected --> ModeSelected: user clicks mode
    FileSelected --> Running: user clicks Run Backtest
    
    ModeSelected --> FileSelected: user changes file
    ModeSelected --> Running: user clicks Run Backtest
    
    Running --> Processing: Backend starts
    Processing --> Complete: report received
    Processing --> Error: error received
    
    Complete --> Idle: user clicks Back
    Error --> Idle: user dismisses
```

**Component structure in `UploadCard.jsx`**:

```jsx
const UploadCard = ({ onUpload, isLoading, progress, entryMode, onEntryModeChange }) => {
    // state: file, dragActive

    const handleSubmit = () => { if (file) onUpload(file); };

    return (
        <div className="upload-card">
            {/* Drop zone — unchanged */}
            <div className="drop-zone" onDragEnter.. onDrop..>
                <input type="file" /> <label>...</label>
            </div>

            {/* ENTRY MODE SELECTOR — NEW */}
            <div className="entry-mode-selector">
                <span className="entry-mode-label">Entry Mode:</span>
                <div className="entry-mode-toggle">
                    <button
                        className={`mode-btn ${entryMode === 'next_open' ? 'active' : ''}`}
                        onClick={() => onEntryModeChange('next_open')}
                        disabled={isLoading}
                    >
                        Next Open
                    </button>
                    <button
                        className={`mode-btn ${entryMode === 'next_close' ? 'active' : ''}`}
                        onClick={() => onEntryModeChange('next_close')}
                        disabled={isLoading}
                    >
                        Next Close
                    </button>
                </div>
            </div>

            {/* Submit button — unchanged */}
            {file && !isLoading && <button onClick={handleSubmit}>Run Backtest</button>}

            {/* Progress bar — unchanged */}
            <AnimatePresence>...</AnimatePresence>
        </div>
    );
};
```

### 4.7 Dashboard — Trade Log Changes

```mermaid
flowchart LR
    subgraph BEFORE ["Current Trade Log Columns"]
        C1["Symbol"]
        C2["Date<br/>(was entry_date)"]
        C3["Entry"]
        C4["1W Return"]
        C5["1M Return"]
        C6["3M Return"]
        C7["Max High"]
        C8["Max Low"]
        
        C1 --- C2 --- C3 --- C4 --- C5 --- C6 --- C7 --- C8
        style C2 fill:#ffcccc,stroke:#ff0000
        note right of C2 "Misleading label<br/>signal_date = entry_date"
    end
    
    subgraph AFTER ["Proposed Trade Log Columns"]
        D1["Symbol"]
        D2["Signal Date"]
        D3["Signal Close 🆕"]
        D4["Entry Date 🆕"]
        D5["Entry Price"]
        D6["Mode 🆕"]
        D7["1W Return"]
        D8["1M Return"]
        D9["3M Return"]
        D10["Max High"]
        D11["Max Low"]
        
        D1 --- D2 --- D3 --- D4 --- D5 --- D6 --- D7 --- D8 --- D9 --- D10 --- D11
        
        style D2 fill:#d4f5d4,stroke:#00aa00
        note right of D2 "Original signal date<br/>Preserved, never overwritten"
        style D3 fill:#d4f5d4,stroke:#00aa00
        note right of D3 "Close on signal_date<br/>Shows trigger price"
        style D4 fill:#d4f5d4,stroke:#00aa00
        note right of D4 "Actual trade date<br/>Always next candle"
        style D6 fill:#d4f5d4,stroke:#00aa00
        note right of D6 "Open / Close badge"
    end
```

**Backward compatibility fallback pattern**:

```javascript
// In Dashboard.jsx — trade rendering
const renderTradeRow = (trade, idx) => {
    // Handle old reports (no entry_date, signal_close_price)
    const signalDate = trade.signal_date || '-';
    const signalClose = trade.signal_close_price ?? null;
    const entryDate = trade.entry_date || trade.signal_date;    // ← fallback
    const entryPrice = trade.entry_price;
    const entryMode = trade.entry_mode || 'next_close';          // ← fallback

    return (
        <tr key={idx}>
            <td className="symbol-cell">{trade.symbol}</td>
            <td>{signalDate}</td>
            <td>{signalClose ? formatCurrency(signalClose) : '-'}</td>
            <td>{entryDate}</td>
            <td>{formatCurrency(entryPrice)}</td>
            <td><span className="mode-badge">{entryMode === 'next_open' ? 'Open' : 'Close'}</span></td>
            <td ...>...</td>
            {/* ... rest of the columns */}
        </tr>
    );
};
```

**`getExitDate` fix** — must use `entry_date` for accurate exit calculation:

```javascript
// Before (Line 165-170)
const getExitDate = (entryDate, period) => {
    const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
    const date = new Date(entryDate);       // ← was trade.signal_date
    date.setDate(date.getDate() + days);
    return date.toLocaleDateString('en-IN');
};

// After
const getExitDate = (trade, period) => {    // ← now takes trade object
    const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
    const date = new Date(trade.entry_date || trade.signal_date);  // ← uses entry_date
    date.setDate(date.getDate() + days);
    return date.toLocaleDateString('en-IN');
};
```

**`getTooltipContent` fix**:

```javascript
// Before (Line 178-184)
const getTooltipContent = (trade, period) => {
    const exitPriceKey = `exit_price_${period}`;
    const exitDate = getExitDate(trade.signal_date, period);   // ← was passing string
    const exitPrice = trade[exitPriceKey];
    return `📅 Exit Date: ${exitDate}\n💰 Exit Price: ${formatCurrency(exitPrice)}`;
};

// After
const getTooltipContent = (trade, period) => {
    const exitPriceKey = `exit_price_${period}`;
    const exitDate = getExitDate(trade, period);                // ← now passes trade object
    const exitPrice = trade[exitPriceKey];
    return `Exit Date: ${exitDate}\nExit Price: ${formatCurrency(exitPrice)}`;
};
```

**`handleSort` update** — fix signal_date sorting (was working, still works):

```javascript
// Line 141-144 — no change needed, signal_date is still a string date
if (sortConfig.key === 'signal_date') {
    aVal = new Date(aVal).getTime();
    bVal = new Date(bVal).getTime();
}

// Potentially add entry_date sorting
if (sortConfig.key === 'entry_date') {
    aVal = new Date(aVal).getTime();
    bVal = new Date(bVal).getTime();
}
```

**`handleCellClick` update** — passes trade to StockChartModal (unchanged):

```javascript
// Line 172-175 — no change, StockChartModal only needs trade object
const handleCellClick = (trade, period) => {
    setSelectedStock(trade);
    setSelectedPeriod(period);
};
```

### 4.8 StockChartModal Changes

```mermaid
flowchart TD
    subgraph CURRENT ["Current — uses signal_date"]
        M1["chartData entry point<br/>date: stock.signal_date"]
        M2["getExitDate(stock.signal_date, days)"]
        M3["Footer: Entry: {stock.signal_date}"]
        
        style M1 fill:#ffcccc
        style M2 fill:#ffcccc
        style M3 fill:#ffcccc
    end
    
    subgraph NEW ["Proposed — uses entry_date with fallback"]
        N1["chartData entry point<br/>date: stock.entry_date || stock.signal_date"]
        N2["getExitDate(stock, days) → uses entry_date"]
        N3["Footer: Entry: {stock.entry_date || stock.signal_date}"]
        
        style N1 fill:#d4f5d4
        style N2 fill:#d4f5d4
        style N3 fill:#d4f5d4
    end
```

**Line-by-line changes in `StockChartModal.jsx`**:

| Line | Current Code | New Code |
|---|---|---|
| 27 | `const exitDate = getExitDate(stock.signal_date, periodDays);` | `const entryDate = stock.entry_date \|\| stock.signal_date; const exitDate = getExitDate(entryDate, periodDays);` |
| 34 | `date: stock.signal_date,` | `date: stock.entry_date \|\| stock.signal_date,` |
| 134 | `<span className="modal-stat-date">{stock.signal_date}</span>` | `<span className="modal-stat-date">{stock.entry_date \|\| stock.signal_date}</span>` |
| 234 | `<strong>Entry:</strong> {stock.signal_date}` | `<strong>Entry:</strong> {stock.entry_date \|\| stock.signal_date} \| <strong>Signal:</strong> {stock.signal_date}` |

---

## 5. Regression & Impact Analysis

### 5.1 Before/After Result Comparison

```mermaid
flowchart TD
    subgraph SAME_DAY ["Signal: Monday (trading day)"]
        CURRENT_SD["Current:<br/>entry_date = Monday<br/>entry_price = Mon Close<br/>signal_date = Monday"]
        NEW_CLOSE_SD["New next_close:<br/>signal_date = Monday (orig)<br/>signal_close_price = Mon Close<br/>entry_date = Tuesday<br/>entry_price = Tue Close"]
        NEW_OPEN_SD["New next_open:<br/>signal_date = Monday (orig)<br/>signal_close_price = Mon Close<br/>entry_date = Tuesday<br/>entry_price = Tue Open"]
        
        CURRENT_SD -.->|"⚠ Different entry_price"| NEW_CLOSE_SD
        CURRENT_SD -.->|"⚠ Different entry_price"| NEW_OPEN_SD
    end
    
    subgraph WEEKEND ["Signal: Saturday (holiday)"]
        CURR_WK["Current:<br/>entry_date = Monday<br/>entry_price = Mon Close<br/>signal_date = Monday"]
        NEW_CLOSE_WK["New next_close:<br/>signal_date = Saturday (orig)<br/>signal_close_price = Mon Close<br/>entry_date = Tuesday<br/>entry_price = Tue Close"]
        NEW_OPEN_WK["New next_open:<br/>signal_date = Saturday (orig)<br/>signal_close_price = Mon Close<br/>entry_date = Tuesday<br/>entry_price = Tue Open"]
        
        CURR_WK -.->|"⚠ Different entry_price"| NEW_CLOSE_WK
        CURR_WK -.->|"⚠ Different entry_price"| NEW_OPEN_WK
    end
    
    note["All results change when signal_date is a trading day.<br/>This is intentional — same-day entry was unrealistic."]
```

### 5.2 Regression Impact Matrix

| Scenario | Current | After (next_close) | After (next_open) | Breakage |
|---|---|---|---|---|
| Mon signal, Mon data | entry=Mon, price=Mon Close | signal_date=Mon, signal_close=Mon Close, entry=Tue, price=Tue Close | signal_date=Mon, signal_close=Mon Close, entry=Tue, price=Tue Open | **Yes** — entry_price changes |
| Sat signal, Mon data | entry=Mon, price=Mon Close | signal_date=Sat, signal_close=Mon Close, entry=Tue, price=Tue Close | signal_date=Sat, signal_close=Mon Close, entry=Tue, price=Tue Open | **Yes** — entry_price changes |
| All historical | Stable but shifted | +1d entry for same-day signals | +1d + Open price | Re-run required |
| Old report JSON loaded | N/A | Missing entry_date, signal_close_price, entry_mode | — | Handled by `\|\|` fallback |
| Recent signal, no future data | entry=last date | No Entry Data | No Entry Data | Status quo |

**Acceptance criteria**: This regression is **by design**. The old behavior (same-day entry) was incorrect for swing trading. Users must re-run old files to get accurate results.

### 5.3 Premortem — Failure Mode & Effects Analysis

```mermaid
flowchart TD
    subgraph RISKS ["Risk Register"]
        R1["R1: entry_date is None<br/>for failed trades"]
        R2["R2: Market not open yet<br/>for recent signal_date"]
        R3["R3: User forgets to<br/>select entry_mode"]
        R4["R4: Old report JSON<br/>loaded without new fields"]
        R5["R5: WebSocket query params<br/>stripped by reverse proxy"]
        R6["R6: get_future_trading_day<br/>throws on empty DataFrame"]
        R7["R7: signal_close_price uses<br/>same get_next_trading_day —<br/>may return signal_date itself"]
        R8["R8: Frontend sort by 'Date'<br/>confuses users (two date columns)"]
    end
    
    subgraph MITIGATIONS ["Mitigations"]
        M1["Schema: Optional[str]<br/>Frontend: || fallback to signal_date"]
        M2["Accurate status 'No Entry Data'<br/>User sees signal_close_price<br/>as partial data"]
        M3["Default: 'next_close'<br/>Always safe, always valid"]
        M4["Frontend: trade.entry_date ||<br/>trade.signal_date fallback"]
        M5["HTTP fallback always available<br/>FormData preserves entry_mode"]
        M6["Guard: if df is None/empty,<br/>skip both lookups<br/>Trade: status='No Data'"]
        M7["Intentional — shows user<br/>the close price that<br/>triggered the signal"]
        M8["Clear column headers<br/>'Signal Date' vs 'Entry Date'<br/>Tooltips on hover"]
    end
    
    R1 --> M1
    R2 --> M2
    R3 --> M3
    R4 --> M4
    R5 --> M5
    R6 --> M6
    R7 --> M7
    R8 --> M8
```

### 5.4 Edge Cases

| Edge Case | What Happens | Expected? |
|---|---|---|
| `df.index` contains `NaT` or duplicates | `get_next_trading_day` / `get_future_trading_day` may misbehave | Low risk — yfinance returns clean index |
| `df` has no `Open` column (unlikely) | `df.loc[entry_date]["Open"]` raises `KeyError` | Very low — yfinance always returns OHLCV |
| User passes `entry_mode=INVALID` | Python default catches → `else` branch → `next_close` | Safe |
| Bulk_df is MultiIndex with 1 column | `isinstance(bulk_df.columns, pd.MultiIndex)` check handles it | Already handled |
| Signal date format unsupported | `parse_date()` raises → caught → `Invalid Date` status | Already handled |
| Multiple signals for same symbol, different dates | Each signal separately resolved — no conflict | Already handled |

---

## 6. Implementation Plan

### 6.1 Dependency Graph

```mermaid
flowchart TD
    S1["Step 1: date_utils.py<br/>+ get_future_trading_day()"]
    S2["Step 2: schemas.py<br/>+ entry_date, signal_close_price, entry_mode"]
    S3["Step 3: backtester.py<br/>entry_mode param + new computation"]
    S4["Step 4: main.py<br/>entry_mode in REST + WS"]
    S5["Step 5: api.js<br/>+ entryMode param"]
    S6["Step 6: BacktesterPage.jsx<br/>+ entryMode state"]
    S7["Step 7: UploadCard.jsx + .css<br/>segmented control"]
    S8["Step 8: Dashboard.jsx<br/>+ columns, fallbacks"]
    S9["Step 9: StockChartModal.jsx<br/>entry_date fallback"]
    S10["Step 10: Test & Verify"]

    S1 --> S3
    S2 --> S3
    S3 --> S4
    S4 --> S5
    S5 --> S6
    S6 --> S7
    S7 --> S8
    S8 --> S9
    S9 --> S10
```

### 6.2 Step-by-Step Instructions

| Step | File | Action | Test Verification |
|---|---|---|---|
| 1 | `backend/utils/date_utils.py` | Add `get_future_trading_day()` — loop from `i=1` to `max_lookahead` | Unit: returns None when no future day; returns next day when signal_date is trading day |
| 2 | `backend/models/schemas.py` | Add 3 fields to `SignalResult`, 1 field to `BacktestReport` | Pydantic validates; `report.dict()` includes new fields |
| 3 | `backend/core/backtester.py` | Accept `entry_mode`; add signal_close_price, entry_date, entry_price logic; preserve signal_date | `pytest backend/tests/ -v --asyncio-mode=auto` |
| 4 | `backend/main.py` | Add `entry_mode: str = Form("next_close")` to REST; add `entry_mode: str = "next_close"` to WS | Test via Swagger UI: POST with entry_mode field |
| 5 | `frontend/src/services/api.js` | Add `entryMode` param to both functions | Manual: check WS URL includes `?entry_mode=` |
| 6 | `frontend/src/pages/BacktesterPage.jsx` | Add `const [entryMode, setEntryMode] = useState('next_close')`; pass to UploadCard + API | Manual: state flows correctly |
| 7 | `frontend/src/components/UploadCard.jsx` + `.css` | Add segmented control between drop zone and submit button | Visual: toggle works, active/inactive states styled |
| 8 | `frontend/src/components/Dashboard.jsx` | Add 3 columns; rename "Date" → "Signal Date"; fix `getExitDate`; fix `getTooltipContent` | Manual: trade log renders correctly with new columns |
| 9 | `frontend/src/components/StockChartModal.jsx` | Fix entry point date, footer | Manual: modal shows entry_date as entry point |
| 10 | Test | `pytest backend/tests/ -v --asyncio-mode=auto`; `cd frontend && npm run lint`; manual upload | All tests pass, lint clean |

### 6.3 Test Scenarios

```mermaid
flowchart TD
    TEST["Manual Test Matrix"] --> T1["Test 1: next_close mode<br/>Upload CSV with Mon-Fri signals<br/>Verify entry_date = signal_date + 1d<br/>Verify entry_price = Close of entry_date"]
    TEST --> T2["Test 2: next_open mode<br/>Same CSV<br/>Verify entry_price = Open of entry_date<br/>Verify return% differs from close mode"]
    TEST --> T3["Test 3: weekend signals<br/>Upload CSV with Sat/Sun signals<br/>Verify signal_close_price = Mon Close<br/>Verify entry_date = Tue<br/>Verify gap visible between signal_close and entry"]
    TEST --> T4["Test 4: old report JSON<br/>Load previously saved report<br/>Verify no crash<br/>Verify entry_date falls back to signal_date"]
    TEST --> T5["Test 5: very recent dates<br/>Upload with yesterday's date<br/>Verify 'No Entry Data' for affected signals<br/>Verify other signals work fine"]
    TEST --> T6["Test 6: toggle modes<br/>Run same CSV with open → close<br/>Verify entry prices change<br/>Verify returns change accordingly"]
```

---

## 7. Files Changed Summary

| File | Change Type | Lines Changed |
|---|---|---|
| `backend/utils/date_utils.py` | **+1 function** | +8 |
| `backend/models/schemas.py` | **+4 fields** (3 SignalResult + 1 BacktestReport) | +5 |
| `backend/core/backtester.py` | **+entry_mode param** + signal_close_price/entry_date/entry_price logic | ~30 |
| `backend/main.py` | **+2 params** (REST + WS) | +4 |
| `frontend/src/services/api.js` | **+entryMode param** in both functions | +4 |
| `frontend/src/pages/BacktesterPage.jsx` | **+entryMode state** | +3 |
| `frontend/src/components/UploadCard.jsx` | **+segmented control** | +25 |
| `frontend/src/components/UploadCard.css` | **+toggle styles** | +20 |
| `frontend/src/components/Dashboard.jsx` | **+3 columns** + fallbacks + getExitDate fix | ~30 |
| `frontend/src/components/StockChartModal.jsx` | **+entry_date fallback** in 4 places | +4 |

**Total: ~133 lines across 10 files**
