import React, { useState, useEffect } from 'react';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    ComposedChart, Line
} from 'recharts';
import { TrendingUp, ShieldAlert, DollarSign, Activity, Layers } from 'lucide-react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

const EquityCurveChart = ({ equityCurve = [], quantMetrics = {} }) => {
    const [benchmarkData, setBenchmarkData] = useState([]);
    const [showBenchmark, setShowBenchmark] = useState(true);

    useEffect(() => {
        if (!equityCurve || equityCurve.length < 2) return;
        const startDate = equityCurve[0].date;
        const endDate = equityCurve[equityCurve.length - 1].date;

        if (startDate && endDate) {
            axios.get(`${API_URL}/benchmark/history?start=${startDate}&end=${endDate}&benchmark=^NSEI`)
                .then(res => {
                    if (res.data?.series) {
                        setBenchmarkData(res.data.series);
                    }
                })
                .catch(() => {
                    // Non-blocking fallback
                });
        }
    }, [equityCurve]);

    if (!equityCurve || equityCurve.length === 0) {
        return (
            <div className="p-8 text-center bg-gray-900/40 rounded-2xl border border-white/5">
                <Activity className="mx-auto text-gray-500 mb-3" size={32} />
                <p className="text-gray-400">Not enough trade history to generate an equity progression curve.</p>
            </div>
        );
    }

    // Merge benchmark % return into equityCurve points by matching date (nearest)
    const chartData = equityCurve.map(item => {
        let bmPoint = null;
        if (benchmarkData.length > 0 && item.date) {
            bmPoint = benchmarkData.find(b => b.date === item.date);
            if (!bmPoint) {
                // Find nearest previous date
                bmPoint = [...benchmarkData].reverse().find(b => b.date <= item.date);
            }
        }
        return {
            ...item,
            benchmarkReturn: bmPoint ? bmPoint.return : null
        };
    });

    const formatCurrency = (val) => `₹${Math.round(val).toLocaleString('en-IN')}`;
    const formatPercent = (val) => `${val > 0 ? '+' : ''}${val?.toFixed(2)}%`;

    const isProfitable = (quantMetrics.netProfit ?? 0) >= 0;

    return (
        <div className="w-full rounded-2xl border border-white/10 bg-gray-900/60 backdrop-blur-xl p-6 shadow-2xl space-y-6">
            {/* Header & Controls */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                        <TrendingUp size={20} />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-white">Portfolio Equity Curve & Drawdown</h3>
                        <p className="text-xs text-gray-400">Chronological cumulative portfolio value compared against Nifty 50 benchmark</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setShowBenchmark(!showBenchmark)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                            showBenchmark
                                ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30 shadow-[0_0_15px_rgba(99,102,241,0.2)]'
                                : 'bg-gray-800/60 text-gray-400 border-white/5 hover:text-white'
                        }`}
                    >
                        <Layers size={14} />
                        <span>Nifty 50 Baseline</span>
                    </button>
                </div>
            </div>

            {/* Metric Pills */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/5">
                    <div className="text-xs text-gray-400 mb-1">Total Net PnL</div>
                    <div className={`text-lg font-bold font-mono ${isProfitable ? 'text-emerald-400' : 'text-red-400'}`}>
                        {formatCurrency(quantMetrics.netProfit ?? 0)}
                    </div>
                </div>
                <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/5">
                    <div className="text-xs text-gray-400 mb-1">Cumulative Return</div>
                    <div className={`text-lg font-bold font-mono ${isProfitable ? 'text-emerald-400' : 'text-red-400'}`}>
                        {formatPercent(quantMetrics.totalRoiPct ?? 0)}
                    </div>
                </div>
                <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/5">
                    <div className="text-xs text-gray-400 mb-1">Max Drawdown</div>
                    <div className="text-lg font-bold font-mono text-red-400">
                        -{quantMetrics.maxDrawdown ?? 0}%
                    </div>
                </div>
                <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/5">
                    <div className="text-xs text-gray-400 mb-1">Profit Factor</div>
                    <div className="text-lg font-bold font-mono text-blue-400">
                        {quantMetrics.profitFactor ?? '0.00'}x
                    </div>
                </div>
            </div>

            {/* Equity Chart */}
            <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                        <defs>
                            <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                                <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                        <XAxis
                            dataKey="date"
                            stroke="#6b7280"
                            fontSize={11}
                            tickLine={false}
                            tickFormatter={(d) => (d ? String(d).slice(2) : '')}
                        />
                        <YAxis
                            stroke="#6b7280"
                            fontSize={11}
                            tickLine={false}
                            domain={['auto', 'auto']}
                            tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
                        />
                        <Tooltip
                            content={({ active, payload }) => {
                                if (active && payload && payload.length) {
                                    const d = payload[0].payload;
                                    return (
                                        <div className="glass-card p-3 rounded-xl border border-white/10 bg-gray-950/90 shadow-xl text-xs space-y-1">
                                            <div className="font-bold text-white mb-1">{d.date} • {d.symbol}</div>
                                            <div className="text-emerald-400">Portfolio Equity: {formatCurrency(d.equity)}</div>
                                            <div className="text-blue-300">Cumulative ROI: {formatPercent(d.cumulativeRoi)}</div>
                                            {showBenchmark && d.benchmarkReturn !== null && (
                                                <div className="text-indigo-400">Nifty 50 ROI: {formatPercent(d.benchmarkReturn)}</div>
                                            )}
                                            <div className="text-red-400">Drawdown: {d.drawdownPct}%</div>
                                        </div>
                                    );
                                }
                                return null;
                            }}
                        />
                        <Area
                            type="monotone"
                            dataKey="equity"
                            stroke="#10b981"
                            strokeWidth={2.5}
                            fillOpacity={1}
                            fill="url(#equityGrad)"
                            name="Strategy Equity"
                        />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>

            {/* Underwater Drawdown Chart */}
            <div>
                <div className="flex items-center justify-between text-xs text-gray-400 mb-2 px-1">
                    <span className="flex items-center gap-1 text-red-400 font-semibold">
                        <ShieldAlert size={14} /> Underwater Drawdown Profile
                    </span>
                    <span>Max: -{quantMetrics.maxDrawdown ?? 0}%</span>
                </div>
                <div className="h-[90px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData} margin={{ top: 0, right: 10, left: 10, bottom: 0 }}>
                            <defs>
                                <linearGradient id="drawdownGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.5} />
                                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0.05} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" vertical={false} />
                            <XAxis dataKey="date" hide={true} />
                            <YAxis domain={[-100, 0]} hide={true} />
                            <Tooltip
                                content={({ active, payload }) => {
                                    if (active && payload && payload.length) {
                                        const d = payload[0].payload;
                                        return (
                                            <div className="glass-card p-2 rounded-lg border border-red-500/20 bg-gray-950/90 text-xs">
                                                <span className="text-red-400 font-bold">Drawdown: {d.drawdownPct}%</span>
                                            </div>
                                        );
                                    }
                                    return null;
                                }}
                            />
                            <Area
                                type="monotone"
                                dataKey="drawdownPct"
                                stroke="#ef4444"
                                strokeWidth={1.5}
                                fill="url(#drawdownGrad)"
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
};

export default EquityCurveChart;
