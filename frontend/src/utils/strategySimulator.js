/**
 * Realistic Quantitative Trading & Portfolio Execution Simulator
 * Models realistic Stop-Loss, Take-Profit targets, Indian Market Taxes & Brokerage (STT, GST, Stamp Duty, Slippage),
 * Portfolio Equity Curve progression, Drawdown metrics, Sharpe/Sortino ratios, and Monthly Returns Matrix.
 */

export const DEFAULT_SIMULATION_CONFIG = {
    stopLossPercent: 6.0,          // 6% Stop Loss
    targetPercent: 12.0,           // 12% Take-Profit Target (1:2 R:R)
    slippagePercent: 0.10,         // 0.10% slippage on entry and exit
    capitalPerTrade: 50000,        // ₹50,000 capital allocated per trade
    brokeragePerOrder: 20,         // ₹20 flat brokerage (discount brokers like Zerodha/Groww/Angel)
    sttRate: 0.001,                // 0.1% STT on equity delivery sell
    turnoverRate: 0.0000345,       // NSE exchange turnover charges
    gstRate: 0.18,                 // 18% GST on (Brokerage + Exchange turnover)
    stampDutyRate: 0.00015,        // 0.015% Stamp duty on buy
    horizon: '30d'                 // Default holding period comparison
};

/**
 * Calculates realistic Indian market transaction taxes and brokerage fees
 */
export const calculateTradeCharges = (buyValue, sellValue, brokeragePerOrder = 20) => {
    if (!buyValue || buyValue <= 0) return 0;
    const effectiveSell = sellValue > 0 ? sellValue : buyValue;
    
    // Brokerage (Buy + Sell)
    const brokerage = brokeragePerOrder * 2;
    // STT (0.1% on Sell for Delivery)
    const stt = effectiveSell * 0.001;
    // Exchange Turnover charges (Buy + Sell)
    const turnover = (buyValue + effectiveSell) * 0.0000345;
    // GST (18% on Brokerage + Turnover)
    const gst = (brokerage + turnover) * 0.18;
    // Stamp duty (0.015% on Buy)
    const stampDuty = buyValue * 0.00015;
    // SEBI charges (~₹10 per crore)
    const sebi = (buyValue + effectiveSell) * 0.000001;

    return brokerage + stt + turnover + gst + stampDuty + sebi;
};

/**
 * Simulates trade execution outcomes with Stop-Loss, Take-Profit, and Transaction Friction
 */
export const simulateStrategy = (trades = [], userConfig = {}) => {
    const config = { ...DEFAULT_SIMULATION_CONFIG, ...userConfig };
    const validTrades = (trades || []).filter(t => t.status === 'Success' && t.entry_price > 0);

    if (validTrades.length === 0) {
        return {
            simulatedTrades: [],
            equityCurve: [],
            monthlyMatrix: {},
            quantMetrics: {
                totalTrades: 0,
                winRate: 0,
                netProfit: 0,
                grossProfit: 0,
                profitFactor: 0,
                sharpeRatio: 0,
                sortinoRatio: 0,
                calmarRatio: 0,
                maxDrawdown: 0,
                expectancy: 0,
                avgWin: 0,
                avgLoss: 0,
                totalCharges: 0,
                avgHoldingDays: 0,
            }
        };
    }

    const {
        stopLossPercent,
        targetPercent,
        slippagePercent,
        capitalPerTrade,
        brokeragePerOrder,
        horizon
    } = config;

    // Simulate each trade individually
    const simulatedTrades = validTrades.map(trade => {
        const entryPrice = trade.entry_price;
        const horizonReturn = trade[`return_${horizon}`] ?? trade.return_30d ?? 0;
        const horizonExitPrice = trade[`exit_price_${horizon}`] ?? trade.exit_price_30d ?? entryPrice;

        const maxHigh = trade.max_high_90d ?? entryPrice;
        const maxLow = trade.max_low_90d ?? entryPrice;

        const maxRunupPct = entryPrice > 0 ? ((maxHigh - entryPrice) / entryPrice) * 100 : 0;
        const maxDrawdownPct = entryPrice > 0 ? ((entryPrice - maxLow) / entryPrice) * 100 : 0;

        let exitReason = 'Horizon Exit';
        let grossReturnPct = horizonReturn;
        let exitPrice = horizonExitPrice;
        let holdingDays = parseInt(horizon) || 30;

        // Target / Stop Loss simulation logic
        const hitTarget = targetPercent > 0 && maxRunupPct >= targetPercent;
        const hitStopLoss = stopLossPercent > 0 && maxDrawdownPct >= stopLossPercent;

        if (hitTarget && !hitStopLoss) {
            exitReason = 'Target Hit';
            grossReturnPct = targetPercent;
            exitPrice = entryPrice * (1 + targetPercent / 100);
            holdingDays = Math.max(3, Math.round(holdingDays * 0.45)); // Reached early
        } else if (hitStopLoss && !hitTarget) {
            exitReason = 'Stop Loss Hit';
            grossReturnPct = -stopLossPercent;
            exitPrice = entryPrice * (1 - stopLossPercent / 100);
            holdingDays = Math.max(2, Math.round(holdingDays * 0.35)); // Stopped out early
        } else if (hitTarget && hitStopLoss) {
            // Both triggered in duration: Conservative rule (SL hit first if high drawdown)
            if (maxDrawdownPct > targetPercent * 0.7) {
                exitReason = 'Stop Loss Hit';
                grossReturnPct = -stopLossPercent;
                exitPrice = entryPrice * (1 - stopLossPercent / 100);
                holdingDays = Math.max(3, Math.round(holdingDays * 0.4));
            } else {
                exitReason = 'Target Hit';
                grossReturnPct = targetPercent;
                exitPrice = entryPrice * (1 + targetPercent / 100);
                holdingDays = Math.max(4, Math.round(holdingDays * 0.5));
            }
        }

        // Apply slippage (entry slippage + exit slippage)
        const totalSlippagePct = slippagePercent * 2;
        const netReturnPctBeforeCharges = grossReturnPct - totalSlippagePct;

        // Position Sizing: Number of shares purchased with capitalPerTrade
        const shares = Math.max(1, Math.floor(capitalPerTrade / entryPrice));
        const actualBuyValue = shares * entryPrice;
        const actualSellValue = shares * exitPrice;

        const grossPnl = actualSellValue - actualBuyValue;
        const charges = calculateTradeCharges(actualBuyValue, actualSellValue, brokeragePerOrder);
        const netPnl = grossPnl - (actualBuyValue * (totalSlippagePct / 100)) - charges;
        const netReturnPct = actualBuyValue > 0 ? (netPnl / actualBuyValue) * 100 : 0;

        return {
            ...trade,
            simulatedExitPrice: round(exitPrice, 2),
            simulatedExitReason: exitReason,
            simulatedHoldingDays: holdingDays,
            grossReturnPct: round(grossReturnPct, 2),
            netReturnPct: round(netReturnPct, 2),
            grossPnl: round(grossPnl, 2),
            netPnl: round(netPnl, 2),
            tradeCharges: round(charges, 2),
            shares,
            tradeCapital: round(actualBuyValue, 2),
            isWinner: netPnl > 0
        };
    });

    // Chronological sorting for equity progression
    const sortedChronological = [...simulatedTrades].sort((a, b) => {
        const dateA = new Date(a.entry_date || a.signal_date || 0).getTime();
        const dateB = new Date(b.entry_date || b.signal_date || 0).getTime();
        return dateA - dateB;
    });

    // Generate Equity Curve & Drawdown Series
    let runningEquity = capitalPerTrade * 10; // Initial portfolio pool baseline
    const startingCapital = runningEquity;
    let highWaterMark = startingCapital;
    let maxDrawdownPct = 0;
    let maxDrawdownAmt = 0;

    const equityCurve = [];
    const returnsList = [];

    sortedChronological.forEach((t, index) => {
        runningEquity += t.netPnl;
        returnsList.push(t.netReturnPct);

        if (runningEquity > highWaterMark) {
            highWaterMark = runningEquity;
        }

        const drawdownAmt = highWaterMark - runningEquity;
        const drawdownPct = highWaterMark > 0 ? (drawdownAmt / highWaterMark) * 100 : 0;

        if (drawdownPct > maxDrawdownPct) maxDrawdownPct = drawdownPct;
        if (drawdownAmt > maxDrawdownAmt) maxDrawdownAmt = drawdownAmt;

        equityCurve.push({
            tradeIndex: index + 1,
            date: t.entry_date || t.signal_date,
            symbol: t.symbol,
            tradePnl: t.netPnl,
            equity: Math.round(runningEquity),
            cumulativeRoi: round(((runningEquity - startingCapital) / startingCapital) * 100, 2),
            drawdownPct: round(-drawdownPct, 2),
            drawdownAmt: Math.round(drawdownAmt),
        });
    });

    // Quant Performance Metrics Calculation
    const winners = simulatedTrades.filter(t => t.netPnl > 0);
    const losers = simulatedTrades.filter(t => t.netPnl < 0);

    const grossWins = winners.reduce((sum, t) => sum + t.netPnl, 0);
    const grossLosses = Math.abs(losers.reduce((sum, t) => sum + t.netPnl, 0));
    const totalNetProfit = simulatedTrades.reduce((sum, t) => sum + t.netPnl, 0);
    const totalCharges = simulatedTrades.reduce((sum, t) => sum + t.tradeCharges, 0);

    const winRate = simulatedTrades.length > 0 ? (winners.length / simulatedTrades.length) * 100 : 0;
    const lossRate = 100 - winRate;
    const avgWin = winners.length > 0 ? grossWins / winners.length : 0;
    const avgLoss = losers.length > 0 ? grossLosses / losers.length : 0;
    const payoffRatio = avgLoss > 0 ? avgWin / avgLoss : (avgWin > 0 ? 99 : 0);

    // Mathematical Expectancy: (Win% * AvgWin) - (Loss% * AvgLoss)
    const expectancy = ((winRate / 100) * avgWin) - ((lossRate / 100) * avgLoss);

    // Profit Factor
    const profitFactor = grossLosses > 0 ? grossWins / grossLosses : (grossWins > 0 ? 99.9 : 0);

    // Sharpe & Sortino Calculations
    const meanReturn = returnsList.length > 0 ? returnsList.reduce((a, b) => a + b, 0) / returnsList.length : 0;
    const variance = returnsList.length > 1
        ? returnsList.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / (returnsList.length - 1)
        : 0;
    const stdDev = Math.sqrt(variance);

    const downsideVariance = returnsList.length > 1
        ? returnsList.filter(r => r < 0).reduce((sum, r) => sum + Math.pow(r, 2), 0) / (returnsList.length - 1)
        : 0;
    const downsideDev = Math.sqrt(downsideVariance);

    // Annualized with standard trade frequency factor (sqrt(252/avgDays))
    const avgHoldingDays = simulatedTrades.reduce((sum, t) => sum + t.simulatedHoldingDays, 0) / (simulatedTrades.length || 1);
    const annFactor = Math.sqrt(Math.max(1, 252 / Math.max(1, avgHoldingDays)));

    const sharpeRatio = stdDev > 0 ? (meanReturn / stdDev) * annFactor : 0;
    const sortinoRatio = downsideDev > 0 ? (meanReturn / downsideDev) * annFactor : (meanReturn > 0 ? 9.9 : 0);

    const totalRoiPct = ((runningEquity - startingCapital) / startingCapital) * 100;
    const calmarRatio = maxDrawdownPct > 0 ? totalRoiPct / maxDrawdownPct : (totalRoiPct > 0 ? 9.9 : 0);

    // Monthly & Annual Return Matrix
    const monthlyMatrix = {};
    sortedChronological.forEach(t => {
        const dateStr = t.entry_date || t.signal_date;
        if (!dateStr) return;
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return;
        const year = d.getFullYear();
        const month = d.getMonth() + 1; // 1-12

        if (!monthlyMatrix[year]) {
            monthlyMatrix[year] = { months: {}, totalPnl: 0, tradeCount: 0 };
        }
        if (!monthlyMatrix[year].months[month]) {
            monthlyMatrix[year].months[month] = { pnl: 0, count: 0, winCount: 0, returns: [] };
        }

        monthlyMatrix[year].months[month].pnl += t.netPnl;
        monthlyMatrix[year].months[month].count += 1;
        if (t.isWinner) monthlyMatrix[year].months[month].winCount += 1;
        monthlyMatrix[year].months[month].returns.push(t.netReturnPct);

        monthlyMatrix[year].totalPnl += t.netPnl;
        monthlyMatrix[year].tradeCount += 1;
    });

    return {
        simulatedTrades,
        equityCurve,
        monthlyMatrix,
        quantMetrics: {
            totalTrades: simulatedTrades.length,
            winnersCount: winners.length,
            losersCount: losers.length,
            winRate: round(winRate, 1),
            payoffRatio: round(payoffRatio, 2),
            expectancy: round(expectancy, 2),
            profitFactor: round(profitFactor, 2),
            netProfit: round(totalNetProfit, 2),
            grossProfit: round(grossWins, 2),
            grossLoss: round(grossLosses, 2),
            totalCharges: round(totalCharges, 2),
            avgWin: round(avgWin, 2),
            avgLoss: round(avgLoss, 2),
            sharpeRatio: round(sharpeRatio, 2),
            sortinoRatio: round(sortinoRatio, 2),
            calmarRatio: round(calmarRatio, 2),
            maxDrawdown: round(maxDrawdownPct, 2),
            maxDrawdownAmount: round(maxDrawdownAmt, 2),
            avgHoldingDays: round(avgHoldingDays, 1),
            totalRoiPct: round(totalRoiPct, 2),
            targetHits: simulatedTrades.filter(t => t.simulatedExitReason === 'Target Hit').length,
            stopLossHits: simulatedTrades.filter(t => t.simulatedExitReason === 'Stop Loss Hit').length,
            horizonExits: simulatedTrades.filter(t => t.simulatedExitReason === 'Horizon Exit').length
        }
    };
};

const round = (num, decimals = 2) => {
    if (num === null || num === undefined || isNaN(num)) return 0;
    return Number(Math.round(Number(num + 'e' + decimals)) + 'e-' + decimals);
};
