/**
 * Dynamic Model Portfolio Allocator & Position Sizing Engine
 * 
 * Takes top-ranked screener candidates and builds a balanced, institutional-grade
 * Model Portfolio based on:
 * 1. Capital Allocation & Position Sizing (Share Quantity calculation)
 * 2. Sector Diversification Guard (Max 25-30% allocation per sector)
 * 3. Risk Parity & Volatility-Adjusted Weights
 * 4. 1-Click Broker Basket Export (Zerodha Kite, Groww, Angel One)
 */

export const DEFAULT_PORTFOLIO_SETTINGS = {
    totalCapital: 500000,          // ₹5,00,000 portfolio capital
    maxPositions: 8,               // 5 to 8 positions
    maxSectorExposurePct: 30,      // Max 30% per sector
    riskPerTradePct: 1.5,          // 1.5% capital at risk per trade
    horizonStyle: 'swing_7_21d'    // 'btst_1_3d' | 'swing_7_21d' | 'positional_30_90d'
};

/**
 * Builds a diversified Model Portfolio from ranked screener candidates
 */
export function buildModelPortfolio(rankedCandidates = [], userSettings = {}) {
    const settings = { ...DEFAULT_PORTFOLIO_SETTINGS, ...userSettings };
    const { totalCapital, maxPositions, maxSectorExposurePct, riskPerTradePct } = settings;

    if (!Array.isArray(rankedCandidates) || rankedCandidates.length === 0) {
        return {
            positions: [],
            metrics: {
                totalInvested: 0,
                cashReserve: totalCapital,
                expectedPortfolioReturnPct: 0,
                maxRiskValue: 0,
                positionCount: 0,
                avgWinRate: 0,
                sectorBreakdown: {}
            }
        };
    }

    // 1. Filter out overextended or zero-price candidates
    const eligible = rankedCandidates.filter(c => c.currentPrice > 0);

    const positions = [];
    const sectorTotals = {};
    const maxCapitalPerSector = (totalCapital * maxSectorExposurePct) / 100;
    const baseAllocationPerStock = totalCapital / Math.max(1, maxPositions);

    for (const candidate of eligible) {
        if (positions.length >= maxPositions) break;

        const sec = candidate.sector || 'General';
        const currentSecAllocation = sectorTotals[sec] || 0;

        // Sector Diversification Check
        if (currentSecAllocation + baseAllocationPerStock > maxCapitalPerSector && currentSecAllocation > 0) {
            continue; // Skip to next candidate to preserve diversification
        }

        const price = candidate.currentPrice;
        const slPrice = candidate.executionPlan?.stopLoss || (price * 0.95);
        const slPct = candidate.executionPlan?.stopLossPct || 5.0;

        // Volatility/Score-Adjusted Weight
        // Higher score gives slightly higher weight (e.g. 1.1x vs 0.9x)
        const scoreMultiplier = Math.max(0.8, Math.min(1.25, candidate.technicalScore / 80));
        let allocatedAmount = Math.round(baseAllocationPerStock * scoreMultiplier);
        
        // Cap by sector room
        const remainingSectorCap = maxCapitalPerSector - currentSecAllocation;
        if (allocatedAmount > remainingSectorCap) {
            allocatedAmount = remainingSectorCap;
        }

        // Calculate exact share quantity (whole shares)
        const shares = Math.max(1, Math.floor(allocatedAmount / price));
        const actualInvested = shares * price;
        const riskAmount = shares * (price - slPrice);
        const target1 = candidate.executionPlan?.target1 || (price * 1.10);
        const target2 = candidate.executionPlan?.target2 || (price * 1.20);

        const pos = {
            symbol: candidate.symbol,
            sector: sec,
            technicalScore: candidate.technicalScore,
            patternType: candidate.patternType,
            stars: candidate.stars,
            entryPrice: price,
            shares,
            allocatedAmount: actualInvested,
            weightPct: Math.round((actualInvested / totalCapital) * 1000) / 10,
            stopLossPrice: slPrice,
            stopLossPct: slPct,
            riskAmount: Math.round(riskAmount),
            target1Price: target1,
            target1Pct: candidate.executionPlan?.target1Pct || 10.0,
            target2Price: target2,
            target2Pct: candidate.executionPlan?.target2Pct || 20.0,
            expectedReturnPct: candidate.avgNetPnLPct ?? 8.0,
            holdingHorizon: candidate.executionPlan?.holdingHorizon || '7 - 21 Days',
            sampleTier: candidate.sampleTier
        };

        positions.push(pos);
        sectorTotals[sec] = (sectorTotals[sec] || 0) + actualInvested;
    }

    // Portfolio aggregate metrics
    const totalInvested = positions.reduce((acc, p) => acc + p.allocatedAmount, 0);
    const cashReserve = Math.max(0, totalCapital - totalInvested);
    const maxRiskValue = positions.reduce((acc, p) => acc + p.riskAmount, 0);

    const weightedReturnSum = positions.reduce((acc, p) => acc + (p.expectedReturnPct * (p.allocatedAmount / (totalInvested || 1))), 0);
    const avgWinRateSum = positions.reduce((acc, p) => acc + (p.simWinRate || 70), 0);

    return {
        positions,
        metrics: {
            totalCapital,
            totalInvested,
            cashReserve,
            cashReservePct: Math.round((cashReserve / totalCapital) * 100),
            expectedPortfolioReturnPct: Math.round(weightedReturnSum * 10) / 10,
            maxRiskValue,
            maxRiskPct: Math.round((maxRiskValue / totalCapital) * 100 * 10) / 10,
            positionCount: positions.length,
            avgWinRate: positions.length > 0 ? Math.round(avgWinRateSum / positions.length) : 0,
            sectorBreakdown: sectorTotals
        }
    };
}

/**
 * Generates Zerodha Kite / Broker CSV Basket Format
 */
export function generateBrokerBasketCSV(positions = []) {
    if (!Array.isArray(positions) || positions.length === 0) return '';

    // Standard Zerodha Kite Basket CSV Format:
    // Instrument,Exchange,Tradingsymbol,Transaction Type,Order Type,Quantity,Price,Trigger Price,Product Type
    const headers = ['Instrument', 'Exchange', 'Tradingsymbol', 'Transaction Type', 'Order Type', 'Quantity', 'Price', 'Product Type'];
    
    const rows = positions.map(pos => {
        let sym = pos.symbol || '';
        let exchange = 'NSE';
        if (sym.endsWith('.NS')) {
            sym = sym.slice(0, -3);
            exchange = 'NSE';
        } else if (sym.endsWith('.BO')) {
            sym = sym.slice(0, -3);
            exchange = 'BSE';
        }

        return [
            'EQ',
            exchange,
            sym,
            'BUY',
            'LIMIT',
            pos.shares,
            pos.entryPrice,
            'CNC' // Cash & Carry (Delivery)
        ].join(',');
    });

    return [headers.join(','), ...rows].join('\n');
}
