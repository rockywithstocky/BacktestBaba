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

describe('getReturnClass Heat Tiers', () => {
    const HEAT_TIER_1 = 2;
    const HEAT_TIER_2 = 5;
    const HEAT_TIER_3 = 10;

    const getReturnClass = (val) => {
        if (val === null || val === undefined || isNaN(val) || val === 0) return 'neutral';
        const sign = val > 0 ? 'pos' : 'neg';
        const abs = Math.abs(val);
        const tier = abs >= HEAT_TIER_3 ? 4 : abs >= HEAT_TIER_2 ? 3 : abs >= HEAT_TIER_1 ? 2 : 1;
        return `heat-${sign}-${tier}`;
    };

    it('maps positive tiers', () => {
        expect(getReturnClass(1.5)).toBe('heat-pos-1');
        expect(getReturnClass(2.0)).toBe('heat-pos-2');
        expect(getReturnClass(4.99)).toBe('heat-pos-2');
        expect(getReturnClass(5.0)).toBe('heat-pos-3');
        expect(getReturnClass(9.99)).toBe('heat-pos-3');
        expect(getReturnClass(10.0)).toBe('heat-pos-4');
        expect(getReturnClass(25)).toBe('heat-pos-4');
    });

    it('maps negative tiers as mirror image', () => {
        expect(getReturnClass(-1.5)).toBe('heat-neg-1');
        expect(getReturnClass(-2.0)).toBe('heat-neg-2');
        expect(getReturnClass(-4.99)).toBe('heat-neg-2');
        expect(getReturnClass(-5.0)).toBe('heat-neg-3');
        expect(getReturnClass(-10.0)).toBe('heat-neg-4');
        expect(getReturnClass(-25)).toBe('heat-neg-4');
    });

    it('handles zero-crossing tiny values', () => {
        expect(getReturnClass(0.001)).toBe('heat-pos-1');
        expect(getReturnClass(-0.001)).toBe('heat-neg-1');
    });

    it('returns neutral for zero, null, undefined, NaN', () => {
        expect(getReturnClass(0)).toBe('neutral');
        expect(getReturnClass(null)).toBe('neutral');
        expect(getReturnClass(undefined)).toBe('neutral');
        expect(getReturnClass(NaN)).toBe('neutral');
    });
});
