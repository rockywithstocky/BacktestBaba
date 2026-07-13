const DB_NAME = 'backtestbaba';
const DB_VERSION = 1;
const STORE_NAME = 'reports';

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('created_at', 'created_at', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveReport(report) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const record = {
      id: report.run_id || `report_${Date.now()}`,
      report,
      created_at: new Date().toISOString(),
      total_signals: report.total_signals,
      successful_signals: report.successful_signals,
      failed_signals: report.failed_signals,
      avg_return_7d: report.avg_return_7d,
      win_rate_7d: report.win_rate_7d,
    };
    const request = store.put(record);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getReport(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result?.report || null);
    request.onerror = () => reject(request.error);
  });
}

export async function listReports() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('created_at');
    const request = index.openCursor(null, 'prev');
    const reports = [];
    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        reports.push({
          id: cursor.value.id,
          created_at: cursor.value.created_at,
          total_signals: cursor.value.total_signals,
          successful_signals: cursor.value.successful_signals,
          failed_signals: cursor.value.failed_signals,
          avg_return_7d: cursor.value.avg_return_7d,
          win_rate_7d: cursor.value.win_rate_7d,
        });
        cursor.continue();
      } else {
        resolve(reports);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

export async function deleteReport(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(id);
    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
}
