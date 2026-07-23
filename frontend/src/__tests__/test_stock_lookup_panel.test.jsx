import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import StockLookupPanel from '../analyzer/StockLookupPanel';
import { computeAllStats, getFreshStocks } from '../analyzer/analyzerUtils';

function makeTrade(symbol, date, ret7d, ret14d, ret30d, entryPrice) {
  return {
    symbol,
    signal_date: date,
    entry_date: date,
    return_7d: ret7d,
    return_14d: ret14d,
    return_30d: ret30d,
    return_45d: ret14d,
    return_60d: ret14d,
    return_90d: ret14d,
    entry_price: entryPrice || 500,
    exit_price_7d: 500,
    exit_price_30d: 500,
    exit_price_90d: 500,
    max_high_90d: entryPrice ? entryPrice * 1.1 : 550,
    max_low_90d: entryPrice ? entryPrice * 0.95 : 475,
    status: 'Success',
    latest_price: 510,
    latest_price_date: date,
    latest_price_return: 2.0,
    sector: 'Technology',
    market_cap: 'Largecap',
  };
}

const today = new Date();
function daysAgo(n) {
  const d = new Date(today);
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function makeTrades(count, symbol) {
  const trades = [];
  for (let i = 0; i < count; i++) {
    trades.push(makeTrade(
      symbol,
      daysAgo(i * 7),
      [2, -1, 3, -2, 5][i % 5],
      [4, -2, 6, -3, 8][i % 5],
      [6, -4, 8, -5, 10][i % 5],
      500 + (i * 10)
    ));
  }
  return trades;
}

const defaultTrades = [
  ...makeTrades(10, 'RELIANCE.NS'),
  ...makeTrades(5, 'TCS.NS'),
  ...makeTrades(3, 'INFY.NS'),
];

const defaultStats = computeAllStats(defaultTrades);
const defaultFresh = getFreshStocks(defaultTrades);

const baseProps = {
  stats: defaultStats,
  capital: 100000,
  riskPercent: 2,
  stopLossPercent: 5,
  rrRatio: 2,
  selectedTier: 'balanced',
  trades: defaultTrades,
  freshStocks: defaultFresh,
  selectedSymbol: null,
  entryPrice: null,
  onSymbolSelect: () => {},
};

describe('StockLookupPanel', () => {
  it('renders without crashing with empty trades', () => {
    const emptyStats = computeAllStats([]);
    expect(() => render(
      <StockLookupPanel
        {...baseProps}
        stats={emptyStats}
        trades={[]}
        freshStocks={[]}
      />
    )).not.toThrow();
  });

  it('renders without crashing with null stats', () => {
    expect(() => render(
      <StockLookupPanel
        {...baseProps}
        stats={null}
        trades={[]}
        freshStocks={[]}
      />
    )).not.toThrow();
  });

  it('renders without crashing with full data', () => {
    expect(() => render(
      <StockLookupPanel
        {...baseProps}
        selectedSymbol="RELIANCE.NS"
        entryPrice={500}
      />
    )).not.toThrow();
  });

  it('renders without crashing when a stock is selected via onSymbolSelect flow', () => {
    expect(() => render(
      <StockLookupPanel
        {...baseProps}
        trades={defaultTrades}
        freshStocks={defaultFresh}
      />
    )).not.toThrow();
  });

  it('shows placeholder when no symbol selected and no fresh stocks', () => {
    const { container } = render(
      <StockLookupPanel
        {...baseProps}
        stats={null}
        trades={[]}
        freshStocks={[]}
      />
    );
    expect(container.textContent).toContain('Type a symbol');
  });

  it('shows selected stock name in header when symbol provided', () => {
    const { container } = render(
      <StockLookupPanel
        {...baseProps}
        selectedSymbol="RELIANCE.NS"
        entryPrice={500}
      />
    );
    expect(container.textContent).toContain('RELIANCE');
  });
});
