import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';
const LOCAL_STORAGE_KEY = 'backtestbaba_deployed_portfolios';

function getAuthHeader() {
    try {
        const token = localStorage.getItem('auth_token');
        return token ? { Authorization: `Bearer ${token}` } : {};
    } catch {
        return {};
    }
}

export async function deployPortfolio(portfolio, positions) {
    try {
        const res = await axios.post(`${API_BASE}/portfolios/deploy`, {
            portfolio,
            positions
        }, {
            headers: {
                'Content-Type': 'application/json',
                ...getAuthHeader()
            },
            timeout: 10000
        });
        
        if (res.data) {
            saveToLocalCache(res.data);
            return res.data;
        }
    } catch (e) {
        console.warn('[TrackerAPI] Deploy API fallback to local cache:', e);
    }
    
    // Offline / local fallback
    const todayStr = new Date().toISOString().slice(0, 10);
    const isQueued = portfolio.status === 'PENDING' || (portfolio.deployment_date && portfolio.deployment_date > todayStr);
    const finalStatus = isQueued ? 'PENDING' : (portfolio.status || 'ACTIVE');

    const localEntity = {
        ...portfolio,
        id: portfolio.id || `local_${Date.now()}`,
        status: finalStatus,
        positions: (positions || []).map(p => ({
            ...p,
            status: isQueued ? 'PENDING_FILL' : (p.status || 'ACTIVE')
        })),
        metrics: {
            total_capital: portfolio.total_capital || 500000,
            total_invested: positions.reduce((acc, p) => acc + (p.allocated_amount || 0), 0),
            cash_reserve: Math.max(0, (portfolio.total_capital || 500000) - positions.reduce((acc, p) => acc + (p.allocated_amount || 0), 0)),
            current_value: portfolio.total_capital || 500000,
            total_pnl: 0,
            total_roi_pct: 0,
            win_rate_pct: 0,
            active_positions: isQueued ? 0 : positions.length,
            pending_positions: isQueued ? positions.length : 0,
            closed_positions: 0,
            total_positions: positions.length
        }
    };
    saveToLocalCache(localEntity);
    return localEntity;
}

export async function listDeployedPortfolios() {
    try {
        const res = await axios.get(`${API_BASE}/portfolios/deployed`, {
            headers: getAuthHeader(),
            timeout: 10000
        });
        if (res.data && Array.isArray(res.data.portfolios)) {
            // Update local cache
            res.data.portfolios.forEach(saveToLocalCache);
            return res.data.portfolios;
        }
    } catch (e) {
        console.warn('[TrackerAPI] List API failed, loading from local cache:', e);
    }
    
    return loadFromLocalCache();
}

export async function refreshDeployedPortfolio(portfolioId) {
    try {
        const res = await axios.post(`${API_BASE}/portfolios/deployed/${portfolioId}/refresh`, {}, {
            headers: getAuthHeader(),
            timeout: 12000
        });
        if (res.data) {
            saveToLocalCache(res.data);
            return res.data;
        }
    } catch (e) {
        console.warn('[TrackerAPI] Refresh API failed:', e);
    }
    return null;
}

export async function deleteDeployedPortfolio(portfolioId) {
    try {
        await axios.delete(`${API_BASE}/portfolios/deployed/${portfolioId}`, {
            headers: getAuthHeader(),
            timeout: 6000
        });
    } catch (e) {
        console.warn('[TrackerAPI] Delete API failed:', e);
    }
    deleteFromLocalCache(portfolioId);
    return true;
}

export async function pauseDeployedPortfolio(portfolioId) {
    try {
        const res = await axios.post(`${API_BASE}/portfolios/deployed/${portfolioId}/pause`, {}, {
            headers: getAuthHeader(),
            timeout: 6000
        });
        if (res.data) {
            updateLocalStatus(portfolioId, 'PAUSED');
            return res.data;
        }
    } catch (e) {
        console.warn('[TrackerAPI] Pause API failed, falling back to local:', e);
    }
    updateLocalStatus(portfolioId, 'PAUSED');
    return { id: portfolioId, status: 'PAUSED' };
}

export async function resumeDeployedPortfolio(portfolioId) {
    try {
        const res = await axios.post(`${API_BASE}/portfolios/deployed/${portfolioId}/resume`, {}, {
            headers: getAuthHeader(),
            timeout: 10000
        });
        if (res.data) {
            saveToLocalCache(res.data);
            return res.data;
        }
    } catch (e) {
        console.warn('[TrackerAPI] Resume API failed, falling back to local:', e);
    }
    updateLocalStatus(portfolioId, 'ACTIVE');
    return { id: portfolioId, status: 'ACTIVE' };
}

export async function squareOffDeployedPortfolio(portfolioId) {
    try {
        const res = await axios.post(`${API_BASE}/portfolios/deployed/${portfolioId}/square-off`, {}, {
            headers: getAuthHeader(),
            timeout: 12000
        });
        if (res.data) {
            saveToLocalCache(res.data);
            return res.data;
        }
    } catch (e) {
        console.warn('[TrackerAPI] Square off API failed, falling back to local:', e);
    }
    updateLocalStatus(portfolioId, 'COMPLETED');
    return { id: portfolioId, status: 'COMPLETED' };
}

export async function forceFillDeployedPortfolio(portfolioId) {
    try {
        const res = await axios.post(`${API_BASE}/portfolios/deployed/${portfolioId}/force-fill`, {}, {
            headers: getAuthHeader(),
            timeout: 12000
        });
        if (res.data) {
            saveToLocalCache(res.data);
            return res.data;
        }
    } catch (e) {
        console.warn('[TrackerAPI] Force fill API failed, falling back to local:', e);
    }
    updateLocalStatus(portfolioId, 'ACTIVE');
    return { id: portfolioId, status: 'ACTIVE' };
}

function updateLocalStatus(portfolioId, newStatus) {
    try {
        const list = loadFromLocalCache();
        const updated = list.map(p => p.id === portfolioId ? { ...p, status: newStatus } : p);
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
    } catch {}
}

// ── Local Storage Cache Helpers ──────────────────────────────

function loadFromLocalCache() {
    try {
        const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

function saveToLocalCache(portfolio) {
    if (!portfolio || !portfolio.id) return;
    try {
        const list = loadFromLocalCache();
        const idx = list.findIndex(p => p.id === portfolio.id);
        if (idx >= 0) {
            list[idx] = portfolio;
        } else {
            list.unshift(portfolio);
        }
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(list));
    } catch (e) {
        console.error('Failed to save to local cache', e);
    }
}

function deleteFromLocalCache(portfolioId) {
    try {
        const list = loadFromLocalCache().filter(p => p.id !== portfolioId);
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(list));
    } catch (e) {
        console.error('Failed to delete from local cache', e);
    }
}
