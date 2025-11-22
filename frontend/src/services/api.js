import axios from 'axios';

const API_URL = 'http://localhost:8000/api';
const WS_URL = 'ws://localhost:8000/ws';

export const runBacktest = async (file) => {
    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await axios.post(`${API_URL}/backtest`, formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            },
        });
        return response.data;
    } catch (error) {
        console.error("Backtest failed:", error);
        throw error;
    }
};

export const runBacktestWS = (file, onProgress, onComplete, onError) => {
    const ws = new WebSocket(`${WS_URL}/backtest`);

    ws.onopen = () => {
        console.log('[WS] Connected, sending file...');
        const reader = new FileReader();
        reader.onload = (e) => {
            console.log('[WS] File read, sending...');
            ws.send(e.target.result);
        };
        reader.onerror = (e) => {
            console.error('[WS] FileReader error:', e);
            onError('Failed to read file');
        };
        reader.readAsArrayBuffer(file);
    };

    ws.onmessage = (event) => {
        console.log('[WS] Message:', event.data);
        const data = JSON.parse(event.data);

        if (data.type === 'progress') {
            onProgress(data);
        } else if (data.type === 'complete') {
            onComplete(data.report);
            ws.close();
        } else if (data.type === 'error') {
            onError(data.message);
            ws.close();
        }
    };

    ws.onerror = (error) => {
        console.error('[WS] Error:', error);
        onError("WebSocket connection error");
    };

    ws.onclose = (event) => {
        console.log('[WS] Closed:', event.code, event.reason);
    };

    return ws;
};
