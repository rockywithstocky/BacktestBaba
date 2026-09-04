import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, ExternalLink, ChevronLeft, ChevronRight, Zap, Target,
  Shield, TrendingUp, TrendingDown, AlertTriangle, CheckCircle,
  Activity, BarChart2, Layers, DollarSign, Loader2, Info, HelpCircle
} from 'lucide-react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

const formatPercent = (val) => {
  if (val === null || val === undefined || isNaN(val)) return '—';
  const num = typeof val === 'number' ? val : parseFloat(val);
  const prefix = num > 0 ? '+' : '';
  return `${prefix}${num.toFixed(2)}%`;
};

const getReturnColor = (val) => {
  if (val === null || val === undefined || isNaN(val)) return 'text-neutral-400 border-white/10 bg-white/[0.02]';
  const num = typeof val === 'number' ? val : parseFloat(val);
  if (num > 0) return 'text-emerald-400 border-emerald-500/20 bg-emerald-500/10';
  if (num < 0) return 'text-red-400 border-red-500/20 bg-red-500/10';
  return 'text-neutral-300 border-white/10 bg-white/[0.02]';
};

const getRsiColor = (rsi) => {
  if (rsi === null || rsi === undefined || isNaN(rsi)) return 'text-neutral-400';
  const val = typeof rsi === 'number' ? rsi : parseFloat(rsi);
  if (val >= 50 && val <= 70) return 'text-emerald-400'; // Bullish Momentum
  if (val > 70) return 'text-amber-400'; // Overbought
  if (val < 30) return 'text-purple-400'; // Oversold / Reversal watch
  return 'text-red-400'; // Bearish (<50)
};

const getAdxColor = (adx) => {
  if (adx === null || adx === undefined || isNaN(adx)) return 'text-neutral-400';
  const val = typeof adx === 'number' ? adx : parseFloat(adx);
  if (val >= 50) return 'text-emerald-400'; // Very Strong Trend
  if (val >= 25) return 'text-emerald-400'; // Strong Trend
  if (val >= 20) return 'text-blue-400'; // Emerging Trend
  return 'text-amber-400'; // Weak / Ranging (<20) - NOT green!
};

const getMacdColor = (hist) => {
  if (hist === null || hist === undefined || isNaN(hist)) return 'text-neutral-400';
  const val = typeof hist === 'number' ? hist : parseFloat(hist);
  if (val > 0) return 'text-emerald-400';
  if (val < 0) return 'text-red-400';
  return 'text-neutral-400';
};

const getTrendScoreColor = (score) => {
  if (score === null || score === undefined || isNaN(score)) return 'text-neutral-400';
  const val = typeof score === 'number' ? score : parseFloat(score);
  if (val >= 7) return 'text-emerald-400';
  if (val >= 5.5) return 'text-emerald-300';
  if (val <= 3.5) return 'text-red-400';
  return 'text-amber-400'; // Neutral / Sideways
};

export default function AIGlanceModal({
  isOpen,
  onClose,
  trades = [],
  currentIndex = 0,
  onNavigate
}) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState('short_term');
  const [activeTab, setActiveTab] = useState('setup'); // 'setup' | 'backtest' | 'fundamentals'

  const currentTrade = trades[currentIndex] || null;

  const fetchGlance = useCallback(async (trade, selectedMode) => {
    if (!trade) return;
    setLoading(true);
    setError(null);

    const symbol = trade.symbol || trade.Symbol || '';
    const entryPrice = trade.entry_price || trade.entryPrice || trade.entry || null;
    const signalDate = trade.signal_date || trade.signalDate || trade.date || null;

    try {
      const res = await axios.post(`${API_URL}/ai/glance`, {
        symbol: symbol,
        entry_price: entryPrice ? parseFloat(entryPrice) : null,
        signal_date: signalDate,
        mode: selectedMode
      });
      setData(res.data);
    } catch (err) {
      console.error('Failed to fetch AI glance:', err);
      setError('Could not load AI analysis for this stock.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && currentTrade) {
      fetchGlance(currentTrade, mode);
    }
  }, [isOpen, currentTrade, mode, fetchGlance]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isOpen) return;
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && currentIndex > 0) onNavigate(currentIndex - 1);
      if (e.key === 'ArrowRight' && currentIndex < trades.length - 1) onNavigate(currentIndex + 1);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, currentIndex, trades.length, onNavigate, onClose]);

  if (!isOpen || !currentTrade) return null;

  const rawSym = currentTrade.symbol || '';
  const cleanSym = rawSym.replace(/\.NS$/i, '').replace(/\.BO$/i, '').trim();
  const currencySymbol = data?.currency || '₹';
  const isBullish = data?.trade_setup?.signal?.includes('BUY');
  const isBearish = data?.trade_setup?.signal?.includes('SELL');

  const tvUrl = data?.tradingview_link || (
    data?.exchange && !['NSE', 'BSE'].includes(data?.exchange)
      ? `https://in.tradingview.com/chart/?symbol=${cleanSym}`
      : `https://in.tradingview.com/chart/?symbol=NSE:${cleanSym}`
  );
  const screenerUrl = `https://www.screener.in/company/${encodeURIComponent(cleanSym)}/`;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/75 backdrop-blur-sm">
        {/* Backdrop click */}
        <div className="absolute inset-0" onClick={onClose} />

        {/* Slide-Over Drawer */}
        <motion.div
          initial={{ x: '100%', opacity: 0.5 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          className="relative z-10 flex h-full w-full max-w-2xl flex-col bg-[#0b0c0e] border-l border-white/10 text-white shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 px-6 py-4 bg-white/[0.02]">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-bold">
                <Zap className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold tracking-tight text-white">
                    {data?.name || cleanSym}
                  </h2>
                  <span className="rounded-md bg-white/10 px-2 py-0.5 text-xs font-mono font-semibold text-neutral-400">
                    {data?.exchange || 'NSE'}:{cleanSym}
                  </span>
                  {currentTrade?.isFresh && (
                    <span
                      title="Fresh signal (last 3 trading days)"
                      className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                      LIVE
                    </span>
                  )}
                </div>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Signal Date: <span className="font-mono text-neutral-200">{currentTrade?.signal_date || 'N/A'}</span> · Entry: <span className="font-mono text-neutral-200">{currencySymbol}{currentTrade?.entry_price || '—'}</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="rounded-xl p-2 text-neutral-400 hover:bg-white/10 hover:text-white transition cursor-pointer"
                title="Close Drawer (Esc)"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Mode Selector & Price Status Banner */}
          <div className="flex items-center justify-between border-b border-white/10 px-6 py-3 bg-[#0e1014]">
            <div className="flex items-center gap-2 bg-white/[0.04] p-1 rounded-xl border border-white/10">
              <button
                onClick={() => setMode('short_term')}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition ${
                  mode === 'short_term'
                    ? 'bg-emerald-500 text-black font-extrabold shadow'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                ⚡ Short-Term (Swing)
              </button>
              <button
                onClick={() => setMode('long_term')}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition ${
                  mode === 'long_term'
                    ? 'bg-emerald-500 text-black font-extrabold shadow'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                📈 Long-Term (Positional)
              </button>
            </div>

            <div className="text-right">
              <div className="text-sm font-bold text-white font-mono">
                {currencySymbol}{data?.price?.toFixed(2) || currentTrade?.entry_price || '—'}
              </div>
              <div className={`text-xs font-semibold ${
                (data?.change_percent || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'
              }`}>
                {(data?.change_percent || 0) >= 0 ? '+' : ''}
                {data?.change_percent?.toFixed(2) || '0.00'}%
              </div>
            </div>
          </div>

          {/* Navigation Tabs (Streamlined to 3 Views) */}
          <div className="flex items-center gap-4 px-6 pt-3 border-b border-white/10 bg-black/20 text-xs font-semibold">
            <button
              onClick={() => setActiveTab('setup')}
              className={`pb-2.5 px-1 border-b-2 transition ${
                activeTab === 'setup'
                  ? 'border-emerald-400 text-emerald-400 font-bold'
                  : 'border-transparent text-neutral-400 hover:text-neutral-200'
              }`}
            >
              ⚡ Trade Setup & Analysis
            </button>
            <button
              onClick={() => setActiveTab('backtest')}
              className={`pb-2.5 px-1 border-b-2 transition ${
                activeTab === 'backtest'
                  ? 'border-emerald-400 text-emerald-400 font-bold'
                  : 'border-transparent text-neutral-400 hover:text-neutral-200'
              }`}
            >
              📊 Backtest & Horizons
            </button>
            <button
              onClick={() => setActiveTab('fundamentals')}
              className={`pb-2.5 px-1 border-b-2 transition ${
                activeTab === 'fundamentals'
                  ? 'border-emerald-400 text-emerald-400 font-bold'
                  : 'border-transparent text-neutral-400 hover:text-neutral-200'
              }`}
            >
              🏛️ Fundamentals
            </button>
          </div>

          {/* Content Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-64 space-y-3">
                <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
                <p className="text-sm text-neutral-400">Synthesizing live technicals & trade plan...</p>
              </div>
            ) : error ? (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-center text-sm text-red-400">
                {error}
              </div>
            ) : data ? (
              <>
                {/* TAB 1: Complete Trade Setup & Technical Confluence */}
                {activeTab === 'setup' && (
                  <div className="space-y-4">
                    {/* Setup Matrix Card */}
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-4 shadow-xl">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-neutral-400">
                          Recommended Setup
                        </span>
                        <span className={`px-3 py-1 rounded-full text-xs font-extrabold tracking-wide ${
                          isBullish ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' :
                          isBearish ? 'bg-red-500/20 text-red-400 border border-red-500/40' :
                          'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                        }`}>
                          {data.trade_setup?.signal}
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-3 text-center">
                        <div className="rounded-xl border border-white/10 bg-black/40 p-3">
                          <div className="text-[10px] uppercase font-bold text-neutral-400">Entry Target</div>
                          <div className="text-sm sm:text-base font-extrabold text-white font-mono mt-0.5">
                            {currencySymbol}{data.trade_setup?.entry}
                          </div>
                        </div>

                        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3">
                          <div className="text-[10px] uppercase font-bold text-red-400">Stop-Loss (ATR)</div>
                          <div className="text-sm sm:text-base font-extrabold text-red-400 font-mono mt-0.5">
                            {currencySymbol}{data.trade_setup?.stop_loss}
                          </div>
                        </div>

                        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                          <div className="text-[10px] uppercase font-bold text-emerald-400">Take Profit 1</div>
                          <div className="text-sm sm:text-base font-extrabold text-emerald-400 font-mono mt-0.5">
                            {currencySymbol}{data.trade_setup?.take_profit_1}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-xs text-neutral-400 pt-1 border-t border-white/5">
                        <span>TP2 (Runner Target): <strong className="text-emerald-400 font-mono">{currencySymbol}{data.trade_setup?.take_profit_2}</strong></span>
                        <span>Risk / Reward: <strong className="text-white font-mono">{data.trade_setup?.risk_reward_ratio}</strong></span>
                      </div>
                    </div>

                    {/* Contingency Scenarios (Bull vs Bear Probabilities & Confidence Tooltip) */}
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-neutral-400">
                          Contingency Scenarios
                        </span>
                        <div
                          className="flex items-center gap-1 text-xs text-neutral-400 font-semibold cursor-help border-b border-dashed border-neutral-500"
                          title="Confidence Score (0–100%): Calculated from directional indicator confluence. A high score (e.g. 95%) means Bullish probability (>80%), Moving Average alignment (Price > 20/50/200 SMAs), and strong ADX momentum all agree simultaneously."
                        >
                          <span>Confidence:</span>
                          <strong className="text-white">{data.trade_setup?.confidence_score}%</strong>
                          <HelpCircle className="h-3 w-3 text-emerald-400 inline" />
                        </div>
                      </div>

                      {/* Bullish scenario bar */}
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-xs">
                          <span className="flex items-center gap-1.5 text-emerald-400 font-bold">
                            <span className="h-2 w-2 rounded-full bg-emerald-400"></span>
                            Bullish Scenario
                          </span>
                          <span className="font-bold text-emerald-400 font-mono">
                            {data.scenarios?.bullish?.probability}%
                          </span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-white/5 overflow-hidden">
                          <div
                            className="h-full bg-emerald-400 rounded-full transition-all duration-500"
                            style={{ width: `${data.scenarios?.bullish?.probability}%` }}
                          />
                        </div>
                        <p className="text-[11px] text-neutral-400 leading-relaxed">
                          <strong>Trigger:</strong> {data.scenarios?.bullish?.trigger}
                        </p>
                      </div>

                      {/* Bearish scenario bar */}
                      <div className="space-y-1.5 pt-2 border-t border-white/5">
                        <div className="flex justify-between text-xs">
                          <span className="flex items-center gap-1.5 text-red-400 font-bold">
                            <span className="h-2 w-2 rounded-full bg-red-400"></span>
                            Bearish Contingency
                          </span>
                          <span className="font-bold text-red-400 font-mono">
                            {data.scenarios?.bearish?.probability}%
                          </span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-white/5 overflow-hidden">
                          <div
                            className="h-full bg-red-400 rounded-full transition-all duration-500"
                            style={{ width: `${data.scenarios?.bearish?.probability}%` }}
                          />
                        </div>
                        <p className="text-[11px] text-neutral-400 leading-relaxed">
                          <strong>Trigger:</strong> {data.scenarios?.bearish?.trigger}
                        </p>
                      </div>
                    </div>

                    {/* Technical Confluence Radar (Integrated Directly in Setup) */}
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-neutral-400">
                          Trend Strength & Momentum Radar
                        </span>
                        <div
                          className={`flex items-center gap-1 text-xs font-bold font-mono cursor-help border-b border-dashed border-neutral-600 ${getTrendScoreColor(data.technicals?.trend_score)}`}
                          title="Trend Score (0–10 scale): Points awarded for objective price structure: Price > SMA20 (+1.5), Price > SMA50 (+1.5), Price > SMA200 (+1.0), RSI > 50 (+1.0), MACD Histogram > 0 (+1.0), Base (+5.0). Score >= 6 confirms an active Uptrend; <= 4 confirms a Downtrend."
                        >
                          <span>Score: {data.technicals?.trend_score}/10 ({data.technicals?.trend_direction})</span>
                          <HelpCircle className="h-3 w-3 inline opacity-80" />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center text-xs">
                        {/* RSI 14 */}
                        <div
                          className="rounded-xl border border-white/10 bg-black/40 p-2.5 cursor-help transition hover:border-white/20"
                          title="RSI (14-period Momentum): Scale 0–100. Values 50–70 confirm healthy bullish buyer momentum. >70 is Overbought (exhaustion risk). <30 is Oversold (potential reversal zone)."
                        >
                          <div className="flex items-center justify-center gap-1 text-[10px] text-neutral-400 uppercase font-bold">
                            <span>RSI (14)</span>
                            <Info className="h-2.5 w-2.5 text-neutral-500" />
                          </div>
                          <div className={`font-bold font-mono mt-0.5 ${getRsiColor(data.technicals?.rsi_14?.value)}`}>
                            {data.technicals?.rsi_14?.value}
                          </div>
                          <div className={`text-[9px] font-semibold truncate ${getRsiColor(data.technicals?.rsi_14?.value)}`}>
                            {data.technicals?.rsi_14?.interpretation}
                          </div>
                        </div>

                        {/* ADX 14 */}
                        <div
                          className="rounded-xl border border-white/10 bg-black/40 p-2.5 cursor-help transition hover:border-white/20"
                          title="ADX (14-period Trend Strength): Scale 0–100. <20 = Weak / Choppy Market; 20–25 = Emerging Trend; 25–50 = Strong Directional Trend; 50+ = Very Strong / Parabolic Trend."
                        >
                          <div className="flex items-center justify-center gap-1 text-[10px] text-neutral-400 uppercase font-bold">
                            <span>ADX Trend</span>
                            <Info className="h-2.5 w-2.5 text-neutral-500" />
                          </div>
                          <div className={`font-bold font-mono mt-0.5 ${getAdxColor(data.technicals?.adx_14?.value)}`}>
                            {data.technicals?.adx_14?.value}
                          </div>
                          <div className={`text-[9px] font-semibold truncate ${getAdxColor(data.technicals?.adx_14?.value)}`}>
                            {data.technicals?.adx_14?.interpretation}
                          </div>
                        </div>

                        {/* MACD Hist */}
                        <div
                          className="rounded-xl border border-white/10 bg-black/40 p-2.5 cursor-help transition hover:border-white/20"
                          title="MACD Histogram (12, 26, 9): Measures momentum expansion. Positive (>0) confirms buyers are pushing price upward. Negative (<0) indicates seller momentum."
                        >
                          <div className="flex items-center justify-center gap-1 text-[10px] text-neutral-400 uppercase font-bold">
                            <span>MACD Hist</span>
                            <Info className="h-2.5 w-2.5 text-neutral-500" />
                          </div>
                          <div className={`font-bold font-mono mt-0.5 ${getMacdColor(data.technicals?.macd?.histogram)}`}>
                            {data.technicals?.macd?.histogram}
                          </div>
                          <div className={`text-[9px] truncate ${getMacdColor(data.technicals?.macd?.histogram)}`}>
                            {data.technicals?.macd?.interpretation}
                          </div>
                        </div>

                        {/* ATR Volatility Buffer */}
                        <div
                          className="rounded-xl border border-white/10 bg-black/40 p-2.5 cursor-help transition hover:border-emerald-500/40"
                          title="ATR (Average True Range 14-period): Average expected daily price volatility. Used to calculate volatility-safe Stop-Loss and Target sizing so trades are not stopped out by regular market noise."
                        >
                          <div className="flex items-center justify-center gap-1 text-[10px] text-neutral-400 uppercase font-bold">
                            <span>ATR (14) Vol</span>
                            <Info className="h-2.5 w-2.5 text-neutral-500" />
                          </div>
                          <div className="font-bold text-white font-mono mt-0.5">
                            {currencySymbol}{data.technicals?.atr_14?.value}
                          </div>
                          <div className="text-[9px] text-neutral-400">
                            Volatility Buffer
                          </div>
                        </div>
                      </div>

                      {/* Moving Averages, S/R, and Fibonacci */}
                      <div className="pt-2 border-t border-white/5 space-y-2 text-xs">
                        <div
                          className="flex justify-between items-center cursor-help"
                          title="Simple Moving Averages (20, 50, 200 days): Multi-timeframe trend baselines. Price holding above all three averages signals full institutional bull trend alignment."
                        >
                          <span className="text-neutral-400 flex items-center gap-1">
                            <span>SMA 20 / 50 / 200:</span>
                            <Info className="h-3 w-3 text-neutral-500" />
                          </span>
                          <span className="font-mono text-white font-semibold">
                            {currencySymbol}{data.technicals?.sma20} / {currencySymbol}{data.technicals?.sma50} / {currencySymbol}{data.technicals?.sma200}
                          </span>
                        </div>

                        <div
                          className="flex justify-between items-center cursor-help"
                          title="Support & Resistance: Computed from recent 60-day swing price extremes (Support Floor vs Resistance Ceiling)."
                        >
                          <span className="text-neutral-400 flex items-center gap-1">
                            <span>Support / Resistance:</span>
                            <Info className="h-3 w-3 text-neutral-500" />
                          </span>
                          <span className="font-mono text-white font-semibold">
                            <span className="text-emerald-400">{currencySymbol}{data.technicals?.support_level}</span> - <span className="text-red-400">{currencySymbol}{data.technicals?.resistance_level}</span>
                          </span>
                        </div>

                        <div
                          className="flex justify-between items-center cursor-help"
                          title="Fibonacci 0.50 Level: The 50% equilibrium midpoint between the 60-day swing low and high. Acts as high-probability pullback support."
                        >
                          <span className="text-neutral-400 flex items-center gap-1">
                            <span>Fibonacci 0.50 Retracement:</span>
                            <Info className="h-3 w-3 text-neutral-500" />
                          </span>
                          <span className="font-mono text-neutral-200">
                            {currencySymbol}{data.technicals?.fibonacci?.fib_500}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Detected Patterns */}
                    {data.technicals?.patterns?.length > 0 && (
                      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-neutral-400">
                          Detected Chart Patterns &amp; Setup Criteria
                        </span>
                        <div className="space-y-2">
                          {data.technicals.patterns.map((pat, idx) => {
                            const isMinervini = pat.name.includes('Minervini');
                            const isVcp = pat.name.includes('VCP');
                            return (
                              <div key={idx} className={`flex items-start gap-2.5 text-xs p-2.5 rounded-xl border ${
                                isMinervini ? 'bg-gradient-to-r from-amber-500/10 to-orange-500/5 border-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.1)]' :
                                isVcp ? 'bg-gradient-to-r from-blue-500/10 to-cyan-500/5 border-blue-500/30' :
                                'bg-black/40 border-white/5'
                              }`}>
                                <span className="font-bold mt-0.5 shrink-0 text-sm">
                                  {isMinervini ? '👑' : isVcp ? '📐' : (pat.type === 'bullish' ? '▲' : '▼')}
                                </span>
                                <div>
                                  <span className={`font-bold ${isMinervini ? 'text-amber-300' : isVcp ? 'text-blue-300' : 'text-white'}`}>{pat.name}: </span>
                                  <span className="text-neutral-300">{pat.desc}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 2: Historical Backtest Returns & Horizons */}
                {activeTab === 'backtest' && (
                  <div className="space-y-4">
                    {/* Simulated Trade Performance Card */}
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-neutral-400">
                          Strategy Simulation Result
                        </span>
                        <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-white/10 text-neutral-300">
                          Exit: {currentTrade.simulatedExitReason || 'Holding Trajectory'}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-xl border border-white/10 bg-black/40 p-3">
                          <div className="text-[10px] text-neutral-400 uppercase font-bold">Simulated Net Return</div>
                          <div className={`text-xl font-extrabold font-mono mt-0.5 ${
                            (currentTrade.netReturnPct ?? currentTrade.return_30d ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'
                          }`}>
                            {formatPercent(currentTrade.netReturnPct ?? currentTrade.return_30d)}
                          </div>
                        </div>

                        <div className="rounded-xl border border-white/10 bg-black/40 p-3">
                          <div className="text-[10px] text-neutral-400 uppercase font-bold">Latest Return</div>
                          <div className={`text-xl font-extrabold font-mono mt-0.5 ${
                            (currentTrade.latest_price_return ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'
                          }`}>
                            {formatPercent(currentTrade.latest_price_return)}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Forward Horizons Grid */}
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-neutral-400">
                          Forward Horizon Returns
                        </span>
                        <span className="text-[11px] text-neutral-400">Post-Signal Trajectory</span>
                      </div>

                      <div className="grid grid-cols-3 gap-2.5 text-center text-xs">
                        <div className={`p-3 rounded-xl border ${getReturnColor(currentTrade.return_7d)}`}>
                          <div className="text-[10px] text-neutral-400 uppercase font-bold">7 Days</div>
                          <div className="font-extrabold font-mono mt-0.5">{formatPercent(currentTrade.return_7d)}</div>
                        </div>
                        <div className={`p-3 rounded-xl border ${getReturnColor(currentTrade.return_14d)}`}>
                          <div className="text-[10px] text-neutral-400 uppercase font-bold">14 Days</div>
                          <div className="font-extrabold font-mono mt-0.5">{formatPercent(currentTrade.return_14d)}</div>
                        </div>
                        <div className={`p-3 rounded-xl border ${getReturnColor(currentTrade.return_30d)}`}>
                          <div className="text-[10px] text-neutral-400 uppercase font-bold">30 Days</div>
                          <div className="font-extrabold font-mono mt-0.5">{formatPercent(currentTrade.return_30d)}</div>
                        </div>
                        <div className={`p-3 rounded-xl border ${getReturnColor(currentTrade.return_45d)}`}>
                          <div className="text-[10px] text-neutral-400 uppercase font-bold">45 Days</div>
                          <div className="font-extrabold font-mono mt-0.5">{formatPercent(currentTrade.return_45d)}</div>
                        </div>
                        <div className={`p-3 rounded-xl border ${getReturnColor(currentTrade.return_60d)}`}>
                          <div className="text-[10px] text-neutral-400 uppercase font-bold">60 Days</div>
                          <div className="font-extrabold font-mono mt-0.5">{formatPercent(currentTrade.return_60d)}</div>
                        </div>
                        <div className={`p-3 rounded-xl border ${getReturnColor(currentTrade.return_90d)}`}>
                          <div className="text-[10px] text-neutral-400 uppercase font-bold">90 Days</div>
                          <div className="font-extrabold font-mono mt-0.5">{formatPercent(currentTrade.return_90d)}</div>
                        </div>
                      </div>
                    </div>

                    {/* 90-Day Extremes */}
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-2 text-xs">
                      <div className="flex justify-between items-center">
                        <span className="text-neutral-400">90-Day Max High:</span>
                        <span className="font-mono font-bold text-emerald-400">
                          {currencySymbol}{currentTrade.max_high_90d || '—'} {currentTrade.max_high_date ? `(${currentTrade.max_high_date})` : ''}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-neutral-400">90-Day Max Low:</span>
                        <span className="font-mono font-bold text-red-400">
                          {currencySymbol}{currentTrade.max_low_90d || '—'} {currentTrade.max_low_date ? `(${currentTrade.max_low_date})` : ''}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 3: Fundamental Health */}
                {activeTab === 'fundamentals' && (
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-neutral-400">
                          Valuation & Quality Scorecard
                        </span>
                        <span className="text-xs font-bold text-blue-400">
                          {data.fundamentals?.sector || 'Equities'}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center text-xs">
                        <div className="rounded-xl border border-white/10 bg-black/40 p-3">
                          <div className="text-[10px] text-neutral-400 uppercase font-bold">P/E Ratio</div>
                          <div className="font-bold text-white font-mono mt-0.5">
                            {data.fundamentals?.pe_ratio || 'N/A'}
                          </div>
                        </div>

                        <div className="rounded-xl border border-white/10 bg-black/40 p-3">
                          <div className="text-[10px] text-neutral-400 uppercase font-bold">EPS</div>
                          <div className="font-bold text-white font-mono mt-0.5">
                            {data.fundamentals?.eps ? `${currencySymbol}${data.fundamentals.eps}` : 'N/A'}
                          </div>
                        </div>

                        <div className="rounded-xl border border-white/10 bg-black/40 p-3">
                          <div className="text-[10px] text-neutral-400 uppercase font-bold">ROE</div>
                          <div className="font-bold text-white font-mono mt-0.5">
                            {data.fundamentals?.roe ? `${data.fundamentals.roe}%` : 'N/A'}
                          </div>
                        </div>

                        <div className="rounded-xl border border-white/10 bg-black/40 p-3">
                          <div className="text-[10px] text-neutral-400 uppercase font-bold">Debt / Equity</div>
                          <div className="font-bold text-white font-mono mt-0.5">
                            {data.fundamentals?.debt_to_equity || 'N/A'}
                          </div>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-white/5 flex flex-col gap-2 text-xs text-neutral-400">
                        <div className="flex justify-between">
                          <span>Market Cap:</span>
                          <strong className="text-white">{data.fundamentals?.market_cap || 'N/A'}</strong>
                        </div>
                        <div className="flex justify-between">
                          <span>Industry:</span>
                          <strong className="text-white">{data.fundamentals?.industry || 'General'}</strong>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : null}
          </div>

          {/* Footer Actions & Signal Browsing */}
          <div className="flex items-center justify-between border-t border-white/10 px-6 py-4 bg-white/[0.02]">
            <div className="flex items-center gap-2">
              <button
                onClick={() => currentIndex > 0 && onNavigate(currentIndex - 1)}
                disabled={currentIndex === 0}
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2 text-xs font-bold text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/10 transition cursor-pointer"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </button>
              <button
                onClick={() => currentIndex < trades.length - 1 && onNavigate(currentIndex + 1)}
                disabled={currentIndex >= trades.length - 1}
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2 text-xs font-bold text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/10 transition cursor-pointer"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <a
                href={screenerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-3.5 py-2 rounded-xl border border-white/10 bg-white/[0.03] text-neutral-300 hover:text-white hover:bg-white/10 transition"
              >
                <span>Screener.in</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
              <a
                href={tvUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-3.5 py-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 font-bold transition"
              >
                <span>TradingView</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
