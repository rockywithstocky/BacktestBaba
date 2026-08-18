import React from 'react';
import { Calendar, TrendingUp, TrendingDown, DollarSign } from 'lucide-react';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const MonthlyHeatmap = ({ monthlyMatrix = {} }) => {
    const years = Object.keys(monthlyMatrix).sort((a, b) => Number(b) - Number(a));

    if (years.length === 0) {
        return (
            <div className="p-8 text-center bg-gray-900/40 rounded-2xl border border-white/5 backdrop-blur-sm">
                <Calendar className="mx-auto text-gray-500 mb-3" size={32} />
                <p className="text-gray-400 font-medium">No monthly performance data available for this backtest.</p>
            </div>
        );
    }

    const formatCurrency = (val) => {
        if (!val && val !== 0) return '-';
        const sign = val > 0 ? '+' : val < 0 ? '-' : '';
        return `${sign}₹${Math.abs(Math.round(val)).toLocaleString('en-IN')}`;
    };

    const getCellColor = (pnl) => {
        if (!pnl && pnl !== 0) return 'bg-white/[0.02] text-gray-600 border-white/5';
        if (pnl === 0) return 'bg-gray-800/40 text-gray-400 border-white/5';

        if (pnl > 0) {
            if (pnl > 100000) return 'bg-emerald-500/30 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/40';
            if (pnl > 40000) return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/30';
            return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/10 hover:bg-emerald-500/20';
        } else {
            const abs = Math.abs(pnl);
            if (abs > 100000) return 'bg-red-500/30 text-red-300 border-red-500/30 hover:bg-red-500/40';
            if (abs > 40000) return 'bg-red-500/20 text-red-400 border-red-500/20 hover:bg-red-500/30';
            return 'bg-red-500/10 text-red-400 border-red-500/10 hover:bg-red-500/20';
        }
    };

    return (
        <div className="w-full overflow-x-auto rounded-2xl border border-white/10 bg-gray-900/60 backdrop-blur-xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
                        <Calendar size={20} />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-white">Monthly & Annual Performance Matrix</h3>
                        <p className="text-xs text-gray-400">Quant hedge-fund style monthly Net PnL distribution across calendar years</p>
                    </div>
                </div>
                <div className="flex items-center gap-4 text-xs">
                    <span className="flex items-center gap-1.5 text-emerald-400"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Profitable Month</span>
                    <span className="flex items-center gap-1.5 text-red-400"><span className="w-2.5 h-2.5 rounded-full bg-red-500"></span> Drawdown Month</span>
                </div>
            </div>

            <table className="w-full text-center border-collapse min-w-[760px]">
                <thead>
                    <tr className="border-b border-white/10 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                        <th className="py-3 px-4 text-left">Year</th>
                        {MONTH_NAMES.map(m => (
                            <th key={m} className="py-3 px-2">{m}</th>
                        ))}
                        <th className="py-3 px-4 text-right bg-white/[0.03] rounded-t-lg">Year Total</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-white/5 font-mono text-xs">
                    {years.map(year => {
                        const yearData = monthlyMatrix[year] || { months: {}, totalPnl: 0, tradeCount: 0 };
                        return (
                            <tr key={year} className="hover:bg-white/[0.02] transition-colors">
                                <td className="py-3 px-4 text-left font-bold text-white">{year}</td>
                                {MONTH_NAMES.map((_, idx) => {
                                    const mIndex = idx + 1;
                                    const monthInfo = yearData.months[mIndex];
                                    const pnl = monthInfo ? monthInfo.pnl : null;
                                    const count = monthInfo ? monthInfo.count : 0;
                                    const winCount = monthInfo ? monthInfo.winCount : 0;

                                    return (
                                        <td key={idx} className="py-2 px-1.5">
                                            {monthInfo ? (
                                                <div
                                                    className={`py-2 px-1 rounded-lg border transition-all cursor-default ${getCellColor(pnl)}`}
                                                    title={`${MONTH_NAMES[idx]} ${year}\nNet PnL: ${formatCurrency(pnl)}\nTrades: ${count} (${winCount} Wins)`}
                                                >
                                                    <div className="font-semibold text-[11px] truncate">
                                                        {formatCurrency(pnl)}
                                                    </div>
                                                    <div className="text-[9px] opacity-70 font-sans">
                                                        {count} trade{count !== 1 ? 's' : ''}
                                                    </div>
                                                </div>
                                            ) : (
                                                <span className="text-gray-700 font-sans">-</span>
                                            )}
                                        </td>
                                    );
                                })}
                                <td className="py-3 px-4 text-right font-bold bg-white/[0.03]">
                                    <span className={`px-2.5 py-1 rounded-md ${yearData.totalPnl >= 0 ? 'text-emerald-400 bg-emerald-500/10' : 'text-red-400 bg-red-500/10'}`}>
                                        {formatCurrency(yearData.totalPnl)}
                                    </span>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};

export default MonthlyHeatmap;
