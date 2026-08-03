import { describe, it, expect } from 'vitest';

const sortHeatmapRows = (trades, cap = 150) => {
    return [...trades]
        .sort((a, b) => {
            const aDate = a.signal_date ? new Date(a.signal_date).getTime() : -Infinity;
            const bDate = b.signal_date ? new Date(b.signal_date).getTime() : -Infinity;
            if (bDate !== aDate) return bDate - aDate;
            return a.symbol.localeCompare(b.symbol);
        })
        .slice(0, cap);
};

const makeTrade = (overrides) => ({
    symbol: 'TEST', signal_date: '2026-01-01',
    latest_price_return: 4, return_7d: 3.2, return_30d: -1.5, return_90d: 6,
    ...overrides,
});

describe('sortHeatmapRows', () => {
    it('sorts newest signal date first', () => {
        const result = sortHeatmapRows([
            makeTrade({ symbol: 'A', signal_date: '2026-01-01' }),
            makeTrade({ symbol: 'B', signal_date: '2026-03-15' }),
            makeTrade({ symbol: 'C', signal_date: '2026-02-10' }),
        ]);
        expect(result.map(t => t.symbol)).toEqual(['B', 'C', 'A']);
    });

    it('sinks trades with missing signal dates to the bottom', () => {
        const result = sortHeatmapRows([
            makeTrade({ symbol: 'A', signal_date: '2026-01-01' }),
            makeTrade({ symbol: 'B', signal_date: null }),
            makeTrade({ symbol: 'C', signal_date: '2026-02-01' }),
            makeTrade({ symbol: 'D', signal_date: undefined }),
        ]);
        expect(result.map(t => t.symbol)).toEqual(['C', 'A', 'B', 'D']);
    });

    it('caps the result at 150 rows by default', () => {
        const trades = Array.from({ length: 200 }, (_, i) => makeTrade({
            symbol: `S${i}`,
            signal_date: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`,
        }));
        const result = sortHeatmapRows(trades);
        expect(result).toHaveLength(150);
    });

    it('breaks date ties by symbol ascending', () => {
        const result = sortHeatmapRows([
            makeTrade({ symbol: 'ZEBRA', signal_date: '2026-01-01' }),
            makeTrade({ symbol: 'ALPHA', signal_date: '2026-01-01' }),
            makeTrade({ symbol: 'MID', signal_date: '2026-01-01' }),
        ]);
        expect(result.map(t => t.symbol)).toEqual(['ALPHA', 'MID', 'ZEBRA']);
    });

    it('respects a custom cap', () => {
        const trades = Array.from({ length: 10 }, (_, i) => makeTrade({ symbol: `S${i}` }));
        expect(sortHeatmapRows(trades, 3)).toHaveLength(3);
    });

    it('does not mutate the input array', () => {
        const trades = [makeTrade({ symbol: 'A', signal_date: '2026-01-01' }), makeTrade({ symbol: 'B', signal_date: '2026-02-01' })];
        sortHeatmapRows(trades);
        expect(trades.map(t => t.symbol)).toEqual(['A', 'B']);
    });

    it('returns empty array for no trades', () => {
        expect(sortHeatmapRows([])).toEqual([]);
    });
});
