import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Rocket, ShieldCheck, Calendar, Clock, DollarSign, Target, CheckCircle2, AlertTriangle, Moon, Sun } from 'lucide-react';

function getSmartDeploymentContext() {
    const now = new Date();
    // Convert to IST (UTC + 5:30)
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istTime = new Date(now.getTime() + (now.getTimezoneOffset() * 60000) + istOffset);
    
    const hours = istTime.getHours();
    const minutes = istTime.getMinutes();
    const dayOfWeek = istTime.getDay(); // 0 = Sun, 6 = Sat
    
    // Market is 09:15 to 15:30 IST
    const isPostMarket = hours > 15 || (hours === 15 && minutes >= 30);
    const isPreMarket = hours < 9 || (hours === 9 && minutes < 15);
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    
    let targetDate = new Date(istTime);
    let sessionLabel = '🟢 Live Market Session (09:15 - 15:30 IST)';
    let isQueuedForNextSession = false;
    
    if (isWeekend || isPostMarket) {
        isQueuedForNextSession = true;
        // Advance to next day
        targetDate.setDate(targetDate.getDate() + 1);
        
        // Skip Saturday (6) and Sunday (0)
        while (targetDate.getDay() === 0 || targetDate.getDay() === 6) {
            targetDate.setDate(targetDate.getDate() + 1);
        }
        
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const nextDayName = dayNames[targetDate.getDay()];
        sessionLabel = `🌙 Post-Market / Weekend Staging → Queued for ${nextDayName}'s Open (09:15 AM)`;
    } else if (isPreMarket) {
        sessionLabel = `🌅 Pre-Market Staging → Queued for Today's Open (09:15 AM)`;
    }
    
    const yyyy = targetDate.getFullYear();
    const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
    const dd = String(targetDate.getDate()).padStart(2, '0');
    const formattedDate = `${yyyy}-${mm}-${dd}`;
    
    return {
        formattedDate,
        sessionLabel,
        isQueuedForNextSession
    };
}

const PreDeployChecklistModal = ({
    isOpen,
    onClose,
    onConfirmDeploy,
    modelPortfolio,
    horizonStyle = 'swing_7_21d',
    optimalHorizonDays = 14
}) => {
    if (!isOpen || !modelPortfolio) return null;

    const smartContext = useMemo(() => getSmartDeploymentContext(), []);

    const [portfolioName, setPortfolioName] = useState(
        `Model Portfolio - ${horizonStyle.toUpperCase().replace(/_/g, ' ')} (${modelPortfolio.positions?.length || 0} Stocks)`
    );
    const [deploymentDate, setDeploymentDate] = useState(smartContext.formattedDate);
    const [entryMode, setEntryMode] = useState('next_open');
    const [exitRule, setExitRule] = useState('partial_runner'); // 'partial_runner' | 'full_target1'

    // Checklist checkboxes
    const [checks, setChecks] = useState({
        dateLocked: true,
        exitRules: true,
        riskBudget: true
    });

    const isAllChecked = checks.dateLocked && checks.exitRules && checks.riskBudget;

    const handleConfirm = () => {
        if (!isAllChecked) return;

        const todayStr = new Date().toISOString().slice(0, 10);
        const isQueued = smartContext.isAfterMarketOrWeekend || (deploymentDate && deploymentDate > todayStr);
        const initialStatus = isQueued ? 'PENDING' : 'ACTIVE';

        const portfolioPayload = {
            name: portfolioName,
            strategy_name: `${horizonStyle.toUpperCase().replace(/_/g, ' ')} Strategy`,
            horizon_style: horizonStyle,
            optimal_horizon_days: optimalHorizonDays,
            deployment_date: deploymentDate,
            entry_mode: entryMode,
            exit_rule: exitRule,
            total_capital: modelPortfolio.metrics.totalInvested + modelPortfolio.metrics.cashReserve,
            allocated_capital: modelPortfolio.metrics.totalInvested,
            cash_reserve: modelPortfolio.metrics.cashReserve,
            expected_roi_pct: parseFloat(modelPortfolio.metrics.expectedPortfolioReturnPct) || 0,
            status: initialStatus
        };

        const positionsPayload = (modelPortfolio.positions || []).map(pos => ({
            symbol: pos.symbol,
            sector: pos.sector,
            shares: pos.shares,
            entry_price: pos.entryPrice,
            allocated_amount: pos.allocatedAmount,
            weight_pct: pos.weightPct,
            stop_loss_price: pos.stopLossPrice,
            target1_price: pos.target1Price,
            target2_price: pos.target2Price,
            current_price: pos.entryPrice,
            status: isQueued ? 'PENDING_FILL' : 'ACTIVE'
        }));

        onConfirmDeploy(portfolioPayload, positionsPayload);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 15 }}
                className="relative w-full max-w-xl bg-gray-900 border border-white/15 rounded-3xl p-6 shadow-2xl overflow-y-auto max-h-[90vh]"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex justify-between items-start pb-4 border-b border-white/10 mb-4">
                    <div className="flex items-center gap-3">
                        <div className="p-3 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                            <Rocket size={24} />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-white">Pre-Deployment Verification</h3>
                            <p className="text-xs text-gray-400">
                                Verify execution parameters before locking this forward portfolio
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-gray-400 hover:text-white rounded-xl bg-white/5 hover:bg-white/10 transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Smart Market Session Banner */}
                <div className="p-3 rounded-2xl bg-blue-500/10 border border-blue-500/30 text-blue-300 text-xs font-semibold flex items-center gap-2 mb-4">
                    {smartContext.isQueuedForNextSession ? (
                        <Moon size={16} className="text-amber-400 shrink-0" />
                    ) : (
                        <Sun size={16} className="text-emerald-400 shrink-0" />
                    )}
                    <span>{smartContext.sessionLabel}</span>
                </div>

                {/* Form Inputs */}
                <div className="space-y-4 text-xs">
                    {/* Portfolio Name */}
                    <div>
                        <label className="block text-gray-400 font-semibold mb-1">Portfolio Name</label>
                        <input
                            type="text"
                            value={portfolioName}
                            onChange={(e) => setPortfolioName(e.target.value)}
                            className="w-full px-3.5 py-2 bg-black/50 border border-white/10 rounded-xl text-white font-medium focus:outline-none focus:border-emerald-500"
                        />
                    </div>

                    {/* Date & Mode Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="block text-gray-400 font-semibold mb-1 flex items-center gap-1">
                                <Calendar size={13} className="text-blue-400" /> Target Execution Date (Anchor)
                            </label>
                            <input
                                type="date"
                                value={deploymentDate}
                                onChange={(e) => setDeploymentDate(e.target.value)}
                                className="w-full px-3.5 py-2 bg-black/50 border border-white/10 rounded-xl text-white font-mono focus:outline-none focus:border-emerald-500"
                            />
                            <span className="text-[10px] text-gray-500 mt-0.5 block">
                                Immutable fill price anchors to this session
                            </span>
                        </div>

                        <div>
                            <label className="block text-gray-400 font-semibold mb-1 flex items-center gap-1">
                                <Clock size={13} className="text-amber-400" /> Execution Fill Mode
                            </label>
                            <select
                                value={entryMode}
                                onChange={(e) => setEntryMode(e.target.value)}
                                className="w-full px-3.5 py-2 bg-black/50 border border-white/10 rounded-xl text-white font-semibold focus:outline-none focus:border-emerald-500"
                            >
                                <option value="next_open">⚡ Market Open (09:15 AM)</option>
                                <option value="next_close">📈 Market Close (15:30 PM)</option>
                            </select>
                            <span className="text-[10px] text-gray-500 mt-0.5 block">
                                Exact candle print used for fills
                            </span>
                        </div>
                    </div>

                    {/* Exit Strategy Rule */}
                    <div>
                        <label className="block text-gray-400 font-semibold mb-1 flex items-center gap-1">
                            <Target size={13} className="text-emerald-400" /> Automated Exit Strategy
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <button
                                type="button"
                                onClick={() => setExitRule('partial_runner')}
                                className={`p-3 rounded-xl border text-left transition-all ${
                                    exitRule === 'partial_runner'
                                        ? 'bg-emerald-500/20 border-emerald-500/50 text-white shadow-[0_0_15px_rgba(16,185,129,0.2)]'
                                        : 'bg-black/30 border-white/10 text-gray-400 hover:text-white'
                                }`}
                            >
                                <div className="font-bold text-xs text-emerald-300">50% T1 + 50% Runner (T2)</div>
                                <div className="text-[10px] text-gray-400 mt-0.5">Locks 50% profit at Target 1, trails runner to Target 2</div>
                            </button>

                            <button
                                type="button"
                                onClick={() => setExitRule('full_target1')}
                                className={`p-3 rounded-xl border text-left transition-all ${
                                    exitRule === 'full_target1'
                                        ? 'bg-emerald-500/20 border-emerald-500/50 text-white shadow-[0_0_15px_rgba(16,185,129,0.2)]'
                                        : 'bg-black/30 border-white/10 text-gray-400 hover:text-white'
                                }`}
                            >
                                <div className="font-bold text-xs text-emerald-300">100% Exit at Target 1</div>
                                <div className="text-[10px] text-gray-400 mt-0.5">Strict R:R target execution. Closes entire position</div>
                            </button>
                        </div>
                    </div>

                    {/* Capital & Portfolio Summary Pill */}
                    <div className="p-3.5 rounded-2xl bg-black/40 border border-white/10 grid grid-cols-3 text-center text-xs">
                        <div>
                            <div className="text-gray-500 text-[10px]">Capital Allocation</div>
                            <div className="font-bold font-mono text-white mt-0.5">
                                ₹{modelPortfolio.metrics.totalInvested.toLocaleString('en-IN')}
                            </div>
                            <div className="text-[9px] text-emerald-400 font-medium">
                                ₹{modelPortfolio.metrics.cashReserve?.toLocaleString('en-IN')} ({modelPortfolio.metrics.cashReservePct}%) Buffer
                            </div>
                        </div>
                        <div>
                            <div className="text-gray-500 text-[10px]">Positions</div>
                            <div className="font-bold font-mono text-blue-400 mt-0.5">
                                {modelPortfolio.positions?.length || 0} Stocks
                            </div>
                            <div className="text-[9px] text-gray-400">
                                ~{modelPortfolio.metrics.avgWinRate || 70}% Win Rate
                            </div>
                        </div>
                        <div>
                            <div className="text-gray-500 text-[10px]">Optimal Horizon</div>
                            <div className="font-bold font-mono text-amber-300 mt-0.5">
                                {optimalHorizonDays} Days
                            </div>
                            <div className="text-[9px] text-amber-400/90 font-medium">
                                +{modelPortfolio.metrics.expectedPortfolioReturnPct}% Exp. ROI
                            </div>
                        </div>
                    </div>

                    {/* Pre-Deployment Checklist Items */}
                    <div className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/10 space-y-2.5">
                        <div className="text-xs font-bold text-gray-300 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                            <ShieldCheck size={14} className="text-emerald-400" />
                            Pre-Deployment Verification Checklist
                        </div>

                        <label className="flex items-start gap-2 cursor-pointer text-gray-300">
                            <input
                                type="checkbox"
                                checked={checks.dateLocked}
                                onChange={(e) => setChecks(c => ({ ...c, dateLocked: e.target.checked }))}
                                className="mt-0.5 rounded accent-emerald-500"
                            />
                            <span>
                                <strong>Immutable Fill Price:</strong> Once deployed, the entry fill price will be permanently locked to <strong>{deploymentDate} ({entryMode === 'next_open' ? '09:15 AM Open' : '15:30 PM Close'})</strong>.
                            </span>
                        </label>

                        <label className="flex items-start gap-2 cursor-pointer text-gray-300">
                            <input
                                type="checkbox"
                                checked={checks.exitRules}
                                onChange={(e) => setChecks(c => ({ ...c, exitRules: e.target.checked }))}
                                className="mt-0.5 rounded accent-emerald-500"
                            />
                            <span>
                                <strong>Strategy Lifecycle Watchdog:</strong> Daily price action will automatically evaluate Target 1, Target 2, Stop Loss, and Horizon Expiry ({optimalHorizonDays}d) whenever you open the app.
                            </span>
                        </label>

                        <label className="flex items-start gap-2 cursor-pointer text-gray-300">
                            <input
                                type="checkbox"
                                checked={checks.riskBudget}
                                onChange={(e) => setChecks(c => ({ ...c, riskBudget: e.target.checked }))}
                                className="mt-0.5 rounded accent-emerald-500"
                            />
                            <span>
                                <strong>Risk Budget Verified:</strong> Max portfolio risk is budgeted at ₹{modelPortfolio.metrics.maxRiskValue?.toLocaleString('en-IN') || '—'}.
                            </span>
                        </label>
                    </div>
                </div>

                {/* Footer Buttons */}
                <div className="pt-4 mt-4 border-t border-white/10 flex items-center gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        className="py-2.5 px-4 bg-white/5 hover:bg-white/10 rounded-xl text-gray-300 hover:text-white font-semibold text-xs transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        disabled={!isAllChecked}
                        onClick={handleConfirm}
                        className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)]"
                    >
                        <Rocket size={15} /> Confirm & Deploy to Live Tracker
                    </button>
                </div>
            </motion.div>
        </div>
    );
};

export default PreDeployChecklistModal;
