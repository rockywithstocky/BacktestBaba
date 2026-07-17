import { saveReport } from './db';

const BACKOFF_DELAYS = [1000, 2000, 4000, 8000, 16000];
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

export async function syncReport(report, trades = [], token = null) {
  let localId = null;
  try {
    localId = await saveReport(report);
  } catch (err) {
    console.warn('[sync] IndexedDB save failed:', err);
  }

  // Remote sync with exponential backoff
  if (token) {
    for (let i = 0; i < BACKOFF_DELAYS.length; i++) {
      try {
        const res = await fetch(`${API_URL}/backtest/sync`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ localId, report }),
        });
        if (res.ok) {
          const data = await res.json();
          return { localId, remoteId: data.id || null, synced: true };
        }
        if (res.status >= 400 && res.status < 500) {
          console.warn('[sync] Client error, not retrying:', res.status);
          break;
        }
      } catch (err) {
        if (i === BACKOFF_DELAYS.length - 1) {
          console.warn('[sync] All retry attempts exhausted:', err);
        } else {
          console.warn(`[sync] Attempt ${i + 1} failed, retrying in ${BACKOFF_DELAYS[i]}ms:`, err);
          await new Promise(r => setTimeout(r, BACKOFF_DELAYS[i]));
        }
      }
    }
  }

  return { localId, remoteId: null, synced: false };
}
