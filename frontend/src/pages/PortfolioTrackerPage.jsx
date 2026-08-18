import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
    ArrowLeft, Rocket, RefreshCw, CheckCircle, Clock, Target, Shield, AlertTriangle,
    TrendingUp, BarChart3, ExternalLink, Trash2, Layers, Download, Sparkles, LineChart,
    Pause, Play, XCircle, CheckCircle2, Lock, Zap, Moon, Sun
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    listDeployedPortfolios,
    refreshDeployedPortfolio,
    deleteDeployedPortfolio,
    pauseDeployedPortfolio,
    resumeDeployedPortfolio,
    squareOffDeployedPortfolio,
    forceFillDeployedPortfolio
} from '../services/trackerApi';

const PortfolioTrackerPage = () => {
    const navigate = useNavigate();
    const [portfolios, setPortfolios] = useState([]);
    const [loading, setLoading] = useState(true);
    const [actionLoadingId, setActionLoadingId] = useState(null);
    const [activeTab, setActiveTab] = useState('active'); // 'pending' | 'active' | 'paused' | 'completed'

    useEffect(() => {
        loadPortfolios();
    }, []);

    const loadPortfolios = async () => {
        setLoading(true);
        try {
            const list = await listDeployedPortfolios();
            setPortfolios(list || []);
            
            const pending = (list || []).filter(p => p.status === 'PENDING');
            const active = (list || []).filter(p => p.status === 'ACTIVE');
            
            // Check if latest deployed portfolio is pending
            const latest = list && list.length > 0 ? list[0] : null;
            if (latest?.status === 'PENDING' || (pending.length > 0 && active.length === 0)) {
                setActiveTab('pending');
            } else if (active.length > 0) {
                setActiveTab('active');
            } else if (pending.length > 0) {
                setActiveTab('pending');
            }
        } catch (e) {
            console.error('Failed to load deployed portfolios', e);
        } finally {
            setLoading(false);
        }
    };

    const handleRefresh = async (pid) => {
        setActionLoadingId(pid);
        try {
            const updated = await refreshDeployedPortfolio(pid);
            if (updated) {
                setPortfolios(prev => prev.map(p => p.id === pid ? updated : p));
            }
        } catch (e) {
            console.error('Refresh error', e);
        } finally {
            setActionLoadingId(null);
        }
    };

    const handlePause = async (pid) => {
        setActionLoadingId(pid);
        try {
            await pauseDeployedPortfolio(pid);
            setPortfolios(prev => prev.map(p => p.id === pid ? { ...p, status: 'PAUSED' } : p));
        } catch (e) {
            console.error('Pause error', e);
        } finally {
            setActionLoadingId(null);
        }
    };

    const handleResume = async (pid) => {
        setActionLoadingId(pid);
        try {
            const res = await resumeDeployedPortfolio(pid);
            if (res) {
                setPortfolios(prev => prev.map(p => p.id === pid ? res : p));
            }
        } catch (e) {
            console.error('Resume error', e);
        } finally {
            setActionLoadingId(null);
        }
    };

    const handleSquareOff = async (pid) => {
        if (window.confirm('Are you sure you want to manually square off and exit all open positions at current market prices?')) {
            setActionLoadingId(pid);
            try {
                const res = await squareOffDeployedPortfolio(pid);
                if (res) {
                    setPortfolios(prev => prev.map(p => p.id === pid ? res : p));
                }
            } catch (e) {
                console.error('Square off error', e);
            } finally {
                setActionLoadingId(null);
            }
        }
    };

    const handleForceFill = async (pid) => {
        if (window.confirm('Force immediate execution at current reference prices?')) {
            setActionLoadingId(pid);
            try {
                const res = await forceFillDeployedPortfolio(pid);
                if (res) {
                    setPortfolios(prev => prev.map(p => p.id === pid ? res : p));
                    setActiveTab('active');
                }
            } catch (e) {
                console.error('Force fill error', e);
            } finally {
                setActionLoadingId(null);
            }
        }
    };

    const handleDelete = async (pid) => {
        if (window.confirm('Are you sure you want to remove this portfolio?')) {
            await deleteDeployedPortfolio(pid);
            setPortfolios(prev => prev.filter(p => p.id !== pid));
        }
    };

    const getTradingViewUrl = (symbol) => {
        if (!symbol) return '#';
        let tvSymbol = symbol;
        if (symbol.endsWith('.NS')) tvSymbol = `NSE:${symbol.slice(0, -3)}`;
        else if (symbol.endsWith('.BO')) tvSymbol = `BSE:${symbol.slice(0, -3)}`;
        return `https://in.tradingview.com/chart/?symbol=${encodeURIComponent(tvSymbol)}`;
    };

    const pendingPortfolios = portfolios.filter(p => p.status === 'PENDING');
    const activePortfolios = portfolios.filter(p => p.status === 'ACTIVE');
    const pausedPortfolios = portfolios.filter(p => p.status === 'PAUSED');
    const completedPortfolios = portfolios.filter(p => p.status === 'COMPLETED');

    // Aggregate global metrics across active & paused portfolios
    const liveMonitored = [...activePortfolios, ...pausedPortfolios];
    const totalCapitalDeployed = liveMonitored.reduce((acc, p) => acc + (p.metrics?.total_invested || 0), 0);
    const totalCurrentValue = liveMonitored.reduce((acc, p) => acc + (p.metrics?.current_value || p.metrics?.total_capital || 0), 0);
    const totalNetPnL = liveMonitored.reduce((acc, p) => acc + (p.metrics?.total_pnl || 0), 0);
    const totalNetRoiPct = totalCapitalDeployed > 0 ? (totalNetPnL / totalCapitalDeployed) * 100 : 0;

    const allMonitoredPositions = liveMonitored.flatMap(p => p.positions || []);
    const winPositions = allMonitoredPositions.filter(pos => (pos.realized_pnl || pos.unrealized_pnl || 0) > 0);
    const globalWinRate = allMonitoredPositions.length > 0 ? (winPositions.length / allMonitoredPositions.length) * 100 : 0;

    return (
        <div className="min-h-screen pt-24 pb-16 px-6 relative">
            {/* Background Glows */}
            <div className="absolute top-20 left-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-[140px] pointer-events-none" />
            <div className="absolute bottom-20 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-[140px] pointer-events-none" />

            <div className="container mx-auto max-w-6xl relative z-10">
                {/* Navigation & Header */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
                    <div>
                        <Link to="/dashboard" className="inline-flex items-center text-gray-400 hover:text-white mb-2 text-sm font-semibold transition-colors">
                            <ArrowLeft size={18} className="mr-1.5" /> Back to Hub
                        </Link>
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 text-emerald-400">
                                <Rocket size={26} />
                            </div>
                            <div>
                                <h1 className="text-3xl font-display font-bold text-white tracking-tight flex items-center gap-2">
                                    Forward Portfolio Tracker
                                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                        Lifecycle Control Center
                                    </span>
                                </h1>
                                <p className="text-gray-400 text-sm">
                                    Track queued, live, and paused portfolios with automated target/stop watchdogs & early square-off controls
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={loadPortfolios}
                            className="px-3.5 py-2 bg-gray-900 hover:bg-gray-800 border border-white/10 rounded-xl text-xs font-semibold text-gray-300 hover:text-white flex items-center gap-1.5 transition-colors"
                        >
                            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh All
                        </button>
                        <Link
                            to="/dashboard/screener"
                            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)]"
                        >
                            <Sparkles size={14} /> Stage New Portfolio
                        </Link>
                    </div>
                </div>

                {/* Aggregate Global KPI Banner */}
                <div className="p-6 rounded-3xl bg-gray-900/70 border border-white/10 backdrop-blur-xl mb-8">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                        <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/5">
                            <div className="text-gray-500 text-xs">Total Capital Monitored</div>
                            <div className="text-xl font-bold font-mono text-white mt-1">
                                ₹{totalCapitalDeployed.toLocaleString('en-IN')}
                            </div>
                        </div>

                        <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/5">
                            <div className="text-gray-500 text-xs">Current Portfolio Value</div>
                            <div className="text-xl font-bold font-mono text-emerald-400 mt-1">
                                ₹{totalCurrentValue.toLocaleString('en-IN')}
                            </div>
                        </div>

                        <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/5">
                            <div className="text-gray-500 text-xs">Net Forward PnL</div>
                            <div className={`text-xl font-bold font-mono mt-1 ${totalNetPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                {totalNetPnL >= 0 ? '+' : ''}₹{totalNetPnL.toLocaleString('en-IN')} ({totalNetRoiPct >= 0 ? '+' : ''}{totalNetRoiPct.toFixed(2)}%)
                            </div>
                        </div>

                        <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/5">
                            <div className="text-gray-500 text-xs">Forward Win Rate</div>
                            <div className="text-xl font-bold font-mono text-teal-300 mt-1">
                                {globalWinRate.toFixed(1)}% <span className="text-xs text-gray-500 font-normal">({winPositions.length}/{allMonitoredPositions.length})</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Tab Switcher: Pending vs Active vs Paused vs Completed */}
                <div className="flex items-center gap-4 border-b border-white/10 mb-6 pb-2 overflow-x-auto">
                    <button
                        onClick={() => setActiveTab('pending')}
                        className={`flex items-center gap-2 pb-2 text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${
                            activeTab === 'pending'
                                ? 'border-amber-500 text-amber-400'
                                : 'border-transparent text-gray-400 hover:text-white'
                        }`}
                    >
                        <Clock size={16} /> Queued / Pending ({pendingPortfolios.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('active')}
                        className={`flex items-center gap-2 pb-2 text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${
                            activeTab === 'active'
                                ? 'border-emerald-500 text-emerald-400'
                                : 'border-transparent text-gray-400 hover:text-white'
                        }`}
                    >
                        <Rocket size={16} /> Active Live ({activePortfolios.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('paused')}
                        className={`flex items-center gap-2 pb-2 text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${
                            activeTab === 'paused'
                                ? 'border-purple-500 text-purple-400'
                                : 'border-transparent text-gray-400 hover:text-white'
                        }`}
                    >
                        <Pause size={16} /> Paused ({pausedPortfolios.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('completed')}
                        className={`flex items-center gap-2 pb-2 text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${
                            activeTab === 'completed'
                                ? 'border-blue-500 text-blue-400'
                                : 'border-transparent text-gray-400 hover:text-white'
                        }`}
                    >
                        <CheckCircle size={16} /> Closed Archive ({completedPortfolios.length})
                    </button>
                </div>

                {/* -------------------- TAB 1: PENDING / QUEUED -------------------- */}
                {activeTab === 'pending' && (
                    <div className="space-y-6">
                        {pendingPortfolios.length === 0 ? (
                            <div className="p-12 text-center rounded-3xl bg-gray-900/40 border border-white/10 backdrop-blur-xl">
                                <Clock size={40} className="mx-auto text-amber-500/60 mb-3" />
                                <h3 className="text-lg font-bold text-white mb-1">No Pending Portfolios</h3>
                                <p className="text-xs text-gray-400 max-w-md mx-auto mb-5">
                                    When you stage a portfolio post-market or over the weekend, it will be queued here awaiting tomorrow's opening print (09:15 AM).
                                </p>
                                <Link
                                    to="/dashboard/screener"
                                    className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-xl inline-flex items-center gap-1.5"
                                >
                                    Stage Model Portfolio →
                                </Link>
                            </div>
                        ) : (
                            pendingPortfolios.map((portfolio) => (
                                <div
                                    key={portfolio.id}
                                    className="rounded-3xl border border-amber-500/30 bg-gray-900/85 backdrop-blur-xl p-6 shadow-2xl space-y-5"
                                >
                                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-4 border-b border-white/10">
                                        <div>
                                            <div className="flex items-center gap-2.5">
                                                <h3 className="text-xl font-bold text-white">{portfolio.name}</h3>
                                                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                                                    <Clock size={11} /> QUEUED FOR MARKET OPEN
                                                </span>
                                            </div>
                                            <div className="text-xs text-gray-400 mt-1 flex items-center gap-3 flex-wrap">
                                                <span>Target Date: <strong className="text-white font-mono">{portfolio.deployment_date}</strong> (09:15 AM Open)</span>
                                                <span>·</span>
                                                <span>Capital: <strong className="text-emerald-400 font-mono">₹{portfolio.total_capital?.toLocaleString('en-IN')}</strong></span>
                                                <span>·</span>
                                                <span>Horizon: <strong className="text-blue-300 font-mono">{portfolio.optimal_horizon_days} Days</strong></span>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => handleForceFill(portfolio.id)}
                                                disabled={actionLoadingId === portfolio.id}
                                                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-[0_0_15px_rgba(16,185,129,0.3)]"
                                                title="Force fill immediately at current reference prices"
                                            >
                                                <Zap size={13} /> Fill Now
                                            </button>
                                            <button
                                                onClick={() => handleDelete(portfolio.id)}
                                                className="px-3 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl border border-red-500/20 text-xs font-semibold flex items-center gap-1 transition-colors"
                                                title="Cancel and discard this queued portfolio"
                                            >
                                                <XCircle size={13} /> Cancel Order
                                            </button>
                                        </div>
                                    </div>

                                    {/* Queued Positions Table */}
                                    <div className="overflow-x-auto rounded-2xl border border-white/10 bg-black/30">
                                        <table className="w-full text-left text-xs">
                                            <thead className="bg-white/5 text-gray-400 font-bold uppercase tracking-wider border-b border-white/10">
                                                <tr>
                                                    <th className="p-3">Symbol</th>
                                                    <th className="p-3">Planned Qty</th>
                                                    <th className="p-3">Reference Price</th>
                                                    <th className="p-3">Stop Loss</th>
                                                    <th className="p-3">Target 1</th>
                                                    <th className="p-3">Allocated Amount</th>
                                                    <th className="p-3 text-right">Status</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-white/5">
                                                {(portfolio.positions || []).map((pos) => (
                                                    <tr key={pos.symbol} className="hover:bg-white/[0.02] transition-colors">
                                                        <td className="p-3 font-bold text-white">
                                                            <div className="flex items-center gap-1.5">
                                                                <span>{pos.symbol}</span>
                                                                <a
                                                                    href={getTradingViewUrl(pos.symbol)}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="text-gray-500 hover:text-blue-400"
                                                                >
                                                                    <ExternalLink size={12} />
                                                                </a>
                                                            </div>
                                                            <div className="text-[10px] text-gray-500 font-normal">{pos.sector}</div>
                                                        </td>
                                                        <td className="p-3 font-mono font-bold text-white">{pos.shares} Shares</td>
                                                        <td className="p-3 font-mono text-gray-300">₹{pos.entry_price} (Ref)</td>
                                                        <td className="p-3 font-mono text-red-400">₹{pos.stop_loss_price}</td>
                                                        <td className="p-3 font-mono text-emerald-400">₹{pos.target1_price}</td>
                                                        <td className="p-3 font-mono text-white">₹{pos.allocated_amount?.toLocaleString('en-IN')}</td>
                                                        <td className="p-3 text-right">
                                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                                                ⏳ Awaiting Open Print
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}

                {/* -------------------- TAB 2: ACTIVE LIVE -------------------- */}
                {activeTab === 'active' && (
                    <div className="space-y-6">
                        {activePortfolios.length === 0 ? (
                            <div className="p-12 text-center rounded-3xl bg-gray-900/40 border border-white/10 backdrop-blur-xl">
                                <Rocket size={40} className="mx-auto text-gray-600 mb-3" />
                                <h3 className="text-lg font-bold text-white mb-1">No Active Forward Portfolios</h3>
                                <p className="text-xs text-gray-400 max-w-md mx-auto mb-5">
                                    Deploy a model portfolio from the Market Scanner to track real-world execution with automated target and stop-loss monitoring.
                                </p>
                                <Link
                                    to="/dashboard/screener"
                                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl inline-flex items-center gap-1.5"
                                >
                                    Go to Model Portfolio Builder →
                                </Link>
                            </div>
                        ) : (
                            activePortfolios.map((portfolio) => (
                                <div
                                    key={portfolio.id}
                                    className="rounded-3xl border border-white/15 bg-gray-900/80 backdrop-blur-xl p-6 shadow-2xl space-y-5"
                                >
                                    {/* Portfolio Header Bar */}
                                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-4 border-b border-white/10">
                                        <div>
                                            <div className="flex items-center gap-2.5">
                                                <h3 className="text-xl font-bold text-white">{portfolio.name}</h3>
                                                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                                    LIVE TRACKING
                                                </span>
                                            </div>
                                            <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-3 flex-wrap">
                                                <span>Deployed: <strong className="text-gray-200 font-mono">{portfolio.deployment_date}</strong> ({portfolio.entry_mode === 'next_open' ? 'Market Open' : 'Market Close'})</span>
                                                <span>·</span>
                                                <span>Horizon: <strong className="text-blue-300 font-mono">{portfolio.optimal_horizon_days} Days</strong></span>
                                                <span>·</span>
                                                <span>Exit Strategy: <strong className="text-teal-300">{portfolio.exit_rule === 'partial_runner' ? '50% T1 + 50% Runner' : '100% Target 1'}</strong></span>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2 flex-wrap">
                                            <button
                                                onClick={() => handleRefresh(portfolio.id)}
                                                disabled={actionLoadingId === portfolio.id}
                                                className="px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-xl text-xs text-gray-300 hover:text-white font-semibold flex items-center gap-1 transition-colors"
                                                title="Refresh prices and check trigger levels"
                                            >
                                                <RefreshCw size={12} className={actionLoadingId === portfolio.id ? 'animate-spin' : ''} /> Refresh
                                            </button>
                                            <button
                                                onClick={() => handlePause(portfolio.id)}
                                                disabled={actionLoadingId === portfolio.id}
                                                className="px-3 py-1.5 bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 rounded-xl border border-purple-500/20 text-xs font-semibold flex items-center gap-1 transition-colors"
                                                title="Pause tracking"
                                            >
                                                <Pause size={12} /> Pause
                                            </button>
                                            <button
                                                onClick={() => handleSquareOff(portfolio.id)}
                                                disabled={actionLoadingId === portfolio.id}
                                                className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 rounded-xl border border-amber-500/20 text-xs font-semibold flex items-center gap-1 transition-colors"
                                                title="Manually exit and square off all open positions at CMP"
                                            >
                                                <Lock size={12} /> Square Off
                                            </button>
                                            <button
                                                onClick={() => handleDelete(portfolio.id)}
                                                className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl border border-red-500/20 transition-colors"
                                                title="Delete this portfolio"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Portfolio Metrics Summary Strip */}
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center text-xs p-3 rounded-2xl bg-black/40 border border-white/5">
                                        <div>
                                            <div className="text-gray-500 text-[10px]">Invested Capital</div>
                                            <div className="font-bold font-mono text-white mt-0.5">
                                                ₹{(portfolio.metrics?.total_invested || 0).toLocaleString('en-IN')}
                                            </div>
                                        </div>
                                        <div>
                                            <div className="text-gray-500 text-[10px]">Current Value</div>
                                            <div className="font-bold font-mono text-emerald-400 mt-0.5">
                                                ₹{(portfolio.metrics?.current_value || 0).toLocaleString('en-IN')}
                                            </div>
                                        </div>
                                        <div>
                                            <div className="text-gray-500 text-[10px]">Net PnL (MTM)</div>
                                            <div className={`font-bold font-mono mt-0.5 ${(portfolio.metrics?.total_pnl || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                {(portfolio.metrics?.total_pnl || 0) >= 0 ? '+' : ''}₹{(portfolio.metrics?.total_pnl || 0).toLocaleString('en-IN')} ({(portfolio.metrics?.total_roi_pct || 0) >= 0 ? '+' : ''}{portfolio.metrics?.total_roi_pct || 0}%)
                                            </div>
                                        </div>
                                        <div>
                                            <div className="text-gray-500 text-[10px]">Expected Strategy ROI</div>
                                            <div className="font-bold font-mono text-blue-300 mt-0.5">
                                                +{portfolio.expected_roi_pct || portfolio.metrics?.expectedPortfolioReturnPct || 0}%
                                            </div>
                                        </div>
                                    </div>

                                    {/* Positions Detail Table */}
                                    <div className="overflow-x-auto rounded-2xl border border-white/10 bg-black/30">
                                        <table className="w-full text-left text-xs">
                                            <thead className="bg-white/5 text-gray-400 font-bold uppercase tracking-wider border-b border-white/10">
                                                <tr>
                                                    <th className="p-3">Symbol</th>
                                                    <th className="p-3">Qty & Fill</th>
                                                    <th className="p-3">Live CMP</th>
                                                    <th className="p-3">Stop Loss</th>
                                                    <th className="p-3">Target 1 (1:2)</th>
                                                    <th className="p-3">Target 2 (Runner)</th>
                                                    <th className="p-3">Status</th>
                                                    <th className="p-3 text-right">Net PnL</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-white/5">
                                                {(portfolio.positions || []).map((pos) => {
                                                    const isExited = pos.status === 'EXITED';
                                                    const pnl = isExited ? pos.realized_pnl : pos.unrealized_pnl;
                                                    const retPct = isExited ? pos.realized_return_pct : pos.unrealized_return_pct;

                                                    let badge = (
                                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                                                            🟢 Active (Day {pos.days_held || 1}/{portfolio.optimal_horizon_days})
                                                        </span>
                                                    );

                                                    if (pos.exit_reason === 'TARGET_1_HIT') {
                                                        badge = (
                                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                                                🎯 Target 1 Hit ({pos.exit_date})
                                                            </span>
                                                        );
                                                    } else if (pos.exit_reason === 'STOP_LOSS_HIT') {
                                                        badge = (
                                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/20 text-red-300 border border-red-500/30">
                                                                🛑 Stop Loss Hit ({pos.exit_date})
                                                            </span>
                                                        );
                                                    } else if (pos.exit_reason === 'MANUAL_SQUARE_OFF') {
                                                        badge = (
                                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                                                🔒 Squared Off ({pos.exit_date})
                                                            </span>
                                                        );
                                                    } else if (pos.exit_reason === 'HORIZON_EXPIRED') {
                                                        badge = (
                                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                                                                ⏳ Horizon Closed ({pos.exit_date})
                                                            </span>
                                                        );
                                                    }

                                                    return (
                                                        <tr key={pos.symbol} className="hover:bg-white/[0.02] transition-colors">
                                                            <td className="p-3 font-bold text-white">
                                                                <div className="flex items-center gap-1.5">
                                                                    <span>{pos.symbol}</span>
                                                                    <a
                                                                        href={getTradingViewUrl(pos.symbol)}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        className="text-gray-500 hover:text-blue-400"
                                                                        title="View on TradingView"
                                                                    >
                                                                        <ExternalLink size={12} />
                                                                    </a>
                                                                </div>
                                                                <div className="text-[10px] text-gray-500 font-normal">{pos.sector}</div>
                                                            </td>
                                                            <td className="p-3 font-mono">
                                                                <div className="text-white font-bold">{pos.shares} Shares</div>
                                                                <div className="text-[10px] text-gray-400">@ ₹{pos.entry_price} (Fill)</div>
                                                            </td>
                                                            <td className="p-3 font-mono font-bold text-white">
                                                                ₹{pos.current_price || pos.entry_price}
                                                            </td>
                                                            <td className="p-3 font-mono text-red-400">
                                                                ₹{pos.stop_loss_price}
                                                            </td>
                                                            <td className="p-3 font-mono text-emerald-400">
                                                                ₹{pos.target1_price}
                                                            </td>
                                                            <td className="p-3 font-mono text-teal-300">
                                                                ₹{pos.target2_price}
                                                            </td>
                                                            <td className="p-3">
                                                                {badge}
                                                            </td>
                                                            <td className="p-3 text-right font-mono font-bold">
                                                                <div className={(pnl || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                                                                    {(pnl || 0) >= 0 ? '+' : ''}₹{(pnl || 0).toLocaleString('en-IN')}
                                                                </div>
                                                                <div className={`text-[10px] ${(retPct || 0) >= 0 ? 'text-emerald-400/80' : 'text-red-400/80'}`}>
                                                                    {(retPct || 0) >= 0 ? '+' : ''}{retPct || 0}%
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}

                {/* -------------------- TAB 3: PAUSED -------------------- */}
                {activeTab === 'paused' && (
                    <div className="space-y-6">
                        {pausedPortfolios.length === 0 ? (
                            <div className="p-12 text-center rounded-3xl bg-gray-900/40 border border-white/10 backdrop-blur-xl">
                                <Pause size={40} className="mx-auto text-purple-400/60 mb-3" />
                                <h3 className="text-lg font-bold text-white mb-1">No Paused Portfolios</h3>
                                <p className="text-xs text-gray-400 max-w-md mx-auto">
                                    When you temporarily pause an active portfolio, it will be stored here with its last mark-to-market prices.
                                </p>
                            </div>
                        ) : (
                            pausedPortfolios.map((portfolio) => (
                                <div
                                    key={portfolio.id}
                                    className="rounded-3xl border border-purple-500/30 bg-gray-900/80 backdrop-blur-xl p-6 shadow-2xl space-y-4"
                                >
                                    <div className="flex justify-between items-center pb-4 border-b border-white/10">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h3 className="text-lg font-bold text-white">{portfolio.name}</h3>
                                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                                                    PAUSED
                                                </span>
                                            </div>
                                            <p className="text-xs text-gray-400 mt-0.5">
                                                Deployed: {portfolio.deployment_date} · Capital: ₹{(portfolio.metrics?.total_invested || 0).toLocaleString('en-IN')}
                                            </p>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => handleResume(portfolio.id)}
                                                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1 transition-all"
                                            >
                                                <Play size={12} /> Resume
                                            </button>
                                            <button
                                                onClick={() => handleSquareOff(portfolio.id)}
                                                className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 rounded-xl border border-amber-500/20 text-xs font-semibold flex items-center gap-1 transition-colors"
                                            >
                                                <Lock size={12} /> Square Off
                                            </button>
                                            <button
                                                onClick={() => handleDelete(portfolio.id)}
                                                className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl border border-red-500/20 transition-colors"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}

                {/* -------------------- TAB 4: COMPLETED ARCHIVE -------------------- */}
                {activeTab === 'completed' && (
                    <div className="space-y-6">
                        {completedPortfolios.length === 0 ? (
                            <div className="p-12 text-center rounded-3xl bg-gray-900/40 border border-white/10 backdrop-blur-xl">
                                <CheckCircle size={40} className="mx-auto text-gray-600 mb-3" />
                                <h3 className="text-lg font-bold text-white mb-1">No Completed Runs in Archive</h3>
                                <p className="text-xs text-gray-400 max-w-md mx-auto">
                                    When all positions in a forward portfolio reach Target, Stop Loss, Horizon Expiry, or Manual Square Off, they are archived here with full performance attribution.
                                </p>
                            </div>
                        ) : (
                            completedPortfolios.map((portfolio) => (
                                <div
                                    key={portfolio.id}
                                    className="rounded-3xl border border-white/10 bg-gray-900/50 backdrop-blur-xl p-6 space-y-4"
                                >
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <h4 className="text-lg font-bold text-white">{portfolio.name}</h4>
                                            <p className="text-xs text-gray-400">
                                                Deployed: {portfolio.deployment_date} · Status: <span className="text-emerald-400 font-bold">COMPLETED</span>
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-xs text-gray-400">Final Realized ROI</div>
                                            <div className={`text-lg font-bold font-mono ${(portfolio.metrics?.total_pnl || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                {(portfolio.metrics?.total_pnl || 0) >= 0 ? '+' : ''}₹{(portfolio.metrics?.total_pnl || 0).toLocaleString('en-IN')} ({(portfolio.metrics?.total_roi_pct || 0) >= 0 ? '+' : ''}{portfolio.metrics?.total_roi_pct || 0}%)
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default PortfolioTrackerPage;
