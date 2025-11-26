import React from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { TrendingUp, BarChart2, Shield, Zap, ArrowRight, Sparkles, LineChart, Target } from 'lucide-react';

const LandingPage = () => {
    return (
        <div className="min-h-screen bg-black text-white overflow-hidden relative">
            {/* Animated Background */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/30 rounded-full blur-[120px] animate-pulse" />
                <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-purple-500/30 rounded-full blur-[120px] animate-pulse delay-700" />
                <div className="absolute bottom-0 left-1/2 w-96 h-96 bg-pink-500/20 rounded-full blur-[120px] animate-pulse delay-1000" />
            </div>

            {/* Grid Pattern Overlay */}
            <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.02)_1px,transparent_1px)] bg-[size:100px_100px] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_50%,#000_70%,transparent_110%)]" />

            {/* Hero Section */}
            <div className="relative z-10 container mx-auto px-6 pt-32 pb-20">
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8 }}
                    className="text-center max-w-5xl mx-auto"
                >
                    {/* Badge */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.2 }}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20 backdrop-blur-sm mb-8"
                    >
                        <Sparkles size={16} className="text-blue-400" />
                        <span className="text-sm font-medium bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                            Professional Trading Analytics
                        </span>
                    </motion.div>

                    {/* Main Heading */}
                    <h1 className="text-6xl md:text-8xl font-black mb-6 leading-tight">
                        <span className="bg-gradient-to-r from-white via-blue-100 to-white bg-clip-text text-transparent">
                            Master Your
                        </span>
                        <br />
                        <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent animate-gradient">
                            Trading Strategy
                        </span>
                    </h1>

                    {/* Subtitle */}
                    <p className="text-xl md:text-2xl text-gray-400 mb-12 max-w-3xl mx-auto leading-relaxed">
                        Transform your stock screening results into actionable insights.
                        <span className="text-white font-semibold"> Backtest instantly</span>, visualize performance, and
                        <span className="text-white font-semibold"> optimize your portfolio</span> with institutional-grade tools.
                    </p>

                    {/* CTA Buttons */}
                    <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-16">
                        <Link to="/login">
                            <motion.button
                                whileHover={{ scale: 1.05, boxShadow: "0 20px 60px rgba(59, 130, 246, 0.4)" }}
                                whileTap={{ scale: 0.95 }}
                                className="group px-8 py-4 bg-gradient-to-r from-blue-600 via-blue-500 to-purple-600 rounded-2xl font-bold text-lg shadow-2xl shadow-blue-500/50 flex items-center gap-3 relative overflow-hidden"
                            >
                                <div className="absolute inset-0 bg-gradient-to-r from-blue-400 to-purple-400 opacity-0 group-hover:opacity-100 transition-opacity blur-xl" />
                                <span className="relative">Get Started Free</span>
                                <ArrowRight size={20} className="relative group-hover:translate-x-1 transition-transform" />
                            </motion.button>
                        </Link>
                        <Link to="/login">
                            <motion.button
                                whileHover={{ scale: 1.05, backgroundColor: "rgba(255,255,255,0.1)" }}
                                whileTap={{ scale: 0.95 }}
                                className="px-8 py-4 bg-white/5 border-2 border-white/10 rounded-2xl font-bold text-lg backdrop-blur-md hover:border-white/20 transition-all flex items-center gap-3"
                            >
                                <LineChart size={20} />
                                View Live Demo
                            </motion.button>
                        </Link>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-3 gap-8 max-w-2xl mx-auto">
                        <StatItem number="10K+" label="Backtests Run" />
                        <StatItem number="99.9%" label="Accuracy" />
                        <StatItem number="<1s" label="Avg. Speed" />
                    </div>
                </motion.div>
            </div>

            {/* Features Section */}
            <div className="relative z-10 container mx-auto px-6 py-20">
                <motion.div
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    className="text-center mb-16"
                >
                    <h2 className="text-4xl md:text-5xl font-bold mb-4">
                        <span className="bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                            Everything You Need to Win
                        </span>
                    </h2>
                    <p className="text-gray-400 text-lg">Powerful features designed for serious traders</p>
                </motion.div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <FeatureCard
                        icon={<Zap size={32} />}
                        title="Lightning Fast"
                        description="Upload your CSV and get comprehensive backtest results in under a second. No waiting, no complexity."
                        gradient="from-yellow-500 to-orange-500"
                        delay={0.2}
                    />
                    <FeatureCard
                        icon={<BarChart2 size={32} />}
                        title="Deep Analytics"
                        description="Visualize win rates, drawdowns, and returns. Interactive charts reveal patterns you'd otherwise miss."
                        gradient="from-blue-500 to-cyan-500"
                        delay={0.4}
                    />
                    <FeatureCard
                        icon={<Target size={32} />}
                        title="Risk Management"
                        description="Calculate optimal position sizing and analyze risk-adjusted returns with institutional precision."
                        gradient="from-emerald-500 to-green-500"
                        delay={0.6}
                    />
                </div>
            </div>

            {/* Dashboard Preview */}
            <div className="relative z-10 container mx-auto px-6 py-20">
                <motion.div
                    initial={{ opacity: 0, y: 50 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.8 }}
                    className="relative rounded-3xl overflow-hidden border border-white/10 shadow-2xl shadow-blue-500/20 bg-gradient-to-br from-gray-900/90 to-black/90 backdrop-blur-2xl p-1 group"
                >
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 via-purple-500/20 to-pink-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                    <div className="relative bg-black rounded-3xl aspect-video flex items-center justify-center overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-purple-500/5" />
                        <div className="text-center p-8 relative z-10">
                            <motion.div
                                animate={{ rotate: 360 }}
                                transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                                className="mx-auto mb-6 w-24 h-24 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 p-1"
                            >
                                <div className="w-full h-full rounded-full bg-black flex items-center justify-center">
                                    <TrendingUp size={40} className="text-blue-400" />
                                </div>
                            </motion.div>
                            <h3 className="text-3xl font-bold text-white mb-2">Interactive Dashboard</h3>
                            <p className="text-gray-400 text-lg">See your strategies come to life with real-time visualizations</p>
                        </div>
                    </div>
                </motion.div>
            </div>

            {/* Footer */}
            <footer className="relative z-10 border-t border-white/5 bg-black/50 backdrop-blur-md mt-20">
                <div className="container mx-auto px-6 py-12">
                    <div className="flex flex-col md:flex-row justify-between items-center gap-6">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl">
                                <TrendingUp size={24} className="text-white" />
                            </div>
                            <span className="font-bold text-xl">StockBacktester<span className="text-blue-400">Pro</span></span>
                        </div>
                        <div className="text-gray-400 text-sm">
                            © 2024 StockBacktester Pro. Empowering traders worldwide.
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    );
};

const StatItem = ({ number, label }) => (
    <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8 }}
        className="text-center"
    >
        <div className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent mb-1">
            {number}
        </div>
        <div className="text-sm text-gray-500 font-medium">{label}</div>
    </motion.div>
);

const FeatureCard = ({ icon, title, description, gradient, delay }) => (
    <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ delay, duration: 0.5 }}
        whileHover={{ y: -8, transition: { duration: 0.2 } }}
        className="group relative p-8 rounded-3xl bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10 backdrop-blur-sm hover:border-white/20 transition-all duration-300 overflow-hidden"
    >
        {/* Gradient Glow */}
        <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-0 group-hover:opacity-10 transition-opacity duration-300 blur-xl`} />

        {/* Icon */}
        <div className="relative mb-6">
            <div className={`inline-flex p-4 rounded-2xl bg-gradient-to-br ${gradient} bg-opacity-10 group-hover:scale-110 transition-transform duration-300`}>
                <div className={`text-transparent bg-gradient-to-br ${gradient} bg-clip-text`}>
                    {icon}
                </div>
            </div>
        </div>

        {/* Content */}
        <h3 className="text-2xl font-bold mb-3 text-white group-hover:text-transparent group-hover:bg-gradient-to-r group-hover:from-white group-hover:to-gray-300 group-hover:bg-clip-text transition-all">
            {title}
        </h3>
        <p className="text-gray-400 leading-relaxed">
            {description}
        </p>
    </motion.div>
);

export default LandingPage;
