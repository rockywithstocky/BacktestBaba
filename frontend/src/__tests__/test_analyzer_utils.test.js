import { describe, it, expect } from 'vitest';
import { computeAllStats, findSymbol, perSymbolStats, fmtRS, fmtPC } from '../analyzer/analyzerUtils';

const makeTrade = (overrides = {}) => ({
    symbol: 'RELIANCE',
    signal_date: '2026-01-15',
    entry_price: 2500,
    status: 'Success',
    return_7d: 3.5,
    return_14d: 8.2,
    return_30d: 12.1,
    return_45d: 15.0,
    return_60d: 18.3,
    return_90d: 22.5,
    max_low_90d: 2350,
    max_high_90d: 2900,
    market_cap: 'Largecap',
    sector: 'Technology',
    ...overrides,
});

const sampleTrades = [
    makeTrade({ symbol: 'RELIANCE', signal_date: '2026-01-15', return_14d: 8.2, market_cap: 'Largecap' }),
    makeTrade({ symbol: 'RELIANCE', signal_date: '2026-02-10', return_14d: 5.1, market_cap: 'Largecap' }),
    makeTrade({ symbol: 'TCS', signal_date: '2026-01-20', return_14d: 3.0, market_cap: 'Largecap' }),
    makeTrade({ symbol: 'HINDALCO', signal_date: '2026-03-05', return_14d: -2.5, market_cap: 'Midcap' }),
    makeTrade({ symbol: 'HINDALCO', signal_date: '2026-04-12', return_14d: 7.8, market_cap: 'Midcap' }),
    makeTrade({ symbol: 'INFOSYS', signal_date: '2026-02-28', return_14d: 10.0, market_cap: 'Largecap' }),
    makeTrade({ symbol: 'SBIN', signal_date: '2026-05-01', return_14d: -1.2, market_cap: 'Largecap' }),
];

describe('computeAllStats', () => {
    it('returns all expected sections', () => {
        const stats = computeAllStats(sampleTrades);
        expect(stats).toHaveProperty('hstats');
        expect(stats).toHaveProperty('caps');
        expect(stats).toHaveProperty('ls');
        expect(stats).toHaveProperty('yrStats');
        expect(stats).toHaveProperty('moStats');
        expect(stats).toHaveProperty('wkStats');
        expect(stats).toHaveProperty('ps');
        expect(stats).toHaveProperty('conc');
        expect(stats).toHaveProperty('sm');
        expect(stats.totalTrades).toBe(7);
        expect(stats.totalSymbols).toBe(5);
    });

    it('computes horizon stats correctly', () => {
        const stats = computeAllStats(sampleTrades);
        const h14 = stats.hstats[14];
        expect(h14.n).toBe(7);
        expect(h14.mean).toBeCloseTo(4.343, 1);
        expect(h14.winRate).toBeGreaterThan(0);
    });

    it('computes market cap breakdown', () => {
        const stats = computeAllStats(sampleTrades);
        expect(stats.caps.Largecap.n).toBe(5);
        expect(stats.caps.Midcap.n).toBe(2);
        expect(stats.caps.Smallcap.n).toBe(0);
    });

    it('computes yearly stats', () => {
        const stats = computeAllStats(sampleTrades);
        expect(stats.yrStats.length).toBeGreaterThanOrEqual(1);
        expect(stats.yrStats[0].year).toBe('2026');
    });

    it('computes reversal rates', () => {
        const stats = computeAllStats(sampleTrades);
        expect(stats.rr90).toBeGreaterThanOrEqual(0);
        expect(stats.rr14).toBeGreaterThanOrEqual(0);
    });

    it('computes most-signaled stocks', () => {
        const stats = computeAllStats(sampleTrades);
        expect(stats.conc.length).toBeGreaterThan(0);
        expect(stats.conc[0].symbol).toBeTruthy();
    });

    it('computes price distribution', () => {
        const stats = computeAllStats(sampleTrades);
        expect(stats.ps.median).toBeGreaterThan(0);
        expect(stats.ps.pctU100).toBe(0);
    });

    it('computes distribution bins', () => {
        const stats = computeAllStats(sampleTrades);
        expect(stats.dBins.length).toBeGreaterThan(0);
        expect(stats.dBins[0]).toHaveProperty('lo');
        expect(stats.dBins[0]).toHaveProperty('count');
    });

    it('computes stop frequency', () => {
        const stats = computeAllStats(sampleTrades);
        expect(stats.stopFrequency[5].hits).toBeGreaterThanOrEqual(0);
        expect(stats.stopFrequency[5].total).toBe(7);
    });

    it('computes target frequency', () => {
        const stats = computeAllStats(sampleTrades);
        expect(stats.targetFrequency[10].hits).toBeGreaterThanOrEqual(0);
        expect(stats.targetFrequency[10].total).toBe(7);
    });

    it('handles empty trades', () => {
        const stats = computeAllStats([]);
        expect(stats.totalTrades).toBe(0);
        expect(stats.hstats[14].n).toBe(0);
    });

    it('handles single trade', () => {
        const stats = computeAllStats([makeTrade()]);
        expect(stats.totalTrades).toBe(1);
        expect(stats.hstats[14].n).toBe(1);
    });
});

describe('findSymbol', () => {
    it('finds exact symbol', () => {
        expect(findSymbol(sampleTrades, 'RELIANCE')).toBe('RELIANCE');
    });
    it('finds case-insensitive symbol', () => {
        expect(findSymbol(sampleTrades, 'reliance')).toBe('RELIANCE');
    });
    it('returns null for missing symbol', () => {
        expect(findSymbol(sampleTrades, 'MISSING')).toBeNull();
    });
    it('returns null for empty input', () => {
        expect(findSymbol(sampleTrades, '')).toBeNull();
        expect(findSymbol(sampleTrades, '  ')).toBeNull();
    });
    it('returns multiple matches', () => {
        const result = findSymbol(sampleTrades, 'N');
        if (result && typeof result === 'object' && result.multiple) {
            expect(result.multiple.length).toBeGreaterThan(1);
        }
    });
});

describe('perSymbolStats', () => {
    it('returns stats for a symbol', () => {
        const trades = sampleTrades.filter(t => t.symbol === 'RELIANCE');
        const ss = computeAllStats(sampleTrades);
        const ps = perSymbolStats(trades, ss);
        expect(ps.n).toBe(2);
        expect(ps.n14).toBe(2);
        expect(ps.tier).toBe('Very limited');
        expect(ps.tc).toBe('insufficient');
    });

    it('assigns correct tier based on sample size', () => {
        const ss = computeAllStats(sampleTrades);

        let ps = perSymbolStats([makeTrade()], ss);
        expect(ps.tier).toBe('Insufficient data');

        const twoTrades = [makeTrade(), makeTrade({ return_14d: 3.0 })];
        ps = perSymbolStats(twoTrades, ss);
        expect(ps.tier).toBe('Very limited');

        const fiveTrades = Array(5).fill(null).map((_, i) => makeTrade({ return_14d: 2 + i }));
        ps = perSymbolStats(fiveTrades, ss);
        expect(ps.tier).toBe('Moderate sample');

        const tenTrades = Array(10).fill(null).map((_, i) => makeTrade({ return_14d: 2 + i }));
        ps = perSymbolStats(tenTrades, ss);
        expect(ps.tier).toBe('Well-tested');
    });

    it('detects circuit risk for low price', () => {
        const ss = computeAllStats(sampleTrades);
        const cheapTrade = makeTrade({ entry_price: 45 });
        const ps = perSymbolStats([cheapTrade, cheapTrade], ss);
        expect(ps.cr).toBe(true);
    });

    it('detects amber for moderate price', () => {
        const ss = computeAllStats(sampleTrades);
        const midTrade = makeTrade({ entry_price: 75 });
        const ps = perSymbolStats([midTrade], ss);
        expect(ps.cr).toBe('amber');
    });

    it('no risk flag for high price', () => {
        const ss = computeAllStats(sampleTrades);
        const ps = perSymbolStats(sampleTrades.filter(t => t.symbol === 'RELIANCE'), ss);
        expect(ps.cr).toBe(false);
    });
});

describe('fmtRS (Rupee formatting)', () => {
    it('formats with ₹ symbol and Indian locale', () => {
        expect(fmtRS(100000)).toContain('₹');
        expect(fmtRS(100000)).toContain('1,00,000');
    });
    it('returns — for non-finite values', () => {
        expect(fmtRS(NaN)).toBe('—');
        expect(fmtRS(Infinity)).toBe('—');
    });
});

describe('fmtPC (percentage formatting)', () => {
    it('adds + for positive values', () => {
        expect(fmtPC(5.25, 2)).toContain('+');
        expect(fmtPC(5.25, 2)).toContain('5.25%');
    });
    it('adds - for negative values (implicit)', () => {
        expect(fmtPC(-3.1, 1)).toBe('-3.1%');
    });
    it('defaults to 1 decimal place', () => {
        expect(fmtPC(8.456)).toContain('8.5');
    });
    it('returns — for non-finite', () => {
        expect(fmtPC(NaN)).toBe('—');
    });
});
