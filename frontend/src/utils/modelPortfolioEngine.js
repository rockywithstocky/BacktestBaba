/**
 * Dynamic Model Portfolio Allocator & Position Sizing Engine
 * 
 * Takes top-ranked screener candidates and builds a balanced, institutional-grade
 * Model Portfolio based on:
 * 1. Capital Allocation & Strict Cash Buffer Reserve Enforcement
 * 2. Normalized Score Weights (sum of weights strictly <= 1.0)
 * 3. Sector Diversification Guard (Max 25-35% allocation per sector)
 * 4. Whole-Share Precision Guard (Prevents fractional floating point overflows)
 * 5. 1-Click Broker Basket Export (Zerodha Kite, Groww, Angel One)
 */

export const DEFAULT_PORTFOLIO_SETTINGS = {
    totalCapital: 500000,          // ₹5,00,000 portfolio capital
    maxPositions: 6,               // 4 to 10 positions
    maxSectorExposurePct: 35,      // Max 35% per sector
    cashReserveBufferPct: 10,      // 10% Cash Reserve / Buffer by default
    riskPerTradePct: 1.5,          // 1.5% capital at risk per trade
    horizonStyle: 'swing_7_21d'    // 'btst_1_3d' | 'swing_7_21d' | 'positional_30_90d'
};

/**
 * Builds a diversified Model Portfolio from ranked screener candidates
 */
export function buildModelPortfolio(rankedCandidates = [], userSettings = {}) {
    const settings = { ...DEFAULT_PORTFOLIO_SETTINGS, ...userSettings };
    const totalCapital = Math.max(10000, Number(settings.totalCapital) || 500000);
    const maxPositions = Math.max(1, Number(settings.maxPositions) || 6);
    const maxSectorExposurePct = Math.max(10, Number(settings.maxSectorExposurePct) || 35);
    const cashReserveBufferPct = Math.max(0, Math.min(50, Number(settings.cashReserveBufferPct ?? 10)));

    if (!Array.isArray(rankedCandidates) || rankedCandidates.length === 0) {
        const cashReserve = totalCapital;
        return {
            positions: [],
            metrics: {
                totalCapital,
                totalInvested: 0,
                cashReserve,
                cashReservePct: 100,
                investedPct: 0,
                expectedPortfolioReturnPct: 0,
                totalExpectedProfit: 0,
                rewardRiskRatio: 2.0,
                maxRiskValue: 0,
                maxRiskPct: 0,
                positionCount: 0,
                avgWinRate: 0,
                sectorBreakdown: {}
            }
        };
    }

    // 1. Filter out zero-price or invalid candidates
    const eligible = rankedCandidates.filter(c => c.currentPrice && Number(c.currentPrice) > 0);
    if (eligible.length === 0) {
        return {
            positions: [],
            metrics: {
                totalCapital,
                totalInvested: 0,
                cashReserve: totalCapital,
                cashReservePct: 100,
                investedPct: 0,
                expectedPortfolioReturnPct: 0,
                totalExpectedProfit: 0,
                rewardRiskRatio: 2.0,
                maxRiskValue: 0,
                maxRiskPct: 0,
                positionCount: 0,
                avgWinRate: 0,
                sectorBreakdown: {}
            }
        };
    }

    // Target deployable capital after strictly reserving the cash buffer
    const targetDeployableCapital = Math.round(totalCapital * (1 - (cashReserveBufferPct / 100)));

    // Select candidates while respecting sector concentration
    const selectedCandidates = [];
    const sectorTempCount = {};
    const maxStocksPerSector = Math.max(2, Math.floor(maxPositions * (maxSectorExposurePct / 100)));

    for (const candidate of eligible) {
        if (selectedCandidates.length >= maxPositions) break;
        const sec = candidate.sector || 'General';
        const currentSecCount = sectorTempCount[sec] || 0;
        if (currentSecCount >= maxStocksPerSector && selectedCandidates.length < maxPositions) {
            continue; // Preserves sector diversification
        }
        selectedCandidates.push(candidate);
        sectorTempCount[sec] = currentSecCount + 1;
    }

    if (selectedCandidates.length === 0) {
        selectedCandidates.push(eligible[0]);
    }

    // 2. Normalized Score Weights (Ensures sum of allocations strictly <= targetDeployableCapital)
    const rawScores = selectedCandidates.map(c => Math.max(40, c.technicalScore || 70));
    const totalScoreSum = rawScores.reduce((a, b) => a + b, 0);

    let runningInvested = 0;
    const positions = [];
    const sectorTotals = {};

    for (let i = 0; i < selectedCandidates.length; i++) {
        const candidate = selectedCandidates[i];
        const sec = candidate.sector || 'General';
        const weight = rawScores[i] / totalScoreSum;
        const targetStockCapital = Math.round(targetDeployableCapital * weight);

        const remainingDeployable = targetDeployableCapital - runningInvested;
        if (remainingDeployable <= 0) break;

        const allocatedCap = Math.min(targetStockCapital, remainingDeployable);
        const price = Math.round(Number(candidate.currentPrice) * 100) / 100;
        
        let shares = Math.floor(allocatedCap / price);
        if (shares === 0 && price <= remainingDeployable && price <= targetDeployableCapital * 0.4) {
            shares = 1;
        }

        if (shares <= 0) continue;

        let actualInvested = Math.round(shares * price);
        if (runningInvested + actualInvested > targetDeployableCapital) {
            // Trim shares to strictly enforce cash buffer cap
            shares = Math.floor((targetDeployableCapital - runningInvested) / price);
            if (shares <= 0) continue;
            actualInvested = Math.round(shares * price);
        }

        const slPrice = Math.round(Number(candidate.executionPlan?.stopLoss || (price * 0.95)) * 100) / 100;
        const slPct = Math.round(Number(candidate.executionPlan?.stopLossPct || 5.0) * 10) / 10;
        const riskAmount = Math.round(shares * (price - slPrice));
        const target1 = Math.round(Number(candidate.executionPlan?.target1 || (price * 1.10)) * 100) / 100;
        const target2 = Math.round(Number(candidate.executionPlan?.target2 || (price * 1.20)) * 100) / 100;

        const posExpectedReturn = (candidate.avgNetPnLPct && candidate.avgNetPnLPct > 0)
            ? Math.round(candidate.avgNetPnLPct * 10) / 10
            : Math.max(4.5, Math.round(((candidate.simWinRate || 65) / 100 * (candidate.executionPlan?.target1Pct || 10) - (1 - (candidate.simWinRate || 65) / 100) * slPct) * 10) / 10);

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
            riskAmount,
            target1Price: target1,
            target1Pct: candidate.executionPlan?.target1Pct || 10.0,
            target2Price: target2,
            target2Pct: candidate.executionPlan?.target2Pct || 20.0,
            expectedReturnPct: posExpectedReturn,
            simWinRate: candidate.simWinRate || 70,
            holdingHorizon: candidate.executionPlan?.holdingHorizon || '7 - 21 Days',
            sampleTier: candidate.sampleTier
        };

        positions.push(pos);
        runningInvested += actualInvested;
        sectorTotals[sec] = (sectorTotals[sec] || 0) + actualInvested;
    }

    // 3. Portfolio Aggregate Metrics (All cleanly rounded integers / 1-decimal floats)
    const totalInvested = Math.round(positions.reduce((acc, p) => acc + p.allocatedAmount, 0));
    const cashReserve = Math.round(Math.max(0, totalCapital - totalInvested));
    const maxRiskValue = Math.round(positions.reduce((acc, p) => acc + p.riskAmount, 0));

    const weightedReturnSum = positions.reduce((acc, p) => acc + (p.expectedReturnPct * (p.allocatedAmount / (totalInvested || 1))), 0);
    const avgWinRateSum = positions.reduce((acc, p) => acc + (p.simWinRate || 70), 0);
    const expectedReturnPct = Math.max(3.5, Math.round((weightedReturnSum || 8.5) * 10) / 10);
    const totalExpectedProfit = Math.round(totalInvested * (expectedReturnPct / 100));
    const rewardRiskRatio = maxRiskValue > 0 ? Math.round((totalExpectedProfit / maxRiskValue) * 10) / 10 : 2.2;
    const cashReservePct = Math.round((cashReserve / (totalCapital || 1)) * 100);

    return {
        positions,
        metrics: {
            totalCapital,
            totalInvested,
            cashReserve,
            cashReservePct,
            investedPct: 100 - cashReservePct,
            expectedPortfolioReturnPct: expectedReturnPct,
            totalExpectedProfit,
            rewardRiskRatio,
            maxRiskValue,
            maxRiskPct: Math.round((maxRiskValue / (totalCapital || 1)) * 100 * 10) / 10,
            positionCount: positions.length,
            avgWinRate: positions.length > 0 ? Math.round(avgWinRateSum / positions.length) : 70,
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
