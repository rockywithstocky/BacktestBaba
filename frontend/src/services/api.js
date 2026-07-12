import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || (typeof window !== 'undefined' && window.location.hostname === 'localhost' ? 'http://localhost:8000/api' : 'https://backtestbaba-api.onrender.com/api');
const WS_URL = import.meta.env.VITE_WS_URL || (typeof window !== 'undefined' && window.location.hostname === 'localhost' ? 'ws://localhost:8000/ws' : 'wss://backtestbaba-api.onrender.com/ws');
const WS_TIMEOUT = parseInt(import.meta.env.VITE_WS_TIMEOUT || '30000', 10);
const HTTP_TIMEOUT = parseInt(import.meta.env.VITE_HTTP_TIMEOUT || '120000', 10);

const MOBILE_BREAKPOINT = 768;
const MOBILE_PROGRESS_TIMEOUT = 180000;

const isMobile = () => typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT;

const PHASE_MESSAGES = [
    { label: 'Uploading file...', weight: 5 },
    { label: 'Resolving symbols...', weight: 20 },
    { label: 'Fetching prices...', weight: 35 },
    { label: 'Computing returns...', weight: 30 },
    { label: 'Finalizing...', weight: 10 },
];

const runBacktestMobile = async (file, onProgress, onComplete, onError, entryMode = 'next_close') => {
    let progressIndex = 0;
    let settled = false;

    const advancePhase = () => {
        if (settled || progressIndex >= PHASE_MESSAGES.length) return;
        const phase = PHASE_MESSAGES[progressIndex];
        const cumulative = PHASE_MESSAGES
            .slice(0, progressIndex + 1)
            .reduce((sum, p) => sum + p.weight, 0);
        onProgress({
            type: 'progress',
            current: cumulative,
            total: 100,
            symbol: phase.label,
            indeterminate: true,
        });
        progressIndex++;
    };

    advancePhase();

    const progressTimer = setInterval(() => {
        advancePhase();
        if (progressIndex >= PHASE_MESSAGES.length) clearInterval(progressTimer);
    }, 8000);

    const stuckTimer = setTimeout(() => {
        if (!settled) {
            onProgress({
                type: 'progress',
                current: 95, total: 100, symbol: 'Taking longer than expected...', indeterminate: true,
            });
        }
    }, MOBILE_PROGRESS_TIMEOUT);

    try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('entry_mode', entryMode);

        const response = await axios.post(`${API_URL}/backtest`, formData, {
            timeout: HTTP_TIMEOUT,
        });

        clearInterval(progressTimer);
        clearTimeout(stuckTimer);
        settled = true;

        if (response.data) {
            onProgress({
                type: 'progress', current: 100, total: 100, symbol: 'Complete!', indeterminate: false,
            });
            onComplete(response.data);
        }
    } catch (error) {
        clearInterval(progressTimer);
        clearTimeout(stuckTimer);
        if (!settled) {
            settled = true;
            const message = error.response?.data?.detail || error.message || 'Backtest failed';
            onError(message);
        }
    }
};

const runBacktestHTTPFallback = async (file, onProgress, onComplete, onError, entryMode = 'next_close') => {
    try {
        onProgress({ current: 0, total: 100, symbol: 'Backend waking up...' });

        const formData = new FormData();
        formData.append('file', file);
        formData.append('entry_mode', entryMode);

        await axios.post(`${API_URL}/backtest`, formData, {
            timeout: HTTP_TIMEOUT,
        }).then(response => {
            onComplete(response.data);
        });
    } catch (error) {
        console.error('[HTTP Fallback] Error:', error);
        const message = error.response?.data?.detail || error.message || 'Backtest failed';
        onError(message);
    }
};

export const runBacktestWS = (file, onProgress, onComplete, onError, entryMode = 'next_close') => {
    if (isMobile()) {
        return runBacktestMobile(file, onProgress, onComplete, onError, entryMode);
    }

    const ws = new WebSocket(`${WS_URL}/backtest?entry_mode=${entryMode}`);
    let settled = false;

    const wsTimeout = setTimeout(() => {
        if (!settled) {
            settled = true;
            ws.close();
            onProgress({ current: 0, total: 100, symbol: 'WebSocket timeout, falling back to HTTP...' });
            runBacktestHTTPFallback(file, onProgress, onComplete, onError, entryMode);
        }
    }, WS_TIMEOUT);

    ws.onopen = () => {
        clearTimeout(wsTimeout);
        if (settled) return;
        console.log('[WS] Connected, sending file...');
        const reader = new FileReader();
        reader.onload = (e) => {
            console.log('[WS] File read, sending...');
            ws.send(e.target.result);
        };
        reader.onerror = () => {
            onError('Failed to read file');
        };
        reader.readAsArrayBuffer(file);
    };

    let trades = [];

    ws.onmessage = (event) => {
        if (settled) return;
        let data;
        try {
            data = JSON.parse(event.data);
        } catch (e) {
            console.error('[WS] Invalid JSON from server:', e.message);
            return;
        }

        if (data.type === 'progress') {
            onProgress(data);
        } else if (data.type === 'trade_batch') {
            trades = trades.concat(data.batch);
            onProgress({
                type: 'progress',
                current: data.current,
                total: data.total,
                symbol: `Loaded ${trades.length} trades...`
            });
        } else if (data.type === 'ping') {
            // Server keepalive — ignore
        } else if (data.type === 'complete') {
            settled = true;
            onComplete({ ...data.report, trades });
            ws.close();
        } else if (data.type === 'error') {
            settled = true;
            onError(data.message);
            ws.close();
        }
    };

    ws.onerror = () => {
        if (!settled) {
            settled = true;
            clearTimeout(wsTimeout);
            runBacktestHTTPFallback(file, onProgress, onComplete, onError, entryMode);
        }
    };

    ws.onclose = (event) => {
        console.log('[WS] Closed:', event.code, event.reason);
    };

    return ws;
};

export const fetchSymbolPrices = async (symbol, start, end, signal) => {
    const { data } = await axios.get(`${API_URL}/prices/${symbol}`, {
        params: { start, end },
        timeout: 10000,
        signal,
    });
    return data.prices;
};
