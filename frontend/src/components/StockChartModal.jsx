import React, { useState, useRef, useEffect } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
    LineChart, Line, Area, AreaChart, ComposedChart, Scatter
} from 'recharts';
import { X, BarChart3, LineChart as LineChartIcon, Activity, CandlestickChart, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { fetchSymbolPrices } from '../services/api';

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
    const [chartType, setChartType] = useState('area');
    const [ohlcvData, setOhlcvData] = useState(null);
    const [candleLoading, setCandleLoading] = useState(false);

    const chartContainerRef = useRef(null);
    const chartRef = useRef(null);
    const seriesRef = useRef(null);
    const toolTipRef = useRef(null);
    const currentSymbolRef = useRef(null);
    const resizeObserverRef = useRef(null);

    const periodKey = `return_${period}`;
    const exitPriceKey = `exit_price_${period}`;
    const periodDays = period === '7d' ? 7 : period === '30d' ? 30 : 90;
    const periodName = period === '7d' ? '7 Days' : period === '30d' ? '30 Days' : '90 Days';

    const entryDateStr = stock?.entry_date || stock?.signal_date;

    const getExitDate = (entryDateStr, days) => {
        const date = new Date(entryDateStr);
        date.setDate(date.getDate() + days);
        return date.toLocaleDateString('en-IN');
    };

    const exitDate = entryDateStr ? getExitDate(entryDateStr, periodDays) : '';
    const returnValue = stock?.[periodKey];
    const isPositive = returnValue > 0;

    const chartData = [
        { date: entryDateStr, price: stock?.entry_price, type: 'Entry', marker: '🟢' },
        { date: exitDate, price: stock?.[exitPriceKey], type: 'Exit', marker: isPositive ? '🟢' : '🔴' },
        { date: stock?.max_high_date || 'N/A', price: stock?.max_high_90d, type: 'Max High', marker: '⬆️' },
        { date: stock?.max_low_date || 'N/A', price: stock?.max_low_90d, type: 'Max Low', marker: '⬇️' }
    ].filter(d => d.price !== null && d.price !== undefined);

    const sortedChartData = [...chartData].sort((a, b) => new Date(a.date) - new Date(b.date));

    const parseDateToYYYYMMDD = (dateStr) => {
        if (!dateStr || dateStr === 'N/A') return null;
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return null;
        return d.toISOString().split('T')[0];
    };

    // Candlestick lifecycle — must be before early return (hooks rule)
    useEffect(() => {
        if (!stock) return;

        if (chartType !== 'candlestick') {
            if (chartRef.current) {
                chartRef.current.remove();
                chartRef.current = null;
                seriesRef.current = null;
                if (toolTipRef.current) {
                    toolTipRef.current.style.display = 'none';
                }
            }
            return;
        }

        let destroyed = false;
        const symbol = stock?.symbol || '';
        currentSymbolRef.current = symbol;
        setCandleLoading(true);
        setOhlcvData(null);

        const startDate = parseDateToYYYYMMDD(entryDateStr);
        let endD = new Date(entryDateStr);
        endD.setDate(endD.getDate() + periodDays + 5);
        const endDate = endD.toISOString().split('T')[0];

        const loadChart = async () => {
            let lw;
            try {
                const mod = await import('lightweight-charts');
                lw = mod;
            } catch (err) {
                console.error('Failed to load lightweight-charts:', err);
                setCandleLoading(false);
                return;
            }
            if (destroyed) return;

            const container = chartContainerRef.current;
            if (!container) return;

            if (chartRef.current) return;

            const chart = lw.createChart(container, {
                layout: {
                    background: { type: 'solid', color: 'transparent' },
                    textColor: '#d1d5db',
                },
                grid: {
                    vertLines: { color: 'rgba(255,255,255,0.05)' },
                    horzLines: { color: 'rgba(255,255,255,0.05)' },
                },
                crosshair: {
                    mode: lw.CrosshairMode.Normal,
                    vertLine: {
                        width: 1, color: 'rgba(255,255,255,0.2)',
                        style: lw.LineStyle.Dashed, labelBackgroundColor: '#0f172a',
                    },
                    horzLine: {
                        width: 1, color: 'rgba(255,255,255,0.2)',
                        style: lw.LineStyle.Dashed, labelBackgroundColor: '#0f172a',
                    },
                },
                rightPriceScale: { borderColor: 'rgba(255,255,255,0.1)' },
                timeScale: { borderColor: 'rgba(255,255,255,0.1)' },
            });
            chartRef.current = chart;

            // Tooltip element
            let tooltip = toolTipRef.current;
            if (!tooltip) {
                tooltip = document.createElement('div');
                tooltip.className = 'lwc-tooltip';
                container.parentElement.appendChild(tooltip);
                toolTipRef.current = tooltip;
            }

            chart.subscribeCrosshairMove((param) => {
                if (!param.time || !param.point) {
                    tooltip.style.display = 'none';
                    return;
                }

                const data = param.seriesData.get(seriesRef.current);
                if (!data) {
                    tooltip.style.display = 'none';
                    return;
                }

                const entryPx = stock?.entry_price;
                const changePct = entryPx ? ((data.close - entryPx) / entryPx * 100) : 0;

                tooltip.innerHTML = `
                    <div class="tt-symbol">${symbol}</div>
                    <div class="tt-row"><span>O: ${data.open.toFixed(2)}</span><span>H: ${data.high.toFixed(2)}</span></div>
                    <div class="tt-row"><span>L: ${data.low.toFixed(2)}</span><span>C: ${data.close.toFixed(2)}</span></div>
                    <div class="tt-change ${changePct >= 0 ? 'positive' : 'negative'}">
                        ${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}% from entry
                    </div>
                    <div class="tt-date">${param.time}</div>
                `;
                tooltip.style.display = 'block';

                const containerRect = container.parentElement.getBoundingClientRect();
                const x = param.point.x + 15;
                const y = param.point.y - 10;
                const tw = tooltip.offsetWidth;
                const rightEdge = x + tw + 15;
                if (rightEdge > containerRect.width) {
                    tooltip.style.left = (param.point.x - tw - 15) + 'px';
                } else {
                    tooltip.style.left = x + 'px';
                }
                tooltip.style.top = Math.max(0, y) + 'px';
            });

            // Fetch data
            try {
                const prices = await fetchSymbolPrices(symbol, startDate, endDate);
                if (symbol !== currentSymbolRef.current) return;

                if (destroyed) return;

                if (!prices || prices.length === 0) {
                    setCandleLoading(false);
                    setOhlcvData(null);
                    return;
                }

                setOhlcvData(prices);
                setCandleLoading(false);

                const mappedCandles = prices.map(p => ({
                    time: p.date,
                    open: p.open,
                    high: p.high,
                    low: p.low,
                    close: p.close,
                }));

                const candlestickSeries = chart.addSeries(lw.CandlestickSeries, {
                    upColor: '#10b981',
                    downColor: '#ef4444',
                    borderDownColor: '#ef4444',
                    borderUpColor: '#10b981',
                    wickDownColor: '#ef4444',
                    wickUpColor: '#10b981',
                });
                candlestickSeries.setData(mappedCandles);
                seriesRef.current = candlestickSeries;

                // Price reference lines on Y-axis
                const entryPrice = stock?.entry_price;
                const exitPrice = stock?.[exitPriceKey];
                if (entryPrice) {
                    candlestickSeries.createPriceLine({
                        price: entryPrice,
                        color: '#10b981',
                        lineWidth: 1,
                        lineStyle: lw.LineStyle.Dashed,
                        axisLabelVisible: true,
                        title: `Entry ₹${entryPrice.toFixed(0)}`,
                    });
                }
                if (exitPrice) {
                    candlestickSeries.createPriceLine({
                        price: exitPrice,
                        color: exitPrice >= entryPrice ? '#10b981' : '#ef4444',
                        lineWidth: 1,
                        lineStyle: lw.LineStyle.Dashed,
                        axisLabelVisible: true,
                        title: `Exit ₹${exitPrice.toFixed(0)}`,
                    });
                }
                if (stock?.max_high_90d != null) {
                    candlestickSeries.createPriceLine({
                        price: stock.max_high_90d,
                        color: '#8b5cf6',
                        lineWidth: 1,
                        lineStyle: lw.LineStyle.Dotted,
                        axisLabelVisible: true,
                        title: `High ₹${stock.max_high_90d.toFixed(0)}`,
                    });
                }
                if (stock?.max_low_90d != null) {
                    candlestickSeries.createPriceLine({
                        price: stock.max_low_90d,
                        color: '#f59e0b',
                        lineWidth: 1,
                        lineStyle: lw.LineStyle.Dotted,
                        axisLabelVisible: true,
                        title: `Low ₹${stock.max_low_90d.toFixed(0)}`,
                    });
                }

                // Markers — snap to nearest candle time
                const timeSet = new Set(mappedCandles.map(c => c.time));
                const snapToNearest = (targetDateStr) => {
                    if (!targetDateStr || targetDateStr === 'N/A') return null;
                    if (timeSet.has(targetDateStr)) return targetDateStr;
                    const target = new Date(targetDateStr);
                    let best = null;
                    let bestDiff = Infinity;
                    for (const t of timeSet) {
                        const diff = Math.abs(new Date(t) - target);
                        if (diff < bestDiff) {
                            bestDiff = diff;
                            best = t;
                        }
                    }
                    return best;
                };

                const markers = [];
                const entryTime = snapToNearest(parseDateToYYYYMMDD(entryDateStr));
                const exitTime = snapToNearest(parseDateToYYYYMMDD(exitDate));
                const highTime = snapToNearest(stock.max_high_date);
                const lowTime = snapToNearest(stock.max_low_date);

                if (entryTime && stock.entry_price != null) {
                    markers.push({
                        time: entryTime, position: 'belowBar', color: '#10b981',
                        shape: 'arrowUp', text: `Entry ₹${stock.entry_price.toFixed(2)}`,
                    });
                }
                if (exitTime && stock[exitPriceKey] != null) {
                    markers.push({
                        time: exitTime,
                        position: isPositive ? 'aboveBar' : 'belowBar',
                        color: isPositive ? '#10b981' : '#ef4444',
                        shape: isPositive ? 'arrowUp' : 'arrowDown',
                        text: `Exit ₹${stock[exitPriceKey].toFixed(2)}`,
                    });
                }
                if (highTime && stock.max_high_90d != null) {
                    markers.push({
                        time: highTime, position: 'aboveBar', color: '#8b5cf6',
                        shape: 'arrowDown', text: `High ₹${stock.max_high_90d.toFixed(2)}`,
                    });
                }
                if (lowTime && stock.max_low_90d != null) {
                    markers.push({
                        time: lowTime, position: 'belowBar', color: '#f59e0b',
                        shape: 'arrowUp', text: `Low ₹${stock.max_low_90d.toFixed(2)}`,
                    });
                }
                candlestickSeries.setMarkers(markers);
                chart.timeScale().fitContent();
            } catch {
                if (!destroyed) {
                    setCandleLoading(false);
                    setOhlcvData(null);
                }
            }
        };

        loadChart();

        // ResizeObserver
        const container = chartContainerRef.current;
        if (container) {
            const observer = new ResizeObserver(() => {
                if (chartRef.current) {
                    chartRef.current.resize(container.clientWidth, container.clientHeight);
                }
            });
            observer.observe(container);
            resizeObserverRef.current = observer;
        }

        return () => {
            destroyed = true;
            if (resizeObserverRef.current) {
                resizeObserverRef.current.disconnect();
                resizeObserverRef.current = null;
            }
            if (chartRef.current) {
                chartRef.current.remove();
                chartRef.current = null;
                seriesRef.current = null;
            }
            if (toolTipRef.current) {
                toolTipRef.current.style.display = 'none';
            }
        };
    }, [chartType, stock, period]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!stock) return null;

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
                        <div className="modal-header-left">
                            <h3 className="modal-title">{stock.symbol}</h3>
                            <span className={`hero-badge ${isPositive ? 'positive' : 'negative'}`}>
                                {isPositive ? '+' : ''}{returnValue?.toFixed(2)}%
                            </span>
                            <p className="modal-subtitle">{periodName} • {entryDateStr} → {exitDate}</p>
                        </div>
                        <button className="modal-close" onClick={onClose}>
                            <X size={24} />
                        </button>
                    </div>

                    {/* Stats Grid */}
                    <div className="modal-stats-grid">
                        <div className="stat-card">
                            <span className="stat-label">Entry</span>
                            <span className="stat-price">₹{stock.entry_price?.toFixed(2)}</span>
                            <span className="stat-date">{entryDateStr}</span>
                        </div>
                        <div className="stat-card">
                            <span className="stat-label">Exit</span>
                            <span className="stat-price">₹{stock[exitPriceKey]?.toFixed(2)}</span>
                            <span className="stat-date">{exitDate}</span>
                        </div>
                        <div className="stat-card">
                            <span className="stat-label">Peak</span>
                            <span className="stat-price positive">₹{stock.max_high_90d?.toFixed(2)}</span>
                            <span className="stat-date">{stock.max_high_date || 'N/A'}</span>
                        </div>
                        <div className="stat-card">
                            <span className="stat-label">Trough</span>
                            <span className="stat-price negative">₹{stock.max_low_90d?.toFixed(2)}</span>
                            <span className="stat-date">{stock.max_low_date || 'N/A'}</span>
                        </div>
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
                        <button
                            className={`chart-type-btn ${chartType === 'candlestick' ? 'active' : ''}`}
                            onClick={() => setChartType('candlestick')}
                        >
                            <CandlestickChart size={18} /> Candlestick
                        </button>
                    </div>

                    <div className="modal-chart">
                        {chartType === 'candlestick' ? (
                            <>
                                {candleLoading && (
                                    <div className="chart-skeleton" style={{ height: 280 }} />
                                )}
                                    <div
                                        ref={chartContainerRef}
                                        style={{
                                            width: '100%',
                                            height: candleLoading ? 0 : 280,
                                            display: candleLoading ? 'none' : 'block',
                                        }}
                                    />
                                    {!candleLoading && !ohlcvData && (
                                        <div className="flex items-center justify-center" style={{ height: 280 }}>
                                            <p className="text-gray-500 text-sm">No price data available for this period.</p>
                                        </div>
                                    )}
                            </>
                        ) : (
                            <ResponsiveContainer width="100%" height={280}>
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
                                        <RechartsTooltip content={<CustomTooltip />} />
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
                                        <RechartsTooltip content={<CustomTooltip />} />
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
                                        <RechartsTooltip content={<CustomTooltip />} />
                                        <Bar
                                            dataKey="price"
                                            fill={isPositive ? "#10b981" : "#ef4444"}
                                            radius={[8, 8, 0, 0]}
                                        />
                                    </BarChart>
                                )}
                            </ResponsiveContainer>
                        )}
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
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold transition-colors text-xs"
                        >
                            Fundamentals <ArrowRight size={14} />
                        </Link>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};

export default StockChartModal;
