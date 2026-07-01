import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || (typeof window !== 'undefined' && window.location.hostname === 'localhost' ? 'http://localhost:8000/api' : 'https://backtestbaba-api.onrender.com/api');
const WS_URL = import.meta.env.VITE_WS_URL || (typeof window !== 'undefined' && window.location.hostname === 'localhost' ? 'ws://localhost:8000/ws' : 'wss://backtestbaba-api.onrender.com/ws');

const runBacktestHTTPFallback = async (file, onProgress, onComplete, onError, entryMode = 'next_close') => {
    try {
        onProgress({ current: 0, total: 100, symbol: 'Backend waking up...' });

        const formData = new FormData();
        formData.append('file', file);
        formData.append('entry_mode', entryMode);

        await axios.post(`${API_URL}/backtest`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            timeout: 120000,
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
            runBacktestHTTPFallback(file, onProgress, onComplete, onError, entryMode);
        }
    }, 10000);

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

    ws.onmessage = (event) => {
        if (settled) return;
        const data = JSON.parse(event.data);

        if (data.type === 'progress') {
            onProgress(data);
        } else if (data.type === 'complete') {
            settled = true;
            onComplete(data.report);
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
