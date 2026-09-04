import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import {
    ArrowLeft, Search, Zap, Target, Shield, Star, TrendingUp, CheckCircle,
    BarChart3, Sparkles, ExternalLink, RefreshCw, Layers, ArrowUpRight, Flame,
    Clock, Gauge, Scale, LayoutGrid, Table, Download, PieChart, Briefcase,
    ChevronLeft, ChevronRight, X, Info, Wallet, LineChart, Rocket, Award
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { analyzeTopNextDayPicks, detectOptimalHorizon, analyzeHighConvictionFreshPicks } from '../utils/technicalPatternEngine';
import { buildModelPortfolio, generateBrokerBasketCSV } from '../utils/modelPortfolioEngine';
import { listReports, getReport } from '../services/db';
import PreDeployChecklistModal from '../components/PreDeployChecklistModal';
import AIGlanceModal from '../components/copilot/AIGlanceModal';
import { deployPortfolio } from '../services/trackerApi';

const HORIZON_OPTIONS = [
    { id: 'auto', label: '🎯 Auto-Detect Optimal', desc: 'Strategy highest Sharpe ratio' },
    { id: 'btst_1_3d', label: '⚡ BTST / Quick Flip', desc: '1 – 3 Days holding window' },
    { id: 'swing_7_21d', label: '📈 Momentum Swing', desc: '7 – 21 Days swing wave' },
    { id: 'positional_30_90d', label: '💎 Positional Trend', desc: '30 – 90 Days compounding' }
];

const FRESHNESS_TABS = [
    { id: 'all', label: '🎯 All High Conviction (≤30d)', badge: '≤30d', desc: 'All high-probability fresh signals' },
    { id: 'btst_3d', label: '⚡ Today / BTST (0–3d)', badge: '0-3d', desc: 'Next-day open & live execution ready' },
    { id: 'swing_7d', label: '📈 1-Week Swing (≤7d)', badge: '≤7d', desc: 'Active 7-day breakout momentum' },
    { id: 'momentum_14d', label: '💎 2-Week Momentum (≤14d)', badge: '≤14d', desc: 'Confirmed 2-week wave runners' },
    { id: 'positional_30d', label: '🏆 1-Month Trend (≤30d)', badge: '≤30d', desc: 'Multi-week compounding setups' }
];

const LiveMarketScanner = () => {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const initialMainTab = searchParams.get('tab') || 'high_conviction';
    const initialFreshness = searchParams.get('freshness') || 'all';

    const [selectedReportId, setSelectedReportId] = useState(null);
    const [reports, setReports] = useState([]);
    const [activeReport, setActiveReport] = useState(() => {
        const saved = sessionStorage.getItem('backtest_report');
        return saved ? JSON.parse(saved) : null;
    });

    // Active View & Horizon
    const [activeMainTab, setActiveMainTab] = useState(initialMainTab); // 'high_conviction' | 'screener' | 'portfolio'
    const [freshnessHorizon, setFreshnessHorizon] = useState(initialFreshness);
    const [horizonStyle, setHorizonStyle] = useState('auto');
    const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'table'
    const [filterCategory, setFilterCategory] = useState('all'); // 'all' | '5star' | 'asymmetric' | 'high_expectancy'
    const [searchQuery, setSearchQuery] = useState('');

    // Glance Modal State
    const [isGlanceOpen, setIsGlanceOpen] = useState(false);
    const [glanceTradeIndex, setGlanceTradeIndex] = useState(0);

    // Pagination for Screener
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(6); // 6 for grid, 15 for table

    // Portfolio Settings
    const [portfolioCapital, setPortfolioCapital] = useState(500000);
    const [maxPositions, setMaxPositions] = useState(6);
    const [cashReserveBufferPct, setCashReserveBufferPct] = useState(10);
    const [selectedStockForDrawer, setSelectedStockForDrawer] = useState(null);
    const [isDeployModalOpen, setIsDeployModalOpen] = useState(false);

    const handleConfirmDeploy = async (portfolioPayload, positionsPayload) => {
        setIsDeployModalOpen(false);
        try {
            await deployPortfolio(portfolioPayload, positionsPayload);
            navigate('/dashboard/tracker');
        } catch (e) {
            console.error('Failed to deploy portfolio', e);
        }
    };

    useEffect(() => {
        listReports()
            .then(reps => {
                if (Array.isArray(reps)) {
                    setReports(reps);
                    if (!activeReport && reps.length > 0) {
                        getReport(reps[0].id).then(r => {
                            if (r) setActiveReport(r);
                        });
                    }
                }
            })
            .catch(() => {});
    }, []);

    const handleSelectReport = (id) => {
        setSelectedReportId(id);
        getReport(id).then(r => {
            if (r) setActiveReport(r);
        });
    };

    const optimalHorizonInfo = useMemo(() => {
        if (!activeReport || !Array.isArray(activeReport.trades)) {
            return { bestHorizon: '14d', bestHorizonDays: 14 };
        }
        return detectOptimalHorizon(activeReport.trades);
    }, [activeReport]);

    // Calculate ranked picks based on selected horizon
    const topPicks = useMemo(() => {
        if (!activeReport || !Array.isArray(activeReport.trades)) {
            return [];
        }
        return analyzeTopNextDayPicks(activeReport.trades, { horizonStyle });
    }, [activeReport, horizonStyle]);

    // High Conviction Fresh Signals (<30d) with Multi-Horizon Sub-Buckets
    const highConvictionTrades = useMemo(() => {
        if (!activeReport || !Array.isArray(activeReport.trades)) return [];
        return analyzeHighConvictionFreshPicks(activeReport.trades, {
            maxDays: 30,
            horizon: freshnessHorizon,
            entryMode: activeReport.entry_mode || 'next_close'
        });
    }, [activeReport, freshnessHorizon]);

    const filteredHighConvictionTrades = useMemo(() => {
        if (!searchQuery.trim()) return highConvictionTrades;
        const q = searchQuery.toLowerCase();
        return highConvictionTrades.filter(t =>
            (t.symbol || '').toLowerCase().includes(q) ||
            (t.sector || '').toLowerCase().includes(q)
        );
    }, [highConvictionTrades, searchQuery]);

    const handleOpenGlanceForTrade = (trade) => {
        if (!activeReport?.trades) return;
        const idx = activeReport.trades.findIndex(t => t.symbol === trade.symbol && t.signal_date === trade.signal_date);
        setGlanceTradeIndex(idx >= 0 ? idx : 0);
        setIsGlanceOpen(true);
    };

    // Filter candidates
    const filteredPicks = useMemo(() => {
        let list = topPicks;
        if (filterCategory === '5star') {
            list = list.filter(p => p.stars === 5);
        } else if (filterCategory === 'asymmetric') {
            list = list.filter(p => p.asymmetryRatio >= 2.5);
        } else if (filterCategory === 'high_expectancy') {
            list = list.filter(p => p.profitFactor >= 2.0 && p.avgNetPnLPct > 0);
        }

        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            list = list.filter(p =>
                (p.symbol || '').toLowerCase().includes(q) ||
                (p.sector || '').toLowerCase().includes(q)
            );
        }
        return list;
    }, [topPicks, filterCategory, searchQuery]);

    // Model Portfolio generated from ranked picks
    const modelPortfolio = useMemo(() => {
        return buildModelPortfolio(topPicks, {
            totalCapital: portfolioCapital,
            maxPositions: maxPositions,
            maxSectorExposurePct: 35,
            cashReserveBufferPct,
            horizonStyle
        });
    }, [topPicks, portfolioCapital, maxPositions, cashReserveBufferPct, horizonStyle]);

    // Paginated list for Screener
    const paginatedPicks = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return filteredPicks.slice(start, start + pageSize);
    }, [filteredPicks, currentPage, pageSize]);

    const totalPages = Math.max(1, Math.ceil(filteredPicks.length / pageSize));

    const handleExportZerodhaBasket = () => {
        const csv = generateBrokerBasketCSV(modelPortfolio.positions);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `Zerodha_Basket_${horizonStyle}_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const getTradingViewUrl = (symbol) => {
        if (!symbol) return '#';
        let tvSymbol = symbol;
        if (symbol.endsWith('.NS')) tvSymbol = `NSE:${symbol.slice(0, -3)}`;
        else if (symbol.endsWith('.BO')) tvSymbol = `BSE:${symbol.slice(0, -3)}`;
        return `https://in.tradingview.com/chart/?symbol=${encodeURIComponent(tvSymbol)}`;
    };

    const getScreenerUrl = (symbol) => {
        if (!symbol) return '#';
        const clean = symbol.replace(/\.(NS|BO)$/, '');
        return `https://www.screener.in/company/${encodeURIComponent(clean)}/`;
    };

    return (
        <div className="min-h-screen pt-24 pb-16 px-6 relative">
            {/* Ambient Background Glows */}
            <div className="absolute top-20 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-[140px] pointer-events-none" />
            <div className="absolute bottom-20 right-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-[140px] pointer-events-none" />

            <div className="container mx-auto max-w-6xl relative z-10">
                {/* Header & Strategy Source */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                    <div>
                        <Link to="/dashboard" className="inline-flex items-center text-gray-400 hover:text-white mb-2 text-sm font-semibold transition-colors">
                            <ArrowLeft size={18} className="mr-1.5" /> Back to Hub
                        </Link>
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/30 text-amber-400">
                                <Flame size={26} />
                            </div>
                            <div>
                                <h1 className="text-3xl font-display font-bold text-white tracking-tight flex items-center gap-2">
                                    Market Scanner & Model Portfolio
                                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                        Institutional Quant Engine
                                    </span>
                                </h1>
                                <p className="text-gray-400 text-sm">
                                    Multi-horizon high-conviction screening & automated portfolio position sizing
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Report Selector Dropdown */}
                    {reports.length > 0 && (
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-400 font-semibold whitespace-nowrap">Strategy Source:</span>
                            <select
                                value={selectedReportId || (activeReport?.id || '')}
                                onChange={(e) => handleSelectReport(e.target.value)}
                                className="px-3 py-2 bg-gray-900 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500"
                            >
                                {reports.map((r, i) => (
                                    <option key={r.id || i} value={r.id}>
                                        {r.filename || `Report ${i + 1}`} ({r.total_signals || 0} signals)
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>

                {/* Main Navigation Tabs */}
                <div className="flex items-center justify-between border-b border-white/10 mb-6 pb-2">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setActiveMainTab('high_conviction')}
                            className={`flex items-center gap-2 pb-2 text-sm font-bold border-b-2 transition-colors ${
                                activeMainTab === 'high_conviction'
                                    ? 'border-amber-500 text-amber-400'
                                    : 'border-transparent text-gray-400 hover:text-white'
                            }`}
                        >
                            <Award size={16} /> 🎯 High Conviction (&lt;30d) ({highConvictionTrades.length})
                        </button>
                        <button
                            onClick={() => setActiveMainTab('screener')}
                            className={`flex items-center gap-2 pb-2 text-sm font-bold border-b-2 transition-colors ${
                                activeMainTab === 'screener'
                                    ? 'border-blue-500 text-blue-400'
                                    : 'border-transparent text-gray-400 hover:text-white'
                            }`}
                        >
                            <Zap size={16} /> Screener & Top Setups ({topPicks.length})
                        </button>
                        <button
                            onClick={() => setActiveMainTab('portfolio')}
                            className={`flex items-center gap-2 pb-2 text-sm font-bold border-b-2 transition-colors ${
                                activeMainTab === 'portfolio'
                                    ? 'border-emerald-500 text-emerald-400'
                                    : 'border-transparent text-gray-400 hover:text-white'
                            }`}
                        >
                            <Briefcase size={16} /> Model Portfolio ({modelPortfolio.positions.length})
                        </button>
                    </div>

                    {activeMainTab === 'screener' && (
                        <div className="flex items-center gap-2">
                            <div className="p-1 rounded-xl bg-gray-900 border border-white/10 flex items-center gap-1">
                                <button
                                    onClick={() => {
                                        setViewMode('grid');
                                        setPageSize(6);
                                        setCurrentPage(1);
                                    }}
                                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                                        viewMode === 'grid' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
                                    }`}
                                >
                                    <LayoutGrid size={13} /> Grid
                                </button>
                                <button
                                    onClick={() => {
                                        setViewMode('table');
                                        setPageSize(15);
                                        setCurrentPage(1);
                                    }}
                                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                                        viewMode === 'table' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
                                    }`}
                                >
                                    <Table size={13} /> Table
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* -------------------- TAB 0: HIGH CONVICTION FRESH SIGNALS (<30D) -------------------- */}
                {activeMainTab === 'high_conviction' && (
                    <div className="space-y-6">
                        {/* Freshness Horizon Sub-Tabs */}
                        <div className="flex flex-wrap items-center gap-2">
                            {FRESHNESS_TABS.map(tab => {
                                const isSelected = freshnessHorizon === tab.id;
                                const count = highConvictionTrades.filter(t => tab.id === 'all' || t.freshnessTier === tab.id).length;
                                return (
                                    <button
                                        key={tab.id}
                                        onClick={() => setFreshnessHorizon(tab.id)}
                                        className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                                            isSelected
                                                ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-gray-950 shadow-[0_0_20px_rgba(245,158,11,0.35)]'
                                                : 'bg-gray-900/80 border border-white/10 text-gray-400 hover:text-white hover:border-white/20'
                                        }`}
                                    >
                                        <span>{tab.label}</span>
                                        <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono ${
                                            isSelected ? 'bg-black/30 text-gray-950 font-extrabold' : 'bg-white/5 text-gray-400'
                                        }`}>
                                            {count}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Search & Info Banner */}
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 p-4 rounded-2xl bg-gradient-to-r from-amber-500/10 via-orange-500/5 to-transparent border border-amber-500/20">
                            <div className="flex items-center gap-2.5">
                                <Sparkles size={18} className="text-amber-400 shrink-0" />
                                <div className="text-xs text-gray-300">
                                    <span className="font-bold text-white">Empirical High-Conviction Filter:</span> Ranked by Bayesian Laplace backtest win rate, mark-to-market momentum, and horizon consistency.
                                </div>
                            </div>
                            <div className="relative w-full sm:w-64">
                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                                <input
                                    type="text"
                                    placeholder="Search symbol or sector..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-gray-900 border border-white/10 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-amber-500"
                                />
                            </div>
                        </div>

                        {/* Grid of High Conviction Cards */}
                        {filteredHighConvictionTrades.length === 0 ? (
                            <div className="text-center py-16 p-8 rounded-3xl bg-gray-900/40 border border-white/10">
                                <Award size={36} className="mx-auto text-gray-600 mb-3" />
                                <h3 className="text-lg font-bold text-white mb-1">No Fresh Signals In This Horizon Window</h3>
                                <p className="text-xs text-gray-400 max-w-md mx-auto">
                                    Try switching to another freshness tab (e.g. 🎯 All High Conviction ≤30d) or upload a fresh dataset.
                                </p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {filteredHighConvictionTrades.map((trade, idx) => (
                                    <div
                                        key={`${trade.symbol}-${trade.signal_date}-${idx}`}
                                        className="relative rounded-3xl border border-white/10 bg-gradient-to-br from-gray-900/90 via-gray-900/60 to-gray-950/80 p-5 backdrop-blur-xl hover:border-amber-500/40 hover:shadow-[0_0_25px_rgba(245,158,11,0.15)] transition-all flex flex-col justify-between"
                                    >
                                        <div>
                                            {/* Header: Rank + Freshness + Score */}
                                            <div className="flex items-center justify-between gap-2 mb-3">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="px-2 py-0.5 rounded-lg text-[10px] font-extrabold uppercase bg-amber-500 text-gray-950">
                                                        #{idx + 1}
                                                    </span>
                                                    <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-white/5 border border-white/10 text-amber-300">
                                                        {trade.freshnessLabel}
                                                    </span>
                                                    <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${
                                                        trade.executionStatus.includes('PENDING')
                                                            ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                                                            : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                                    }`}>
                                                        {trade.executionStatus}
                                                    </span>
                                                </div>

                                                <div className="flex items-center gap-1 text-amber-400 text-xs font-bold font-mono">
                                                    <Zap size={13} /> {trade.convictionScore}/100
                                                </div>
                                            </div>

                                            {/* Symbol & Price Overview */}
                                            <div className="flex justify-between items-baseline mb-3">
                                                <div>
                                                    <h3 className="text-xl font-bold text-white tracking-tight">{trade.symbol}</h3>
                                                    <span className="text-[11px] text-gray-400">{trade.sector || 'General Market'}</span>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-base font-bold font-mono text-white">
                                                        ₹{trade.latestPrice.toLocaleString('en-IN')}
                                                    </div>
                                                    <div className={`text-xs font-bold font-mono ${trade.liveReturn >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                        {trade.liveReturn >= 0 ? '+' : ''}{trade.liveReturn.toFixed(1)}% live
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Strategy Metrics Grid */}
                                            <div className="grid grid-cols-3 gap-2 p-2.5 rounded-2xl bg-black/40 border border-white/5 mb-3 text-center">
                                                <div>
                                                    <div className="text-[10px] text-gray-500">Entry Price</div>
                                                    <div className="text-xs font-bold font-mono text-gray-200 mt-0.5">
                                                        ₹{trade.entryPrice.toLocaleString('en-IN')}
                                                    </div>
                                                </div>
                                                <div>
                                                    <div className="text-[10px] text-gray-500">CSV Win Rate</div>
                                                    <div className="text-xs font-bold font-mono text-emerald-400 mt-0.5">
                                                        {trade.rawWinRate}% ({trade.symbolWins}/{trade.symbolTotalTrades})
                                                    </div>
                                                </div>
                                                <div>
                                                    <div className="text-[10px] text-gray-500">Signal Date</div>
                                                    <div className="text-xs font-bold font-mono text-gray-300 mt-0.5">
                                                        {trade.signal_date}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Evidence Bullets */}
                                            <div className="space-y-1.5 mb-4">
                                                {trade.reasons.map((r, i) => (
                                                    <div key={i} className="flex items-start gap-1.5 text-[11px] text-gray-300">
                                                        <CheckCircle size={12} className="text-emerald-400 mt-0.5 shrink-0" />
                                                        <span>{r}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Action Bar */}
                                        <div className="pt-3 border-t border-white/10 flex items-center gap-2">
                                            <button
                                                onClick={() => handleOpenGlanceForTrade(trade)}
                                                className="flex-1 py-2 px-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-gray-950 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1.5 shadow-[0_0_15px_rgba(245,158,11,0.2)]"
                                            >
                                                <Zap size={13} className="fill-current" /> ⚡ Glance
                                            </button>
                                            <a
                                                href={getTradingViewUrl(trade.symbol)}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white transition-colors"
                                                title="Open in TradingView"
                                            >
                                                <ExternalLink size={14} />
                                            </a>
                                            <a
                                                href={getScreenerUrl(trade.symbol)}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white transition-colors"
                                                title="Open in Screener.in"
                                            >
                                                <BarChart3 size={14} />
                                            </a>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* -------------------- TAB 1: SCREENER & TOP SETUPS -------------------- */}
                {activeMainTab === 'screener' && (
                    <div className="space-y-6">
                        {/* Top Conviction Podium Setups (with direct Chart & Screener links) */}
                        {currentPage === 1 && !searchQuery && filteredPicks.length >= 3 && (
                            <div className="mb-8">
                                <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                                    <Sparkles size={14} className="text-amber-400" />
                                    <span>Top Conviction Podium Setups</span>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    {filteredPicks.slice(0, 3).map((pick, i) => (
                                        <div
                                            key={pick.symbol}
                                            className={`relative rounded-3xl border backdrop-blur-xl p-5 transition-all hover:scale-[1.01] ${
                                                i === 0
                                                    ? 'bg-gradient-to-br from-gray-900/95 via-gray-900/80 to-blue-950/40 border-blue-500/40 shadow-[0_0_25px_rgba(59,130,246,0.2)]'
                                                    : 'bg-gray-900/70 border-white/10 hover:border-white/20'
                                            }`}
                                        >
                                            <div className="flex justify-between items-start mb-2">
                                                <span className={`px-2 py-0.5 rounded-lg text-[10px] font-extrabold uppercase ${
                                                    i === 0 ? 'bg-amber-500 text-gray-950' : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                                                }`}>
                                                    #{i + 1} {i === 0 ? 'PRIME' : 'TOP PICK'}
                                                </span>
                                                <div className="flex items-center gap-1 text-emerald-400 text-xs font-bold font-mono">
                                                    <Zap size={12} /> {pick.technicalScore}/100
                                                </div>
                                            </div>

                                            {/* Symbol with Direct TradingView link */}
                                            <div className="flex justify-between items-baseline mb-3">
                                                <div>
                                                    <div className="flex items-center gap-1.5">
                                                        <h4 className="text-xl font-bold text-white">{pick.symbol}</h4>
                                                        <a
                                                            href={getTradingViewUrl(pick.symbol)}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="text-gray-400 hover:text-blue-400"
                                                            title="Open in TradingView"
                                                        >
                                                            <ExternalLink size={13} />
                                                        </a>
                                                    </div>
                                                    <span className="text-[11px] text-gray-400">{pick.sector}</span>
                                                </div>
                                                <div className="text-right font-mono font-bold text-white text-base">
                                                    ₹{pick.currentPrice.toLocaleString('en-IN')}
                                                </div>
                                            </div>

                                            <div className="p-2.5 rounded-xl bg-black/40 border border-white/5 grid grid-cols-3 text-center text-[10px] mb-3">
                                                <div>
                                                    <div className="text-gray-500">Stop Loss</div>
                                                    <div className="font-bold text-red-400 font-mono">₹{pick.executionPlan.stopLoss}</div>
                                                </div>
                                                <div>
                                                    <div className="text-gray-500">Target 1</div>
                                                    <div className="font-bold text-emerald-400 font-mono">₹{pick.executionPlan.target1}</div>
                                                </div>
                                                <div>
                                                    <div className="text-gray-500">R:R Edge</div>
                                                    <div className="font-bold text-teal-300 font-mono">{pick.asymmetryRatio}:1</div>
                                                </div>
                                            </div>

                                            {/* Quick Action Links directly on Podium */}
                                            <div className="flex items-center gap-2 pt-2 border-t border-white/5">
                                                <button
                                                    onClick={() => setSelectedStockForDrawer(pick)}
                                                    className="flex-1 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 rounded-lg text-blue-300 font-semibold text-[11px] transition-colors text-center"
                                                >
                                                    Trade Plan
                                                </button>
                                                <a
                                                    href={getTradingViewUrl(pick.symbol)}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="py-1.5 px-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white rounded-lg text-[11px] font-semibold transition-colors flex items-center gap-1"
                                                    title="TradingView Chart"
                                                >
                                                    <LineChart size={12} /> Chart
                                                </a>
                                                <a
                                                    href={getScreenerUrl(pick.symbol)}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="py-1.5 px-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white rounded-lg text-[11px] font-semibold transition-colors"
                                                    title="Screener.in"
                                                >
                                                    Screener
                                                </a>
                                                <button
                                                    onClick={() => navigate(`/dashboard/fundamental/${pick.symbol}`)}
                                                    className="p-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-gray-400 hover:text-white rounded-lg"
                                                    title="Fundamentals"
                                                >
                                                    <BarChart3 size={13} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Interactive Toolbar (Filter Chips + Search + View Switcher) */}
                        <div className="p-4 rounded-2xl bg-gray-900/60 border border-white/10 backdrop-blur-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                            <div className="flex items-center gap-2 flex-wrap text-xs">
                                <span className="text-gray-400 font-semibold mr-1">Filter:</span>
                                {[
                                    { id: 'all', label: `All (${topPicks.length})` },
                                    { id: '5star', label: `5-Star (${topPicks.filter(p => p.stars === 5).length})` },
                                    { id: 'asymmetric', label: `Asymmetric R:R > 2.5 (${topPicks.filter(p => p.asymmetryRatio >= 2.5).length})` },
                                    { id: 'high_expectancy', label: `High PF > 2.0 (${topPicks.filter(p => p.profitFactor >= 2.0).length})` },
                                ].map(tab => (
                                    <button
                                        key={tab.id}
                                        onClick={() => {
                                            setFilterCategory(tab.id);
                                            setCurrentPage(1);
                                        }}
                                        className={`px-3 py-1.5 rounded-xl font-semibold transition-all ${
                                            filterCategory === tab.id
                                                ? 'bg-blue-600 text-white shadow-[0_0_15px_rgba(59,130,246,0.3)]'
                                                : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
                                        }`}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                            </div>

                            <div className="flex items-center gap-3 w-full sm:w-auto">
                                {/* Search Input */}
                                <div className="relative flex-1 sm:w-56">
                                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                                    <input
                                        type="text"
                                        placeholder="Search ticker / sector..."
                                        value={searchQuery}
                                        onChange={(e) => {
                                            setSearchQuery(e.target.value);
                                            setCurrentPage(1);
                                        }}
                                        className="w-full pl-8 pr-3 py-1.5 bg-black/40 border border-white/10 rounded-xl text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                                    />
                                </div>

                                {/* View Switcher inline */}
                                <div className="p-1 rounded-xl bg-gray-900 border border-white/10 flex items-center gap-1">
                                    <button
                                        onClick={() => {
                                            setViewMode('grid');
                                            setPageSize(6);
                                            setCurrentPage(1);
                                        }}
                                        className={`p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors ${
                                            viewMode === 'grid' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
                                        }`}
                                        title="Tiles Grid View"
                                    >
                                        <LayoutGrid size={14} />
                                    </button>
                                    <button
                                        onClick={() => {
                                            setViewMode('table');
                                            setPageSize(15);
                                            setCurrentPage(1);
                                        }}
                                        className={`p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors ${
                                            viewMode === 'table' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
                                        }`}
                                        title="Tabular Matrix View"
                                    >
                                        <Table size={14} />
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* SCREENER VIEW: GRID CARDS */}
                        {viewMode === 'grid' && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {paginatedPicks.map((pick, idx) => (
                                    <motion.div
                                        key={pick.symbol}
                                        initial={{ opacity: 0, y: 15 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: idx * 0.04 }}
                                        className="relative rounded-3xl border backdrop-blur-xl p-6 transition-all hover:scale-[1.01] bg-gray-900/70 border-white/10 hover:border-white/20 shadow-xl"
                                    >
                                        <div className="flex justify-between items-start mb-4">
                                            <div className="flex items-center gap-2">
                                                <span className="px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wider bg-white/5 text-gray-300 border border-white/10">
                                                    #{((currentPage - 1) * pageSize) + idx + 1}
                                                </span>
                                                <div className="flex text-amber-400">
                                                    {Array.from({ length: pick.stars }).map((_, s) => (
                                                        <Star key={s} size={13} fill="#f59e0b" />
                                                    ))}
                                                </div>
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${pick.sampleBadgeColor}`}>
                                                    {pick.sampleTier}
                                                </span>
                                            </div>

                                            <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                                                <Zap size={14} />
                                                <span className="text-sm font-bold font-mono">{pick.technicalScore}</span>
                                                <span className="text-[10px] opacity-70">/100</span>
                                            </div>
                                        </div>

                                        <div className="flex justify-between items-end mb-4 pb-4 border-b border-white/10">
                                            <div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <a
                                                        href={getTradingViewUrl(pick.symbol)}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-2xl font-display font-bold text-white hover:text-blue-300 flex items-center gap-1.5 transition-colors"
                                                        title="Open in TradingView Chart"
                                                    >
                                                        <span>{pick.symbol}</span>
                                                        <ExternalLink size={14} className="text-gray-400 group-hover:text-blue-400" />
                                                    </a>
                                                    <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-white/5 text-gray-400">
                                                        {pick.sector}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-blue-400 font-medium">
                                                    {pick.patternType}
                                                </p>
                                            </div>

                                            <div className="text-right">
                                                <div className="text-xl font-bold font-mono text-white">
                                                    ₹{pick.currentPrice > 0 ? pick.currentPrice.toLocaleString('en-IN') : '—'}
                                                </div>
                                                <div className="text-xs text-gray-400">
                                                    Triggered: {pick.lastSignalDate}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Actionable Strategy Plan */}
                                        <div className="p-4 rounded-2xl bg-black/40 border border-white/10 mb-4 space-y-3">
                                            <div className="text-xs font-bold text-gray-300 uppercase tracking-wider flex items-center justify-between">
                                                <span>Execution Target Plan</span>
                                                <span className="text-blue-400 font-mono text-[11px]">{pick.executionPlan.holdingHorizon}</span>
                                            </div>

                                            <div className="grid grid-cols-3 gap-2 text-center text-xs">
                                                <div className="p-2 rounded-xl bg-white/[0.03] border border-white/5">
                                                    <div className="text-gray-400 text-[10px] mb-0.5">Stop Loss</div>
                                                    <div className="font-bold text-red-400 font-mono">₹{pick.executionPlan.stopLoss}</div>
                                                    <div className="text-[9px] text-red-400/80">-{pick.executionPlan.stopLossPct}%</div>
                                                </div>

                                                <div className="p-2 rounded-xl bg-white/[0.03] border border-white/5">
                                                    <div className="text-gray-400 text-[10px] mb-0.5">Target 1</div>
                                                    <div className="font-bold text-emerald-400 font-mono">₹{pick.executionPlan.target1}</div>
                                                    <div className="text-[9px] text-emerald-400/80">+{pick.executionPlan.target1Pct}%</div>
                                                </div>

                                                <div className="p-2 rounded-xl bg-white/[0.03] border border-white/5">
                                                    <div className="text-gray-400 text-[10px] mb-0.5">MFE / MAE</div>
                                                    <div className="font-bold text-teal-300 font-mono">{pick.asymmetryRatio}:1</div>
                                                    <div className="text-[9px] text-teal-300/80">PF: {pick.profitFactor}</div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Action Links */}
                                        <div className="flex items-center gap-2 pt-3 border-t border-white/5">
                                            <button
                                                onClick={() => setSelectedStockForDrawer(pick)}
                                                className="flex-1 py-2 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 rounded-xl text-blue-300 font-semibold text-xs transition-colors flex items-center justify-center gap-1"
                                            >
                                                <Info size={14} /> Full Trade Plan
                                            </button>
                                            <a
                                                href={getTradingViewUrl(pick.symbol)}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="py-2 px-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-gray-300 hover:text-white text-xs font-semibold transition-colors flex items-center gap-1"
                                                title="Open in TradingView Chart"
                                            >
                                                <LineChart size={14} /> Chart
                                            </a>
                                            <a
                                                href={getScreenerUrl(pick.symbol)}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="py-2 px-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-gray-300 hover:text-white text-xs font-semibold transition-colors"
                                                title="Open in Screener.in"
                                            >
                                                Screener
                                            </a>
                                            <button
                                                onClick={() => navigate(`/dashboard/fundamental/${pick.symbol}`)}
                                                className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-gray-300 hover:text-white"
                                                title="Fundamentals"
                                            >
                                                <BarChart3 size={14} />
                                            </button>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        )}

                        {/* SCREENER VIEW: TABULAR MATRIX */}
                        {viewMode === 'table' && (
                            <div className="overflow-x-auto rounded-2xl border border-white/10 bg-gray-900/60 backdrop-blur-xl">
                                <table className="w-full text-left text-xs">
                                    <thead className="bg-white/5 text-gray-400 font-bold uppercase tracking-wider border-b border-white/10">
                                        <tr>
                                            <th className="p-3.5">Rank</th>
                                            <th className="p-3.5">Symbol</th>
                                            <th className="p-3.5">CMP</th>
                                            <th className="p-3.5">Score</th>
                                            <th className="p-3.5">Setup Type</th>
                                            <th className="p-3.5">MFE/MAE Edge</th>
                                            <th className="p-3.5">Stop Loss</th>
                                            <th className="p-3.5">Target 1</th>
                                            <th className="p-3.5">Sample (N)</th>
                                            <th className="p-3.5 text-right">Action / Links</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                        {paginatedPicks.map((pick, idx) => (
                                            <tr key={pick.symbol} className="hover:bg-white/[0.03] transition-colors">
                                                <td className="p-3.5 font-bold font-mono text-gray-400">
                                                    #{((currentPage - 1) * pageSize) + idx + 1}
                                                </td>
                                                <td className="p-3.5 font-bold text-white">
                                                    <div className="flex items-center gap-1.5">
                                                        <a
                                                            href={getTradingViewUrl(pick.symbol)}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="hover:text-blue-300 transition-colors flex items-center gap-1"
                                                            title="Click to view chart in TradingView"
                                                        >
                                                            <span>{pick.symbol}</span>
                                                            <ExternalLink size={11} className="text-gray-500 hover:text-blue-400" />
                                                        </a>
                                                    </div>
                                                    <div className="text-[10px] text-gray-500 font-normal">{pick.sector}</div>
                                                </td>
                                                <td className="p-3.5 font-mono font-semibold text-white">
                                                    ₹{pick.currentPrice.toLocaleString('en-IN')}
                                                </td>
                                                <td className="p-3.5 font-mono font-bold text-emerald-400">
                                                    {pick.technicalScore}/100
                                                </td>
                                                <td className="p-3.5 text-blue-300 font-medium truncate max-w-xs">
                                                    {pick.patternType}
                                                </td>
                                                <td className="p-3.5 font-mono font-bold text-teal-300">
                                                    {pick.asymmetryRatio}:1
                                                </td>
                                                <td className="p-3.5 font-mono text-red-400">
                                                    ₹{pick.executionPlan.stopLoss} (-{pick.executionPlan.stopLossPct}%)
                                                </td>
                                                <td className="p-3.5 font-mono text-emerald-400">
                                                    ₹{pick.executionPlan.target1} (+{pick.executionPlan.target1Pct}%)
                                                </td>
                                                <td className="p-3.5 text-gray-400">
                                                    {pick.sampleTier}
                                                </td>
                                                <td className="p-3.5 text-right">
                                                    <div className="flex items-center justify-end gap-1.5">
                                                        <button
                                                            onClick={() => setSelectedStockForDrawer(pick)}
                                                            className="px-2.5 py-1 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 rounded-lg text-blue-300 font-semibold text-[11px] transition-colors"
                                                        >
                                                            Plan
                                                        </button>
                                                        <a
                                                            href={getTradingViewUrl(pick.symbol)}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="p-1 rounded bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white"
                                                            title="TradingView Chart"
                                                        >
                                                            <LineChart size={13} />
                                                        </a>
                                                        <a
                                                            href={getScreenerUrl(pick.symbol)}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 text-[10px] font-semibold text-gray-400 hover:text-white"
                                                            title="Screener.in"
                                                        >
                                                            Scr
                                                        </a>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* Pagination Bar */}
                        {totalPages > 1 && (
                            <div className="flex justify-between items-center pt-4 border-t border-white/10 text-xs text-gray-400">
                                <div>
                                    Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(filteredPicks.length, currentPage * pageSize)} of {filteredPicks.length} candidates
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        disabled={currentPage === 1}
                                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                        className="p-2 rounded-xl bg-gray-900 border border-white/10 disabled:opacity-30 hover:bg-gray-800 text-white"
                                    >
                                        <ChevronLeft size={16} />
                                    </button>
                                    <span className="font-bold text-white px-2">
                                        Page {currentPage} of {totalPages}
                                    </span>
                                    <button
                                        disabled={currentPage === totalPages}
                                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                        className="p-2 rounded-xl bg-gray-900 border border-white/10 disabled:opacity-30 hover:bg-gray-800 text-white"
                                    >
                                        <ChevronRight size={16} />
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* -------------------- TAB 2: MODEL PORTFOLIO BUILDER -------------------- */}
                {activeMainTab === 'portfolio' && (
                    <div className="space-y-6">
                        {/* Interactive Capital & Controls Bar */}
                        <div className="p-6 rounded-3xl bg-gray-900/70 border border-white/10 backdrop-blur-xl">
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 pb-6 border-b border-white/10">
                                <div>
                                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                        <Wallet size={22} className="text-emerald-400" />
                                        Model Portfolio Capital Allocator
                                    </h3>
                                    <p className="text-xs text-gray-400 mt-1">
                                        Calculates exact position sizing, share quantities, and risk parameters based on your capital.
                                    </p>
                                </div>

                                <div className="flex items-center gap-4 flex-wrap">
                                    <div>
                                        <label className="text-[11px] text-gray-400 block mb-1 font-semibold">Total Capital (₹)</label>
                                        <input
                                            type="number"
                                            value={portfolioCapital}
                                            onChange={(e) => setPortfolioCapital(Math.max(10000, Number(e.target.value) || 0))}
                                            step={25000}
                                            className="px-3 py-2 bg-black/50 border border-white/15 rounded-xl font-mono text-sm text-white font-bold w-36 focus:outline-none focus:border-emerald-500"
                                        />
                                    </div>

                                    <div>
                                        <label className="text-[11px] text-gray-400 block mb-1 font-semibold">Max Positions</label>
                                        <select
                                            value={maxPositions}
                                            onChange={(e) => setMaxPositions(Number(e.target.value))}
                                            className="px-3 py-2 bg-black/50 border border-white/15 rounded-xl text-sm text-white font-bold focus:outline-none focus:border-emerald-500"
                                        >
                                            <option value={4}>4 Stocks (Focused 25%)</option>
                                            <option value={6}>6 Stocks (Balanced ~16%)</option>
                                            <option value={8}>8 Stocks (Diversified ~12%)</option>
                                            <option value={10}>10 Stocks (Broad ~10%)</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label className="text-[11px] text-gray-400 block mb-1 font-semibold">Cash Buffer Reserve</label>
                                        <select
                                            value={cashReserveBufferPct}
                                            onChange={(e) => setCashReserveBufferPct(Number(e.target.value))}
                                            className="px-3 py-2 bg-black/50 border border-white/15 rounded-xl text-sm text-white font-bold focus:outline-none focus:border-emerald-500"
                                        >
                                            <option value={5}>5% Cash (95% Active)</option>
                                            <option value={10}>10% Cash (Recommended)</option>
                                            <option value={15}>15% Cash (Balanced)</option>
                                            <option value={20}>20% Cash (Conservative)</option>
                                            <option value={0}>0% Cash (100% Deployed)</option>
                                        </select>
                                    </div>

                                    <div className="flex items-center gap-2 mt-4 sm:mt-0">
                                        <button
                                            onClick={() => setIsDeployModalOpen(true)}
                                            className="px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl font-bold text-xs flex items-center gap-2 transition-all shadow-[0_0_20px_rgba(16,185,129,0.35)]"
                                        >
                                            <Rocket size={15} /> Deploy & Track
                                        </button>
                                        <button
                                            onClick={handleExportZerodhaBasket}
                                            className="px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/15 text-white rounded-xl font-bold text-xs flex items-center gap-2 transition-all"
                                        >
                                            <Download size={15} /> Zerodha CSV
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Portfolio KPI Summary Grid */}
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 pt-6 text-center text-xs">
                                <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/5">
                                    <div className="text-gray-500 text-[10px]">Capital Allocation</div>
                                    <div className="text-base font-bold text-white font-mono mt-0.5">
                                        ₹{modelPortfolio.metrics.totalInvested.toLocaleString('en-IN')}
                                    </div>
                                    <div className="text-[10px] text-emerald-400 font-medium">
                                        ₹{modelPortfolio.metrics.cashReserve.toLocaleString('en-IN')} ({modelPortfolio.metrics.cashReservePct}%) Cash Buffer
                                    </div>
                                </div>

                                <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/5">
                                    <div className="text-gray-500 text-[10px]">Expected Strategy Return</div>
                                    <div className="text-base font-bold text-emerald-400 font-mono mt-0.5">
                                        +{modelPortfolio.metrics.expectedPortfolioReturnPct}%
                                    </div>
                                    <div className="text-[10px] text-emerald-300/90 font-mono">
                                        +₹{(modelPortfolio.metrics.totalExpectedProfit || 0).toLocaleString('en-IN')} Est. Gain
                                    </div>
                                </div>

                                <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/5">
                                    <div className="text-gray-500 text-[10px]">Max Risk Budget (SL)</div>
                                    <div className="text-base font-bold text-red-400 font-mono mt-0.5">
                                        ₹{modelPortfolio.metrics.maxRiskValue.toLocaleString('en-IN')}
                                    </div>
                                    <div className="text-[10px] text-red-300/80 font-mono">
                                        {modelPortfolio.metrics.maxRiskPct}% Capital at Risk
                                    </div>
                                </div>

                                <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/5">
                                    <div className="text-gray-500 text-[10px]">Reward-to-Risk Edge</div>
                                    <div className="text-base font-bold text-teal-300 font-mono mt-0.5">
                                        1 : {modelPortfolio.metrics.rewardRiskRatio || 2.2}
                                    </div>
                                    <div className="text-[10px] text-teal-300/80 font-medium">
                                        Asymmetric Edge
                                    </div>
                                </div>

                                <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/5">
                                    <div className="text-gray-500 text-[10px]">Strategy Positions</div>
                                    <div className="text-base font-bold text-blue-400 font-mono mt-0.5">
                                        {modelPortfolio.metrics.positionCount} Stocks
                                    </div>
                                    <div className="text-[10px] text-blue-300/80 font-medium">
                                        ~{modelPortfolio.metrics.avgWinRate || 70}% Strategy Win Rate
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Model Portfolio Positions Grid (Rich Glass Cards) */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {modelPortfolio.positions.map((pos, idx) => (
                                <motion.div
                                    key={pos.symbol}
                                    initial={{ opacity: 0, y: 15 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: idx * 0.05 }}
                                    className="relative rounded-3xl border backdrop-blur-xl p-6 transition-all hover:scale-[1.01] bg-gray-900/70 border-white/10 hover:border-emerald-500/30 shadow-xl"
                                >
                                    <div className="flex justify-between items-start mb-3">
                                        <div className="flex items-center gap-2">
                                            <span className="px-2.5 py-1 rounded-lg text-xs font-extrabold uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                                Position #{idx + 1}
                                            </span>
                                            <span className="text-xs font-bold text-gray-300 px-2 py-0.5 rounded-full bg-white/5 border border-white/10">
                                                {pos.weightPct}% Weight
                                            </span>
                                        </div>

                                        <div className="text-right">
                                            <div className="text-xs text-gray-400">Allocated Capital</div>
                                            <div className="text-lg font-bold font-mono text-emerald-400">
                                                ₹{pos.allocatedAmount.toLocaleString('en-IN')}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex justify-between items-end mb-4 pb-4 border-b border-white/10">
                                        <div>
                                            <div className="flex items-center gap-1.5">
                                                <h3 className="text-2xl font-bold text-white">{pos.symbol}</h3>
                                                <a
                                                    href={getTradingViewUrl(pos.symbol)}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-gray-400 hover:text-blue-400"
                                                    title="TradingView Chart"
                                                >
                                                    <ExternalLink size={14} />
                                                </a>
                                            </div>
                                            <div className="text-xs text-gray-400 mt-0.5">{pos.sector} · {pos.patternType}</div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-xs text-gray-400">Buy Quantity</div>
                                            <div className="text-xl font-bold font-mono text-white">
                                                {pos.shares} Shares <span className="text-xs text-gray-400">@ ₹{pos.entryPrice}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Order Targets & Sizing */}
                                    <div className="grid grid-cols-3 gap-2 text-center text-xs p-3 rounded-2xl bg-black/40 border border-white/5 mb-4">
                                        <div>
                                            <div className="text-gray-500 text-[10px]">Stop Loss</div>
                                            <div className="font-bold text-red-400 font-mono">₹{pos.stopLossPrice}</div>
                                            <div className="text-[9px] text-red-400/80">Risk: -₹{pos.riskAmount}</div>
                                        </div>
                                        <div>
                                            <div className="text-gray-500 text-[10px]">Target 1</div>
                                            <div className="font-bold text-emerald-400 font-mono">₹{pos.target1Price}</div>
                                            <div className="text-[9px] text-emerald-400/80">+{pos.target1Pct}%</div>
                                        </div>
                                        <div>
                                            <div className="text-gray-500 text-[10px]">Target 2 (Runner)</div>
                                            <div className="font-bold text-teal-300 font-mono">₹{pos.target2Price}</div>
                                            <div className="text-[9px] text-teal-300/80">+{pos.target2Pct}%</div>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between text-xs text-gray-400 pt-2 border-t border-white/5">
                                        <span>Holding Horizon: <strong className="text-blue-300">{pos.holdingHorizon}</strong></span>
                                        <div className="flex items-center gap-2">
                                            <a
                                                href={getTradingViewUrl(pos.symbol)}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="px-2.5 py-1 rounded bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white text-xs flex items-center gap-1"
                                            >
                                                <LineChart size={12} /> Chart
                                            </a>
                                            <button
                                                onClick={() => navigate(`/dashboard/fundamental/${pos.symbol}`)}
                                                className="text-blue-400 hover:text-blue-300 font-semibold"
                                            >
                                                Fundamentals →
                                            </button>
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* -------------------- SLIDE-OVER TRADE INSPECTOR DRAWER -------------------- */}
            <AnimatePresence>
                {selectedStockForDrawer && (
                    <div className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm" onClick={() => setSelectedStockForDrawer(null)}>
                        <motion.div
                            initial={{ x: '100%' }}
                            animate={{ x: 0 }}
                            exit={{ x: '100%' }}
                            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                            className="w-full max-w-lg h-full bg-gray-950 border-l border-white/10 p-6 overflow-y-auto shadow-2xl flex flex-col justify-between"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div>
                                <div className="flex justify-between items-start mb-6">
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <a
                                                href={getTradingViewUrl(selectedStockForDrawer.symbol)}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-3xl font-bold text-white hover:text-blue-300 flex items-center gap-2 transition-colors"
                                                title="Open in TradingView Chart"
                                            >
                                                <span>{selectedStockForDrawer.symbol}</span>
                                                <ExternalLink size={18} className="text-gray-400 hover:text-blue-400" />
                                            </a>
                                            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                                                Score: {selectedStockForDrawer.technicalScore}
                                            </span>
                                        </div>
                                        <p className="text-xs text-gray-400">{selectedStockForDrawer.sector} · {selectedStockForDrawer.patternType}</p>
                                    </div>
                                    <button
                                        onClick={() => setSelectedStockForDrawer(null)}
                                        className="p-2 text-gray-400 hover:text-white rounded-xl bg-white/5 hover:bg-white/10"
                                    >
                                        <X size={18} />
                                    </button>
                                </div>

                                <div className="space-y-6">
                                    {/* Actionable Execution Plan */}
                                    <div className="p-4 rounded-2xl bg-gray-900 border border-white/10 space-y-3">
                                        <h4 className="text-xs font-bold text-white uppercase tracking-wider">Execution Setup Plan</h4>
                                        <div className="grid grid-cols-2 gap-3 text-xs">
                                            <div className="p-2.5 rounded-xl bg-black/40">
                                                <div className="text-gray-500 text-[10px]">Entry Action</div>
                                                <div className="font-bold text-white mt-0.5">{selectedStockForDrawer.executionPlan.entryAction}</div>
                                            </div>
                                            <div className="p-2.5 rounded-xl bg-black/40">
                                                <div className="text-gray-500 text-[10px]">Reference Price</div>
                                                <div className="font-bold text-white font-mono mt-0.5">₹{selectedStockForDrawer.currentPrice}</div>
                                            </div>
                                            <div className="p-2.5 rounded-xl bg-black/40">
                                                <div className="text-gray-500 text-[10px]">Stop Loss Price</div>
                                                <div className="font-bold text-red-400 font-mono mt-0.5">₹{selectedStockForDrawer.executionPlan.stopLoss} (-{selectedStockForDrawer.executionPlan.stopLossPct}%)</div>
                                            </div>
                                            <div className="p-2.5 rounded-xl bg-black/40">
                                                <div className="text-gray-500 text-[10px]">Target 1 (1:2)</div>
                                                <div className="font-bold text-emerald-400 font-mono mt-0.5">₹{selectedStockForDrawer.executionPlan.target1} (+{selectedStockForDrawer.executionPlan.target1Pct}%)</div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Backtest Empirical Metrics */}
                                    <div className="p-4 rounded-2xl bg-gray-900 border border-white/10 space-y-3">
                                        <h4 className="text-xs font-bold text-white uppercase tracking-wider">Empirical Backtest Metrics</h4>
                                        <div className="grid grid-cols-3 gap-2 text-center text-xs">
                                            <div className="p-2 rounded-xl bg-black/40">
                                                <div className="text-gray-500 text-[10px]">Avg Runup (MFE)</div>
                                                <div className="font-bold text-emerald-400 font-mono">+{selectedStockForDrawer.avgRunup}%</div>
                                            </div>
                                            <div className="p-2 rounded-xl bg-black/40">
                                                <div className="text-gray-500 text-[10px]">Avg Drawdown (MAE)</div>
                                                <div className="font-bold text-red-400 font-mono">-{selectedStockForDrawer.avgDrawdown}%</div>
                                            </div>
                                            <div className="p-2 rounded-xl bg-black/40">
                                                <div className="text-gray-500 text-[10px]">Profit Factor</div>
                                                <div className="font-bold text-teal-300 font-mono">{selectedStockForDrawer.profitFactor}</div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Technical Validation Points */}
                                    <div className="space-y-2 text-xs text-gray-300">
                                        <h4 className="text-xs font-bold text-white uppercase tracking-wider">Validation Criteria</h4>
                                        {selectedStockForDrawer.technicalReasons.map((r, i) => (
                                            <div key={i} className="flex items-start gap-2">
                                                <CheckCircle size={14} className="text-emerald-400 mt-0.5 shrink-0" />
                                                <span>{r}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Drawer Action Buttons */}
                            <div className="pt-6 border-t border-white/10 flex items-center gap-3">
                                <button
                                    onClick={() => navigate(`/dashboard/fundamental/${selectedStockForDrawer.symbol}`)}
                                    className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-xs transition-colors flex items-center justify-center gap-2"
                                >
                                    <BarChart3 size={15} /> Deep Fundamentals
                                </button>
                                <a
                                    href={getTradingViewUrl(selectedStockForDrawer.symbol)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="py-3 px-4 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-xl font-bold text-xs transition-colors flex items-center gap-1.5"
                                >
                                    <LineChart size={15} /> TradingView Chart
                                </a>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Pre-Deployment Checklist Modal */}
            <PreDeployChecklistModal
                isOpen={isDeployModalOpen}
                onClose={() => setIsDeployModalOpen(false)}
                onConfirmDeploy={handleConfirmDeploy}
                modelPortfolio={modelPortfolio}
                horizonStyle={horizonStyle}
                optimalHorizonDays={optimalHorizonInfo.bestHorizonDays || 14}
            />

            {/* AI Glance Modal Workstation */}
            {isGlanceOpen && activeReport?.trades && (
                <AIGlanceModal
                    isOpen={isGlanceOpen}
                    onClose={() => setIsGlanceOpen(false)}
                    trades={activeReport.trades}
                    initialIndex={glanceTradeIndex}
                />
            )}
        </div>
    );
};

export default LiveMarketScanner;
