import axios from 'axios';
import { syncReport } from './sync';
import { getToken } from './auth';

const API_URL = import.meta.env.VITE_API_URL || (typeof window !== 'undefined' && window.location.hostname === 'localhost' ? 'http://localhost:8000/api' : 'https://backtestbaba-api.onrender.com/api');
const WS_URL = import.meta.env.VITE_WS_URL || (typeof window !== 'undefined' && window.location.hostname === 'localhost' ? 'ws://localhost:8000/ws' : 'wss://backtestbaba-api.onrender.com/ws');
const WS_TIMEOUT = parseInt(import.meta.env.VITE_WS_TIMEOUT || '30000', 10);
const HTTP_TIMEOUT = parseInt(import.meta.env.VITE_HTTP_TIMEOUT || '900000', 10);

const runBacktestHTTPFallback = async (file, onProgress, onComplete, onError, entryMode = 'next_close') => {
    try {
        onProgress({ current: 0, total: 100, symbol: 'Backend waking up...' });

        const formData = new FormData();
        formData.append('file', file);
        formData.append('entry_mode', entryMode);

        const token = getToken();
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        await axios.post(`${API_URL}/backtest`, formData, {
            timeout: HTTP_TIMEOUT,
            headers,
        }).then(response => {
            const report = response.data;
            if (!Array.isArray(report?.trades)) {
                report.trades = [];
            }
            onComplete(report);
        });
    } catch (error) {
        console.error('[HTTP Fallback] Error:', error);
        const message = error.response?.data?.detail || error.message || 'Backtest failed';
        onError(message);
    }
};

export const runBacktestWS = (file, onProgress, onComplete, onError, entryMode = 'next_close') => {
    const token = getToken();
    const wsUrl = token
        ? `${WS_URL}/backtest?token=${token}&entry_mode=${entryMode}`
        : `${WS_URL}/backtest?entry_mode=${entryMode}`;
    const ws = new WebSocket(wsUrl);
    let settled = false;
    let watchdogTimer = null;

    const WATCHDOG_INTERVAL = 60000;

    const startWatchdog = () => {
        if (watchdogTimer) clearTimeout(watchdogTimer);
        watchdogTimer = setTimeout(() => {
            if (!settled) {
                settled = true;
                ws.close();
                onProgress({ current: 0, total: 100, symbol: 'Connection lost, falling back to HTTP...' });
                runBacktestHTTPFallback(file, onProgress, onComplete, onError, entryMode);
            }
        }, WATCHDOG_INTERVAL);
    };

    const wsTimeout = setTimeout(() => {
        if (!settled) {
            settled = true;
            ws.close();
            onProgress({ current: 0, total: 100, symbol: 'WebSocket timeout, falling back to HTTP...' });
            runBacktestHTTPFallback(file, onProgress, onComplete, onError, entryMode);
        }
    }, WS_TIMEOUT);

    const handleVisibility = () => {
        if (!settled && document.visibilityState === 'visible') {
            startWatchdog();
        }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    ws.onopen = () => {
        clearTimeout(wsTimeout);
        startWatchdog();
        if (settled) return;
        const reader = new FileReader();
        reader.onload = (e) => {
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
            startWatchdog();
            onProgress(data);
        } else if (data.type === 'trade_batch') {
            startWatchdog();
            trades = trades.concat(data.batch);
            onProgress({
                type: 'progress',
                current: data.current,
                total: data.total,
                symbol: `Loaded ${trades.length} trades...`
            });
        } else if (data.type === 'ping') {
            startWatchdog();
        } else if (data.type === 'complete') {
            settled = true;
            clearTimeout(watchdogTimer);
            document.removeEventListener('visibilitychange', handleVisibility);

            if (!Array.isArray(trades)) trades = [];

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
        } else if (data.type === 'error') {
            settled = true;
            clearTimeout(watchdogTimer);
            document.removeEventListener('visibilitychange', handleVisibility);
            onError(data.message);
            ws.close();
        }
    };

    ws.onerror = () => {
        if (!settled) {
            settled = true;
            clearTimeout(wsTimeout);
            clearTimeout(watchdogTimer);
            document.removeEventListener('visibilitychange', handleVisibility);
            runBacktestHTTPFallback(file, onProgress, onComplete, onError, entryMode);
        }
    };

    ws.onclose = (event) => {
        document.removeEventListener('visibilitychange', handleVisibility);
        if (!settled && event.code !== 1000) {
            settled = true;
            clearTimeout(wsTimeout);
            clearTimeout(watchdogTimer);
            onProgress({ current: 0, total: 100, symbol: 'Connection lost, falling back to HTTP...' });
            runBacktestHTTPFallback(file, onProgress, onComplete, onError, entryMode);
        }
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

export const fetchUploads = async () => {
    const auth = await import('./auth');
    const token = auth.getToken();
    if (!token) return { results: [], total: 0 };
    try {
        const { data } = await axios.get(`${API_URL}/uploads`, {
            headers: { Authorization: `Bearer ${token}` },
            timeout: 10000,
        });
        return data;
    } catch (error) {
        if (error.response?.status === 401) {
            auth.logout();
        }
        return { results: [], total: 0 };
    }
};
