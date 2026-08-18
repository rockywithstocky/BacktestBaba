import { describe, it, expect } from 'vitest';
import { simulateStrategy, calculateTradeCharges, DEFAULT_SIMULATION_CONFIG } from '../utils/strategySimulator';

describe('Strategy Simulator & Friction Engine', () => {
    it('calculates trade charges correctly for Indian equity delivery', () => {
        const buyVal = 50000;
        const sellVal = 55000;
        const charges = calculateTradeCharges(buyVal, sellVal, 20);

        expect(charges).toBeGreaterThan(0);
        // Brokerage (40) + STT (55) + GST + Stamp duty + Turnover
        expect(charges).toBeGreaterThan(95);
        expect(charges).toBeLessThan(250);
    });

    it('returns empty fallback structure on empty trades array', () => {
        const result = simulateStrategy([], {});
        expect(result.simulatedTrades).toHaveLength(0);
        expect(result.equityCurve).toHaveLength(0);
        expect(result.quantMetrics.totalTrades).toBe(0);
        expect(result.quantMetrics.winRate).toBe(0);
    });

    it('simulates target hit and stop loss correctly', () => {
        const mockTrades = [
            {
                symbol: 'INFY.NS',
                signal_date: '2024-01-10',
                entry_date: '2024-01-11',
                entry_price: 1500,
                return_30d: 15.0,
                max_high_90d: 1750, // +16.6% -> should trigger 10% target
                max_low_90d: 1470,  // -2% -> will not trigger 5% SL
                status: 'Success'
            },
            {
                symbol: 'TCS.NS',
                signal_date: '2024-01-15',
                entry_date: '2024-01-16',
                entry_price: 3500,
                return_30d: -8.0,
                max_high_90d: 3550, // +1.4%
                max_low_90d: 3200,  // -8.5% -> should trigger 5% SL
                status: 'Success'
            }
        ];

        const result = simulateStrategy(mockTrades, {
            stopLossPercent: 5.0,
            targetPercent: 10.0,
            slippagePercent: 0.1,
            capitalPerTrade: 50000
        });

        expect(result.simulatedTrades).toHaveLength(2);
        
        const infy = result.simulatedTrades.find(t => t.symbol === 'INFY.NS');
        const tcs = result.simulatedTrades.find(t => t.symbol === 'TCS.NS');

        expect(infy.simulatedExitReason).toBe('Target Hit');
        expect(infy.isWinner).toBe(true);

        expect(tcs.simulatedExitReason).toBe('Stop Loss Hit');
        expect(tcs.isWinner).toBe(false);

        expect(result.quantMetrics.winRate).toBe(50);
        expect(result.quantMetrics.totalTrades).toBe(2);
        expect(result.equityCurve).toHaveLength(2);
    });

    it('generates monthly matrix accurately', () => {
        const mockTrades = [
            {
                symbol: 'RELIANCE.NS',
                signal_date: '2024-03-05',
                entry_date: '2024-03-06',
                entry_price: 2500,
                return_30d: 8.0,
                max_high_90d: 2800,
                max_low_90d: 2450,
                status: 'Success'
            }
        ];

        const result = simulateStrategy(mockTrades, { capitalPerTrade: 50000 });
        expect(result.monthlyMatrix['2024']).toBeDefined();
        expect(result.monthlyMatrix['2024'].months[3]).toBeDefined();
        expect(result.monthlyMatrix['2024'].months[3].count).toBe(1);
    });
});
