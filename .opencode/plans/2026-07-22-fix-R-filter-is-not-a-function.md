# Fix `R.filter is not a function` — Runtime TypeError

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the `Uncaught (in promise) TypeError: R.filter is not a function` error observed in production

**Root Cause:** A variable expected to be an array in a Promise/then context receives a non-array value (object, null, or undefined). The primary candidate is `report.trades.filter(...)` in `Dashboard.jsx:34` where `report.trades` is not a proper array after HTTP fallback or WebSocket data reconstruction.

**Tech Stack:** JavaScript, React 19, FastAPI backend

## Global Constraints

- No changes to backend serialization — only add defensive guards in frontend
- Preserve all existing behavior for normal (array) inputs
- Add targeted `console.warn` instrumentation to identify the exact source if the error recurs
- Must not break the existing test suite

---

### Task 1: Add defensive guard + instrumentation at `Dashboard.jsx:34` — `report.trades.filter`

**Files:**
- Modify: `frontend/src/components/Dashboard.jsx:33-36`
- Modify: `frontend/src/services/api.js:118-122` (WebSocket report reconstruction)

**Interfaces:**
- The `Dashboard` component receives `report` as a prop (either from WS or HTTP)
- `report.trades` must always be an array before `.filter()` is called

- [ ] **Step 1: Add array guard at `report.trades.filter` in Dashboard.jsx**

```javascript
// Dashboard.jsx:33-36 — replace `report.trades.filter(...)` with guarded version
const successfulTrades = useMemo(() => {
    if (!Array.isArray(report?.trades)) {
        console.warn('[Dashboard] report.trades is not an array:', typeof report?.trades, report?.trades);
        return [];
    }
    return report.trades.filter(t => t.status === 'Success');
}, [report?.trades]);
```

This guards the primary `.filter()` call and logs the actual value when it fails.

- [ ] **Step 2: Add array guard at `successfulTrades.filter` call in Dashboard.jsx:153**

```javascript
// line 152-156 — filteredTrades memo
const filteredTrades = useMemo(() => {
    if (!Array.isArray(successfulTrades)) {
        console.warn('[Dashboard] successfulTrades is not an array:', typeof successfulTrades, successfulTrades);
        return [];
    }
    return successfulTrades.filter(trade =>
        trade.symbol.toLowerCase().includes(searchTerm.toLowerCase())
    );
}, [successfulTrades, searchTerm]);
```

- [ ] **Step 3: Add array guard at WebSocket report construction in api.js**

```javascript
// api.js:118-122 — add guard around trades.concat and the final report
} else if (data.type === 'complete') {
    settled = true;
    clearTimeout(watchdogTimer);
    document.removeEventListener('visibilitychange', handleVisibility);

    if (!Array.isArray(trades)) {
        console.warn('[WS] trades accumulator is not an array:', typeof trades, trades);
        trades = [];
    }

    if (data.latest_prices && typeof data.latest_prices === 'object') {
        trades = trades.map(t => ({
            ...t,
            ...(t.status === 'Success' && data.latest_prices[t.symbol] || {}),
        }));
    }

    const report = { ...data.report, trades };
    onComplete(report);
    ws.close();
    syncReport(report, trades);
}
```

- [ ] **Step 4: Add instrumentation at HTTP fallback report path**

```javascript
// api.js:20-25 — add guard before onComplete
await axios.post(`${API_URL}/backtest`, formData, {
    timeout: HTTP_TIMEOUT,
    headers,
}).then(response => {
    const report = response.data;
    if (!Array.isArray(report?.trades)) {
        console.warn('[HTTP] report.trades is not an array:', typeof report?.trades, report?.trades);
    }
    onComplete(report);
});
```

- [ ] **Step 5: Run frontend tests to verify no regressions**

```bash
cd frontend; npm test -- --run
```

Expected: All tests pass (the guards are no-ops for normal array inputs)

- [ ] **Step 6: Run frontend build to verify no build errors**

```bash
cd frontend; npm run build
```

Expected: Build succeeds

---

### Task 2: Add defensive guard at `BacktesterPage.jsx:82` — `server.filter` in `refreshReports`

**Files:**
- Modify: `frontend/src/pages/BacktesterPage.jsx:76-88`

- [ ] **Step 1: Add array guard around server variable**

```javascript
// BacktesterPage.jsx:76-88 — replace the .then handler
Promise.all([
    listReports().catch(() => []),
    fetchUploads().then(r => r.results || []).catch(() => []),
]).then(([local, server]) => {
    if (!Array.isArray(local)) {
        console.warn('[refreshReports] local is not an array:', typeof local);
        local = [];
    }
    if (!Array.isArray(server)) {
        console.warn('[refreshReports] server is not an array:', typeof server);
        server = [];
    }
    const localIds = new Set(local.map(r => r.id));
    const merged = [
        ...local,
        ...server
            .filter(s => !localIds.has(s.id))
            .map(s => ({ ...s, source: 'server', total_signals: s.signal_count })),
    ];
    merged.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    setSavedReports(merged);
});
```

- [ ] **Step 2: Run frontend tests**

```bash
cd frontend; npm test -- --run
```

Expected: All tests pass

---

### Task 3: Add defensive guard at `BacktesterPage.jsx:159` — `prev.filter` in `handleDeleteReport`

**Files:**
- Modify: `frontend/src/pages/BacktesterPage.jsx:157-160`

- [ ] **Step 1: Add array guard**

```javascript
// BacktesterPage.jsx:157-160
const handleDeleteReport = async (id) => {
    await deleteReport(id);
    setSavedReports(prev => {
        if (!Array.isArray(prev)) {
            console.warn('[handleDeleteReport] prev is not an array:', typeof prev);
            return [];
        }
        return prev.filter(r => r.id !== id);
    });
};
```

- [ ] **Step 2: Run frontend tests**

```bash
cd frontend; npm test -- --run
```

Expected: All tests pass

---

### Task 4: Add global unhandled promise rejection handler

**Files:**
- Modify: `frontend/src/main.jsx:1-13`

This catches any remaining unhandled promise rejections and logs them with stack traces for diagnosis.

- [ ] **Step 1: Add rejection handler**

```javascript
// main.jsx — before the render call
window.addEventListener('unhandledrejection', (event) => {
    console.warn('[Unhandled Promise Rejection]', event.reason?.message, event.reason?.stack);
});
```

- [ ] **Step 2: Run frontend tests**

```bash
cd frontend; npm test -- --run
```

Expected: All tests pass

---

### Task 5: Verification by building and testing

- [ ] **Step 1: Full build check**

```bash
cd frontend; npm run build
```

- [ ] **Step 2: Run full test suite**

```bash
cd frontend; npm test -- --run
```

Expected: Clean build, all tests pass
