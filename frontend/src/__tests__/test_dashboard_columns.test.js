import { describe, it, expect } from 'vitest';

describe('Trade Table Column Order', () => {
    const COLUMNS = [
        'symbol',
        'signal_date',
        'signal_close_price',
        'entry_date',
        'entry_price',
        'latest_price',
        'return_7d',
        'return_30d',
        'return_90d',
        'max_high_90d',
        'max_low_90d',
    ];

    it('Latest Price must appear right after Entry (position 5)', () => {
        const entryIdx = COLUMNS.indexOf('entry_price');
        const latestPriceIdx = COLUMNS.indexOf('latest_price');
        expect(latestPriceIdx).toBe(entryIdx + 1);
    });

    it('Latest Price must appear before 1 Week Return', () => {
        const wkIdx = COLUMNS.indexOf('return_7d');
        const latestPriceIdx = COLUMNS.indexOf('latest_price');
        expect(latestPriceIdx).toBeLessThan(wkIdx);
    });
});

describe('Latest Price Tooltip (shows return)', () => {
    const formatPercent = (val) => {
        if (val === null || val === undefined || isNaN(val)) return 'N/A';
        return `${val >= 0 ? '+' : ''}${val.toFixed(2)}%`;
    };

    const getLatestPriceTooltip = (trade) => {
        return trade.latest_price_date
            ? `Return: ${formatPercent(trade.latest_price_return)} (since ${trade.latest_price_date})`
            : 'Return: N/A';
    };

    it('shows return percentage and date, not price', () => {
        const tooltip = getLatestPriceTooltip({
            latest_price_return: -0.98,
            latest_price_date: '2026-07-17'
        });
        expect(tooltip).toContain('Return: -0.98%');
        expect(tooltip).toContain('since 2026-07-17');
    });

    it('shows N/A when no date', () => {
        const tooltip = getLatestPriceTooltip({
            latest_price_return: null,
            latest_price_date: null
        });
        expect(tooltip).toBe('Return: N/A');
    });

    it('shows positive return with + sign', () => {
        const tooltip = getLatestPriceTooltip({
            latest_price_return: 5.25,
            latest_price_date: '2026-07-19'
        });
        expect(tooltip).toContain('Return: +5.25%');
    });
});
