import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    ArrowLeft, ExternalLink, Copy, Check, TrendingUp, DollarSign, Activity,
    BarChart3, Search, Shield, Zap, Target, PieChart, Info, Building2
} from 'lucide-react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

const FundamentalAnalysis = () => {
    const { symbol: routeSymbol } = useParams();
    const navigate = useNavigate();
    const [currentSymbol, setCurrentSymbol] = useState(routeSymbol || 'RELIANCE');
    const [searchInput, setSearchInput] = useState('');
    const [loading, setLoading] = useState(true);
    const [copied, setCopied] = useState(false);
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);

    const fetchFundamentals = (sym) => {
        setLoading(true);
        setError(null);
        axios.get(`${API_URL}/stock/${sym}/fundamental`)
            .then(res => {
                setData(res.data);
                setLoading(false);
            })
            .catch(err => {
                console.error("Failed to load stock fundamentals:", err);
                setError(`Could not retrieve fundamentals for ${sym}.`);
                setLoading(false);
            });
    };

    useEffect(() => {
        const sym = routeSymbol || 'RELIANCE';
        setCurrentSymbol(sym);
        fetchFundamentals(sym);
    }, [routeSymbol]);

    const handleSearch = (e) => {
        e.preventDefault();
        if (searchInput.trim()) {
            const sym = searchInput.trim().toUpperCase();
            setCurrentSymbol(sym);
            navigate(`/dashboard/fundamental/${sym}`, { replace: true });
            fetchFundamentals(sym);
            setSearchInput('');
        }
    };

    const copyGoogleFinance = () => {
        const formula = `=GOOGLEFINANCE("NSE:${data?.symbol || currentSymbol}")`;
        navigator.clipboard.writeText(formula);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="min-h-screen pt-24 pb-16 px-6 relative">
            {/* Background glow */}
            <div className="absolute top-20 left-1/3 w-96 h-96 bg-purple-500/10 rounded-full blur-[120px] pointer-events-none" />

            <div className="container mx-auto max-w-6xl relative z-10">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
                    <button
                        onClick={() => navigate('/dashboard')}
                        className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm font-semibold"
                    >
                        <ArrowLeft size={18} /> Back to Hub
                    </button>

                    {/* Search Bar */}
                    <form onSubmit={handleSearch} className="flex items-center gap-2 w-full sm:w-auto">
                        <div className="relative flex-1 sm:w-72">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                            <input
                                type="text"
                                placeholder="Search symbol (e.g. INFY, TCS)..."
                                value={searchInput}
                                onChange={(e) => setSearchInput(e.target.value)}
                                className="w-full pl-9 pr-4 py-2 bg-gray-900/80 border border-white/10 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
                            />
                        </div>
                        <button
                            type="submit"
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-semibold transition-all shadow-[0_0_15px_rgba(59,130,246,0.3)]"
                        >
                            Lookup
                        </button>
                    </form>
                </div>

                {loading ? (
                    <div className="min-h-[400px] flex flex-col items-center justify-center gap-4">
                        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
                        <p className="text-gray-400 text-sm animate-pulse">Loading live market fundamentals for {currentSymbol}...</p>
                    </div>
                ) : error ? (
                    <div className="p-8 text-center bg-red-500/10 border border-red-500/20 rounded-2xl">
                        <p className="text-red-400 font-semibold mb-4">{error}</p>
                        <button
                            onClick={() => fetchFundamentals('RELIANCE')}
                            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-xl text-sm font-semibold"
                        >
                            Load Reliance
                        </button>
                    </div>
                ) : data && (
                    <div className="space-y-8">
                        {/* Main Header Banner */}
                        <div className="p-8 rounded-3xl bg-gradient-to-r from-gray-900/90 via-gray-900/60 to-gray-900/90 border border-white/10 backdrop-blur-xl shadow-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                            <div>
                                <div className="flex items-center gap-3 mb-2 flex-wrap">
                                    <h1 className="text-4xl font-display font-bold text-white tracking-tight">{data.symbol}</h1>
                                    <span className="px-3 py-1 rounded-full bg-blue-500/10 text-blue-400 text-xs font-semibold border border-blue-500/20">
                                        {data.sector}
                                    </span>
                                    <span className="px-3 py-1 rounded-full bg-purple-500/10 text-purple-400 text-xs font-semibold border border-purple-500/20">
                                        {data.industry}
                                    </span>
                                    {data.recommendationKey && data.recommendationKey !== 'N/A' && (
                                        <span className="px-2.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 text-[11px] font-bold uppercase border border-emerald-500/30">
                                            Analyst: {data.recommendationKey}
                                        </span>
                                    )}
                                </div>
                                <h2 className="text-lg text-gray-400 font-medium">{data.name}</h2>
                            </div>

                            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
                                <div className="text-left sm:text-right">
                                    <div className="text-3xl font-bold font-mono text-white">
                                        ₹{data.price > 0 ? data.price.toLocaleString('en-IN') : 'N/A'}
                                    </div>
                                    <div className={`text-sm font-semibold flex items-center sm:justify-end gap-1 ${data.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                        {data.change > 0 ? '+' : ''}{data.change} ({data.changePercent > 0 ? '+' : ''}{data.changePercent}%)
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    <a
                                        href={`https://www.screener.in/company/${encodeURIComponent(data.symbol)}/`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="p-3 bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 text-gray-300 hover:text-white transition-all text-xs font-semibold flex items-center gap-1.5"
                                        title="View on Screener.in"
                                    >
                                        <ExternalLink size={15} /> Screener
                                    </a>
                                    <button
                                        onClick={copyGoogleFinance}
                                        className="flex items-center gap-2 px-4 py-3 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-300 rounded-xl transition-all text-xs font-semibold"
                                        title="Copy Google Finance Formula"
                                    >
                                        {copied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
                                        <span>{copied ? 'Copied formula!' : 'Sheets'}</span>
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* 52-Week Range Visual Bar */}
                        {data.fiftyTwoWeekLow && data.fiftyTwoWeekHigh && (
                            <div className="p-6 rounded-2xl bg-gray-900/60 border border-white/10 backdrop-blur-xl">
                                <div className="flex justify-between items-center text-xs text-gray-400 mb-2">
                                    <span>52-Week Low: <strong className="text-white font-mono">₹{data.fiftyTwoWeekLow}</strong></span>
                                    <span className="text-gray-300 font-semibold">52-Week Price Range</span>
                                    <span>52-Week High: <strong className="text-white font-mono">₹{data.fiftyTwoWeekHigh}</strong></span>
                                </div>
                                <div className="relative w-full h-2.5 bg-gray-800 rounded-full overflow-hidden">
                                    {(() => {
                                        const range = data.fiftyTwoWeekHigh - data.fiftyTwoWeekLow;
                                        const pos = range > 0 ? Math.min(100, Math.max(0, ((data.price - data.fiftyTwoWeekLow) / range) * 100)) : 50;
                                        return (
                                            <div
                                                className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-500 rounded-full"
                                                style={{ width: `${pos}%` }}
                                            />
                                        );
                                    })()}
                                </div>
                            </div>
                        )}

                        {/* Key Valuation & Financial Ratios Grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                            <RatioCard label="Market Cap" value={data.marketCap} icon={<DollarSign size={18} className="text-purple-400" />} />
                            <RatioCard label="P/E (Trailing)" value={data.peRatio ? `${data.peRatio}x` : 'N/A'} icon={<Activity size={18} className="text-blue-400" />} />
                            <RatioCard label="Forward P/E" value={data.forwardPE ? `${data.forwardPE}x` : 'N/A'} icon={<Target size={18} className="text-indigo-400" />} />
                            <RatioCard label="EPS (TTM)" value={data.eps ? `₹${data.eps}` : 'N/A'} icon={<TrendingUp size={18} className="text-emerald-400" />} />
                            <RatioCard label="Return on Equity (ROE)" value={data.returnOnEquity ? `${data.returnOnEquity}%` : 'N/A'} icon={<PieChart size={18} className="text-amber-400" />} />
                            <RatioCard label="Profit Margin" value={data.profitMargins ? `${data.profitMargins}%` : 'N/A'} icon={<TrendingUp size={18} className="text-teal-400" />} />
                            <RatioCard label="Debt to Equity" value={data.debtToEquity !== null ? `${data.debtToEquity}` : 'N/A'} icon={<Shield size={18} className="text-rose-400" />} />
                            <RatioCard label="Beta (Volatility)" value={data.beta !== null ? `${data.beta}` : 'N/A'} icon={<Zap size={18} className="text-cyan-400" />} />
                        </div>

                        {/* Company Profile Description */}
                        <div className="p-6 rounded-2xl bg-gray-900/60 border border-white/10 backdrop-blur-xl">
                            <h3 className="text-base font-bold text-white mb-3 flex items-center gap-2">
                                <Building2 size={18} className="text-blue-400" />
                                Business Overview & Profile
                            </h3>
                            <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-line">
                                {data.description}
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

const RatioCard = ({ label, value, icon }) => (
    <div className="p-4 rounded-2xl bg-gray-900/60 border border-white/10 backdrop-blur-sm flex items-start justify-between hover:border-white/20 transition-colors">
        <div>
            <p className="text-gray-400 text-xs mb-1">{label}</p>
            <p className="text-lg font-bold font-mono text-white">{value || 'N/A'}</p>
        </div>
        <div className="p-2 rounded-xl bg-white/[0.04] border border-white/5">
            {icon}
        </div>
    </div>
);

export default FundamentalAnalysis;
