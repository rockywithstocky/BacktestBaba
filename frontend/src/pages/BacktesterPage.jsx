import React, { useState } from 'react';
import UploadCard from '../components/UploadCard';
import Dashboard from '../components/Dashboard';
import { Activity, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

const BacktesterPage = () => {
    const [report, setReport] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [progress, setProgress] = useState(null);
    const [error, setError] = useState(null);

    const handleUpload = (file) => {
        setIsLoading(true);
        setError(null);
        setProgress({ current: 0, total: 100, symbol: 'Starting...' });

        // Use WebSocket for real-time progress
        import('../services/api').then(({ runBacktestWS }) => {
            runBacktestWS(
                file,
                (progressData) => {
                    setProgress(progressData);
                },
                (reportData) => {
                    setReport(reportData);
                    setIsLoading(false);
                    setProgress(null);
                },
                (errorMessage) => {
                    setError(errorMessage || 'Backtest failed');
                    setIsLoading(false);
                    setProgress(null);
                }
            );
        }).catch(err => {
            console.error("Failed to load api service", err);
            setError("Failed to initialize backtest service");
            setIsLoading(false);
        });
    };

    const handleReset = () => {
        setReport(null);
        setError(null);
    };

    return (
        <div className="min-h-screen bg-gray-900 pt-24 px-4 pb-12">
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
                            />

                            {error && (
                                <div className="mt-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-400">
                                    <Activity size={20} />
                                    <span>{error}</span>
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    <Dashboard report={report} onBack={handleReset} />
                )}
            </div>
        </div>
    );
};

export default BacktesterPage;
