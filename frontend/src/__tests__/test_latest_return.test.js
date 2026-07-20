import { describe, it, expect } from 'vitest';

describe('Latest Return Column', () => {
    const formatPercent = (val) => {
        if (val === null || val === undefined || isNaN(val)) return 'N/A';
        return `${val >= 0 ? '+' : ''}${val.toFixed(2)}%`;
    };

    const getColorClass = (val) => {
        if (val === null || val === undefined) return '';
        return val >= 0 ? 'positive' : 'negative';
    };

    it('formats positive return', () => {
        expect(formatPercent(10.5)).toBe('+10.50%');
    });

    it('formats negative return', () => {
        expect(formatPercent(-5.2)).toBe('-5.20%');
    });

    it('formats null return as N/A', () => {
        expect(formatPercent(null)).toBe('N/A');
    });

    it('formats undefined return as N/A', () => {
        expect(formatPercent(undefined)).toBe('N/A');
    });

    it('formats NaN return as N/A', () => {
        expect(formatPercent(NaN)).toBe('N/A');
    });

    it('returns positive color class', () => {
        expect(getColorClass(5.0)).toBe('positive');
    });

    it('returns negative color class', () => {
        expect(getColorClass(-3.0)).toBe('negative');
    });

    it('returns empty color class for null', () => {
        expect(getColorClass(null)).toBe('');
    });

    it('returns empty color class for undefined', () => {
        expect(getColorClass(undefined)).toBe('');
    });
});
