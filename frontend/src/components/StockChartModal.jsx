import React, { useState } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    LineChart, Line, Area, AreaChart, ComposedChart, Scatter
} from 'recharts';
import { X, BarChart3, LineChart as LineChartIcon, Activity, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';

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

const StockChartModal = ({ stock, period, onClose }) => {
    const [chartType, setChartType] = useState('area'); // 'area', 'line', 'bar'

    if (!stock) return null;

    const periodKey = `return_${period}`;
    const exitPriceKey = `exit_price_${period}`;
    const periodDays = period === '7d' ? 7 : period === '30d' ? 30 : 90;
    const periodName = period === '7d' ? '7 Days' : period === '30d' ? '30 Days' : '90 Days';

    const entryDateStr = stock.entry_date || stock.signal_date;

    // Calculate exit date
    const getExitDate = (entryDateStr, days) => {
        const date = new Date(entryDateStr);
        date.setDate(date.getDate() + days);
        return date.toLocaleDateString('en-IN');
    };

    const exitDate = getExitDate(entryDateStr, periodDays);
    const returnValue = stock[periodKey];
    const isPositive = returnValue > 0;

    // Create comprehensive chart data
    const chartData = [
        {
            date: entryDateStr,
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
                            <span className="modal-stat-date">{entryDateStr}</span>
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

                    <div className="modal-footer flex justify-between items-center">
                        <p className="modal-note">
                            <strong>Signal:</strong> {stock.signal_date} |
                            <strong> Entry:</strong> {entryDateStr} |
                            <strong> Exit:</strong> {exitDate} |
                            <strong> Period:</strong> {periodName}
                        </p>
                        <Link
                            to={`/dashboard/fundamental/${stock.symbol}`}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold transition-colors text-sm"
                        >
                            Analyze Fundamentals <ArrowRight size={16} />
                        </Link>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};

export default StockChartModal;
