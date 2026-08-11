import { render, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Dashboard from '../components/Dashboard';

class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverStub;

const emptyReport = { trades: [], stats: null, best_performer: null, worst_performer: null };

const sampleTrade = {
    symbol: 'RELIANCE.NS', status: 'Success', market_cap: 'Largecap',
    signal_date: '2026-01-01', entry_date: '2026-01-02', close_price: 2500,
    entry_price: 2500, latest_price: 2600, latest_price_date: '2026-01-10',
    latest_price_return: 4.0, return_7d: 3.2, return_30d: -1.5, return_90d: 6.0
};

const tradesReport = {
    trades: [sampleTrade, { ...sampleTrade, symbol: 'TCS.NS', market_cap: undefined, return_7d: null, return_30d: null, return_90d: null, latest_price_return: null }],
    stats: null, best_performer: null, worst_performer: null
};

afterEach(cleanup);

describe('Dashboard render', () => {
    it('renders without crashing (useMemo factory ordering — no TDZ)', () => {
        expect(() =>
            render(
                <MemoryRouter>
                    <Dashboard report={emptyReport} onBack={() => {}} />
                </MemoryRouter>
            )
        ).not.toThrow();
    });

    it('renders heatmap and cap matrix with trade data', () => {
        expect(() =>
            render(
                <MemoryRouter>
                    <Dashboard report={tradesReport} onBack={() => {}} />
                </MemoryRouter>
            )
        ).not.toThrow();
    });
});
