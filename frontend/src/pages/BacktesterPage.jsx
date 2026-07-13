import React, { useState, useEffect, useCallback } from 'react';
import UploadCard from '../components/UploadCard';
import Dashboard from '../components/Dashboard';
import { runBacktestWS } from '../services/api';
import { getReport, listReports, deleteReport, saveReport } from '../services/db';
import { Activity, ArrowLeft, Clock, TrendingUp, Trash2, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

const ConfirmModal = ({ message, onConfirm, onCancel, confirmLabel }) => (
    <AnimatePresence>
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={onCancel}
        >
            <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-gray-800 border border-white/10 rounded-2xl p-6 max-w-md mx-4 shadow-2xl"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-start gap-4">
                    <div className="p-2 bg-yellow-500/10 rounded-xl">
                        <AlertTriangle size={24} className="text-yellow-400" />
                    </div>
                    <div className="flex-1">
                        <h3 className="text-lg font-bold text-white mb-2">Confirm</h3>
                        <p className="text-gray-400 text-sm mb-6">{message}</p>
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={onCancel}
                                className="px-4 py-2 rounded-xl bg-gray-700/50 text-gray-300 hover:bg-gray-700 transition-colors text-sm font-medium"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={onConfirm}
                                className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                                    confirmLabel === 'Discard'
                                        ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                                        : 'bg-blue-600 text-white hover:bg-blue-500'
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
    const [isLoading, setIsLoading] = useState(false);
    const [progress, setProgress] = useState(null);
    const [error, setError] = useState(null);
    const [entryMode, setEntryMode] = useState('next_close');
    const [showExitConfirm, setShowExitConfirm] = useState(false);

    const isReportSaved = report && savedReports.some(r => r.id === report.run_id);

    const refreshReports = useCallback(() => {
        listReports().then(setSavedReports).catch(() => {});
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
        setSavedReports(prev => prev.filter(r => r.id !== id));
    };

    return (
        <div className="min-h-screen bg-gray-900 pt-24 px-4 pb-12">
            {showExitConfirm && (
                <ConfirmModal
                    message="Save this report before leaving? You can reopen it later from Previous Reports."
                    onConfirm={handleConfirmExit}
                    onCancel={handleCancelExit}
                    confirmLabel="Save & Exit"
                />
            )}
            <div className="container mx-auto">
                {!report ? (
                    <div className="max-w-4xl mx-auto">
                        <div className="mb-8">
                            <Link to="/dashboard" className="inline-flex items-center text-gray-400 hover:text-white mb-4 transition-colors">
                                <ArrowLeft size={20} className="mr-2" /> Back to Hub
                            </Link>
                            <h1 className="text-3xl font-bold text-white mb-2">New Backtest</h1>
                            <p className="text-gray-400">Upload your screener results to analyze performance.</p>
                        </div>

                        <div className="bg-gray-800/30 border border-white/5 rounded-2xl p-8 backdrop-blur-sm">
                            <UploadCard
                                onUpload={handleUpload}
                                isLoading={isLoading}
                                progress={progress}
                                entryMode={entryMode}
                                onEntryModeChange={setEntryMode}
                            />

                            {error && (
                                <div className="mt-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-400">
                                    <Activity size={20} />
                                    <span>{error}</span>
                                </div>
                            )}
                        </div>

                        {savedReports.length > 0 && (
                            <div className="mt-8">
                                <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                                    <Clock size={20} className="text-blue-400" /> Previous Reports
                                </h2>
                                <div className="grid gap-3">
                                    {savedReports.map(r => (
                                        <div key={r.id} className="bg-gray-800/30 border border-white/5 rounded-xl p-4 flex items-center justify-between hover:border-blue-500/30 transition-colors">
                                            <button onClick={() => handleLoadReport(r.id)} className="flex-1 text-left">
                                                <div className="text-sm text-gray-400">{new Date(r.created_at).toLocaleDateString()} {new Date(r.created_at).toLocaleTimeString()}</div>
                                                <div className="text-white font-medium mt-1">
                                                    {r.total_signals} signals · {r.successful_signals} wins · {r.failed_signals} losses
                                                </div>
                                                <div className="flex gap-4 mt-1 text-xs text-gray-500">
                                                    {r.win_rate_7d != null && <span>Win Rate: {(r.win_rate_7d * 100).toFixed(1)}%</span>}
                                                    {r.avg_return_7d != null && <span>Avg Return: {(r.avg_return_7d * 100).toFixed(2)}%</span>}
                                                </div>
                                            </button>
                                            <button onClick={() => handleDeleteReport(r.id)} className="p-2 text-gray-500 hover:text-red-400 transition-colors">
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    ))}
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
