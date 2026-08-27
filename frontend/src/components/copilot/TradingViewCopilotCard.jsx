import React, { useState, useEffect, useRef } from 'react';
import {
  Zap, Link, Image, Search, ExternalLink, Loader2,
  AlertTriangle, Shield, TrendingUp, TrendingDown, CheckCircle
} from 'lucide-react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

export default function TradingViewCopilotCard() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState('short_term');
  const [imagePreview, setImagePreview] = useState(null);
  const fileInputRef = useRef(null);

  const handleAnalyze = async (searchQuery = query, selectedMode = mode) => {
    const activeQ = searchQuery || query;
    if (!activeQ && !imagePreview) return;
    setLoading(true);
    setError(null);

    try {
      const res = await axios.post(`${API_URL}/ai/analyze-chart`, {
        query: activeQ,
        mode: selectedMode,
        image: imagePreview
      });
      setResult(res.data);
    } catch (err) {
      console.error('Failed to analyze chart:', err);
      const detail = err.response?.data?.detail || err.message;
      setError(detail || 'Could not retrieve live price data for this symbol.');
    } finally {
      setLoading(false);
    }
  };

  // Clipboard paste listener for PNG chart screenshots
  const handlePaste = (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const blob = items[i].getAsFile();
        const reader = new FileReader();
        reader.onload = (event) => {
          setImagePreview(event.target.result);
        };
        reader.readAsDataURL(blob);
        break;
      }
    }
  };

  const handleFileDrop = (e) => {
    e.preventDefault();
    const files = e.dataTransfer?.files;
    if (files && files[0] && files[0].type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setImagePreview(event.target.result);
      };
      reader.readAsDataURL(files[0]);
    }
  };

  const isBullish = result?.trade_setup?.signal?.includes('BUY');
  const isBearish = result?.trade_setup?.signal?.includes('SELL');

  return (
    <div
      onPaste={handlePaste}
      className="rounded-3xl border border-white/10 bg-[#0d0f14] p-6 sm:p-8 text-white shadow-2xl space-y-6"
    >
      {/* Tile Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div className="flex items-center gap-3.5">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-bold shadow-lg shadow-emerald-500/10">
            <Zap className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-xl font-extrabold tracking-tight text-white flex items-center gap-2">
              AI Chart & TradingView Copilot
              <span className="rounded-full bg-emerald-500/20 border border-emerald-500/40 px-2.5 py-0.5 text-[10px] font-bold text-emerald-400 uppercase tracking-wide">
                Live Verdict
              </span>
            </h2>
            <p className="text-xs text-neutral-400 mt-0.5">
              Paste any TradingView chart link, ticker, or drop a PNG screenshot (Ctrl+V) for instant pro analysis.
            </p>
          </div>
        </div>

        {/* Mode Switcher */}
        <div className="flex items-center gap-1.5 bg-white/[0.04] p-1 rounded-xl border border-white/10">
          <button
            onClick={() => {
              setMode('short_term');
              if (result) handleAnalyze(query, 'short_term');
            }}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition ${
              mode === 'short_term'
                ? 'bg-emerald-500 text-black font-bold shadow'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            ⚡ Short-Term (Swing)
          </button>
          <button
            onClick={() => {
              setMode('long_term');
              if (result) handleAnalyze(query, 'long_term');
            }}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition ${
              mode === 'long_term'
                ? 'bg-emerald-500 text-black font-bold shadow'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            📈 Long-Term (Positional)
          </button>
        </div>
      </div>

      {/* Input Bar & Actions */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-neutral-400">
              <Link className="h-4 w-4 text-emerald-400" />
            </div>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
              placeholder="Paste TradingView link (e.g. https://in.tradingview.com/chart/...?symbol=NSE:SAIL) or Ticker"
              className="w-full rounded-2xl border border-white/10 bg-black/50 pl-10 pr-4 py-3.5 text-sm text-white placeholder-neutral-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition"
            />
          </div>

          <button
            onClick={() => handleAnalyze()}
            disabled={loading || (!query && !imagePreview)}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-6 py-3.5 text-sm font-bold text-black shadow-lg shadow-emerald-500/20 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed transition transform hover:-translate-y-0.5"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-black" />
                Analyzing...
              </>
            ) : (
              <>
                <Zap className="h-4 w-4" />
                Analyze Setup
              </>
            )}
          </button>
        </div>

        {/* Dropzone helper & Format hint */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
          <div className="flex items-center gap-2 text-neutral-400">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>Accepts TradingView URLs (NSE, BSE, NASDAQ), Stock/Crypto Tickers, or Chart Screenshots</span>
          </div>

          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleFileDrop}
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 text-neutral-300 hover:text-emerald-400 cursor-pointer transition border border-dashed border-white/20 hover:border-emerald-500/40 px-3.5 py-1.5 rounded-xl bg-white/[0.03]"
          >
            <Image className="h-3.5 w-3.5 text-emerald-400" />
            <span>{imagePreview ? '📷 Screenshot Attached (Click to change)' : 'Drop / Paste PNG Chart (Ctrl+V)'}</span>
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  const reader = new FileReader();
                  reader.onload = (event) => setImagePreview(event.target?.result);
                  reader.readAsDataURL(file);
                }
              }}
            />
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="flex items-center gap-2.5 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-xs font-semibold text-red-400">
          <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Result Display Card (UpsideGPT Bento Grid Layout) */}
      {result && (
        <div className="space-y-4 pt-3 border-t border-white/10">
          {/* Header row */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white/[0.02] p-4 rounded-2xl border border-white/10">
            <div className="flex items-center gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-white">{result.name}</span>
                  <span className="rounded bg-white/10 px-2 py-0.5 text-xs font-semibold text-neutral-400">
                    {result.exchange}:{result.symbol}
                  </span>
                </div>
                <p className="text-xs text-neutral-400 mt-0.5">
                  {result.fundamentals?.sector} · {result.fundamentals?.industry}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="font-mono text-lg font-extrabold text-white">
                  {result.currency}{result.price?.toFixed(2)}
                </div>
                <div className={`text-xs font-bold ${
                  (result.change_percent || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'
                }`}>
                  {(result.change_percent || 0) >= 0 ? '+' : ''}{result.change_percent?.toFixed(2)}%
                </div>
              </div>

              {result.tradingview_link && (
                <a
                  href={result.tradingview_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2 text-xs font-bold text-emerald-400 hover:bg-emerald-500/20 transition"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Live TradingView
                </a>
              )}
            </div>
          </div>

          {/* Grid Layout: Setup Matrix + Dual Probability */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 1. Setup Matrix */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-neutral-400">
                  Recommended Setup
                </span>
                <span className={`px-2.5 py-1 rounded-full text-xs font-extrabold uppercase tracking-wide border ${
                  isBullish
                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                    : isBearish
                    ? 'bg-red-500/20 text-red-400 border-red-500/40'
                    : 'bg-neutral-500/20 text-neutral-300 border-neutral-500/40'
                }`}>
                  {result.trade_setup?.signal || 'WAIT'}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl border border-white/10 bg-black/40 p-2.5">
                  <div className="text-[10px] text-neutral-400">Entry</div>
                  <div className="font-mono text-sm font-bold text-white mt-0.5">
                    {result.currency}{result.trade_setup?.entry?.toFixed(2)}
                  </div>
                </div>
                <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-2.5">
                  <div className="text-[10px] text-red-400">Stop-Loss</div>
                  <div className="font-mono text-sm font-bold text-red-400 mt-0.5">
                    {result.currency}{result.trade_setup?.stop_loss?.toFixed(2)}
                  </div>
                </div>
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-2.5">
                  <div className="text-[10px] text-emerald-400">Take Profit 1</div>
                  <div className="font-mono text-sm font-bold text-emerald-400 mt-0.5">
                    {result.currency}{result.trade_setup?.take_profit_1?.toFixed(2)}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-neutral-400 pt-1">
                <span>TP2 (Target 2): <strong className="text-emerald-400">{result.currency}{result.trade_setup?.take_profit_2?.toFixed(2)}</strong></span>
                <span>R:R Ratio: <strong className="text-white">{result.trade_setup?.risk_reward_ratio}</strong></span>
              </div>
            </div>

            {/* 2. Dual Probabilities */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-neutral-400">
                <span>Contingency Scenarios</span>
                <span>Confidence: {result.trade_setup?.confidence_score}%</span>
              </div>

              <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.04] p-3 space-y-1">
                <div className="flex items-center justify-between text-xs font-bold text-emerald-400">
                  <span>🟩 Bullish Scenario</span>
                  <span>{result.scenarios?.bullish?.probability}%</span>
                </div>
                <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${result.scenarios?.bullish?.probability}%` }} />
                </div>
                <p className="text-[11px] text-neutral-400 mt-1">
                  <strong>Trigger:</strong> {result.scenarios?.bullish?.trigger}
                </p>
              </div>

              <div className="rounded-xl border border-red-500/25 bg-red-500/[0.04] p-3 space-y-1">
                <div className="flex items-center justify-between text-xs font-bold text-red-400">
                  <span>🟥 Bearish Scenario</span>
                  <span>{result.scenarios?.bearish?.probability}%</span>
                </div>
                <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-red-400 rounded-full" style={{ width: `${result.scenarios?.bearish?.probability}%` }} />
                </div>
                <p className="text-[11px] text-neutral-400 mt-1">
                  <strong>Trigger:</strong> {result.scenarios?.bearish?.trigger}
                </p>
              </div>
            </div>
          </div>

          {/* Indicators + Fundamentals Summary Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center text-xs">
            <div className="rounded-xl border border-white/10 bg-black/40 p-2.5">
              <div className="text-[10px] text-neutral-400">Trend Score</div>
              <div className="font-bold text-white text-sm mt-0.5">{result.technicals?.trend_score}/10 ({result.technicals?.trend_direction})</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/40 p-2.5">
              <div className="text-[10px] text-neutral-400">RSI (14)</div>
              <div className="font-bold text-white text-sm mt-0.5">{result.technicals?.rsi_14?.value} ({result.technicals?.rsi_14?.interpretation})</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/40 p-2.5">
              <div className="text-[10px] text-neutral-400">P/E Valuation</div>
              <div className="font-bold text-white text-sm mt-0.5">{result.fundamentals?.pe_ratio || 'N/A'}</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/40 p-2.5">
              <div className="text-[10px] text-neutral-400">ROE %</div>
              <div className="font-bold text-white text-sm mt-0.5">{result.fundamentals?.roe ? `${result.fundamentals.roe}%` : 'N/A'}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
