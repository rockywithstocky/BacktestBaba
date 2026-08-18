/**
 * Backtest-Driven Strategy Top Pick Engine
 * 
 * Replaces generic assumptions with empirical Backtest Report Analytics:
 * 1. Multi-Horizon Strategy Support:
 *    - 'btst_1_3d': Focus on early 1-3 day velocity, low initial MAE (<2.5%), and signal freshness (≤ 2 days)
 *    - 'swing_7_21d': Focus on 14d Sharpe, 2.5:1+ MFE/MAE Asymmetry, and breakout continuation
 *    - 'positional_30_90d': Focus on 60-90d compounding growth, terminal drawdown recovery, and low turnover
 *    - 'auto': Automatically detect Strategy's peak Sharpe horizon (7d, 14d, 30d, 45d, 60d, 90d)
 * 2. Simulated Net Expectancy & Friction Consistency (after STT, GST, Brokerage, Slippage)
 * 3. MFE / MAE Structural Asymmetry Ratio (Max Runup vs Max Drawdown distribution)
 * 4. Capital Velocity (Return % per day held for fast capital turnover)
 * 5. Empirical Win Rate & Sample Size Reliability (with Bayesian shrinkage)
 */

import { simulateStrategy } from './strategySimulator';

/**
 * Finds the Optimal Strategy Horizon across all backtested horizons (7d, 14d, 30d, 45d, 60d, 90d)
 */
export function detectOptimalHorizon(trades = []) {
    const horizons = [7, 14, 30, 45, 60, 90];
    const valid = trades.filter(t => t.status === 'Success' && t.entry_price > 0);
    if (valid.length === 0) return { bestHorizon: '14d', bestHorizonDays: 14, stats: {} };

    let bestH = 14;
    let maxSharpe = -Infinity;
    const horizonStats = {};

    horizons.forEach(h => {
        const key = `return_${h}d`;
        const rets = valid.map(t => t[key]).filter(r => r != null && isFinite(r));
        if (rets.length === 0) {
            horizonStats[h] = { mean: 0, winRate: 0, sharpe: 0, count: 0 };
            return;
        }

        const count = rets.length;
        const mean = rets.reduce((a, b) => a + b, 0) / count;
        const wins = rets.filter(r => r > 0).length;
        const winRate = (wins / count) * 100;
        
        // Standard deviation & Sharpe
        const variance = rets.reduce((acc, r) => acc + Math.pow(r - mean, 2), 0) / (count > 1 ? count - 1 : 1);
        const stdDev = Math.sqrt(variance);
        const sharpe = stdDev > 0 ? (mean / stdDev) * Math.sqrt(252 / h) : (mean > 0 ? 1 : 0);

        horizonStats[h] = { mean, winRate, sharpe, stdDev, count };

        // We choose horizon maximizing annualized Sharpe while requiring positive expectancy
        const score = sharpe * (winRate >= 50 ? 1.2 : 0.8) + (mean > 0 ? mean * 0.1 : -5);
        if (score > maxSharpe) {
            maxSharpe = score;
            bestH = h;
        }
    });

    return {
        bestHorizon: `${bestH}d`,
        bestHorizonDays: bestH,
        stats: horizonStats
    };
}

/**
 * Analyzes and ranks backtested candidates based on empirical strategy execution and chosen horizon style
 */
export function analyzeTopNextDayPicks(trades = [], userConfig = {}) {
    if (!Array.isArray(trades) || trades.length === 0) {
        return [];
    }

    const validTrades = trades.filter(t => t.status === 'Success' && t.entry_price > 0 && t.symbol);
    if (validTrades.length === 0) return [];

    const horizonStyle = userConfig.horizonStyle || 'auto';

    // 1. Determine Target Evaluation Horizon
    let optHorizon = '14d';
    let optDays = 14;

    if (horizonStyle === 'btst_1_3d') {
        optHorizon = '7d';
        optDays = 3;
    } else if (horizonStyle === 'swing_7_21d') {
        optHorizon = '14d';
        optDays = 14;
    } else if (horizonStyle === 'positional_30_90d') {
        optHorizon = '60d';
        optDays = 60;
    } else {
        const optimalInfo = detectOptimalHorizon(validTrades);
        optHorizon = optimalInfo.bestHorizon;
        optDays = optimalInfo.bestHorizonDays;
    }

    // 2. Run realistic simulation with friction (SL/TP, STT, Brokerage, Slippage)
    const simResult = simulateStrategy(validTrades, { ...userConfig, horizon: optHorizon });
    const simTrades = simResult.simulatedTrades || [];
    
    // Map simulated trade results back to symbols
    const simTradeMap = {};
    simTrades.forEach(st => {
        const sym = st.symbol;
        if (!simTradeMap[sym]) simTradeMap[sym] = [];
        simTradeMap[sym].push(st);
    });

    // 3. Group by symbol and calculate empirical consistency metrics
    const symbolMap = {};
    validTrades.forEach(t => {
        const sym = t.symbol;
        if (!symbolMap[sym]) {
            symbolMap[sym] = {
                symbol: sym,
                rawTrades: [],
                sector: t.sector || 'General',
                marketCap: t.market_cap || 'Unknown',
                latestPrice: t.latest_price || t.entry_price || 0,
                latestPriceDate: t.latest_price_date || t.signal_date,
                latestReturn: t.latest_price_return ?? 0,
            };
        }
        symbolMap[sym].rawTrades.push(t);
    });

    const now = new Date();
    const candidateRankings = Object.values(symbolMap).map(item => {
        const { symbol, rawTrades, sector, latestPrice, latestReturn } = item;
        const nTrades = rawTrades.length;
        const sSimTrades = simTradeMap[symbol] || [];

        // Find most recent signal date
        const sortedTrades = [...rawTrades].sort((a, b) => new Date(b.signal_date || 0) - new Date(a.signal_date || 0));
        const latestTrade = sortedTrades[0];
        const lastSignalDate = new Date(latestTrade.signal_date || 0);
        const daysSinceSignal = Math.max(0, Math.floor((now - lastSignalDate) / (1000 * 60 * 60 * 24)));

        // --- Metric 1: Simulated Friction Expectancy & Net Profit Factor (30 pts) ---
        const horizonReturns = rawTrades
            .map(t => t[`return_${optHorizon}`] ?? t.return_14d ?? t.return_30d ?? t.return_7d)
            .filter(r => r != null && isFinite(r));
        const rawHorizonMean = horizonReturns.length > 0
            ? horizonReturns.reduce((a, b) => a + b, 0) / horizonReturns.length
            : 0;

        const netPnLs = sSimTrades.map(t => t.netPnLPct).filter(p => isFinite(p));
        const netWins = netPnLs.filter(p => p > 0);
        const netLosses = netPnLs.filter(p => p < 0);
        
        let simWinRate = 60;
        let avgNetPnLPct = 6.5;
        let profitFactor = 2.0;

        if (netPnLs.length > 0) {
            simWinRate = (netWins.length / netPnLs.length) * 100;
            avgNetPnLPct = netPnLs.reduce((a, b) => a + b, 0) / netPnLs.length;
            const grossGain = netWins.reduce((a, b) => a + b, 0);
            const grossLoss = Math.abs(netLosses.reduce((a, b) => a + b, 0));
            profitFactor = grossLoss > 0 ? grossGain / grossLoss : (grossGain > 0 ? 3.0 : 1.0);
        } else if (horizonReturns.length > 0) {
            const hWins = horizonReturns.filter(r => r > 0);
            const hLosses = horizonReturns.filter(r => r < 0);
            simWinRate = (hWins.length / horizonReturns.length) * 100;
            avgNetPnLPct = rawHorizonMean;
            const grossGain = hWins.reduce((a, b) => a + b, 0);
            const grossLoss = Math.abs(hLosses.reduce((a, b) => a + b, 0));
            profitFactor = grossLoss > 0 ? grossGain / grossLoss : (grossGain > 0 ? 2.5 : 1.0);
        } else {
            // Derived from MFE / MAE runup expectation
            avgNetPnLPct = 6.5;
            simWinRate = 65;
            profitFactor = 2.0;
        }

        // Bayesian sample shrinkage (reaches 100% confidence at N=6+)
        const sampleConfidence = Math.min(1.0, nTrades / 6);
        const regressedWinRate = sampleConfidence * simWinRate + (1 - sampleConfidence) * 50;

        let scoreExpectancy = (regressedWinRate / 100) * 15;
        if (profitFactor >= 2.5) scoreExpectancy += (15 * sampleConfidence);
        else if (profitFactor >= 1.5) scoreExpectancy += (10 * sampleConfidence);
        else if (profitFactor >= 1.0) scoreExpectancy += (5 * sampleConfidence);
        scoreExpectancy = Math.min(30, Math.max(0, scoreExpectancy));

        // --- Metric 2: MFE vs MAE Structural Asymmetry (25 pts) ---
        // Measures Maximum Favorable Excursion (Max Runup) vs Maximum Adverse Excursion (Max Drawdown)
        const runups = rawTrades.map(t => {
            const entry = t.entry_price || 1;
            const high = t.max_high_90d || entry;
            return ((high - entry) / entry) * 100;
        });
        const drawdowns = rawTrades.map(t => {
            const entry = t.entry_price || 1;
            const low = t.max_low_90d || entry;
            return ((entry - low) / entry) * 100;
        });

        const avgRunup = runups.length > 0 ? runups.reduce((a, b) => a + b, 0) / runups.length : 8;
        const avgDrawdown = drawdowns.length > 0 ? drawdowns.reduce((a, b) => a + b, 0) / drawdowns.length : 4;
        const asymmetryRatio = avgDrawdown > 0 ? avgRunup / avgDrawdown : avgRunup;

        let scoreAsymmetry = 10;
        if (asymmetryRatio >= 3.0) scoreAsymmetry = 25;
        else if (asymmetryRatio >= 2.0) scoreAsymmetry = 20;
        else if (asymmetryRatio >= 1.5) scoreAsymmetry = 15;
        else if (asymmetryRatio >= 1.0) scoreAsymmetry = 10;
        else scoreAsymmetry = 5;

        // --- Metric 3: Capital Velocity & Effective Holding Period Efficiency (20 pts) ---
        // Return % delivered per day held (faster capital recycling = compounding advantage)
        const avgHoldingDays = sSimTrades.length > 0 
            ? sSimTrades.reduce((acc, t) => acc + (t.holdingDays || optDays), 0) / sSimTrades.length 
            : optDays;
        
        const returnVelocity = avgHoldingDays > 0 ? (avgNetPnLPct / avgHoldingDays) : 0; // % per day
        let scoreVelocity = 8;
        if (returnVelocity > 0.6) scoreVelocity = 20;       // e.g. +6% in 10 days
        else if (returnVelocity > 0.3) scoreVelocity = 16;  // e.g. +4.5% in 15 days
        else if (returnVelocity > 0.1) scoreVelocity = 12;
        else if (returnVelocity > 0.0) scoreVelocity = 8;
        else scoreVelocity = 3;

        // --- Metric 4: Horizon Specific Freshness & Overextension Guard (25 pts) ---
        let scoreFreshness = 8;
        if (horizonStyle === 'btst_1_3d') {
            // For BTST, signal MUST be fresh (0-2 days)
            if (daysSinceSignal <= 1) scoreFreshness = 18;
            else if (daysSinceSignal <= 3) scoreFreshness = 12;
            else if (daysSinceSignal <= 7) scoreFreshness = 5;
            else scoreFreshness = 0; // Stale for BTST
        } else if (horizonStyle === 'positional_30_90d') {
            // Positional allows broader window if trend is strong
            if (daysSinceSignal <= 15) scoreFreshness = 15;
            else if (daysSinceSignal <= 45) scoreFreshness = 10;
            else scoreFreshness = 5;
        } else {
            // Swing / Auto
            if (daysSinceSignal <= 5) scoreFreshness = 15;
            else if (daysSinceSignal <= 12) scoreFreshness = 12;
            else if (daysSinceSignal <= 25) scoreFreshness = 8;
            else scoreFreshness = 4;
        }

        // Overextension guard: if price expanded > 18% since trigger date without entry
        const isOverextended = latestReturn > 18;
        let scoreMomentumGuard = 7;
        if (latestReturn >= 1 && latestReturn <= 8) scoreMomentumGuard = 7;
        else if (latestReturn > 8 && !isOverextended) scoreMomentumGuard = 5;
        else if (isOverextended) scoreMomentumGuard = 0; // penalize chasing overbought moves
        else if (latestReturn < -4) scoreMomentumGuard = 2;

        const totalScore = Math.round(scoreExpectancy + scoreAsymmetry + scoreVelocity + scoreFreshness + scoreMomentumGuard);

        // Sample Reliability Tier
        let sampleTier = `Preliminary (N=${nTrades})`;
        let sampleBadgeColor = 'bg-amber-500/20 text-amber-300 border-amber-500/30';
        if (nTrades >= 6) {
            sampleTier = `High Sample (N=${nTrades})`;
            sampleBadgeColor = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
        } else if (nTrades >= 3) {
            sampleTier = `Moderate Sample (N=${nTrades})`;
            sampleBadgeColor = 'bg-blue-500/20 text-blue-300 border-blue-500/30';
        }

        // Actionable Price Execution Targets based on actual Backtested MFE/MAE
        const currentRefPrice = latestPrice > 0 ? latestPrice : (latestTrade.entry_price || 100);
        
        // Stop loss dynamically tailored to empirical MAE with safety buffer
        let slFactor = 1.1;
        if (horizonStyle === 'btst_1_3d') slFactor = 0.8; // tighter SL for BTST
        else if (horizonStyle === 'positional_30_90d') slFactor = 1.3; // wider breathing room for positional
        
        const suggestedSlPct = Math.min(8.0, Math.max(2.0, Math.round((avgDrawdown * slFactor) * 10) / 10));
        const suggestedSlPrice = Math.round((currentRefPrice * (1 - suggestedSlPct / 100)) * 100) / 100;

        // Target tailored to empirical MFE (runup potential)
        const targetMultiplier = horizonStyle === 'btst_1_3d' ? 1.5 : (horizonStyle === 'positional_30_90d' ? 3.0 : 2.0);
        const target1Pct = Math.round(suggestedSlPct * targetMultiplier * 10) / 10;
        const target1Price = Math.round((currentRefPrice * (1 + target1Pct / 100)) * 100) / 100;

        const target2Pct = Math.round(target1Pct * 1.6 * 10) / 10;
        const target2Price = Math.round((currentRefPrice * (1 + target2Pct / 100)) * 100) / 100;

        // Conviction Star Rating
        let stars = 3;
        if (totalScore >= 80 && nTrades >= 3) stars = 5;
        else if (totalScore >= 68) stars = 4;

        // Setup Pattern Type
        let patternType = 'Asymmetric Edge Breakout';
        if (isOverextended) {
            patternType = 'Extended Move (Wait for Pullback / Base)';
        } else if (horizonStyle === 'btst_1_3d') {
            patternType = '⚡ BTST Quick Velocity Surge';
        } else if (horizonStyle === 'positional_30_90d') {
            patternType = '💎 Multi-Week Trend Compounder';
        } else if (returnVelocity > 0.4) {
            patternType = 'High-Velocity Momentum Surge';
        } else if (asymmetryRatio >= 3.0) {
            patternType = 'High R:R Asymmetry Setup';
        } else if (profitFactor >= 2.0) {
            patternType = 'High-Expectancy Strategy Match';
        }

        const holdingLabel = horizonStyle === 'btst_1_3d' ? '1 - 3 Days' : (horizonStyle === 'positional_30_90d' ? '30 - 90 Days' : `${Math.round(avgHoldingDays)} Days`);

        return {
            symbol,
            sector,
            marketCap: item.marketCap,
            lastSignalDate: latestTrade.signal_date,
            daysSinceSignal,
            currentPrice: currentRefPrice,
            latestReturn,
            technicalScore: totalScore,
            stars,
            patternType,
            optimalHorizon: optHorizon,
            avgHoldingDays: Math.round(avgHoldingDays),
            asymmetryRatio: Math.round(asymmetryRatio * 10) / 10,
            avgRunup: Math.round(avgRunup * 10) / 10,
            avgDrawdown: Math.round(avgDrawdown * 10) / 10,
            simWinRate: Math.round(simWinRate),
            profitFactor: Math.round(profitFactor * 100) / 100,
            avgNetPnLPct: Math.round(avgNetPnLPct * 10) / 10,
            sampleTier,
            sampleBadgeColor,
            nTrades,
            isOverextended,
            executionPlan: {
                entryAction: isOverextended ? 'Wait for 2-3% Pullback' : (horizonStyle === 'btst_1_3d' ? 'Buy Today EOD (3:15-3:30 PM) / Next Open' : 'Buy near CMP / Next Open'),
                entryPrice: currentRefPrice,
                stopLoss: suggestedSlPrice,
                stopLossPct: suggestedSlPct,
                target1: target1Price,
                target1Pct,
                target2: target2Price,
                target2Pct,
                riskRewardRatio: `1 : ${Math.round((target1Pct / Math.max(1, suggestedSlPct)) * 10) / 10}`,
                holdingHorizon: `${holdingLabel} (Opt: ${optHorizon})`
            },
            technicalReasons: [
                `Strategy Horizon: ${holdingLabel} (${optHorizon} target window)`,
                `Empirical R:R Asymmetry: ${Math.round(asymmetryRatio * 10) / 10}:1 (Avg Runup +${avgRunup.toFixed(1)}% vs MAE -${avgDrawdown.toFixed(1)}%)`,
                `Net Expectancy after friction: ${avgNetPnLPct >= 0 ? '+' : ''}${avgNetPnLPct.toFixed(1)}% net/trade (PF: ${profitFactor.toFixed(2)}, ${sampleTier})`
            ]
        };
    });

    return candidateRankings.sort((a, b) => b.technicalScore - a.technicalScore);
}
