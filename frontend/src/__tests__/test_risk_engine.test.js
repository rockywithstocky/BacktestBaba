import { describe, it, expect } from 'vitest';
import {
    computeRiskPlan, costSingle, costLadder, costBreakdown,
    kellyFraction, symbolRiskProfile, tierConfig, riskBudget, vl
} from '../analyzer/riskEngine';

describe('vl (value loader)', () => {
    it('returns NaN for null/undefined', () => {
        expect(vl(null)).toBeNaN();
        expect(vl(undefined)).toBeNaN();
        expect(vl('')).toBeNaN();
    });
    it('parses numeric strings', () => {
        expect(vl('42.5')).toBe(42.5);
    });
    it('returns numbers as-is', () => {
        expect(vl(10)).toBe(10);
    });
});

describe('costSingle', () => {
    it('returns positive cost for a trade', () => {
        const c = costSingle(10000);
        expect(c).toBeGreaterThan(0);
        expect(c).toBeLessThan(100);
    });
    it('scales with price', () => {
        const c1 = costSingle(5000);
        const c2 = costSingle(10000);
        expect(c2).toBeGreaterThan(c1);
    });
    it('includes DP flat fee', () => {
        const c1 = costSingle(1000);
        const c2 = costSingle(100000);
        // DP fee is flat, so the difference should only be in variable costs
        expect(c2 - c1).toBeGreaterThan(0);
    });
});

describe('costLadder', () => {
    it('returns cost for 4-way ladder', () => {
        const c = costLadder(10000, 4);
        expect(c).toBeGreaterThan(0);
    });
    it('defaults to 4 legs', () => {
        expect(costLadder(5000)).toBe(costLadder(5000, 4));
    });
});

describe('costBreakdown', () => {
    it('returns all cost components', () => {
        const cb = costBreakdown(25000);
        expect(cb).toHaveProperty('stt');
        expect(cb).toHaveProperty('dp');
        expect(cb).toHaveProperty('stamp');
        expect(cb).toHaveProperty('txn');
        expect(cb).toHaveProperty('gst');
        expect(cb).toHaveProperty('total');
        expect(cb).toHaveProperty('pct');
        expect(cb.total).toBeGreaterThan(0);
        expect(cb.pct).toBeGreaterThan(0);
    });
});

describe('computeRiskPlan', () => {
    it('returns sensible defaults with basic inputs', () => {
        const plan = computeRiskPlan({
            capital: 100000,
            riskPercent: 2,
            stopLossPercent: 5,
            rrRatio: 2,
            entryPrice: 300,
            isLadder: false,
        });
        expect(plan.riskPerTrade).toBe(2000);
        expect(plan.shares).toBeGreaterThan(0);
        expect(plan.positionCost).toBeGreaterThan(0);
        expect(plan.targetReturn).toBeGreaterThan(0);
        expect(plan.netGain).toBeGreaterThan(0);
        expect(plan.netLoss).toBeGreaterThan(0);
    });

    it('handles zero capital gracefully', () => {
        const plan = computeRiskPlan({
            capital: 0,
            riskPercent: 2,
            stopLossPercent: 5,
            rrRatio: 2,
            entryPrice: 300,
        });
        expect(plan.shares).toBe(0);
        expect(plan.positionCost).toBe(0);
    });

    it('handles very high entry price', () => {
        const plan = computeRiskPlan({
            capital: 100000,
            riskPercent: 2,
            stopLossPercent: 5,
            rrRatio: 2,
            entryPrice: 50000,
        });
        expect(plan.shares).toBe(0);
    });

    it('computes correct R:R ratio', () => {
        const plan = computeRiskPlan({
            capital: 100000,
            riskPercent: 2,
            stopLossPercent: 5,
            rrRatio: 3,
            entryPrice: 500,
        });
        expect(plan.actualRR).toBeGreaterThan(0);
        expect(plan.targetReturn).toBeCloseTo(15, 0);
    });

    it('returns pctOfCapital', () => {
        const plan = computeRiskPlan({
            capital: 100000,
            riskPercent: 2,
            stopLossPercent: 5,
            rrRatio: 2,
            entryPrice: 300,
        });
        expect(plan.pctOfCapital).toBeGreaterThan(0);
        expect(plan.pctOfCapital).toBeLessThanOrEqual(100);
    });
});

describe('kellyFraction', () => {
    it('returns positive Kelly for winning strategy', () => {
        const k = kellyFraction(60, 10, 5);
        expect(k).toBeGreaterThan(0);
        expect(k).toBeLessThan(1);
    });
    it('returns null for losing strategy', () => {
        const k = kellyFraction(30, 5, 10);
        expect(k).toBeNull();
    });
    it('returns null for null inputs', () => {
        expect(kellyFraction(null, 10, 5)).toBeNull();
        expect(kellyFraction(60, null, 5)).toBeNull();
    });
});

describe('symbolRiskProfile', () => {
    const mockTrades = [
        { symbol: 'RELIANCE', entry_price: 2500, max_low_90d: 2300, max_high_90d: 2800, return_14d: 8.5 },
        { symbol: 'RELIANCE', entry_price: 2600, max_low_90d: 2400, max_high_90d: 2900, return_14d: 5.2 },
        { symbol: 'RELIANCE', entry_price: 2400, max_low_90d: 2100, max_high_90d: 2700, return_14d: -2.1 },
        { symbol: 'TCS', entry_price: 3500, max_low_90d: 3300, max_high_90d: 3800, return_14d: 3.0 },
    ];

    it('returns profile for symbol with multiple trades', () => {
        const rp = symbolRiskProfile(mockTrades, 'RELIANCE');
        expect(rp).not.toBeNull();
        expect(rp.trades).toBe(3);
        expect(rp.avgDrawdown).toBeGreaterThan(0);
        expect(rp.avgRunup).toBeGreaterThan(0);
        expect(rp.winRate).toBeGreaterThan(0);
    });

    it('returns null for insufficient data', () => {
        expect(symbolRiskProfile(mockTrades, 'HINDALCO')).toBeNull();
    });

    it('returns suggested stop/target', () => {
        const rp = symbolRiskProfile(mockTrades, 'RELIANCE');
        expect(rp.suggestedStop).toBeGreaterThanOrEqual(3);
        expect(rp.suggestedStop).toBeLessThanOrEqual(15);
        expect(rp.suggestedTarget).toBeGreaterThan(0);
    });

    it('returns null for single trade (insufficient)', () => {
        expect(symbolRiskProfile(mockTrades, 'TCS')).toBeNull();
    });
});

describe('tierConfig', () => {
    it('returns all 3 tiers', () => {
        const cfg = tierConfig(100000);
        expect(cfg).toHaveProperty('starter');
        expect(cfg).toHaveProperty('balanced');
        expect(cfg).toHaveProperty('growth');
        expect(cfg.starter.available).toBe(true);
    });

    it('balanced becomes available at 20K+', () => {
        const small = tierConfig(5000);
        expect(small.balanced.available).toBe(false);

        const large = tierConfig(20000);
        expect(large.balanced.available).toBe(true);
    });

    it('growth requires 60K+', () => {
        const small = tierConfig(50000);
        expect(small.growth.available).toBe(false);

        const large = tierConfig(60000);
        expect(large.growth.available).toBe(true);
    });

    it('position counts are positive integers', () => {
        const cfg = tierConfig(100000);
        expect(cfg.starter.positions).toBeGreaterThan(0);
        expect(cfg.balanced.positions).toBeGreaterThan(0);
    });
});

describe('riskBudget', () => {
    it('returns null for unavailable tier', () => {
        const rb = riskBudget('growth', 10000, 2);
        expect(rb).toBeNull();
    });

    it('returns budget for available tier', () => {
        const rb = riskBudget('balanced', 100000, 2);
        expect(rb).not.toBeNull();
        expect(rb.riskPerTrade).toBe(2000);
        expect(rb.maxPositionsByRisk).toBeGreaterThan(0);
        expect(rb.totalPositions).toBeGreaterThan(0);
        expect(rb.capacityPct).toBeGreaterThan(0);
    });
});
