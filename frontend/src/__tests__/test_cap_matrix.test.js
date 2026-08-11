import { describe, it, expect } from 'vitest';

const parseCapNumber = (s) => {
    let text = String(s).replace(/[₹,\s]/g, '');
    const match = text.match(/^([\d.]+)\s*(cr|crore|lakh|lac)?/i);
    if (!match) return null;
    const value = parseFloat(match[1]);
    if (isNaN(value)) return null;
    const unit = (match[2] || '').toLowerCase();
    if (unit === 'cr' || unit === 'crore') return value * 1e7;
    if (unit === 'lakh' || unit === 'lac') return value * 1e5;
    return value;
};

const normalizeCapLabel = (raw) => {
    if (raw === null || raw === undefined) return 'Unknown';
    let s = String(raw).trim();
    if (!s) return 'Unknown';
    const compact = s.toLowerCase().replace(/[^a-z0-9.]/g, '');
    if (compact.includes('large')) return 'Largecap';
    if (compact.includes('micro')) return 'Microcap';
    if (compact.includes('mid')) return 'Midcap';
    if (compact.includes('small')) return 'Smallcap';
    const num = parseCapNumber(s);
    if (num !== null) {
        if (num >= 2e11) return 'Largecap';
        if (num >= 2e10) return 'Midcap';
        if (num >= 2.5e9) return 'Smallcap';
        return 'Microcap';
    }
    return 'Unknown';
};

const buildCapMatrix = (trades) => {
    const buckets = {};
    trades.forEach(t => {
        const name = normalizeCapLabel(t.market_cap);
        if (!buckets[name]) buckets[name] = [];
        buckets[name].push(t);
    });
    return Object.keys(buckets)
        .map(name => {
            const bucketTrades = buckets[name];
            const calc = (key) => {
                const vals = bucketTrades.map(t => t[key]).filter(v => v !== null && v !== undefined && !isNaN(v));
                return vals.length === 0 ? null : vals.reduce((s, v) => s + v, 0) / vals.length;
            };
            const avg30 = calc('return_30d');
            const r30 = bucketTrades.map(t => t.return_30d).filter(v => v !== null && v !== undefined && !isNaN(v));
            const winRate = r30.length === 0 ? null : (r30.filter(v => v > 0).length / r30.length) * 100;
            const wins = r30.filter(v => v > 0);
            const losses = r30.filter(v => v < 0);
            const avgWin = wins.length ? wins.reduce((s, v) => s + v, 0) / wins.length : null;
            const avgLoss = losses.length ? losses.reduce((s, v) => s + v, 0) / losses.length : null;
            const std = r30.length > 1 ? Math.sqrt(r30.reduce((s, v) => s + (v - avg30) ** 2, 0) / r30.length) : 0;
            const consistency = std > 0 ? avg30 / std : (avg30 > 0 ? 999 : -999);
            return {
                name, count: bucketTrades.length,
                return_7d: calc('return_7d'),
                return_30d: avg30,
                return_90d: calc('return_90d'),
                winRate, avgWin, avgLoss, consistency
            };
        })
        .filter(b => b.count >= 3)
        .sort((a, b) => (b.return_30d ?? -Infinity) - (a.return_30d ?? -Infinity));
};

const makeTrade = (overrides) => ({
    symbol: 'TEST', market_cap: 'Largecap',
    return_7d: 2, return_30d: 4, return_90d: 6,
    ...overrides,
});

describe('buildCapMatrix', () => {
    it('groups trades by market cap and computes averages per horizon', () => {
        const result = buildCapMatrix([
            makeTrade({ symbol: 'A', return_7d: 1, return_30d: 2, return_90d: 3 }),
            makeTrade({ symbol: 'B', return_7d: 3, return_30d: 4, return_90d: 5 }),
            makeTrade({ symbol: 'C', return_7d: 5, return_30d: 6, return_90d: 7 }),
        ]);
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('Largecap');
        expect(result[0].count).toBe(3);
        expect(result[0].return_7d).toBe(3);
        expect(result[0].return_30d).toBe(4);
        expect(result[0].return_90d).toBe(5);
    });

    it('excludes buckets with fewer than 3 signals', () => {
        const result = buildCapMatrix([
            makeTrade({ market_cap: 'Smallcap' }),
            makeTrade({ market_cap: 'Smallcap' }),
            makeTrade({ market_cap: 'Midcap' }),
            makeTrade({ market_cap: 'Midcap' }),
            makeTrade({ market_cap: 'Midcap' }),
            makeTrade({ market_cap: 'Midcap' }),
        ]);
        expect(result.some(b => b.name === 'Smallcap')).toBe(false);
        expect(result.some(b => b.name === 'Midcap')).toBe(true);
    });

    it('skips null returns when averaging', () => {
        const result = buildCapMatrix([
            makeTrade({ symbol: 'A', return_7d: 10, return_30d: null }),
            makeTrade({ symbol: 'B', return_7d: 20, return_30d: null }),
            makeTrade({ symbol: 'C', return_7d: 30, return_30d: 12 }),
        ]);
        expect(result[0].return_7d).toBe(20);
        expect(result[0].return_30d).toBe(12);
    });

    it('computes win rate, avg win, avg loss from 30d returns', () => {
        const result = buildCapMatrix([
            makeTrade({ symbol: 'A', return_30d: 5 }),
            makeTrade({ symbol: 'B', return_30d: 3 }),
            makeTrade({ symbol: 'C', return_30d: -2 }),
        ]);
        expect(result[0].winRate).toBeCloseTo(66.67, 1);
        expect(result[0].avgWin).toBe(4);
        expect(result[0].avgLoss).toBe(-2);
    });

    it('sorts buckets by 30d average descending', () => {
        const result = buildCapMatrix([
            makeTrade({ symbol: 'A', market_cap: 'Largecap', return_30d: 2 }),
            makeTrade({ symbol: 'B', market_cap: 'Largecap', return_30d: 4 }),
            makeTrade({ symbol: 'C', market_cap: 'Largecap', return_30d: 3 }),
            makeTrade({ symbol: 'D', market_cap: 'Midcap', return_30d: 10 }),
            makeTrade({ symbol: 'E', market_cap: 'Midcap', return_30d: 12 }),
            makeTrade({ symbol: 'F', market_cap: 'Midcap', return_30d: 11 }),
        ]);
        expect(result[0].name).toBe('Midcap');
        expect(result[1].name).toBe('Largecap');
    });

    it('falls back to Unknown bucket for missing market_cap', () => {
        const result = buildCapMatrix([
            makeTrade({ market_cap: null }),
            makeTrade({ market_cap: undefined }),
            makeTrade({ symbol: 'C', market_cap: undefined }),
        ]);
        expect(result[0].name).toBe('Unknown');
        expect(result[0].count).toBe(3);
    });

    it('returns empty array for no trades', () => {
        expect(buildCapMatrix([])).toEqual([]);
    });

    it('consistency mirrors stats-table logic (999 when std is 0)', () => {
        const result = buildCapMatrix([
            makeTrade({ symbol: 'A', return_30d: 5 }),
            makeTrade({ symbol: 'B', return_30d: 5 }),
            makeTrade({ symbol: 'C', return_30d: 5 }),
        ]);
        expect(result[0].consistency).toBe(999);
    });

    it('merges duplicate cap labels with different raw spellings into one bucket', () => {
        const result = buildCapMatrix([
            makeTrade({ symbol: 'A', market_cap: 'Midcap' }),
            makeTrade({ symbol: 'B', market_cap: 'MID CAP' }),
            makeTrade({ symbol: 'C', market_cap: 'mid-cap' }),
        ]);
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('Midcap');
        expect(result[0].count).toBe(3);
    });

    it('classifies raw rupee values into cap buckets', () => {
        const result = buildCapMatrix([
            makeTrade({ symbol: 'A', market_cap: '2483000000000' }),
            makeTrade({ symbol: 'B', market_cap: '2483000000000' }),
            makeTrade({ symbol: 'C', market_cap: '2483000000000' }),
        ]);
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('Largecap');
        expect(result[0].count).toBe(3);
    });
});

describe('normalizeCapLabel', () => {
    it('maps null, undefined and empty to Unknown', () => {
        expect(normalizeCapLabel(null)).toBe('Unknown');
        expect(normalizeCapLabel(undefined)).toBe('Unknown');
        expect(normalizeCapLabel('')).toBe('Unknown');
        expect(normalizeCapLabel('   ')).toBe('Unknown');
    });

    it('maps case variants to canonical labels', () => {
        expect(normalizeCapLabel('Midcap')).toBe('Midcap');
        expect(normalizeCapLabel('MIDCAP')).toBe('Midcap');
        expect(normalizeCapLabel('largecap')).toBe('Largecap');
        expect(normalizeCapLabel('Smallcap')).toBe('Smallcap');
        expect(normalizeCapLabel('MICROCAP')).toBe('Microcap');
    });

    it('maps space and hyphen variants to canonical labels', () => {
        expect(normalizeCapLabel('Mid Cap')).toBe('Midcap');
        expect(normalizeCapLabel('MID CAP')).toBe('Midcap');
        expect(normalizeCapLabel('mid-cap')).toBe('Midcap');
        expect(normalizeCapLabel('Large Cap')).toBe('Largecap');
        expect(normalizeCapLabel('Small Cap')).toBe('Smallcap');
        expect(normalizeCapLabel('Micro Cap')).toBe('Microcap');
        expect(normalizeCapLabel('  midcap  ')).toBe('Midcap');
    });

    it('classifies raw rupee values by threshold', () => {
        expect(normalizeCapLabel('2483000000000')).toBe('Largecap');
        expect(normalizeCapLabel('500000000000')).toBe('Largecap');
        expect(normalizeCapLabel('50000000000')).toBe('Midcap');
        expect(normalizeCapLabel('8000000000')).toBe('Smallcap');
        expect(normalizeCapLabel('3000000000')).toBe('Smallcap');
        expect(normalizeCapLabel('50000000')).toBe('Microcap');
    });

    it('classifies Cr and Lakh suffixed values', () => {
        expect(normalizeCapLabel('50000 Cr')).toBe('Largecap');
        expect(normalizeCapLabel('₹5,000 Cr')).toBe('Midcap');
        expect(normalizeCapLabel('800 crores')).toBe('Smallcap');
        expect(normalizeCapLabel('100 cr')).toBe('Microcap');
        expect(normalizeCapLabel('500 lac')).toBe('Microcap');
    });

    it('returns Unknown for unrecognized text', () => {
        expect(normalizeCapLabel('ABCDEF')).toBe('Unknown');
        expect(normalizeCapLabel('n/a')).toBe('Unknown');
    });
});
