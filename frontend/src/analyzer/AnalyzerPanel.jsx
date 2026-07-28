import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Search, BarChart3, LayoutDashboard, ChartBar } from 'lucide-react';
import RiskControlBar from './RiskControlBar';
import StockLookupPanel from './StockLookupPanel';
import VerifiedStatsPanel from './VerifiedStatsPanel';
import TierPlannerPanel from './TierPlannerPanel';
import { computeAllStats } from './analyzerUtils';

const TABS = [
  { key: 'lookup', label: 'Plan', icon: Search },
  { key: 'stats', label: 'Stats', icon: BarChart3 },
  { key: 'planner', label: 'Planner', icon: LayoutDashboard },
];

const slideIn = {
  hidden: { x: '100%' },
  visible: { x: 0, transition: { type: 'spring', damping: 30, stiffness: 300 } },
  exit: { x: '100%', transition: { type: 'spring', damping: 30, stiffness: 300 } },
};

export default function AnalyzerPanel({ report, capital, onCapitalChange, panelSymbol, entryPrice, onClose, freshStocks }) {
  const [activeTab, setActiveTab] = useState('lookup');
  const [riskPercent, setRiskPercent] = useState(2);
  const [stopLossPercent, setStopLossPercent] = useState(5);
  const [rrRatio, setRrRatio] = useState(2);
  const [selectedTier, setSelectedTier] = useState('balanced');
  const [selectedSymbol, setSelectedSymbol] = useState(panelSymbol || null);
  const [selectedEntryPrice, setSelectedEntryPrice] = useState(entryPrice || null);

  useEffect(() => {
    if (panelSymbol) {
      setSelectedSymbol(panelSymbol);
      setSelectedEntryPrice(entryPrice || null);
      setActiveTab('lookup');
    }
  }, [panelSymbol, entryPrice]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const successfulTrades = useMemo(() => {
    if (!Array.isArray(report?.trades)) return [];
    return report.trades.filter(t => t.status === 'Success');
  }, [report?.trades]);

  const stats = useMemo(() => {
    if (successfulTrades.length === 0) return null;
    return computeAllStats(successfulTrades);
  }, [successfulTrades]);

  const handleRiskChange = useCallback((partial) => {
    if (partial.riskPercent !== undefined) setRiskPercent(partial.riskPercent);
    if (partial.stopLossPercent !== undefined) setStopLossPercent(partial.stopLossPercent);
    if (partial.rrRatio !== undefined) setRrRatio(partial.rrRatio);
  }, []);

  const handleSymbolSelect = useCallback((sym, price) => {
    setSelectedSymbol(sym);
    setSelectedEntryPrice(price);
  }, []);

  const handleEntryPriceChange = useCallback((price) => {
    setSelectedEntryPrice(price);
  }, []);

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
      >
        <div className="flex-1 bg-black/60" onClick={onClose} />

        <motion.div
          variants={slideIn}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="w-[420px] max-w-[90vw] h-full bg-gray-950 border-l border-[#252940] shadow-2xl shadow-black/60 flex flex-col"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#252940] shrink-0">
            <div className="flex items-center gap-2">
              <ChartBar size={16} className="text-emerald-400" />
              <h2 className="text-sm font-semibold text-white">Trade Analyzer</h2>
            </div>
            <button
              onClick={onClose}
              title="Close analyzer panel"
              className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/5 transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          <div className="px-4 py-3 border-b border-white/5 shrink-0">
            <RiskControlBar
              capital={capital || 100000}
              riskPercent={riskPercent}
              stopLossPercent={stopLossPercent}
              rrRatio={rrRatio}
              onChange={handleRiskChange}
              selectedSymbol={selectedSymbol}
              entryPrice={selectedEntryPrice}
              onEntryPriceChange={handleEntryPriceChange}
            />
          </div>

          <div className="flex gap-1 bg-gray-800/30 border border-white/5 rounded-xl p-1 mx-4 mt-3 shrink-0">
            {TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center justify-center gap-1.5 flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  activeTab === tab.key
                    ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <tab.icon size={14} />
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab || 'empty'}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.12 }}
              >
                {activeTab === 'lookup' && (
                  <StockLookupPanel
                    stats={stats}
                    capital={capital || 100000}
                    riskPercent={riskPercent}
                    stopLossPercent={stopLossPercent}
                    rrRatio={rrRatio}
                    selectedTier={selectedTier}
                    trades={successfulTrades}
                    freshStocks={freshStocks}
                    selectedSymbol={panelSymbol || null}
                    entryPrice={entryPrice || null}
                    onSymbolSelect={handleSymbolSelect}
                  />
                )}
                {activeTab === 'stats' && <VerifiedStatsPanel stats={stats} />}
                {activeTab === 'planner' && (
                  <TierPlannerPanel
                    stats={stats || { hstats: {}, caps: {}, ls: {}, ps: {}, conc: [], allTrades: [], monthly: {} }}
                    capital={capital || 100000}
                    riskPercent={riskPercent}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
