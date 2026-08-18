import { describe, it, expect } from 'vitest';
import { buildModelPortfolio, generateBrokerBasketCSV } from '../utils/modelPortfolioEngine';
import { analyzeTopNextDayPicks, detectOptimalHorizon } from '../utils/technicalPatternEngine';

describe('Model Portfolio & Multi-Horizon Engine', () => {
    const mockTrades = [
        { symbol: 'TATACHEM.NS', status: 'Success', entry_price: 1000, max_high_90d: 1200, max_low_90d: 960, return_7d: 5.0, return_14d: 12.0, return_30d: 18.0, signal_date: '2026-08-15', sector: 'Chemicals' },
        { symbol: 'TATACHEM.NS', status: 'Success', entry_price: 1050, max_high_90d: 1250, max_low_90d: 1010, return_7d: 4.0, return_14d: 10.0, return_30d: 15.0, signal_date: '2026-08-10', sector: 'Chemicals' },
        { symbol: 'POLYCAB.NS', status: 'Success', entry_price: 5000, max_high_90d: 5800, max_low_90d: 4800, return_7d: 6.0, return_14d: 14.0, return_30d: 22.0, signal_date: '2026-08-14', sector: 'Industrials' },
        { symbol: 'BEL.NS', status: 'Success', entry_price: 250, max_high_90d: 310, max_low_90d: 240, return_7d: 3.5, return_14d: 8.5, return_30d: 14.0, signal_date: '2026-08-16', sector: 'Defence' },
        { symbol: 'DIXON.NS', status: 'Success', entry_price: 12000, max_high_90d: 14500, max_low_90d: 11500, return_7d: 7.0, return_14d: 16.0, return_30d: 25.0, signal_date: '2026-08-12', sector: 'Industrials' }
    ];

    it('detectOptimalHorizon detects best Sharpe horizon', () => {
        const res = detectOptimalHorizon(mockTrades);
        expect(res.bestHorizon).toBeDefined();
        expect(res.bestHorizonDays).toBeGreaterThan(0);
    });

    it('analyzeTopNextDayPicks adapts scoring when horizonStyle is BTST', () => {
        const btstPicks = analyzeTopNextDayPicks(mockTrades, { horizonStyle: 'btst_1_3d' });
        expect(btstPicks.length).toBeGreaterThan(0);
        expect(btstPicks[0].executionPlan.holdingHorizon).toContain('1 - 3 Days');
    });

    it('analyzeTopNextDayPicks adapts scoring when horizonStyle is Positional', () => {
        const posPicks = analyzeTopNextDayPicks(mockTrades, { horizonStyle: 'positional_30_90d' });
        expect(posPicks.length).toBeGreaterThan(0);
        expect(posPicks[0].executionPlan.holdingHorizon).toContain('30 - 90 Days');
    });

    it('buildModelPortfolio strictly honors Cash Buffer Reserve and never overflows total capital', () => {
        const ranked = analyzeTopNextDayPicks(mockTrades, { horizonStyle: 'swing_7_21d' });
        const portfolio = buildModelPortfolio(ranked, { 
            totalCapital: 500000, 
            maxPositions: 4, 
            maxSectorExposurePct: 40,
            cashReserveBufferPct: 10
        });

        expect(portfolio.positions.length).toBeGreaterThan(0);
        // Total invested MUST NOT exceed ₹4,50,000 (90% of ₹5,00,000)
        expect(portfolio.metrics.totalInvested).toBeLessThanOrEqual(450000);
        // Cash reserve MUST be at least ₹50,000 (10% buffer)
        expect(portfolio.metrics.cashReserve).toBeGreaterThanOrEqual(50000);
        expect(portfolio.metrics.cashReservePct).toBeGreaterThanOrEqual(10);
        expect(portfolio.positions[0].shares).toBeGreaterThan(0);
        expect(Number.isInteger(portfolio.metrics.totalInvested)).toBe(true);

        // Check CSV basket generation
        const csv = generateBrokerBasketCSV(portfolio.positions);
        expect(csv).toContain('Tradingsymbol');
        expect(csv).toContain('BUY');
    });

    it('buildModelPortfolio with 20% Cash Buffer maintains 20% cushion', () => {
        const ranked = analyzeTopNextDayPicks(mockTrades, { horizonStyle: 'swing_7_21d' });
        const portfolio = buildModelPortfolio(ranked, { 
            totalCapital: 500000, 
            maxPositions: 4, 
            cashReserveBufferPct: 20
        });

        expect(portfolio.metrics.totalInvested).toBeLessThanOrEqual(400000);
        expect(portfolio.metrics.cashReserve).toBeGreaterThanOrEqual(100000);
        expect(portfolio.metrics.cashReservePct).toBeGreaterThanOrEqual(20);
    });
});
