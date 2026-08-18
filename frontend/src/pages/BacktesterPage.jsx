import React, { useState, useEffect, useCallback, useMemo } from 'react';
import UploadCard from '../components/UploadCard';
import Dashboard from '../components/Dashboard';
import { runBacktestWS } from '../services/api';
import { getReport, listReports, deleteReport, saveReport } from '../services/db';
import { fetchUploads } from '../services/api';
import {
    Activity, ArrowLeft, Clock, TrendingUp, Trash2, AlertTriangle, Cloud,
    Search, Sparkles, Layers, ArrowUpRight, CheckCircle2, ShieldAlert
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

const ConfirmModal = ({ message, onConfirm, onCancel, confirmLabel }) => (
    <AnimatePresence>
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md"
            onClick={onCancel}
        >
            <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="glass-card p-6 max-w-md mx-4 shadow-2xl border border-white/15"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-start gap-4">
                    <div className="p-3 bg-yellow-500/15 rounded-2xl border border-yellow-500/30 text-yellow-400">
                        <AlertTriangle size={24} />
                    </div>
                    <div className="flex-1">
                        <h3 className="text-lg font-bold text-white mb-2">Confirm Action</h3>
                        <p className="text-gray-300 text-sm mb-6 leading-relaxed">{message}</p>
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={onCancel}
                                className="px-4 py-2 rounded-xl bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white transition-colors text-sm font-semibold"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={onConfirm}
                                className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all shadow-lg ${
                                    confirmLabel === 'Discard'
                                        ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30'
                                        : 'bg-blue-600 text-white hover:bg-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.3)]'
                                }`}
                            >
                                {confirmLabel || 'Confirm'}
                            </button>
                        </div>
                    </div>
                </div>
            </motion.div>
        </motion.div>
    </AnimatePresence>
);

const BacktesterPage = () => {
    const [report, setReport] = useState(() => {
        const saved = sessionStorage.getItem('backtest_report');
        return saved ? JSON.parse(saved) : null;
    });
    const [savedReports, setSavedReports] = useState([]);
    const [reportSearch, setReportSearch] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [progress, setProgress] = useState(null);
    const [error, setError] = useState(null);
    const [entryMode, setEntryMode] = useState('next_close');
    const [showExitConfirm, setShowExitConfirm] = useState(false);
    const [deleteTargetId, setDeleteTargetId] = useState(null);

    const isReportSaved = report && savedReports.some(r => r.id === report.run_id);

    const refreshReports = useCallback(() => {
        Promise.all([
            listReports().catch(() => []),
            fetchUploads().then(r => r.results || []).catch(() => []),
        ]).then(([local, server]) => {
            if (!Array.isArray(local)) local = [];
            if (!Array.isArray(server)) server = [];
            const localIds = new Set(local.map(r => r.id));
            const merged = [
                ...local,
                ...server
                    .filter(s => !localIds.has(s.id))
                    .map(s => ({ ...s, source: 'server', total_signals: s.signal_count })),
            ];
            merged.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            setSavedReports(merged);
        });
    }, []);

    useEffect(() => {
        if (report) {
            sessionStorage.setItem('backtest_report', JSON.stringify(report));
        } else {
            sessionStorage.removeItem('backtest_report');
        }
    }, [report]);

    useEffect(() => {
        refreshReports();
    }, []);

    const handleUpload = (file) => {
        setIsLoading(true);
        setError(null);
        setProgress({ current: 0, total: 100, symbol: 'Starting...' });

        runBacktestWS(
            file,
            (progressData) => {
                setProgress(progressData);
            },
            (reportData) => {
                setReport(reportData);
                setIsLoading(false);
                setProgress(null);
                saveReport(reportData).then(refreshReports);
            },
            (errorMessage) => {
                setError(errorMessage || 'Backtest failed');
                setIsLoading(false);
                setProgress(null);
            },
            entryMode
        );
    };

    const handleRequestBack = () => {
        if (isReportSaved) {
            setReport(null);
            setError(null);
            sessionStorage.removeItem('backtest_report');
        } else {
            setShowExitConfirm(true);
        }
    };

    const handleConfirmExit = async () => {
        setShowExitConfirm(false);
        if (report) {
            await saveReport(report);
            await refreshReports();
        }
        setReport(null);
        setError(null);
        sessionStorage.removeItem('backtest_report');
    };

    const handleCancelExit = () => {
        setShowExitConfirm(false);
    };

    const handleLoadReport = async (id) => {
        const r = await getReport(id);
        if (r) setReport(r);
    };

    const handleDeleteReport = async (id) => {
        await deleteReport(id);
        setDeleteTargetId(null);
        refreshReports();
    };

    const filteredSavedReports = useMemo(() => {
        if (!reportSearch.trim()) return savedReports;
        const q = reportSearch.toLowerCase();
        return savedReports.filter(r =>
            (r.filename || '').toLowerCase().includes(q) ||
            (r.entry_mode || '').toLowerCase().includes(q) ||
            String(r.total_signals).includes(q)
        );
    }, [savedReports, reportSearch]);

    return (
        <div className="min-h-screen pt-24 pb-16 px-6 relative">
            {/* Background glowing gradients */}
            <div className="absolute top-20 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-[140px] pointer-events-none" />
            <div className="absolute bottom-20 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-[140px] pointer-events-none" />

            {showExitConfirm && (
                <ConfirmModal
                    message="Save this report before leaving? You can reopen it later from Previous Reports."
                    onConfirm={handleConfirmExit}
                    onCancel={handleCancelExit}
                    confirmLabel="Save & Exit"
                />
            )}

            {deleteTargetId && (
                <ConfirmModal
                    message="Are you sure you want to delete this saved backtest report? This action cannot be undone."
                    onConfirm={() => handleDeleteReport(deleteTargetId)}
                    onCancel={() => setDeleteTargetId(null)}
                    confirmLabel="Discard"
                />
            )}

            <div className="container mx-auto">
                {!report ? (
                    <div className="max-w-5xl mx-auto space-y-12">
                        {/* Hero Header */}
                        <div className="text-center max-w-2xl mx-auto">
                            <Link to="/dashboard" className="inline-flex items-center text-gray-400 hover:text-white mb-4 transition-colors text-sm font-semibold">
                                <ArrowLeft size={18} className="mr-1.5" /> Back to Dashboard Hub
                            </Link>
                            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 backdrop-blur-sm mb-4">
                                <Sparkles size={15} className="text-blue-400" />
                                <span className="text-xs font-semibold text-gray-300">Quantitative Signal Validator</span>
                            </div>
                            <h1 className="text-4xl md:text-5xl font-display font-bold text-white mb-3 tracking-tight bg-gradient-to-r from-white via-blue-100 to-white bg-clip-text text-transparent">
                                Stock Screener Backtester
                            </h1>
                            <p className="text-gray-400 text-sm md:text-base leading-relaxed">
                                Upload your ChartInk or custom screener CSV/Excel signals to analyze historical win rates, forward horizons, and realistic trade simulation.
                            </p>
                        </div>

                        {/* Upload Card Container */}
                        <div className="glass-card p-6 sm:p-10 shadow-2xl border border-white/10 rounded-3xl relative overflow-hidden">
                            <UploadCard
                                onUpload={handleUpload}
                                isLoading={isLoading}
                                progress={progress}
                                entryMode={entryMode}
                                onEntryModeChange={setEntryMode}
                            />

                            {error && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="mt-6 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-3 text-red-400 text-sm"
                                >
                                    <AlertTriangle size={20} className="shrink-0" />
                                    <span>{error}</span>
                                </motion.div>
                            )}
                        </div>

                        {/* Previous Reports Section */}
                        {savedReports.length > 0 && (
                            <div className="space-y-6">
                                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
                                            <Clock size={20} />
                                        </div>
                                        <div>
                                            <h2 className="text-xl font-bold text-white">Previous Backtest Reports</h2>
                                            <p className="text-xs text-gray-400">Reopen previous strategy runs or view historical stats</p>
                                        </div>
                                    </div>

                                    {/* Search input */}
                                    <div className="relative w-full sm:w-64">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={15} />
                                        <input
                                            type="text"
                                            placeholder="Search reports..."
                                            value={reportSearch}
                                            onChange={(e) => setReportSearch(e.target.value)}
                                            className="w-full pl-9 pr-3 py-2 bg-gray-900/80 border border-white/10 rounded-xl text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                                        />
                                    </div>
                                </div>

                                {/* Reports Grid */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {filteredSavedReports.map(r => {
                                        const isLocal = !r.source || r.source === 'local';
                                        const modeLabel = r.entry_mode === 'next_open' ? 'Next Open' : r.entry_mode === 'same_close' ? 'Same Close' : r.entry_mode === 'next_avg' ? 'Next Midpoint' : 'Next Close';
                                        return (
                                            <motion.div
                                                key={r.id}
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                className={`group relative p-5 rounded-2xl border backdrop-blur-xl transition-all ${
                                                    isLocal
                                                        ? 'bg-gray-900/70 border-white/10 hover:border-blue-500/40 hover:shadow-[0_0_25px_rgba(59,130,246,0.15)] cursor-pointer'
                                                        : 'bg-gray-900/40 border-white/5 opacity-75'
                                                }`}
                                                onClick={() => isLocal && handleLoadReport(r.id)}
                                            >
                                                <div className="flex justify-between items-start mb-3">
                                                    <div className="flex items-center gap-2">
                                                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/15 text-blue-300 border border-blue-500/30">
                                                            {modeLabel}
                                                        </span>
                                                        {isLocal ? (
                                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                                                                <CheckCircle2 size={10} /> Saved
                                                            </span>
                                                        ) : (
                                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white/5 text-gray-400 border border-white/10 flex items-center gap-1">
                                                                <Cloud size={10} /> Server Backup
                                                            </span>
                                                        )}
                                                    </div>

                                                    {isLocal && (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setDeleteTargetId(r.id);
                                                            }}
                                                            className="p-1.5 text-gray-500 hover:text-red-400 rounded-lg hover:bg-red-500/10 transition-colors"
                                                            title="Delete report"
                                                        >
                                                            <Trash2 size={15} />
                                                        </button>
                                                    )}
                                                </div>

                                                <div className="mb-3">
                                                    <h4 className="text-base font-bold text-white group-hover:text-blue-300 transition-colors flex items-center justify-between">
                                                        <span>{r.filename || 'Backtest Strategy Report'}</span>
                                                        <ArrowUpRight size={16} className="text-gray-500 group-hover:text-blue-400 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                                                    </h4>
                                                    <p className="text-xs text-gray-500 mt-0.5">
                                                        {new Date(r.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} at {new Date(r.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                                                    </p>
                                                </div>

                                                {/* Stats Pills */}
                                                <div className="grid grid-cols-3 gap-2 pt-3 border-t border-white/5 text-center text-xs">
                                                    <div className="p-2 rounded-xl bg-white/[0.02]">
                                                        <div className="text-[10px] text-gray-500">Signals</div>
                                                        <div className="font-bold text-white font-mono">{r.total_signals}</div>
                                                    </div>
                                                    <div className="p-2 rounded-xl bg-white/[0.02]">
                                                        <div className="text-[10px] text-gray-500">Win Rate</div>
                                                        <div className={`font-bold font-mono ${r.win_rate_7d >= 50 ? 'text-emerald-400' : 'text-gray-300'}`}>
                                                            {r.win_rate_7d != null ? `${r.win_rate_7d.toFixed(1)}%` : '—'}
                                                        </div>
                                                    </div>
                                                    <div className="p-2 rounded-xl bg-white/[0.02]">
                                                        <div className="text-[10px] text-gray-500">Avg Return</div>
                                                        <div className={`font-bold font-mono ${r.avg_return_7d > 0 ? 'text-emerald-400' : 'text-gray-300'}`}>
                                                            {r.avg_return_7d != null ? `${r.avg_return_7d > 0 ? '+' : ''}${r.avg_return_7d.toFixed(1)}%` : '—'}
                                                        </div>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <Dashboard report={report} onBack={handleRequestBack} />
                )}
            </div>
        </div>
    );
};

export default BacktesterPage;
