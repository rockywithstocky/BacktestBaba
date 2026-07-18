import { describe, it, expect } from 'vitest';

describe('Trade Table Column Order', () => {
    const COLUMNS = [
        'symbol',
        'signal_date',
        'signal_close_price',
        'entry_date',
        'entry_price',
        'latest_price_return',
        'return_7d',
        'return_30d',
        'return_90d',
        'max_high_90d',
        'max_low_90d',
    ];

    it('Latest Return must appear right after Entry (position 5)', () => {
        const entryIdx = COLUMNS.indexOf('entry_price');
        const latestRetIdx = COLUMNS.indexOf('latest_price_return');
        expect(latestRetIdx).toBe(entryIdx + 1);
    });

    it('Latest Return must appear before 1 Week Return', () => {
        const wkIdx = COLUMNS.indexOf('return_7d');
        const latestRetIdx = COLUMNS.indexOf('latest_price_return');
        expect(latestRetIdx).toBeLessThan(wkIdx);
    });
});

describe('Latest Return Tooltip', () => {
    const formatCurrency = (val) => {
        if (val == null || isNaN(val)) return '₹0.00';
        return '₹' + Math.abs(val).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const getLatestReturnTooltip = (trade) => {
        return trade.latest_price_date
            ? `Latest Price: ${formatCurrency(trade.latest_price)} (as of ${trade.latest_price_date})`
            : 'Latest Price: N/A';
    };

    it('shows latest_price and date, not percentage', () => {
        const tooltip = getLatestReturnTooltip({
            latest_price: 1100.50,
            latest_price_date: '2026-07-17'
        });
        expect(tooltip).toContain('Latest Price: ₹1,100.50');
        expect(tooltip).toContain('as of 2026-07-17');
        expect(tooltip).not.toContain('%');
    });

    it('shows N/A when no date', () => {
        const tooltip = getLatestReturnTooltip({
            latest_price: null,
            latest_price_date: null
        });
        expect(tooltip).toBe('Latest Price: N/A');
    });

    it('formats zero price correctly', () => {
        const tooltip = getLatestReturnTooltip({
            latest_price: 0,
            latest_price_date: '2026-07-17'
        });
        expect(tooltip).toContain('₹0.00');
    });
});
