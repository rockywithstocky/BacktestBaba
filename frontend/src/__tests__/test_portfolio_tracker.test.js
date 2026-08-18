import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deployPortfolio, listDeployedPortfolios, deleteDeployedPortfolio } from '../services/trackerApi';

describe('Frontend Portfolio Tracker Service', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    const mockPortfolio = {
        name: 'Test Forward Swing',
        deployment_date: '2026-08-18',
        entry_mode: 'next_open',
        exit_rule: 'partial_runner',
        optimal_horizon_days: 14,
        total_capital: 500000
    };

    const mockPositions = [
        { symbol: 'TATACHEM.NS', shares: 50, entryPrice: 1000, allocatedAmount: 50000, stopLossPrice: 950, target1Price: 1080, target2Price: 1150 }
    ];

    it('deployPortfolio saves to local cache on fallback and returns entity', async () => {
        const result = await deployPortfolio(mockPortfolio, mockPositions);
        expect(result).toBeDefined();
        expect(result.name).toBe('Test Forward Swing');
        expect(result.status).toBe('ACTIVE');

        const list = await listDeployedPortfolios();
        expect(list.length).toBe(1);
        expect(list[0].name).toBe('Test Forward Swing');
    });

    it('deleteDeployedPortfolio removes portfolio from cache', async () => {
        const result = await deployPortfolio(mockPortfolio, mockPositions);
        const pid = result.id;
        
        await deleteDeployedPortfolio(pid);
        const list = await listDeployedPortfolios();
        expect(list.find(p => p.id === pid)).toBeUndefined();
    });
});
