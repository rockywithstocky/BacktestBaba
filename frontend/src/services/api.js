import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || (typeof window !== 'undefined' && window.location.hostname === 'localhost' ? 'http://localhost:8000/api' : 'https://backtestbaba-api.onrender.com/api');
const WS_URL = import.meta.env.VITE_WS_URL || (typeof window !== 'undefined' && window.location.hostname === 'localhost' ? 'ws://localhost:8000/ws' : 'wss://backtestbaba-api.onrender.com/ws');
const WS_TIMEOUT = parseInt(import.meta.env.VITE_WS_TIMEOUT || '30000', 10);
const HTTP_TIMEOUT = parseInt(import.meta.env.VITE_HTTP_TIMEOUT || '120000', 10);

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

export const fetchSymbolPrices = async (symbol, start, end) => {
    const { data } = await axios.get(`${API_URL}/prices/${symbol}`, {
        params: { start, end },
        timeout: 10000,
    });
    return data.prices;
};
