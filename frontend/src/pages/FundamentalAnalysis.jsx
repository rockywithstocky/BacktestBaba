import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Copy, Check, TrendingUp, DollarSign, Activity, BarChart3 } from 'lucide-react';
import { motion } from 'framer-motion';

const FundamentalAnalysis = () => {
    const { symbol } = useParams();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [copied, setCopied] = useState(false);
    const [data, setData] = useState(null);

    // Mock Data - In real app, fetch from backend (yfinance)
    useEffect(() => {
        // Simulate API call
        setTimeout(() => {
            setData({
                symbol: symbol || 'RELIANCE',
                name: 'Reliance Industries Ltd.',
                price: 2456.75,
                change: 12.50,
                changePercent: 0.51,
                marketCap: '16.5T',
                peRatio: 24.5,
                eps: 102.4,
                sector: 'Energy',
                industry: 'Oil & Gas Refining & Marketing',
                description: 'Reliance Industries Limited is an Indian multinational conglomerate company, headquartered in Mumbai. It has diverse businesses including energy, petrochemicals, natural gas, retail, telecommunications, mass media, and textiles.',
                financials: [
                    { year: '2023', revenue: '8.7T', profit: '66K Cr' },
                    { year: '2022', revenue: '7.2T', profit: '60K Cr' },
                    { year: '2021', revenue: '4.6T', profit: '49K Cr' },
                ]
            });
            setLoading(false);
        }, 1500);
    }, [symbol]);

    const copyGoogleFinance = () => {
        const formula = `=GOOGLEFINANCE("NSE:${symbol}")`;
        navigator.clipboard.writeText(formula);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-900 flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-900 pt-24 pb-12 px-6">
            <div className="container mx-auto max-w-6xl">
                <button
                    onClick={() => navigate(-1)}
                    className="flex items-center gap-2 text-gray-400 hover:text-white mb-8 transition-colors"
                >
                    <ArrowLeft size={20} /> Back
                </button>

                {/* Header */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-12">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <h1 className="text-4xl font-display font-bold text-white">{data.symbol}</h1>
                            <span className="px-3 py-1 rounded-full bg-blue-500/10 text-blue-400 text-sm font-semibold border border-blue-500/20">
                                {data.sector}
                            </span>
                        </div>
                        <h2 className="text-xl text-gray-400">{data.name}</h2>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="text-right">
                            <div className="text-3xl font-bold text-white">₹{data.price.toLocaleString()}</div>
                            <div className={`text-sm font-semibold ${data.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                {data.change > 0 ? '+' : ''}{data.change} ({data.changePercent}%)
                            </div>
                        </div>
                        <button
                            onClick={copyGoogleFinance}
                            className="flex items-center gap-2 px-4 py-3 bg-gray-800 hover:bg-gray-700 rounded-xl transition-all border border-white/10 group"
                            title="Copy Google Finance Formula"
                        >
                            {copied ? <Check size={20} className="text-emerald-400" /> : <Copy size={20} className="text-gray-400 group-hover:text-white" />}
                            <span className="text-sm font-medium text-gray-300 group-hover:text-white">
                                {copied ? 'Copied!' : 'Track in Sheets'}
                            </span>
                        </button>
                    </div>
                </div>

                {/* Grid Layout */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    {/* Key Stats */}
                    <div className="col-span-1 md:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <StatCard label="Market Cap" value={data.marketCap} icon={<DollarSign size={20} className="text-purple-400" />} />
                        <StatCard label="P/E Ratio" value={data.peRatio} icon={<Activity size={20} className="text-blue-400" />} />
                        <StatCard label="EPS" value={`₹${data.eps}`} icon={<TrendingUp size={20} className="text-emerald-400" />} />
                    </div>

                    {/* About */}
                    <div className="col-span-1 md:col-span-3 bg-gray-800/50 backdrop-blur-sm border border-white/10 rounded-2xl p-6">
                        <h3 className="text-lg font-semibold text-white mb-4">About Company</h3>
                        <p className="text-gray-400 leading-relaxed">{data.description}</p>
                    </div>
                </div>

                {/* Financials Placeholder */}
                <div className="bg-gray-800/50 backdrop-blur-sm border border-white/10 rounded-2xl p-6">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                            <BarChart3 size={20} className="text-blue-400" />
                            Financial Performance
                        </h3>
                        <span className="text-sm text-gray-500">Annual (Mock Data)</span>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                        {data.financials.map((item, i) => (
                            <div key={i} className="p-4 rounded-xl bg-gray-900/50 border border-white/5">
                                <div className="text-gray-500 text-sm mb-1">{item.year}</div>
                                <div className="text-white font-semibold mb-1">Rev: {item.revenue}</div>
                                <div className="text-emerald-400 text-sm">Profit: {item.profit}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

const StatCard = ({ label, value, icon }) => (
    <div className="bg-gray-800/50 backdrop-blur-sm border border-white/10 rounded-2xl p-5 flex items-start justify-between hover:border-white/20 transition-colors">
        <div>
            <p className="text-gray-400 text-sm mb-1">{label}</p>
            <p className="text-2xl font-bold text-white">{value}</p>
        </div>
        <div className="p-2 rounded-lg bg-white/5">
            {icon}
        </div>
    </div>
);

export default FundamentalAnalysis;
