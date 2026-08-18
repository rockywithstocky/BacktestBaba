import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    PieChart, Pie, Cell, LineChart, Line, Area, AreaChart, ComposedChart, Scatter
} from 'recharts';
import {
    ArrowLeft, TrendingUp, TrendingDown, Percent, Search, ChevronLeft, ChevronRight,
    ArrowUp, ArrowDown, X, BarChart3, LineChart as LineChartIcon, Activity, ArrowRight,
    ChartBar, ExternalLink, Sliders, Shield, Zap, Target, Download, Calendar, Layers, CheckCircle2, AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import './Dashboard.css';

import StockChartModal from './StockChartModal';
import AnalyzerPanel from '../analyzer/AnalyzerPanel';
import MonthlyHeatmap from './MonthlyHeatmap';
import EquityCurveChart from './EquityCurveChart';
import { getFreshStocks } from '../analyzer/analyzerUtils';
import { simulateStrategy } from '../utils/strategySimulator';

const COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444'];

const Dashboard = ({ report, onBack }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [sortConfig, setSortConfig] = useState({ key: 'signal_date', direction: 'asc' });
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(25);
    const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'equity' | 'monthly' | 'edge' | 'trades'
    const [tradeFilter, setTradeFilter] = useState('all'); // 'all' | 'winners' | 'losers' | 'target_hit' | 'sl_hit' | 'fresh'

    // Realistic Simulation Config State
    const [simConfig, setSimConfig] = useState({
        stopLossPercent: 6.0,
        targetPercent: 12.0,
        slippagePercent: 0.10,
        brokeragePerOrder: 20,
        horizon: '30d'
    });

    const capitalRef = useRef(null);
    const [capital, setCapital] = useState(() => {
        return localStorage.getItem('backtest_capital') || '';
    });
    useEffect(() => {
        if (capitalRef.current) capitalRef.current.value = capital;
    }, []);
    useEffect(() => {
        localStorage.setItem('backtest_capital', capital === '' || capital === '0' ? '' : capital);
    }, [capital]);

    const [selectedStock, setSelectedStock] = useState(null);
    const [selectedPeriod, setSelectedPeriod] = useState(null);
    const [panelOpen, setPanelOpen] = useState(false);
    const [panelSymbol, setPanelSymbol] = useState(null);
    const [selectedEntryPrice, setSelectedEntryPrice] = useState(null);

    const successfulTrades = useMemo(() => {
        if (!Array.isArray(report?.trades)) {
            return [];
        }
        return report.trades.filter(t => t.status === 'Success');
    }, [report?.trades]);

    // Compute realistic quant simulation
    const simulationResult = useMemo(() => {
        const capPerTrade = Number(capital) > 0 ? Number(capital) / 5 : 50000;
        return simulateStrategy(successfulTrades, {
            ...simConfig,
            capitalPerTrade: capPerTrade
        });
    }, [successfulTrades, simConfig, capital]);

    const { simulatedTrades, equityCurve, monthlyMatrix, quantMetrics } = simulationResult;

    const stats = useMemo(() => {
        const calc = (period) => {
            const key = `return_${period}`;
            const values = successfulTrades.map(t => t[key]).filter(v => v !== null);
            if (values.length === 0) return null;

            const positiveValues = values.filter(v => v > 0);
            const negativeValues = values.filter(v => v < 0);
            const sorted = [...values].sort((a, b) => a - b);
            const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
            const median = sorted.length % 2 === 0
                ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
                : sorted[Math.floor(sorted.length / 2)];

            const posSorted = [...positiveValues].sort((a, b) => a - b);
            const negSorted = [...negativeValues].sort((a, b) => a - b);
            const posAvg = positiveValues.length > 0 ? positiveValues.reduce((s, v) => s + v, 0) / positiveValues.length : 0;
            const negAvg = negativeValues.length > 0 ? negativeValues.reduce((s, v) => s + v, 0) / negativeValues.length : 0;
            
            const grossProfit = positiveValues.reduce((s, v) => s + v, 0);
            const grossLoss = Math.abs(negativeValues.reduce((s, v) => s + v, 0));
            const profitFactor = grossLoss > 0 ? (grossProfit / grossLoss) : (grossProfit > 0 ? Infinity : 0);

            const std = Math.sqrt(values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / values.length);
            const consistency = std > 0 ? avg / std : (avg > 0 ? 999 : -999);

            return {
                avg, median,
                highest: Math.max(...values),
                lowest: Math.min(...values),
                positiveCount: positiveValues.length,
                negativeCount: negativeValues.length,
                positiveMedian: posSorted.length > 0 ? posSorted[Math.floor(posSorted.length / 2)] : 0,
                positiveAvg: posAvg,
                negativeMedian: negSorted.length > 0 ? negSorted[Math.floor(negSorted.length / 2)] : 0,
                negativeAvg: negAvg,
                profitFactor,
                consistency,
                capitalReturn: (Number(capital) || 0) * (avg / 100)
            };
        };
        return {
            '7d': calc('7d'),
            '14d': calc('14d'),
            '30d': calc('30d'),
            '45d': calc('45d'),
            '60d': calc('60d'),
            '90d': calc('90d')
        };
    }, [successfulTrades, capital]);

    const enrichmentStats = useMemo(() => {
        const sectorMap = {};
        const periodKey = 'return_30d';

        successfulTrades.forEach(t => {
            const ret = t[periodKey];
            if (ret === null || ret === undefined) return;

            const sector = t.sector || 'Unknown';

            if (!sectorMap[sector]) sectorMap[sector] = { sum: 0, count: 0 };
            sectorMap[sector].sum += ret;
            sectorMap[sector].count += 1;
        });

        const formatAgg = (map) => Object.keys(map)
            .map(k => ({ name: k, avgReturn: map[k].sum / map[k].count, count: map[k].count }))
            .filter(item => item.count >= 3)
            .sort((a, b) => b.avgReturn - a.avgReturn)
            .slice(0, 10);

        return {
            sectors: formatAgg(sectorMap)
        };
    }, [successfulTrades]);

    const distributionData = useMemo(() => {
        const returns = successfulTrades.map(t => t.return_30d).filter(v => v !== null && v !== undefined);
        if (returns.length === 0) return [];
        const ranges = [
            { min: -Infinity, max: -20, label: '< -20%' },
            { min: -20, max: -10, label: '-20%' },
            { min: -10, max: -5, label: '-10%' },
            { min: -5, max: 0, label: '-5%' },
            { min: 0, max: 5, label: '0%' },
            { min: 5, max: 10, label: '+5%' },
            { min: 10, max: 20, label: '+10%' },
            { min: 20, max: 40, label: '+20%' },
            { min: 40, max: Infinity, label: '> +40%' },
        ];
        const counts = ranges.map(() => 0);
        returns.forEach(v => {
            for (let i = 0; i < ranges.length; i++) {
                if (v > ranges[i].min && v <= ranges[i].max) { counts[i]++; break; }
            }
        });
        return ranges.map((r, i) => ({ label: r.label, count: counts[i], fill: r.max <= 0 ? '#ef4444' : '#10b981' }));
    }, [successfulTrades]);

    const handleSort = (key) => {
        setSortConfig(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const freshStocks = useMemo(() => {
        return getFreshStocks(successfulTrades);
    }, [successfulTrades]);

    const freshSymbolSet = useMemo(() => {
        return new Set(freshStocks.map(s => s.symbol));
    }, [freshStocks]);

    // Map simulated trade metadata onto trade list
    const enrichedTrades = useMemo(() => {
        const simMap = new Map();
        simulatedTrades.forEach(st => {
            const key = `${st.symbol}_${st.signal_date}`;
            simMap.set(key, st);
        });

        return successfulTrades.map(t => {
            const key = `${t.symbol}_${t.signal_date}`;
            const sim = simMap.get(key) || {};
            return {
                ...t,
                simulatedExitReason: sim.simulatedExitReason,
                simulatedExitPrice: sim.simulatedExitPrice,
                netReturnPct: sim.netReturnPct,
                netPnl: sim.netPnl,
                tradeCharges: sim.tradeCharges,
                isFresh: freshSymbolSet.has(t.symbol)
            };
        });
    }, [successfulTrades, simulatedTrades, freshSymbolSet]);

    const filteredTrades = useMemo(() => {
        let list = enrichedTrades;

        // Apply trade status filter
        if (tradeFilter === 'winners') {
            list = list.filter(t => (t.netPnl ?? (t.return_30d ?? 0)) > 0);
        } else if (tradeFilter === 'losers') {
            list = list.filter(t => (t.netPnl ?? (t.return_30d ?? 0)) < 0);
        } else if (tradeFilter === 'target_hit') {
            list = list.filter(t => t.simulatedExitReason === 'Target Hit');
        } else if (tradeFilter === 'sl_hit') {
            list = list.filter(t => t.simulatedExitReason === 'Stop Loss Hit');
        } else if (tradeFilter === 'fresh') {
            list = list.filter(t => t.isFresh);
        }

        // Apply symbol search
        if (searchTerm.trim()) {
            const term = searchTerm.toLowerCase();
            list = list.filter(trade => trade.symbol.toLowerCase().includes(term));
        }

        return list;
    }, [enrichedTrades, tradeFilter, searchTerm]);

    const sortedTrades = useMemo(() => {
        const sorted = [...filteredTrades];
        if (sortConfig.key) {
            sorted.sort((a, b) => {
                let aVal = a[sortConfig.key];
                let bVal = b[sortConfig.key];

                if (sortConfig.key === 'signal_date' || sortConfig.key === 'entry_date' || sortConfig.key === 'max_high_date' || sortConfig.key === 'max_low_date') {
                    aVal = new Date(aVal).getTime();
                    bVal = new Date(bVal).getTime();
                }

                aVal = aVal ?? -Infinity;
                bVal = bVal ?? -Infinity;
                return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
            });
        }
        return sorted;
    }, [filteredTrades, sortConfig]);

    const paginatedTrades = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return sortedTrades.slice(start, start + itemsPerPage);
    }, [sortedTrades, currentPage, itemsPerPage]);

    const totalPages = Math.max(1, Math.ceil(sortedTrades.length / itemsPerPage));

    const formatPercent = (val) => val !== null && val !== undefined ? `${val > 0 ? '+' : ''}${val.toFixed(2)}%` : 'N/A';
    const formatCurrency = (val) => val !== null && val !== undefined && val !== '' ? `₹${Number(val).toFixed(2)}` : 'N/A';
    const getColorClass = (val) => val > 0 ? 'positive' : val < 0 ? 'negative' : 'neutral';
    const HEAT_TIER_1 = 2;
    const HEAT_TIER_2 = 5;
    const HEAT_TIER_3 = 10;

    const getReturnClass = (val) => {
        if (val === null || val === undefined || isNaN(val) || val === 0) return 'neutral';
        const sign = val > 0 ? 'pos' : 'neg';
        const abs = Math.abs(val);
        const tier = abs >= HEAT_TIER_3 ? 4 : abs >= HEAT_TIER_2 ? 3 : abs >= HEAT_TIER_1 ? 2 : 1;
        return `heat-${sign}-${tier}`;
    };

    const parseCapNumber = (s) => {
        let text = String(s).replace(/[₹,\s]/g, '');
        const match = text.match(/^([\d.]+)\s*(cr|crore|lakh|lac)?/i);
        if (!match) return null;
        const value = parseFloat(match[1]);
        if (isNaN(value)) return null;
        const unit = (match[2] || '').toLowerCase();
        if (unit === 'cr' || unit === 'crore') return value * 1e7;
        if (unit === 'lakh' || unit === 'lac') return value * 1e5;
        return value;
    };

    const normalizeCapLabel = (raw) => {
        if (raw === null || raw === undefined) return 'Unknown';
        let s = String(raw).trim();
        if (!s) return 'Unknown';
        const compact = s.toLowerCase().replace(/[^a-z0-9.]/g, '');
        if (compact.includes('large')) return 'Largecap';
        if (compact.includes('micro')) return 'Microcap';
        if (compact.includes('mid')) return 'Midcap';
        if (compact.includes('small')) return 'Smallcap';
        const num = parseCapNumber(s);
        if (num !== null) {
            if (num >= 2e11) return 'Largecap';
            if (num >= 2e10) return 'Midcap';
            if (num >= 2.5e9) return 'Smallcap';
            return 'Microcap';
        }
        return 'Unknown';
    };

    const buildCapMatrix = (trades) => {
        const buckets = {};
        trades.forEach(t => {
            const name = normalizeCapLabel(t.market_cap);
            if (!buckets[name]) buckets[name] = [];
            buckets[name].push(t);
        });
        return Object.keys(buckets)
            .map(name => {
                const bucketTrades = buckets[name];
                const calc = (key) => {
                    const vals = bucketTrades.map(t => t[key]).filter(v => v !== null && v !== undefined && !isNaN(v));
                    return vals.length === 0 ? null : vals.reduce((s, v) => s + v, 0) / vals.length;
                };
                const avg30 = calc('return_30d');
                const r30 = bucketTrades.map(t => t.return_30d).filter(v => v !== null && v !== undefined && !isNaN(v));
                const winRate = r30.length === 0 ? null : (r30.filter(v => v > 0).length / r30.length) * 100;
                const wins = r30.filter(v => v > 0);
                const losses = r30.filter(v => v < 0);
                const avgWin = wins.length ? wins.reduce((s, v) => s + v, 0) / wins.length : null;
                const avgLoss = losses.length ? losses.reduce((s, v) => s + v, 0) / losses.length : null;
                const std = r30.length > 1 ? Math.sqrt(r30.reduce((s, v) => s + (v - avg30) ** 2, 0) / r30.length) : 0;
                const consistency = std > 0 ? avg30 / std : (avg30 > 0 ? 999 : -999);
                return {
                    name, count: bucketTrades.length,
                    return_7d: calc('return_7d'),
                    return_30d: avg30,
                    return_90d: calc('return_90d'),
                    winRate, avgWin, avgLoss, consistency
                };
            })
            .filter(b => b.count >= 3)
            .sort((a, b) => (b.return_30d ?? -Infinity) - (a.return_30d ?? -Infinity));
    };

    const sortHeatmapRows = (trades, cap = 150) => {
        return [...trades]
            .sort((a, b) => {
                const aDate = a.signal_date ? new Date(a.signal_date).getTime() : -Infinity;
                const bDate = b.signal_date ? new Date(b.signal_date).getTime() : -Infinity;
                if (bDate !== aDate) return bDate - aDate;
                return a.symbol.localeCompare(b.symbol);
            })
            .slice(0, cap);
    };

    const capMatrix = useMemo(() => buildCapMatrix(successfulTrades), [successfulTrades]);
    const heatmapRows = useMemo(() => sortHeatmapRows(filteredTrades), [filteredTrades]);

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

    const getEntryDate = (trade) => trade.entry_date || trade.signal_date;

    const getExitDate = (trade, period) => {
        const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
        const date = new Date(getEntryDate(trade));
        date.setDate(date.getDate() + days);
        return date.toLocaleDateString('en-IN');
    };

    const handleCellClick = (trade, period) => {
        setSelectedStock(trade);
        setSelectedPeriod(period);
    };

    const getTooltipContent = (trade, period) => {
        const exitPriceKey = `exit_price_${period}`;
        const exitDate = getExitDate(trade, period);
        const exitPrice = trade[exitPriceKey];

        return `📅 Exit Date: ${exitDate}\n💰 Exit Price: ${formatCurrency(exitPrice)}`;
    };

    const bestSymbol = report.best_performer?.symbol;
    const worstSymbol = report.worst_performer?.symbol;

    const riskStats = useMemo(() => {
        const vals = successfulTrades.filter(t => t.entry_price && t.max_low_90d && t.max_high_90d);
        if (vals.length === 0) return null;
        const drawdowns = vals.map(t => ((t.entry_price - t.max_low_90d) / t.entry_price) * 100);
        const runups = vals.map(t => ((t.max_high_90d - t.entry_price) / t.entry_price) * 100);
        const avgDrawdown = drawdowns.reduce((s, v) => s + v, 0) / drawdowns.length;
        const avgRunup = runups.reduce((s, v) => s + v, 0) / runups.length;
        const maxDrawdown = Math.max(...drawdowns);
        const stop5Hit = drawdowns.filter(d => d >= 5).length;
        const stop8Hit = drawdowns.filter(d => d >= 8).length;
        return { avgDrawdown, avgRunup, maxDrawdown, stop5Hit, stop8Hit, total: vals.length };
    }, [successfulTrades]);

    const handleOpenPanel = (symbol, price) => {
        setPanelSymbol(symbol || null);
        setSelectedEntryPrice(price || null);
        setPanelOpen(true);
    };

    // Export CSV handler
    const exportCSV = () => {
        const headers = ["Symbol", "Signal Date", "Signal Close", "Entry Date", "Entry Price", "Latest Price", "Exit Reason", "Net Return %", "Net PnL (₹)", "1W Return %", "1M Return %", "3M Return %", "Max High 90d", "Max Low 90d", "Sector"];
        const rows = filteredTrades.map(t => [
            t.symbol,
            t.signal_date || '',
            t.signal_close_price || '',
            getEntryDate(t) || '',
            t.entry_price || '',
            t.latest_price || '',
            t.simulatedExitReason || 'Standard Exit',
            t.netReturnPct ?? t.return_30d ?? '',
            t.netPnl ?? '',
            t.return_7d ?? '',
            t.return_30d ?? '',
            t.return_90d ?? '',
            t.max_high_90d || '',
            t.max_low_90d || '',
            t.sector || ''
        ]);

        const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `BacktestBaba_Trades_${report.entry_mode || 'strategy'}.csv`);
        document.body.appendChild(link);
        link.click();
        link.remove();
    };

    return (
        <motion.div className="dashboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {selectedStock && selectedPeriod && (
                <StockChartModal
                    stock={selectedStock}
                    period={selectedPeriod}
                    onClose={() => {
                        setSelectedStock(null);
                        setSelectedPeriod(null);
                    }}
                />
            )}

            {/* Header Area */}
            <div className="dashboard-header">
                <button onClick={onBack} className="btn-back">
                    <ArrowLeft size={20} /> Back
                </button>
                <div className="flex items-center gap-4">
                    <h1 className="dashboard-title">Backtest Report</h1>
                    {report.entry_mode && (
                        <span className={`mode-badge ${report.entry_mode === 'next_open' ? 'open' : report.entry_mode === 'same_close' ? 'same-close' : 'close'}`}>
                            {report.entry_mode.toUpperCase().replace('_', ' ')}
                        </span>
                    )}
                </div>
                <div className="header-controls">
                    <div className="capital-input-group">
                        <span className="currency-symbol">₹</span>
                        <input
                            ref={capitalRef}
                            type="text"
                            inputMode="numeric"
                            defaultValue={capital || ''}
                            onInput={(e) => {
                                e.target.value = e.target.value.replace(/[^0-9]/g, '');
                                setCapital(e.target.value);
                            }}
                            onBlur={(e) => {
                                const v = e.target.value;
                                if (v === '' || v === '0') {
                                    e.target.value = '100000';
                                    setCapital('100000');
                                }
                            }}
                            className="capital-input"
                            placeholder="Capital"
                        />
                    </div>
                    <button
                        className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all text-sm font-semibold text-gray-200"
                        onClick={() => {
                            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(report, null, 2));
                            const downloadAnchorNode = document.createElement('a');
                            downloadAnchorNode.setAttribute("href", dataStr);
                            downloadAnchorNode.setAttribute("download", "backtest_report.json");
                            document.body.appendChild(downloadAnchorNode);
                            downloadAnchorNode.click();
                            downloadAnchorNode.remove();
                        }}
                    >
                        <ArrowDown size={16} /> JSON
                    </button>
                    <button
                        title="Export current trades to CSV"
                        onClick={exportCSV}
                        className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 rounded-xl transition-all text-sm font-semibold text-blue-400"
                    >
                        <Download size={16} /> CSV
                    </button>
                    <button
                        title="Open analyzer panel"
                        onClick={() => handleOpenPanel(null, null)}
                        className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-600/30 rounded-xl transition-all text-sm font-semibold text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.15)]"
                    >
                        <ChartBar size={16} /> Strategy AI
                    </button>
                </div>
            </div>

            {/* Strategy Execution Simulator Bar */}
            <div className="w-full rounded-2xl border border-white/10 bg-gradient-to-r from-gray-900/90 via-gray-900/60 to-gray-900/90 backdrop-blur-xl p-5 mb-8 shadow-2xl">
                <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 pb-4 border-b border-white/10">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
                            <Sliders size={20} />
                        </div>
                        <div>
                            <h3 className="text-base font-bold text-white flex items-center gap-2">
                                Realistic Strategy Simulator & Friction Modeling
                                <span className="px-2 py-0.5 rounded-full text-[10px] uppercase font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                    Instant Calc
                                </span>
                            </h3>
                            <p className="text-xs text-gray-400">
                                Real-time dynamic recalculation of Stop Loss, Profit Target, Indian Taxes (STT, GST, Stamp Duty) & Slippage
                            </p>
                        </div>
                    </div>

                    {/* Quick Presets */}
                    <div className="flex items-center gap-2 flex-wrap text-xs">
                        <span className="text-gray-400 text-xs font-semibold mr-1">Presets:</span>
                        <button
                            onClick={() => setSimConfig(c => ({ ...c, stopLossPercent: 4.0, targetPercent: 8.0, slippagePercent: 0.08 }))}
                            className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10 transition-colors"
                        >
                            Conservative (4% SL / 8% TP)
                        </button>
                        <button
                            onClick={() => setSimConfig(c => ({ ...c, stopLossPercent: 6.0, targetPercent: 12.0, slippagePercent: 0.10 }))}
                            className="px-2.5 py-1 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/20 transition-colors font-medium"
                        >
                            Swing 1:2 (6% SL / 12% TP)
                        </button>
                        <button
                            onClick={() => setSimConfig(c => ({ ...c, stopLossPercent: 8.0, targetPercent: 20.0, slippagePercent: 0.15 }))}
                            className="px-2.5 py-1 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/20 transition-colors"
                        >
                            Runner (8% SL / 20% TP)
                        </button>
                    </div>
                </div>

                {/* Slider Controls Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 pt-4">
                    {/* Stop Loss Slider */}
                    <div className="space-y-1.5">
                        <div className="flex justify-between items-center text-xs">
                            <span className="text-gray-400 flex items-center gap-1">
                                <Shield size={13} className="text-red-400" /> Stop Loss (SL)
                            </span>
                            <span className="font-bold text-red-400 font-mono">-{simConfig.stopLossPercent}%</span>
                        </div>
                        <input
                            type="range"
                            min="1.0"
                            max="25.0"
                            step="0.5"
                            value={simConfig.stopLossPercent}
                            onChange={(e) => setSimConfig({ ...simConfig, stopLossPercent: parseFloat(e.target.value) })}
                            className="w-full h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-red-500"
                        />
                        <div className="flex justify-between text-[10px] text-gray-500">
                            <span>1% (Tight)</span>
                            <span>Hits: {quantMetrics.stopLossHits}</span>
                            <span>25%</span>
                        </div>
                    </div>

                    {/* Target Slider */}
                    <div className="space-y-1.5">
                        <div className="flex justify-between items-center text-xs">
                            <span className="text-gray-400 flex items-center gap-1">
                                <Target size={13} className="text-emerald-400" /> Take Profit (TP)
                            </span>
                            <span className="font-bold text-emerald-400 font-mono">+{simConfig.targetPercent}%</span>
                        </div>
                        <input
                            type="range"
                            min="3.0"
                            max="50.0"
                            step="0.5"
                            value={simConfig.targetPercent}
                            onChange={(e) => setSimConfig({ ...simConfig, targetPercent: parseFloat(e.target.value) })}
                            className="w-full h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                        />
                        <div className="flex justify-between text-[10px] text-gray-500">
                            <span>3%</span>
                            <span>Hits: {quantMetrics.targetHits}</span>
                            <span>50% (Max)</span>
                        </div>
                    </div>

                    {/* Slippage Slider */}
                    <div className="space-y-1.5">
                        <div className="flex justify-between items-center text-xs">
                            <span className="text-gray-400 flex items-center gap-1">
                                <Zap size={13} className="text-amber-400" /> Slippage per Leg
                            </span>
                            <span className="font-bold text-amber-400 font-mono">{simConfig.slippagePercent}%</span>
                        </div>
                        <input
                            type="range"
                            min="0.0"
                            max="0.50"
                            step="0.02"
                            value={simConfig.slippagePercent}
                            onChange={(e) => setSimConfig({ ...simConfig, slippagePercent: parseFloat(e.target.value) })}
                            className="w-full h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                        />
                        <div className="flex justify-between text-[10px] text-gray-500">
                            <span>0.0% (Ideal)</span>
                            <span>Total Friction: ₹{Math.round(quantMetrics.totalCharges).toLocaleString('en-IN')}</span>
                            <span>0.5%</span>
                        </div>
                    </div>

                    {/* Holding Horizon Selector */}
                    <div className="space-y-1.5">
                        <div className="flex justify-between items-center text-xs">
                            <span className="text-gray-400">Baseline Horizon</span>
                            <span className="font-bold text-blue-400 font-mono">{simConfig.horizon.toUpperCase()}</span>
                        </div>
                        <div className="grid grid-cols-4 gap-1">
                            {['7d', '14d', '30d', '90d'].map(h => (
                                <button
                                    key={h}
                                    onClick={() => setSimConfig({ ...simConfig, horizon: h })}
                                    className={`py-1 rounded text-xs font-semibold transition-all ${
                                        simConfig.horizon === h
                                            ? 'bg-blue-600 text-white shadow-[0_0_10px_rgba(59,130,246,0.3)]'
                                            : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
                                    }`}
                                >
                                    {h}
                                </button>
                            ))}
                        </div>
                        <div className="text-[10px] text-gray-500 text-right">
                            Avg hold: {quantMetrics.avgHoldingDays} days
                        </div>
                    </div>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex items-center gap-2 border-b border-white/10 pb-4 mb-6 overflow-x-auto">
                {[
                    { id: 'overview', label: 'Overview & Quant Scorecard', icon: <TrendingUp size={16} /> },
                    { id: 'equity', label: 'Equity Curve & Benchmark', icon: <Layers size={16} /> },
                    { id: 'monthly', label: 'Monthly Performance Heatmap', icon: <Calendar size={16} /> },
                    { id: 'edge', label: 'Edge & Market Breakdown', icon: <BarChart3 size={16} /> },
                    { id: 'trades', label: `Trades Log (${filteredTrades.length})`, icon: <Activity size={16} /> },
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-xs whitespace-nowrap transition-all ${
                            activeTab === tab.id
                                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-[0_0_20px_rgba(59,130,246,0.3)]'
                                : 'bg-white/[0.03] text-gray-400 hover:text-white hover:bg-white/[0.06] border border-white/5'
                        }`}
                    >
                        {tab.icon}
                        <span>{tab.label}</span>
                    </button>
                ))}
            </div>

            {/* TAB CONTENT 1: OVERVIEW & QUANT SCORECARD */}
            {activeTab === 'overview' && (
                <div className="space-y-6">
                    {/* Quant KPI Row */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
                        <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10 backdrop-blur-sm">
                            <div className="text-xs text-gray-400 mb-1">Total Net PnL</div>
                            <div className={`text-xl font-bold font-mono ${quantMetrics.netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                ₹{Math.round(quantMetrics.netProfit).toLocaleString('en-IN')}
                            </div>
                            <div className="text-[11px] text-gray-500 mt-1">ROI: {formatPercent(quantMetrics.totalRoiPct)}</div>
                        </div>

                        <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10 backdrop-blur-sm">
                            <div className="text-xs text-gray-400 mb-1">Win Rate</div>
                            <div className="text-xl font-bold font-mono text-emerald-400">
                                {quantMetrics.winRate}%
                            </div>
                            <div className="text-[11px] text-gray-500 mt-1">{quantMetrics.winnersCount}W / {quantMetrics.losersCount}L</div>
                        </div>

                        <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10 backdrop-blur-sm">
                            <div className="text-xs text-gray-400 mb-1">Profit Factor</div>
                            <div className="text-xl font-bold font-mono text-blue-400">
                                {quantMetrics.profitFactor}x
                            </div>
                            <div className="text-[11px] text-gray-500 mt-1">Gross Win/Loss</div>
                        </div>

                        <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10 backdrop-blur-sm">
                            <div className="text-xs text-gray-400 mb-1">Sharpe Ratio</div>
                            <div className={`text-xl font-bold font-mono ${quantMetrics.sharpeRatio >= 1.5 ? 'text-emerald-400' : 'text-purple-400'}`}>
                                {quantMetrics.sharpeRatio}
                            </div>
                            <div className="text-[11px] text-gray-500 mt-1">Risk Adjusted</div>
                        </div>

                        <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10 backdrop-blur-sm">
                            <div className="text-xs text-gray-400 mb-1">Max Drawdown</div>
                            <div className="text-xl font-bold font-mono text-red-400">
                                -{quantMetrics.maxDrawdown}%
                            </div>
                            <div className="text-[11px] text-gray-500 mt-1">Calmar: {quantMetrics.calmarRatio}x</div>
                        </div>

                        <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10 backdrop-blur-sm">
                            <div className="text-xs text-gray-400 mb-1">Expectancy / Trade</div>
                            <div className={`text-xl font-bold font-mono ${quantMetrics.expectancy >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                ₹{Math.round(quantMetrics.expectancy).toLocaleString('en-IN')}
                            </div>
                            <div className="text-[11px] text-gray-500 mt-1">Payoff: {quantMetrics.payoffRatio}x</div>
                        </div>
                    </div>

                    {/* Summary Cards */}
                    <div className="summary-cards">
                        <div className="stat-card">
                            <div className="stat-icon"><TrendingUp size={24} /></div>
                            <div className="stat-content">
                                <div className="stat-label">Total Signals</div>
                                <div className="stat-value">{report.total_signals}</div>
                                <div className="stat-subtext"><span className="positive">{report.successful_signals}</span> data available</div>
                            </div>
                        </div>
                        <div className="stat-card">
                            <div className={`stat-icon ${report.win_rate_7d >= 50 ? 'success' : 'negative'}`}><Percent size={24} /></div>
                            <div className="stat-content">
                                <div className="stat-label">Win Rate (1 Week)</div>
                                <div className={`stat-value ${report.win_rate_7d >= 50 ? 'success' : 'negative'}`}>{report.win_rate_7d?.toFixed(1)}%</div>
                                <div className="stat-subtext">Avg: <span className={getColorClass(report.avg_return_7d)}>{formatPercent(report.avg_return_7d)}</span></div>
                            </div>
                        </div>
                        <div className="stat-card">
                            <div className={`stat-icon ${report.win_rate_30d >= 50 ? 'success' : 'negative'}`}><Percent size={24} /></div>
                            <div className="stat-content">
                                <div className="stat-label">Win Rate (1 Month)</div>
                                <div className={`stat-value ${report.win_rate_30d >= 50 ? 'success' : 'negative'}`}>{report.win_rate_30d?.toFixed(1)}%</div>
                                <div className="stat-subtext">Avg: <span className={getColorClass(report.avg_return_30d)}>{formatPercent(report.avg_return_30d)}</span></div>
                            </div>
                        </div>
                        <div className="stat-card">
                            <div className={`stat-icon ${report.win_rate_90d >= 50 ? 'success' : 'negative'}`}><Percent size={24} /></div>
                            <div className="stat-content">
                                <div className="stat-label">Win Rate (3 Month)</div>
                                <div className={`stat-value ${report.win_rate_90d >= 50 ? 'success' : 'negative'}`}>{report.win_rate_90d?.toFixed(1)}%</div>
                                <div className="stat-subtext">Avg: <span className={getColorClass(report.avg_return_90d)}>{formatPercent(report.avg_return_90d)}</span></div>
                            </div>
                        </div>
                    </div>

                    {/* Stats Table Card */}
                    <div className="stats-table-card">
                        <h3 className="section-title">Return Statistics & Capital Horizon Analysis</h3>
                        <div className="table-scroll-container">
                            <table className="stats-table">
                                <thead>
                                    <tr>
                                        <th>Period</th>
                                        <th>Avg Return</th>
                                        <th>Median</th>
                                        <th>Highest</th>
                                        <th>Lowest</th>
                                        <th>Consistency</th>
                                        <th>Pos. Count</th>
                                        <th>Pos. Median</th>
                                        <th>Pos. Avg</th>
                                        <th>Neg. Count</th>
                                        <th>Neg. Median</th>
                                        <th>Neg. Avg</th>
                                        <th>Capital Return</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {['7d', '14d', '30d', '45d', '60d', '90d'].map(period => {
                                        const s = stats[period];
                                        const names = { '7d': '1 Week', '14d': '2 Weeks', '30d': '1 Month', '45d': '1.5 Months', '60d': '2 Months', '90d': '3 Months' };
                                        const periodName = names[period] || period;
                                        return s ? (
                                            <tr key={period}>
                                                <td className="period-cell">{periodName}</td>
                                                <td className={getColorClass(s.avg)}>{formatPercent(s.avg)}</td>
                                                <td>{formatPercent(s.median)}</td>
                                                <td className="positive">{formatPercent(s.highest)}</td>
                                                <td className="negative">{formatPercent(s.lowest)}</td>
                                                <td className={getColorClass(s.consistency)}>
                                                    {s.consistency === 999 ? 'MAX' : s.consistency === -999 ? 'MIN' : s.consistency.toFixed(2)}
                                                </td>
                                                <td>{s.positiveCount}</td>
                                                <td className="positive">{formatPercent(s.positiveMedian)}</td>
                                                <td className="positive">{formatPercent(s.positiveAvg)}</td>
                                                <td>{s.negativeCount}</td>
                                                <td className="negative">{formatPercent(s.negativeMedian)}</td>
                                                <td className="negative">{formatPercent(s.negativeAvg)}</td>
                                                <td className={getColorClass(s.capitalReturn)}>{formatCurrency(s.capitalReturn)}</td>
                                            </tr>
                                        ) : null;
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* TAB CONTENT 2: EQUITY CURVE & BENCHMARK */}
            {activeTab === 'equity' && (
                <div className="space-y-6">
                    <EquityCurveChart equityCurve={equityCurve} quantMetrics={quantMetrics} />
                </div>
            )}

            {/* TAB CONTENT 3: MONTHLY HEATMAP */}
            {activeTab === 'monthly' && (
                <div className="space-y-6">
                    <MonthlyHeatmap monthlyMatrix={monthlyMatrix} />
                </div>
            )}

            {/* TAB CONTENT 4: EDGE & MARKET BREAKDOWN */}
            {activeTab === 'edge' && (
                <div className="charts-grid">
                    <div className="chart-card">
                        <h3 className="section-title">Return Distribution (1 Month)</h3>
                        <p className="text-xs text-gray-400 mb-4">How your trade returns are spread across ranges.</p>
                        <ResponsiveContainer width="100%" height={280}>
                            <BarChart data={distributionData} margin={{ bottom: 40, left: 5, right: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                <XAxis dataKey="label" stroke="#9ca3af" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={60} />
                                <YAxis stroke="#9ca3af" tickFormatter={(val) => `${val}`} tick={{ fontSize: 12 }} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }}
                                    formatter={(value, name, props) => [`${value} trade${value !== 1 ? 's' : ''}`, props.payload.label]}
                                />
                                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                                    {distributionData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.fill} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>

                    <div className="chart-card">
                        <h3 className="section-title">Strategy Edge by Sector (1 Month)</h3>
                        <p className="text-xs text-gray-400 mb-4">Sectors with min. 3 signals.</p>
                        {enrichmentStats.sectors.length > 0 ? (
                            <ResponsiveContainer width="100%" height={250}>
                                <BarChart data={enrichmentStats.sectors} layout="vertical" margin={{ left: 50 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" horizontal={false} />
                                    <XAxis type="number" stroke="#9ca3af" tickFormatter={(val) => `${val}%`} tick={{ fontSize: 12 }} />
                                    <YAxis type="category" dataKey="name" stroke="#9ca3af" width={110} tick={{ fontSize: 11 }} />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }}
                                        formatter={(value, name, props) => [`${value.toFixed(2)}% (N=${props.payload.count})`, 'Avg Return']}
                                    />
                                    <Bar dataKey="avgReturn" radius={[0, 4, 4, 0]}>
                                        {enrichmentStats.sectors.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.avgReturn > 0 ? '#10b981' : '#ef4444'} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="flex h-48 items-center justify-center text-gray-500">Not enough sector data available.</div>
                        )}
                    </div>

                    <div className="chart-card">
                        <h3 className="section-title">Strategy Edge by Market Cap (1 Month) ℹ️</h3>
                        <p className="text-xs text-gray-400 mb-4">How company size affects returns after a signal — avg % move per cap group, min. 3 signals.</p>
                        {capMatrix.length > 0 ? (
                            <div className="cap-matrix-scroll">
                                <table className="cap-matrix heat-table">
                                    <thead>
                                        <tr>
                                            <th>Bucket</th>
                                            <th>1W</th>
                                            <th>1M</th>
                                            <th>3M</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {capMatrix.map(b => (
                                            <tr key={b.name}>
                                                <td className="cap-matrix-bucket">{b.name} <span className="cap-matrix-count">(N={b.count})</span></td>
                                                <td className={b.return_7d == null ? 'cap-matrix-na' : getReturnClass(b.return_7d)}>
                                                    {b.return_7d == null ? '—' : formatPercent(b.return_7d)}
                                                </td>
                                                <td className={b.return_30d == null ? 'cap-matrix-na' : getReturnClass(b.return_30d)}>
                                                    {b.return_30d == null ? '—' : formatPercent(b.return_30d)}
                                                </td>
                                                <td className={b.return_90d == null ? 'cap-matrix-na' : getReturnClass(b.return_90d)}>
                                                    {b.return_90d == null ? '—' : formatPercent(b.return_90d)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="flex h-48 items-center justify-center text-gray-500">Not enough market cap data available.</div>
                        )}
                    </div>

                    <div className="chart-card">
                        <h3 className="section-title">Return Heatmap ℹ️</h3>
                        <p className="text-xs text-gray-400 mb-4">Darker = stronger move. Showing latest {heatmapRows.length} signals.</p>
                        {heatmapRows.length > 0 ? (
                            <div className="heatmap-scroll">
                                <table className="heatmap-table heat-table">
                                    <thead>
                                        <tr>
                                            <th className="heatmap-symbol">Symbol</th>
                                            <th>Signal Date</th>
                                            <th>Latest</th>
                                            <th>1W</th>
                                            <th>1M</th>
                                            <th>3M</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {heatmapRows.map((trade, idx) => (
                                            <tr key={idx}>
                                                <td className="heatmap-symbol">{trade.symbol}</td>
                                                <td className="heatmap-date">{trade.signal_date || '—'}</td>
                                                <td className={getReturnClass(trade.latest_price_return)}
                                                    title={trade.latest_price_date ? `Return: ${formatPercent(trade.latest_price_return)} (since ${trade.latest_price_date})` : 'Return: N/A'}>
                                                    {formatPercent(trade.latest_price_return)}
                                                </td>
                                                <td className={`heat-click ${getReturnClass(trade.return_7d)}`}
                                                    onClick={() => handleCellClick(trade, '7d')}>
                                                    {formatPercent(trade.return_7d)}
                                                </td>
                                                <td className={`heat-click ${getReturnClass(trade.return_30d)}`}
                                                    onClick={() => handleCellClick(trade, '30d')}>
                                                    {formatPercent(trade.return_30d)}
                                                </td>
                                                <td className={`heat-click ${getReturnClass(trade.return_90d)}`}
                                                    onClick={() => handleCellClick(trade, '90d')}>
                                                    {formatPercent(trade.return_90d)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="flex h-48 items-center justify-center text-gray-500">No trade data available.</div>
                        )}
                    </div>
                </div>
            )}

            {/* TAB CONTENT 5: TRADES LOG & LIVE TRACKER */}
            {(activeTab === 'trades' || activeTab === 'overview') && (
                <div className="trade-log-card">
                    <div className="trade-log-header">
                        <div className="flex items-center gap-3 flex-wrap">
                            <h3 className="section-title mb-0">Trade Log &amp; Execution</h3>
                            {/* Filter Chips */}
                            <div className="flex items-center gap-1.5 flex-wrap">
                                {[
                                    { id: 'all', label: `All (${enrichedTrades.length})` },
                                    { id: 'winners', label: `Winners (${quantMetrics.winnersCount})` },
                                    { id: 'losers', label: `Losers (${quantMetrics.losersCount})` },
                                    { id: 'target_hit', label: `Target Hit (${quantMetrics.targetHits})` },
                                    { id: 'sl_hit', label: `SL Hit (${quantMetrics.stopLossHits})` },
                                    { id: 'fresh', label: `Fresh Signals (${freshStocks.length})` },
                                ].map(f => (
                                    <button
                                        key={f.id}
                                        onClick={() => { setTradeFilter(f.id); setCurrentPage(1); }}
                                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                                            tradeFilter === f.id
                                                ? 'bg-blue-600 text-white shadow-[0_0_10px_rgba(59,130,246,0.3)]'
                                                : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
                                        }`}
                                    >
                                        {f.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="trade-log-controls">
                            <div className="search-box">
                                <Search size={18} />
                                <input
                                    type="text"
                                    placeholder="Search symbol..."
                                    value={searchTerm}
                                    onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                                />
                            </div>
                            <select value={itemsPerPage} onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}>
                                <option value={10}>10 per page</option>
                                <option value={25}>25 per page</option>
                                <option value={50}>50 per page</option>
                                <option value={100}>100 per page</option>
                            </select>
                        </div>
                    </div>

                    <div className="table-scroll-container">
                        <table className="trade-table">
                            <thead>
                                <tr>
                                    <th onClick={() => handleSort('symbol')}>
                                        Symbol {sortConfig.key === 'symbol' && (sortConfig.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}
                                    </th>
                                    <th onClick={() => handleSort('signal_date')}>
                                        Signal Date {sortConfig.key === 'signal_date' && (sortConfig.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}
                                    </th>
                                    <th onClick={() => handleSort('signal_close_price')}>
                                        <span className="inline-flex items-center gap-1">
                                            Close {sortConfig.key === 'signal_close_price' && (sortConfig.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}
                                        </span>
                                    </th>
                                    <th onClick={() => handleSort('entry_date')} className="col-entry-date">
                                        Entry Date {sortConfig.key === 'entry_date' && (sortConfig.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}
                                    </th>
                                    <th onClick={() => handleSort('entry_price')} className="col-entry">
                                        Entry {sortConfig.key === 'entry_price' && (sortConfig.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}
                                    </th>
                                    <th onClick={() => handleSort('latest_price')} className="col-latest">
                                        Latest Price {sortConfig.key === 'latest_price' && (sortConfig.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}
                                    </th>

                                    <th onClick={() => handleSort('return_7d')} className="col-return-7d">
                                        1 Week Return {sortConfig.key === 'return_7d' && (sortConfig.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}
                                    </th>
                                    <th onClick={() => handleSort('return_30d')} className="col-return-30d">
                                        1 Month Return {sortConfig.key === 'return_30d' && (sortConfig.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}
                                    </th>
                                    <th onClick={() => handleSort('return_90d')} className="col-return-90d">
                                        3 Month Return {sortConfig.key === 'return_90d' && (sortConfig.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}
                                    </th>
                                    <th onClick={() => handleSort('max_high_90d')} className="col-max-high">
                                        Max High {sortConfig.key === 'max_high_90d' && (sortConfig.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}
                                    </th>
                                    <th onClick={() => handleSort('max_low_90d')} className="col-max-low">
                                        Max Low {sortConfig.key === 'max_low_90d' && (sortConfig.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {paginatedTrades.map((trade, idx) => (
                                    <tr key={idx} className={`group ${
                                        trade.symbol === bestSymbol ? 'row-best' :
                                        trade.symbol === worstSymbol ? 'row-worst' : ''
                                    }`}>
                                        <td className="symbol-cell">
                                            <span className="flex items-center gap-1.5">
                                                <span>{trade.symbol}</span>
                                                {trade.isFresh && (
                                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                                        LIVE
                                                    </span>
                                                )}
                                                <button
                                                    title="Analyze this trade"
                                                    onClick={(e) => { e.stopPropagation(); handleOpenPanel(trade.symbol, trade.entry_price); }}
                                                    className="opacity-0 group-hover:opacity-100 hover:text-emerald-400 transition-opacity p-0.5 rounded"
                                                >
                                                    <ExternalLink size={13} />
                                                </button>
                                            </span>
                                        </td>
                                        <td>{trade.signal_date}</td>
                                        <td>{trade.signal_close_price ? formatCurrency(trade.signal_close_price) : '-'}</td>
                                        <td className="col-entry-date">{getEntryDate(trade)}</td>
                                        <td className="col-entry">
                                            {trade.entry_price && trade.symbol ? (
                                                <a href={getScreenerUrl(trade.symbol)}
                                                   target="_blank" rel="noopener noreferrer"
                                                   style={{ color: 'inherit', textDecoration: 'none' }}>
                                                    {formatCurrency(trade.entry_price)}
                                                </a>
                                            ) : formatCurrency(trade.entry_price)}
                                        </td>
                                        <td
                                            className={`col-latest ${getColorClass(trade.latest_price_return)}`}
                                            title={trade.latest_price_date ? `Return: ${formatPercent(trade.latest_price_return)} (since ${trade.latest_price_date})` : 'Return: N/A'}
                                        >
                                            {trade.latest_price && trade.symbol ? (
                                                <a href={getTradingViewUrl(trade.symbol)}
                                                   target="_blank" rel="noopener noreferrer"
                                                   style={{ color: 'inherit', textDecoration: 'none' }}>
                                                    {formatCurrency(trade.latest_price)}
                                                </a>
                                            ) : trade.latest_price ? formatCurrency(trade.latest_price) : 'N/A'}
                                        </td>

                                        <td
                                            className={`clickable-cell col-return-7d ${getColorClass(trade.return_7d)}`}
                                            onClick={() => handleCellClick(trade, '7d')}
                                            title={getTooltipContent(trade, '7d')}
                                        >
                                            {formatPercent(trade.return_7d)}
                                        </td>
                                        <td
                                            className={`clickable-cell col-return-30d ${getColorClass(trade.return_30d)}`}
                                            onClick={() => handleCellClick(trade, '30d')}
                                            title={getTooltipContent(trade, '30d')}
                                        >
                                            {formatPercent(trade.return_30d)}
                                        </td>
                                        <td
                                            className={`clickable-cell col-return-90d ${getColorClass(trade.return_90d)}`}
                                            onClick={() => handleCellClick(trade, '90d')}
                                            title={getTooltipContent(trade, '90d')}
                                        >
                                            {formatPercent(trade.return_90d)}
                                        </td>
                                        <td className="col-max-high positive" title={`Max High Date: ${trade.max_high_date || 'N/A'}`}>{formatCurrency(trade.max_high_90d)}</td>
                                        <td className="col-max-low negative" title={`Max Low Date: ${trade.max_low_date || 'N/A'}`}>{formatCurrency(trade.max_low_90d)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="pagination">
                        <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
                            <ChevronLeft size={20} />
                        </button>
                        <span className="page-info">
                            Page {currentPage} of {totalPages} ({sortedTrades.length} results)
                        </span>
                        <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
                            <ChevronRight size={20} />
                        </button>
                    </div>
                    {report.latest_price_date && (
                        <p className="text-xs text-gray-500 mt-2 text-center">
                            Latest prices based on close price as of {report.latest_price_date}. Prices may be delayed.
                        </p>
                    )}
                </div>
            )}

            {/* Position Sizing Card */}
            <details className="position-sizing-card">
                <summary className="position-sizing-summary">
                    <span>Position Sizing &amp; Risk Analysis</span>
                    <span className="text-xs text-gray-500">based on ₹{Number(capital || 100000).toLocaleString('en-IN')} capital</span>
                </summary>
                <div className="position-sizing-content">
                    {(() => {
                        const cap = Number(capital) || 100000;
                        const tiers = [
                            { name: 'Starter', pct: 15, multiplier: 0.85, desc: 'Single exit' },
                            { name: 'Balanced', pct: 8, multiplier: 0.95, desc: 'Stops by horizon' },
                            { name: 'Growth', pct: 10, multiplier: 0.90, desc: '4-way ladder' },
                        ];
                        return (
                            <div className="tier-grid">
                                {tiers.map(t => {
                                    const posSize = cap * t.pct / 100;
                                    const posCount = Math.floor(cap * t.multiplier / posSize);
                                    const deployed = posSize * posCount;
                                    return (
                                        <div key={t.name} className="tier-card">
                                            <div className="tier-name">{t.name}</div>
                                            <div className="tier-desc">{t.desc}</div>
                                            <div className="tier-amount">₹{posSize.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
                                            <div className="tier-label">per position</div>
                                            <div className="tier-count">{posCount} positions</div>
                                            <div className="tier-label">₹{deployed.toLocaleString('en-IN', { maximumFractionDigits: 0 })} deployed</div>
                                            <div className="tier-label">₹{(cap - deployed).toLocaleString('en-IN', { maximumFractionDigits: 0 })} buffer</div>
                                        </div>
                                    );
                                })}
                            </div>
                        );
                    })()}
                    {riskStats && (
                        <div className="risk-row">
                            <span>Avg drawdown: <strong className="negative">{riskStats.avgDrawdown.toFixed(1)}%</strong></span>
                            <span>Avg run-up: <strong className="positive">{riskStats.avgRunup.toFixed(1)}%</strong></span>
                            <span>Max drawdown: <strong className="negative">{riskStats.maxDrawdown.toFixed(1)}%</strong></span>
                            <span>Stop 5% hits: <strong>{riskStats.stop5Hit}/{riskStats.total} ({((riskStats.stop5Hit / riskStats.total) * 100).toFixed(0)}%)</strong></span>
                            <span>Stop 8% hits: <strong>{riskStats.stop8Hit}/{riskStats.total} ({((riskStats.stop8Hit / riskStats.total) * 100).toFixed(0)}%)</strong></span>
                        </div>
                    )}
                </div>
            </details>

            {panelOpen && (
                <AnalyzerPanel
                    report={report}
                    capital={Number(capital) || 100000}
                    onCapitalChange={setCapital}
                    panelSymbol={panelSymbol}
                    entryPrice={selectedEntryPrice}
                    onClose={() => setPanelOpen(false)}
                    freshStocks={freshStocks}
                />
            )}
        </motion.div>
    );
};

export default Dashboard;
