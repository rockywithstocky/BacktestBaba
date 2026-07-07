import React from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { TrendingUp, PieChart, Search, ArrowRight, Lock, Sparkles } from 'lucide-react';

const DashboardHub = () => {
    const tools = [
        {
            id: 'backtester',
            title: 'Stock Screener Backtester',
            description: 'Validate your trading strategies with historical data. Analyze win rates, returns, and drawdowns.',
            icon: <TrendingUp size={40} />,
            link: '/dashboard/backtester',
            active: true,
            gradient: 'from-blue-500 via-indigo-500 to-cyan-500',
            iconBg: 'from-blue-600/20 to-cyan-600/20',
            borderGlow: 'group-hover:shadow-[0_0_40px_rgba(59,130,246,0.3)]',
            bgGlow: 'bg-blue-500/5'
        },
        {
            id: 'fundamental',
            title: 'Fundamental Analysis',
            description: 'Deep dive into company financials, ratios, and growth metrics. Analyze PE, Market Cap, and more.',
            icon: <PieChart size={40} />,
            link: '#',
            active: false, // Will activate when page is ready
            gradient: 'from-purple-500 via-fuchsia-500 to-pink-500',
            iconBg: 'from-purple-600/20 to-pink-600/20',
            borderGlow: 'group-hover:shadow-[0_0_40px_rgba(139,92,246,0.3)]',
            bgGlow: 'bg-purple-500/5'
        },
        {
            id: 'screener',
            title: 'Live Market Screener',
            description: 'Real-time scanning for technical patterns and breakouts. (Coming Soon)',
            icon: <Search size={40} />,
            link: '#',
            active: false,
            gradient: 'from-emerald-500 via-teal-500 to-green-500',
            iconBg: 'from-emerald-600/20 to-teal-600/20',
            borderGlow: 'group-hover:shadow-[0_0_40px_rgba(16,185,129,0.3)]',
            bgGlow: 'bg-emerald-500/5'
        }
    ];

    return (
        <div className="min-h-screen bg-gray-900 pt-28 px-6 pb-12 relative overflow-hidden">
            {/* Animated Background */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-20 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-[120px] animate-pulse" />
                <div className="absolute bottom-20 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-[120px] animate-pulse delay-700" />
            </div>

            <div className="container mx-auto relative z-10">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-12 text-center"
                >
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 backdrop-blur-sm mb-6">
                        <Sparkles size={16} className="text-blue-400" />
                        <span className="text-sm font-semibold text-gray-300">Professional Trading Tools</span>
                    </div>
                    <h1 className="text-4xl md:text-5xl font-display font-bold text-white mb-3 bg-gradient-to-r from-white via-blue-100 to-white bg-clip-text text-transparent">
                        Dashboard Hub
                    </h1>
                    <p className="text-gray-400 text-lg">Select a tool to start your analysis</p>
                </motion.div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
                    {tools.map((tool, index) => (
                        <ToolCard key={tool.id} tool={tool} index={index} />
                    ))}
                </div>
            </div>
        </div>
    );
};

const ToolCard = ({ tool, index }) => {
    const CardContent = (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            whileHover={tool.active ? { y: -8, transition: { duration: 0.3 } } : {}}
            className={`relative h-full p-8 rounded-3xl border backdrop-blur-xl overflow-hidden group transition-all duration-300 ${tool.active
                ? `border-white/10 bg-gradient-to-br from-white/5 to-transparent ${tool.borderGlow}`
                : 'border-white/5 bg-white/[0.02] opacity-60 cursor-not-allowed'
                }`}
        >
            {/* Gradient Overlay on Hover */}
            {tool.active && (
                <div className={`absolute inset-0 bg-gradient-to-br ${tool.gradient} opacity-0 group-hover:opacity-5 transition-opacity duration-300 pointer-events-none`} />
            )}

            {/* Top Border Glow */}
            {tool.active && (
                <div className={`absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r ${tool.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />
            )}

            <div className="relative z-10">
                <div className="flex justify-between items-start mb-6">
                    <motion.div
                        className={`p-4 rounded-2xl backdrop-blur-sm ${tool.active ? `bg-gradient-to-br ${tool.iconBg} border border-white/10` : 'bg-gray-800/50 grayscale'}`}
                        whileHover={tool.active ? { scale: 1.1, rotate: 5 } : {}}
                        transition={{ duration: 0.2 }}
                    >
                        <div className={tool.active ? `bg-gradient-to-br ${tool.gradient} bg-clip-text text-transparent` : 'text-gray-500'}>
                            {tool.icon}
                        </div>
                    </motion.div>
                    {!tool.active && (
                        <div className="p-2 rounded-lg bg-gray-800/50">
                            <Lock size={18} className="text-gray-600" />
                        </div>
                    )}
                </div>

                <h3 className="text-xl font-display font-bold text-white mb-3">{tool.title}</h3>
                <p className="text-gray-400 text-sm mb-6 leading-relaxed">
                    {tool.description}
                </p>

                {tool.active && (
                    <div className="flex items-center gap-2 text-transparent bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text font-semibold text-sm opacity-0 group-hover:opacity-100 transform translate-x-0 group-hover:translate-x-2 transition-all duration-300">
                        <span>Launch Tool</span>
                        <ArrowRight size={16} className="text-blue-400" />
                    </div>
                )}
            </div>
        </motion.div>
    );

    return tool.active ? (
        <Link to={tool.link} className="block h-full min-h-[280px]">
            {CardContent}
        </Link>
    ) : (
        <div className="h-full min-h-[280px]">
            {CardContent}
        </div>
    );
};

export default DashboardHub;
