import React, { useState } from 'react';
import UploadCard from './components/UploadCard';
import Dashboard from './components/Dashboard';
import { runBacktest } from './services/api';
import { Activity, TrendingUp } from 'lucide-react';

function App() {
  const [report, setReport] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);

  const handleUpload = async (file) => {
    setIsLoading(true);
    setError(null);
    setProgress({ current: 0, total: 100, symbol: 'Starting...' });

    try {
      const result = await runBacktest(file);
      setReport(result);
      setIsLoading(false);
      setProgress(null);
    } catch (err) {
      setError(err.message || 'Backtest failed');
      setIsLoading(false);
      setProgress(null);
    }
  };

  const handleReset = () => {
    setReport(null);
    setError(null);
  };

  return (
    <div className="app-container">
      <nav className="navbar">
        <div className="logo">
          <TrendingUp size={28} color="#4f46e5" />
          <h1>Stock Screener Backtester Pro</h1>
        </div>
      </nav>

      <main className="main-content">
        {!report ? (
          <div className="hero-section">
            <h2>Validate Your Strategy with Real Data</h2>
            <p>Upload your screener results and get instant performance metrics.</p>

            <div className="upload-wrapper">
              <UploadCard
                onUpload={handleUpload}
                isLoading={isLoading}
                progress={progress}
              />
            </div>

            {error && (
              <div className="error-message">
                <Activity size={20} />
                <span>{error}</span>
              </div>
            )}
          </div>
        ) : (
          <Dashboard report={report} onBack={handleReset} />
        )}
      </main>
    </div>
  );
}

export default App;
