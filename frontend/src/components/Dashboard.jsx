import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    PieChart, Pie, Cell, LineChart, Line, Area, AreaChart, ComposedChart, Scatter
} from 'recharts';
import { ArrowLeft, TrendingUp, TrendingDown, Percent, Search, ChevronLeft, ChevronRight, ArrowUp, ArrowDown, X, BarChart3, LineChart as LineChartIcon, Activity, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import './Dashboard.css';

const COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444'];

import StockChartModal from './StockChartModal';

const Dashboard = ({ report, onBack }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [sortConfig, setSortConfig] = useState({ key: 'signal_date', direction: 'asc' });
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(25);
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

    const successfulTrades = useMemo(() =>
        report.trades.filter(t => t.status === 'Success'),
        [report.trades]
    );

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
        const capMap = {};
        const periodKey = 'return_30d'; // 30d baseline for edge analysis

        successfulTrades.forEach(t => {
            const ret = t[periodKey];
            if (ret === null || ret === undefined) return;

            const sector = t.sector || 'Unknown';
            const cap = t.market_cap || 'Unknown';

            if (!sectorMap[sector]) sectorMap[sector] = { sum: 0, count: 0 };
            sectorMap[sector].sum += ret;
            sectorMap[sector].count += 1;

            if (!capMap[cap]) capMap[cap] = { sum: 0, count: 0 };
            capMap[cap].sum += ret;
            capMap[cap].count += 1;
        });

        const formatAgg = (map) => Object.keys(map)
            .map(k => ({ name: k, avgReturn: map[k].sum / map[k].count, count: map[k].count }))
            .filter(item => item.count >= 3) // Require min 3 trades for relevance
            .sort((a, b) => b.avgReturn - a.avgReturn)
            .slice(0, 10);

        return {
            sectors: formatAgg(sectorMap),
            marketCaps: formatAgg(capMap)
        };
    }, [successfulTrades]);

    const holdingPeriodData = useMemo(() => {
        if (!stats) return [];
        return [
            { period: '7d', label: '1 Week', avgReturn: stats['7d']?.avg || 0 },
            { period: '14d', label: '2 Weeks', avgReturn: stats['14d']?.avg || 0 },
            { period: '30d', label: '1 Month', avgReturn: stats['30d']?.avg || 0 },
            { period: '45d', label: '1.5 Months', avgReturn: stats['45d']?.avg || 0 },
            { period: '60d', label: '2 Months', avgReturn: stats['60d']?.avg || 0 },
            { period: '90d', label: '3 Months', avgReturn: stats['90d']?.avg || 0 },
        ];
    }, [stats]);

    const handleSort = (key) => {
        setSortConfig(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const filteredTrades = useMemo(() => {
        return successfulTrades.filter(trade =>
            trade.symbol.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [successfulTrades, searchTerm]);

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

    const totalPages = Math.ceil(sortedTrades.length / itemsPerPage);

    const formatPercent = (val) => val !== null && val !== undefined ? `${val > 0 ? '+' : ''}${val.toFixed(2)}%` : 'N/A';
    const formatCurrency = (val) => val !== null && val !== undefined && val !== '' ? `₹${Number(val).toFixed(2)}` : 'N/A';
    const getColorClass = (val) => val > 0 ? 'positive' : val < 0 ? 'negative' : 'neutral';

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

    // Enhanced tooltip content
    const getTooltipContent = (trade, period) => {
        const exitPriceKey = `exit_price_${period}`;
        const exitDate = getExitDate(trade, period);
        const exitPrice = trade[exitPriceKey];

        return `📅 Exit Date: ${exitDate}\n💰 Exit Price: ${formatCurrency(exitPrice)}`;
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

            <div className="dashboard-header">
                <button onClick={onBack} className="btn-back">
                    <ArrowLeft size={20} /> Back
                </button>
                <h1 className="dashboard-title">Backtest Report</h1>
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
                        className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all text-sm font-semibold"
                        onClick={() => {
                            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(report, null, 2));
                            const downloadAnchorNode = document.createElement('a');
                            downloadAnchorNode.setAttribute("href", dataStr);
                            downloadAnchorNode.setAttribute("download", "backtest_report.json");
                            document.body.appendChild(downloadAnchorNode); // Required for Firefox
                            downloadAnchorNode.click();
                            downloadAnchorNode.remove();
                        }}
                    >
                        <ArrowDown size={16} /> Save Report
                    </button>
                </div>
            </div>

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
                {stats['30d'] && stats['30d'].profitFactor !== undefined && (
                    <div className="stat-card">
                        <div className={`stat-icon ${stats['30d'].profitFactor >= 1.5 ? 'success' : stats['30d'].profitFactor >= 1.0 ? 'neutral' : 'negative'}`}><Activity size={24} /></div>
                        <div className="stat-content">
                            <div className="stat-label">Profit Factor (1 Month)</div>
                            <div className={`stat-value ${stats['30d'].profitFactor >= 1.5 ? 'success' : stats['30d'].profitFactor >= 1.0 ? 'neutral' : 'negative'}`}>
                                {stats['30d'].profitFactor === Infinity ? 'MAX' : stats['30d'].profitFactor.toFixed(2)}
                            </div>
                            <div className="stat-subtext" title="Gross Profit / Gross Loss at the signal level. Assumes equal capital per signal.">Signal-Level Ratio ℹ️</div>
                        </div>
                    </div>
                )}
            </div>

            <div className="charts-grid">
                <div className="chart-card">
                    <h3 className="section-title">Optimal Holding Period (Avg Return)</h3>
                    <p className="text-xs text-gray-400 mb-4">Signal-level average return decay across time.</p>
                    <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={holdingPeriodData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                            <XAxis dataKey="label" stroke="#9ca3af" tick={{ fontSize: 12 }} />
                            <YAxis stroke="#9ca3af" tickFormatter={(val) => `${val}%`} tick={{ fontSize: 12 }} />
                            <Tooltip
                                contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }}
                                formatter={(value) => [`${value.toFixed(2)}%`, 'Avg Return']}
                            />
                            <Bar dataKey="avgReturn" fill="#3b82f6" radius={[4, 4, 0, 0]}>
                                {holdingPeriodData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.avgReturn > 0 ? '#10b981' : '#ef4444'} />
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
                    <h3 className="section-title">Strategy Edge by Market Cap (1 Month)</h3>
                    <p className="text-xs text-gray-400 mb-4">Market Caps with min. 3 signals.</p>
                    {enrichmentStats.marketCaps.length > 0 ? (
                        <ResponsiveContainer width="100%" height={250}>
                            <BarChart data={enrichmentStats.marketCaps} layout="vertical" margin={{ left: 50 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#374151" horizontal={false} />
                                <XAxis type="number" stroke="#9ca3af" tickFormatter={(val) => `${val}%`} tick={{ fontSize: 12 }} />
                                <YAxis type="category" dataKey="name" stroke="#9ca3af" width={110} tick={{ fontSize: 11 }} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }}
                                    formatter={(value, name, props) => [`${value.toFixed(2)}% (N=${props.payload.count})`, 'Avg Return']}
                                />
                                <Bar dataKey="avgReturn" radius={[0, 4, 4, 0]}>
                                    {enrichmentStats.marketCaps.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.avgReturn > 0 ? '#10b981' : '#ef4444'} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="flex h-48 items-center justify-center text-gray-500">Not enough market cap data available.</div>
                    )}
                </div>
            </div>

            <div className="stats-table-card">
                <h3 className="section-title">Return Statistics & Capital Analysis</h3>
                <div className="table-scroll-container">
                    <table className="stats-table">
                        <thead>
                            <tr>
                                <th>Period</th>
                                <th>Avg Return</th>
                                <th>Median</th>
                                <th>Highest</th>
                                <th>Lowest</th>
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
                            {['7d', '30d', '90d'].map(period => {
                                const s = stats[period];
                                const periodName = period === '7d' ? '1 Week' : period === '30d' ? '1 Month' : '3 Month';
                                return s ? (
                                    <tr key={period}>
                                        <td className="period-cell">{periodName}</td>
                                        <td className={getColorClass(s.avg)}>{formatPercent(s.avg)}</td>
                                        <td>{formatPercent(s.median)}</td>
                                        <td className="positive">{formatPercent(s.highest)}</td>
                                        <td className="negative">{formatPercent(s.lowest)}</td>
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

            <div className="trade-log-card">
                <div className="trade-log-header">
                    <h3 className="section-title">Trade Log</h3>
                    <div className="trade-log-controls">
                        <div className="search-box">
                            <Search size={18} />
                            <input
                                type="text"
                                placeholder="Search symbol..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <select value={itemsPerPage} onChange={(e) => setItemsPerPage(Number(e.target.value))}>
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
                                <th onClick={() => handleSort('entry_date')}>
                                    Entry Date {sortConfig.key === 'entry_date' && (sortConfig.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}
                                </th>
                                <th onClick={() => handleSort('entry_price')}>
                                    Entry {sortConfig.key === 'entry_price' && (sortConfig.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}
                                </th>
                                <th onClick={() => handleSort('latest_price')}>
                                    Latest Price {sortConfig.key === 'latest_price' && (sortConfig.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}
                                </th>

                                <th onClick={() => handleSort('return_7d')}>
                                    1 Week Return {sortConfig.key === 'return_7d' && (sortConfig.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}
                                </th>
                                <th onClick={() => handleSort('return_30d')}>
                                    1 Month Return {sortConfig.key === 'return_30d' && (sortConfig.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}
                                </th>
                                <th onClick={() => handleSort('return_90d')}>
                                    3 Month Return {sortConfig.key === 'return_90d' && (sortConfig.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}
                                </th>
                                <th onClick={() => handleSort('max_high_90d')}>
                                    Max High {sortConfig.key === 'max_high_90d' && (sortConfig.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}
                                </th>
                                <th onClick={() => handleSort('max_low_90d')}>
                                    Max Low {sortConfig.key === 'max_low_90d' && (sortConfig.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {paginatedTrades.map((trade, idx) => (
                                <tr key={idx}>
                                    <td className="symbol-cell">{trade.symbol}</td>
                                    <td>{trade.signal_date}</td>
                                    <td>{trade.signal_close_price ? formatCurrency(trade.signal_close_price) : '-'}</td>
                                    <td>{getEntryDate(trade)}</td>
                                    <td>{formatCurrency(trade.entry_price)}</td>
                                    <td
                                        className={`clickable-cell ${getColorClass(trade.latest_price_return)}`}
                                        title={trade.latest_price_date ? `Return: ${formatPercent(trade.latest_price_return)} (since ${trade.latest_price_date})` : 'Return: N/A'}
                                    >
                                        {trade.latest_price ? formatCurrency(trade.latest_price) : 'N/A'}
                                    </td>

                                    <td
                                        className={`clickable-cell ${getColorClass(trade.return_7d)}`}
                                        onClick={() => handleCellClick(trade, '7d')}
                                        title={getTooltipContent(trade, '7d')}
                                    >
                                        {formatPercent(trade.return_7d)}
                                    </td>
                                    <td
                                        className={`clickable-cell ${getColorClass(trade.return_30d)}`}
                                        onClick={() => handleCellClick(trade, '30d')}
                                        title={getTooltipContent(trade, '30d')}
                                    >
                                        {formatPercent(trade.return_30d)}
                                    </td>
                                    <td
                                        className={`clickable-cell ${getColorClass(trade.return_90d)}`}
                                        onClick={() => handleCellClick(trade, '90d')}
                                        title={getTooltipContent(trade, '90d')}
                                    >
                                        {formatPercent(trade.return_90d)}
                                    </td>
                                    <td className="positive" title={`Max High Date: ${trade.max_high_date || 'N/A'}`}>{formatCurrency(trade.max_high_90d)}</td>
                                    <td className="negative" title={`Max Low Date: ${trade.max_low_date || 'N/A'}`}>{formatCurrency(trade.max_low_90d)}</td>
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
        </motion.div>
    );
};

export default Dashboard;
