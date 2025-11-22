import React, { useState, useMemo } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    PieChart, Pie, Cell, LineChart, Line, Area, AreaChart, ComposedChart, Scatter
} from 'recharts';
import { ArrowLeft, TrendingUp, TrendingDown, Percent, Search, ChevronLeft, ChevronRight, ArrowUp, ArrowDown, X, BarChart3, LineChart as LineChartIcon, Activity } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import './Dashboard.css';

const COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444'];

// Enhanced Stock Chart Modal Component with Chart Type Switching
const StockChartModal = ({ stock, period, onClose }) => {
    const [chartType, setChartType] = useState('area'); // 'area', 'line', 'bar'

    if (!stock) return null;

    const periodKey = `return_${period}`;
    const exitPriceKey = `exit_price_${period}`;
    const periodDays = period === '7d' ? 7 : period === '30d' ? 30 : 90;
    const periodName = period === '7d' ? '7 Days' : period === '30d' ? '30 Days' : '90 Days';

    // Calculate exit date
    const getExitDate = (entryDateStr, days) => {
        const date = new Date(entryDateStr);
        date.setDate(date.getDate() + days);
        return date.toLocaleDateString('en-IN');
    };

    const exitDate = getExitDate(stock.signal_date, periodDays);
    const returnValue = stock[periodKey];
    const isPositive = returnValue > 0;

    // Create comprehensive chart data
    const chartData = [
        {
            date: stock.signal_date,
            price: stock.entry_price,
            type: 'Entry',
            marker: '🟢'
        },
        {
            date: exitDate,
            price: stock[exitPriceKey],
            type: 'Exit',
            marker: isPositive ? '🟢' : '🔴'
        },
        {
            date: stock.max_high_date || 'N/A',
            price: stock.max_high_90d,
            type: 'Max High',
            marker: '⬆️'
        },
        {
            date: stock.max_low_date || 'N/A',
            price: stock.max_low_90d,
            type: 'Max Low',
            marker: '⬇️'
        }
    ].filter(d => d.price !== null && d.price !== undefined);

    // Sort by date for proper line rendering
    const sortedChartData = [...chartData].sort((a, b) => new Date(a.date) - new Date(b.date));

    const CustomTooltip = ({ active, payload }) => {
        if (active && payload && payload.length) {
            const data = payload[0].payload;
            return (
                <div className="custom-tooltip">
                    <p className="tooltip-label">{data.marker} {data.type}</p>
                    <p className="tooltip-date"><strong>Date:</strong> {data.date}</p>
                    <p className="tooltip-price"><strong>Price:</strong> ₹{data.price?.toFixed(2)}</p>
                </div>
            );
        }
        return null;
    };

    return (
        <AnimatePresence>
            <motion.div
                className="modal-overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
            >
                <motion.div
                    className="modal-content"
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="modal-header">
                        <div>
                            <h3 className="modal-title">{stock.symbol}</h3>
                            <p className="modal-subtitle">{periodName} Performance</p>
                        </div>
                        <button className="modal-close" onClick={onClose}>
                            <X size={24} />
                        </button>
                    </div>

                    {/* Chart Type Switcher */}
                    <div className="chart-type-switcher">
                        <button
                            className={`chart-type-btn ${chartType === 'area' ? 'active' : ''}`}
                            onClick={() => setChartType('area')}
                        >
                            <Activity size={18} /> Area
                        </button>
                        <button
                            className={`chart-type-btn ${chartType === 'line' ? 'active' : ''}`}
                            onClick={() => setChartType('line')}
                        >
                            <LineChartIcon size={18} /> Line
                        </button>
                        <button
                            className={`chart-type-btn ${chartType === 'bar' ? 'active' : ''}`}
                            onClick={() => setChartType('bar')}
                        >
                            <BarChart3 size={18} /> Bar
                        </button>
                    </div>

                    <div className="modal-stats">
                        <div className="modal-stat">
                            <span className="modal-stat-label">Return</span>
                            <span className={`modal-stat-value ${isPositive ? 'positive' : 'negative'}`}>
                                {returnValue > 0 ? '+' : ''}{returnValue?.toFixed(2)}%
                            </span>
                        </div>
                        <div className="modal-stat">
                            <span className="modal-stat-label">Entry</span>
                            <span className="modal-stat-value">₹{stock.entry_price?.toFixed(2)}</span>
                            <span className="modal-stat-date">{stock.signal_date}</span>
                        </div>
                        <div className="modal-stat">
                            <span className="modal-stat-label">Exit</span>
                            <span className="modal-stat-value">₹{stock[exitPriceKey]?.toFixed(2)}</span>
                            <span className="modal-stat-date">{exitDate}</span>
                        </div>
                        <div className="modal-stat">
                            <span className="modal-stat-label">Max High</span>
                            <span className="modal-stat-value positive">₹{stock.max_high_90d?.toFixed(2)}</span>
                            <span className="modal-stat-date">{stock.max_high_date || 'N/A'}</span>
                        </div>
                        <div className="modal-stat">
                            <span className="modal-stat-label">Max Low</span>
                            <span className="modal-stat-value negative">₹{stock.max_low_90d?.toFixed(2)}</span>
                            <span className="modal-stat-date">{stock.max_low_date || 'N/A'}</span>
                        </div>
                    </div>

                    <div className="modal-chart">
                        <ResponsiveContainer width="100%" height={350}>
                            {chartType === 'area' && (
                                <ComposedChart data={sortedChartData}>
                                    <defs>
                                        <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor={isPositive ? "#10b981" : "#ef4444"} stopOpacity={0.3} />
                                            <stop offset="95%" stopColor={isPositive ? "#10b981" : "#ef4444"} stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                    <XAxis dataKey="date" stroke="#9ca3af" angle={-15} textAnchor="end" height={80} />
                                    <YAxis stroke="#9ca3af" domain={['dataMin - 5', 'dataMax + 5']} />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Area
                                        type="monotone"
                                        dataKey="price"
                                        stroke={isPositive ? "#10b981" : "#ef4444"}
                                        strokeWidth={3}
                                        fill="url(#colorPrice)"
                                    />
                                    <Scatter
                                        dataKey="price"
                                        fill={isPositive ? "#10b981" : "#ef4444"}
                                        shape="circle"
                                        r={6}
                                    />
                                </ComposedChart>
                            )}
                            {chartType === 'line' && (
                                <ComposedChart data={sortedChartData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                    <XAxis dataKey="date" stroke="#9ca3af" angle={-15} textAnchor="end" height={80} />
                                    <YAxis stroke="#9ca3af" domain={['dataMin - 5', 'dataMax + 5']} />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Line
                                        type="monotone"
                                        dataKey="price"
                                        stroke={isPositive ? "#10b981" : "#ef4444"}
                                        strokeWidth={3}
                                        dot={{ fill: isPositive ? "#10b981" : "#ef4444", r: 6 }}
                                    />
                                </ComposedChart>
                            )}
                            {chartType === 'bar' && (
                                <BarChart data={sortedChartData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                    <XAxis dataKey="date" stroke="#9ca3af" angle={-15} textAnchor="end" height={80} />
                                    <YAxis stroke="#9ca3af" domain={['dataMin - 5', 'dataMax + 5']} />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Bar
                                        dataKey="price"
                                        fill={isPositive ? "#10b981" : "#ef4444"}
                                        radius={[8, 8, 0, 0]}
                                    />
                                </BarChart>
                            )}
                        </ResponsiveContainer>
                    </div>

                    <div className="modal-legend">
                        <div className="legend-item">
                            <span className="legend-marker entry">🟢</span>
                            <span>Entry Point</span>
                        </div>
                        <div className="legend-item">
                            <span className="legend-marker exit">{isPositive ? '🟢' : '🔴'}</span>
                            <span>Exit Point</span>
                        </div>
                        <div className="legend-item">
                            <span className="legend-marker high">⬆️</span>
                            <span>Maximum High</span>
                        </div>
                        <div className="legend-item">
                            <span className="legend-marker low">⬇️</span>
                            <span>Maximum Low</span>
                        </div>
                    </div>

                    <div className="modal-footer">
                        <p className="modal-note">
                            <strong>Entry:</strong> {stock.signal_date} |
                            <strong> Exit:</strong> {exitDate} |
                            <strong> Period:</strong> {periodName}
                        </p>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};

const Dashboard = ({ report, onBack }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [sortConfig, setSortConfig] = useState({ key: 'return_30d', direction: 'desc' });
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(25);
    const [capital, setCapital] = useState(100000);
    const [selectedStock, setSelectedStock] = useState(null);
    const [selectedPeriod, setSelectedPeriod] = useState(null);

    const successfulTrades = useMemo(() =>
        report.trades.filter(t => t.status === 'Success'),
        [report.trades]
    );

    const getTopPerformers = (period, count = 5, type = 'gainers') => {
        const key = `return_${period}`;
        return successfulTrades
            .filter(t => t[key] !== null && (type === 'gainers' ? t[key] > 0 : t[key] < 0))
            .sort((a, b) => type === 'gainers' ? b[key] - a[key] : a[key] - b[key])
            .slice(0, count);
    };

    const calculateStats = (period) => {
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

        return {
            avg, median,
            highest: Math.max(...values),
            lowest: Math.min(...values),
            positiveCount: positiveValues.length,
            negativeCount: negativeValues.length,
            positiveMedian: posSorted.length > 0 ? posSorted[Math.floor(posSorted.length / 2)] : 0,
            positiveAvg: positiveValues.length > 0 ? positiveValues.reduce((s, v) => s + v, 0) / positiveValues.length : 0,
            negativeMedian: negSorted.length > 0 ? negSorted[Math.floor(negSorted.length / 2)] : 0,
            negativeAvg: negativeValues.length > 0 ? negativeValues.reduce((s, v) => s + v, 0) / negativeValues.length : 0,
            capitalReturn: capital * (avg / 100)
        };
    };

    const stats = {
        '7d': calculateStats('7d'),
        '30d': calculateStats('30d'),
        '90d': calculateStats('90d')
    };

    const bestPeriodData = useMemo(() => {
        const counts = { '7d': 0, '30d': 0, '90d': 0 };
        successfulTrades.forEach(t => {
            const returns = [
                { period: '7d', value: t.return_7d },
                { period: '30d', value: t.return_30d },
                { period: '90d', value: t.return_90d }
            ].filter(r => r.value !== null);
            if (returns.length > 0) {
                const best = returns.reduce((max, r) => r.value > max.value ? r : max);
                counts[best.period]++;
            }
        });
        return [
            { name: '1 Week', value: counts['7d'], fill: COLORS[0] },
            { name: '1 Month', value: counts['30d'], fill: COLORS[1] },
            { name: '3 Month', value: counts['90d'], fill: COLORS[2] }
        ];
    }, [successfulTrades]);

    const topStockByPeriod = useMemo(() => {
        return ['7d', '30d', '90d'].map(period => {
            const key = `return_${period}`;
            const topStock = [...successfulTrades]
                .filter(t => t[key] !== null)
                .sort((a, b) => b[key] - a[key])[0];
            return topStock ? {
                period: period === '7d' ? '1 Week' : period === '30d' ? '1 Month' : '3 Month',
                stock: topStock.symbol,
                value: topStock[key]
            } : null;
        }).filter(item => item !== null);
    }, [successfulTrades]);

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

                if (sortConfig.key === 'signal_date') {
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
    const formatCurrency = (val) => val ? `₹${val.toFixed(2)}` : 'N/A';
    const getColorClass = (val) => val > 0 ? 'positive' : val < 0 ? 'negative' : 'neutral';

    const getExitDate = (entryDate, period) => {
        const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
        const date = new Date(entryDate);
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
        const exitDate = getExitDate(trade.signal_date, period);
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
                    <select value={capital} onChange={(e) => setCapital(Number(e.target.value))} className="capital-select">
                        <option value={100000}>₹1 Lakh</option>
                        <option value={500000}>₹5 Lakh</option>
                        <option value={1000000}>₹10 Lakh</option>
                        <option value={5000000}>₹50 Lakh</option>
                    </select>
                </div>
            </div>

            <div className="summary-cards">
                <div className="stat-card">
                    <div className="stat-icon"><TrendingUp size={24} /></div>
                    <div className="stat-content">
                        <div className="stat-label">Total Signals</div>
                        <div className="stat-value">{report.total_signals}</div>
                        <div className="stat-subtext">{report.successful_signals} successful</div>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon success"><Percent size={24} /></div>
                    <div className="stat-content">
                        <div className="stat-label">Win Rate (1 Week)</div>
                        <div className="stat-value success">{report.win_rate_7d?.toFixed(1)}%</div>
                        <div className="stat-subtext">Avg: {formatPercent(report.avg_return_7d)}</div>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon success"><Percent size={24} /></div>
                    <div className="stat-content">
                        <div className="stat-label">Win Rate (1 Month)</div>
                        <div className="stat-value success">{report.win_rate_30d?.toFixed(1)}%</div>
                        <div className="stat-subtext">Avg: {formatPercent(report.avg_return_30d)}</div>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon success"><Percent size={24} /></div>
                    <div className="stat-content">
                        <div className="stat-label">Win Rate (3 Month)</div>
                        <div className="stat-value success">{report.win_rate_90d?.toFixed(1)}%</div>
                        <div className="stat-subtext">Avg: {formatPercent(report.avg_return_90d)}</div>
                    </div>
                </div>
            </div>

            <div className="charts-grid">
                {['7d', '30d', '90d'].map((period, idx) => {
                    const periodName = period === '7d' ? '1 Week' : period === '30d' ? '1 Month' : '3 Month';
                    return (
                        <div key={period} className="chart-card">
                            <h3 className="chart-title">{periodName} Performance</h3>
                            <ResponsiveContainer width="100%" height={250}>
                                <BarChart data={getTopPerformers(period, 5, 'gainers')}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                    <XAxis dataKey="symbol" stroke="#9ca3af" angle={-45} textAnchor="end" height={80} />
                                    <YAxis stroke="#9ca3af" />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }}
                                        formatter={(value) => [`${value.toFixed(2)}%`, 'Return']}
                                    />
                                    <Bar dataKey={`return_${period}`} fill={COLORS[idx]} radius={[8, 8, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>

                            <div className="performers-grid">
                                <div className="performers-section">
                                    <h4 className="performers-title">Top Gainers</h4>
                                    {getTopPerformers(period, 5, 'gainers').map((trade, i) => (
                                        <div key={i} className="performer-item">
                                            <span className="performer-symbol">{trade.symbol}</span>
                                            <span className="performer-return positive">{formatPercent(trade[`return_${period}`])}</span>
                                        </div>
                                    ))}
                                </div>
                                <div className="performers-section">
                                    <h4 className="performers-title">Top Losers</h4>
                                    {getTopPerformers(period, 5, 'losers').map((trade, i) => (
                                        <div key={i} className="performer-item">
                                            <span className="performer-symbol">{trade.symbol}</span>
                                            <span className="performer-return negative">{formatPercent(trade[`return_${period}`])}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="distribution-grid">
                <div className="chart-card">
                    <h3 className="section-title">Best Return Period Distribution</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                            <Pie
                                data={bestPeriodData}
                                dataKey="value"
                                nameKey="name"
                                cx="50%"
                                cy="50%"
                                outerRadius={100}
                                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                            />
                            <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }} />
                            <Legend />
                        </PieChart>
                    </ResponsiveContainer>
                </div>

                <div className="chart-card">
                    <h3 className="section-title">Summary Statistics</h3>
                    <div className="summary-stats">
                        <div className="stat-row">
                            <span className="stat-label-sm">Total Stocks:</span>
                            <span className="stat-value-sm">{successfulTrades.length}</span>
                        </div>
                        <div className="stat-row">
                            <span className="stat-label-sm">Selected Capital:</span>
                            <span className="stat-value-sm">{formatCurrency(capital)}</span>
                        </div>
                    </div>

                    <h4 className="subsection-title">Top Performers by Period</h4>
                    <div className="top-performers-list">
                        {topStockByPeriod.map(({ period, stock, value }) => (
                            <div key={period} className="top-performer-row">
                                <span className="period-label">{period}:</span>
                                <span className="stock-name">{stock}</span>
                                <span className={`return-value ${getColorClass(value)}`}>{formatPercent(value)}</span>
                            </div>
                        ))}
                    </div>
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
                    <h3 className="section-title">Trade Log <span className="hint-text">(Hover for date/price, Click to view chart)</span></h3>
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
                                    Date {sortConfig.key === 'signal_date' && (sortConfig.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}
                                </th>
                                <th onClick={() => handleSort('entry_price')}>
                                    Entry {sortConfig.key === 'entry_price' && (sortConfig.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}
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
                                    <td>{formatCurrency(trade.entry_price)}</td>
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
            </div>
        </motion.div>
    );
};

export default Dashboard;
