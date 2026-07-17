import { describe, it, expect } from 'vitest';

// Test the capitalReturn calculation logic that exists in Dashboard.jsx
// capitalReturn = (Number(capital) || 0) * (avg / 100)
// Where capital is the user's capital input and avg is the average return % for a period

function calculateCapitalReturn(capital, avgReturn) {
  return (Number(capital) || 0) * (avgReturn / 100);
}

function formatCurrency(value) {
  if (value == null || isNaN(value)) return '₹0.00';
  return '₹' + Math.abs(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getColorClass(value) {
  if (value == null || isNaN(value)) return '';
  return value > 0 ? 'positive' : value < 0 ? 'negative' : '';
}

describe('Dashboard Calculations', () => {
  describe('calculateCapitalReturn', () => {
    it('calculates correct capital return for a given capital and return percentage', () => {
      expect(calculateCapitalReturn(100000, 10)).toBe(10000);
      expect(calculateCapitalReturn(50000, 5)).toBe(2500);
      expect(calculateCapitalReturn(100000, -5)).toBe(-5000);
    });

    it('handles zero capital', () => {
      expect(calculateCapitalReturn(0, 10)).toBe(0);
      expect(calculateCapitalReturn(null, 10)).toBe(0);
      expect(calculateCapitalReturn(undefined, 10)).toBe(0);
    });
  });

  describe('formatCurrency', () => {
    it('formats positive values correctly', () => {
      const result = formatCurrency(10000);
      expect(result).toContain('₹');
      expect(result).toContain('10,000');
    });

    it('handles null/undefined/NaN', () => {
      expect(formatCurrency(null)).toBe('₹0.00');
      expect(formatCurrency(undefined)).toBe('₹0.00');
      expect(formatCurrency(NaN)).toBe('₹0.00');
    });
  });

  describe('getColorClass', () => {
    it('returns positive for positive values', () => {
      expect(getColorClass(5)).toBe('positive');
    });

    it('returns negative for negative values', () => {
      expect(getColorClass(-5)).toBe('negative');
    });

    it('returns empty string for zero, null, undefined', () => {
      expect(getColorClass(0)).toBe('');
      expect(getColorClass(null)).toBe('');
      expect(getColorClass(undefined)).toBe('');
    });
  });
});
