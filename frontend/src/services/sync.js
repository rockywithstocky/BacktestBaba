import { saveReport } from './db';

export async function syncReport(report, trades = []) {
  let localId = null;
  try {
    localId = await saveReport(report);
    console.log('[sync] Saved to IndexedDB:', localId);
  } catch (err) {
    console.warn('[sync] IndexedDB save failed:', err);
  }
  return { localId, remoteId: null };
}
