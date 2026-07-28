import React, { useState, useMemo, useEffect } from 'react';
import { Search, TrendingUp, TrendingDown, AlertTriangle, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { findSymbol, perSymbolStats, fmtRS, fmtPC, pC } from './analyzerUtils';
import { computeRiskPlan, symbolRiskProfile, tierConfig } from './riskEngine';
import { setContext } from './aiBridge';

const TIER_BADGE = {
  'Insufficient data': 'bg-gray-500/20 text-gray-400',
  'Very limited': 'bg-gray-500/20 text-gray-400',
  'Limited data': 'bg-amber-500/20 text-amber-400',
  'Moderate sample': 'bg-orange-500/20 text-orange-400',
  'Well-tested': 'bg-emerald-500/20 text-emerald-400',
};

export default function StockLookupPanel({ stats, capital, riskPercent, stopLossPercent, rrRatio, selectedTier, trades, freshStocks, selectedSymbol: externalSymbol, entryPrice: externalPrice, onSymbolSelect }) {
  const [query, setQuery] = useState('');
  const [internalSymbol, setInternalSymbol] = useState(null);

  const activeSymbol = externalSymbol || internalSymbol;

  const filteredFresh = useMemo(() => {
    if (!Array.isArray(freshStocks)) return [];
    if (!query.trim()) return freshStocks;
    const q = query.trim().toUpperCase();
    return freshStocks.filter(s => s.symbol.toUpperCase().includes(q));
  }, [freshStocks, query]);

  const result = useMemo(() => {
    if (!stats && !trades) return null;
    if (activeSymbol) return activeSymbol;
    if (query.trim()) {
      return findSymbol(trades || stats?.allTrades || [], query);
    }
    return null;
  }, [query, activeSymbol, stats, trades]);

  const symbolData = useMemo(() => {
    const sym = activeSymbol;
    if (!sym || !stats) return null;
    const st = stats.sm?.[sym];
    if (!st || !st.length) return null;
    const ps = perSymbolStats(st, stats);
    const cfg = tierConfig(capital)[selectedTier || 'balanced'];
    const plan = computeRiskPlan({
      capital,
      riskPercent,
      stopLossPercent,
      rrRatio,
      entryPrice: externalPrice || ps.medPrice || 300,
      isLadder: selectedTier === 'growth',
    });
    const riskProfile = symbolRiskProfile(trades || stats.allTrades, sym);
    return { ps, plan, riskProfile, cfg, st, symbol: sym };
  }, [activeSymbol, stats, capital, riskPercent, stopLossPercent, rrRatio, selectedTier, trades, externalPrice]);

  useEffect(() => {
    if (externalSymbol) {
      setQuery('');
    }
  }, [externalSymbol]);

  useEffect(() => {
    if (!activeSymbol && freshStocks && freshStocks.length > 0) {
      const first = freshStocks[0];
      setInternalSymbol(first.symbol);
      if (onSymbolSelect) onSymbolSelect(first.symbol, first.trades[0]?.entry_price || null);
    }
  }, [freshStocks]);

  useEffect(() => {
    setContext(symbolData);
  }, [symbolData]);

  const handleSelectSymbol = (sym, price) => {
    setInternalSymbol(sym);
    setQuery('');
    if (onSymbolSelect) onSymbolSelect(sym, price);
  };

  const formatPercent = (val) => {
    if (val === null || val === undefined || isNaN(val)) return 'N/A';
    return `${val >= 0 ? '+' : ''}${val.toFixed(2)}%`;
  };

  const hasList = Array.isArray(freshStocks) && freshStocks.length > 0;

  return (
    <div>
      <div className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={hasList ? "Filter symbols..." : "Enter symbol (e.g. RELIANCE)"}
            className="w-full bg-gray-700/50 border border-white/10 rounded-lg pl-10 pr-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 font-mono"
          />
        </div>
      </div>

      {hasList && !activeSymbol && filteredFresh.length === 0 && (
        <div className="text-center py-8 text-gray-500 text-sm">No fresh stocks match your filter.</div>
      )}

      {hasList && filteredFresh.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-gray-400 font-medium">Fresh Signals (last 30 days)</span>
            <span className="text-[10px] text-gray-500">— {filteredFresh.length} stock{filteredFresh.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {filteredFresh.map((stock, i) => {
              const isSelected = activeSymbol === stock.symbol && true;
              const isLowConfidence = stock.count < 2;
              return (
                <button
                  key={stock.symbol}
                  onClick={() => handleSelectSymbol(stock.symbol, stock.trades[0]?.entry_price || null)}
                  className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${
                    isSelected
                      ? 'bg-emerald-500/10 border-l-2 border-emerald-500'
                      : 'bg-gray-900/50 hover:bg-gray-800/70 border-l-2 border-transparent'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full shrink-0 ${isSelected ? 'bg-emerald-400' : 'bg-gray-600'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-mono font-semibold text-white">{stock.symbol}</span>
                      <span className="text-[10px] text-gray-500">{stock.count} sig{stock.count !== 1 ? 's' : ''}</span>
                      {isLowConfidence && (
                        <span className="text-[10px] text-amber-400 font-medium">⚠️ low confidence</span>
                      )}
                    </div>
                    <div className="text-[11px] text-gray-500">
                      Last: {stock.lastDate}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    {isFinite(stock.avgReturn14d) && (
                      <div className={`text-xs font-mono font-semibold ${stock.avgReturn14d >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {fmtPC(stock.avgReturn14d, 2)}
                      </div>
                    )}
                    <div className="text-[10px] text-gray-500">avg 14d</div>
                  </div>
                  {isSelected && (
                    <span className="text-emerald-400 text-xs font-medium">Active</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <AnimatePresence mode="wait">
        {symbolData ? (
          <motion.div key="found" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
            <div className="bg-gray-800/30 border border-white/5 rounded-xl p-4">
              <div className="flex items-center gap-3 mb-3 flex-wrap">
                <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${TIER_BADGE[symbolData.ps.tier] || 'bg-gray-500/20 text-gray-400'}`}>
                  {symbolData.ps.tier}
                </span>
                <h3 className="text-lg font-bold text-white font-mono">{activeSymbol}</h3>
                <span className="text-sm text-gray-400">{symbolData.ps.n} trade{symbolData.ps.n !== 1 ? 's' : ''}</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                {isFinite(symbolData.ps.avg14) && (
                  <div className="bg-gray-900/50 rounded-lg p-2.5 text-center">
                    <div className="text-[10px] text-gray-500">Avg 14d</div>
                    <div className={`text-sm font-bold font-mono ${symbolData.ps.avg14 >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {fmtPC(symbolData.ps.avg14, 2)}
                    </div>
                  </div>
                )}
                {isFinite(symbolData.ps.win14) && (
                  <div className="bg-gray-900/50 rounded-lg p-2.5 text-center">
                    <div className="text-[10px] text-gray-500">Win rate</div>
                    <div className={`text-sm font-bold font-mono ${symbolData.ps.win14 >= 50 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {symbolData.ps.win14.toFixed(1)}%
                    </div>
                  </div>
                )}
                {isFinite(symbolData.ps.sharpe14) && (
                  <div className="bg-gray-900/50 rounded-lg p-2.5 text-center">
                    <div className="text-[10px] text-gray-500">Risk score <Info size={11} className="inline text-gray-600 cursor-help -mt-0.5 align-middle" title="How consistently this stock performs. Higher = more predictable. Compare across stocks." /></div>
                    <div className="text-sm font-bold font-mono text-white">
                      {symbolData.ps.sharpe14.toFixed(2)}
                    </div>
                  </div>
                )}
                {isFinite(symbolData.ps.medPrice) && (
                  <div className="bg-gray-900/50 rounded-lg p-2.5 text-center">
                    <div className="text-[10px] text-gray-500">Entry price</div>
                    <div className="text-sm font-bold font-mono text-white">
                      {fmtRS(symbolData.ps.medPrice)}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400 mb-3">
                {isFinite(symbolData.ps.best14) && <span>Best: <span className="text-emerald-400 font-mono">{fmtPC(symbolData.ps.best14, 2)}</span></span>}
                {isFinite(symbolData.ps.worst14) && <span>Worst: <span className="text-red-400 font-mono">{fmtPC(symbolData.ps.worst14, 2)}</span></span>}
                <span>Range: {symbolData.ps.fD} to {symbolData.ps.lD}</span>
                {symbolData.ps.moSince !== null && symbolData.ps.moSince > 12 && (
                  <span className="text-amber-400">Last trade {symbolData.ps.moSince}mo ago</span>
                )}
              </div>

              {symbolData.ps.cr === true && (
                <div className="flex items-start gap-2 p-2.5 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-400 mb-3">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  Price ₹{Math.round(symbolData.ps.medPrice)} — under ₹50 = circuit risk. Exit may not fill.
                </div>
              )}
              {symbolData.ps.cr === 'amber' && (
                <div className="flex items-start gap-2 p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-400 mb-3">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  Price ₹{Math.round(symbolData.ps.medPrice)} — under ₹100 may have low liquidity.
                </div>
              )}
            </div>

            <div className="bg-gray-800/30 border border-white/5 rounded-xl p-4">
              <h4 className="text-sm font-semibold text-white mb-3">
                Risk Plan for {activeSymbol}
                <span className="text-xs text-gray-500 ml-2 font-normal">
                  ({selectedTier === 'growth' ? '4-way ladder' : selectedTier === 'balanced' ? 'Stops by horizon' : 'Single exit'})
                </span>
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-3">
                <div className="bg-gray-900/50 rounded-lg p-2.5 text-center">
                  <div className="text-[10px] text-gray-500">Position</div>
                  <div className="text-sm font-bold text-white font-mono">{fmtRS(symbolData.plan.positionCost)}</div>
                </div>
                <div className="bg-gray-900/50 rounded-lg p-2.5 text-center">
                  <div className="text-[10px] text-gray-500">Shares</div>
                  <div className="text-sm font-bold text-white font-mono">~{symbolData.plan.shares}</div>
                </div>
                <div className="bg-gray-900/50 rounded-lg p-2.5 text-center">
                  <div className="text-[10px] text-gray-500">Target</div>
                  <div className="text-sm font-bold text-emerald-400 font-mono">+{symbolData.plan.targetReturn.toFixed(1)}%</div>
                </div>
                <div className="bg-gray-900/50 rounded-lg p-2.5 text-center">
                  <div className="text-[10px] text-gray-500">Stop</div>
                  <div className="text-sm font-bold text-red-400 font-mono">-{symbolData.plan.stopLossPercent}%</div>
                </div>
                <div className="bg-gray-900/50 rounded-lg p-2.5 text-center">
                  <div className="text-[10px] text-gray-500">Net gain</div>
                  <div className="text-sm font-bold text-emerald-400 font-mono">+{fmtRS(Math.round(symbolData.plan.netGain))}</div>
                </div>
                <div className="bg-gray-900/50 rounded-lg p-2.5 text-center">
                  <div className="text-[10px] text-gray-500">Net loss</div>
                  <div className="text-sm font-bold text-red-400 font-mono">-{fmtRS(Math.round(symbolData.plan.netLoss))}</div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {['starter', 'balanced', 'growth'].map(tier => {
                  const cfg = tierConfig(capital)[tier];
                  if (!cfg.available) return null;
                  const fits = symbolData.plan.positionCost <= cfg.size * cfg.positions;
                  const tight = !fits && symbolData.plan.positionCost <= cfg.size * cfg.positions * 1.3;
                  return (
                    <span key={tier} className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium ${
                      fits ? 'bg-emerald-500/10 text-emerald-400' :
                      tight ? 'bg-amber-500/10 text-amber-400' :
                      'bg-red-500/10 text-red-400'
                    }`}>
                      {fits ? '✅' : tight ? '⚠️' : '❌'} {tier.charAt(0).toUpperCase() + tier.slice(1)}
                    </span>
                  );
                })}
              </div>

              {symbolData.riskProfile && symbolData.riskProfile.kelly !== null && (
                <div className="mt-3 pt-3 border-t border-white/5 text-xs text-gray-400">
                  <span className="font-medium text-gray-300">Kelly: </span>
                  <span className="font-mono">{(symbolData.riskProfile.kelly * 100).toFixed(1)}%</span>
                  <span className="mx-2">·</span>
                  <span className="font-medium text-gray-300">Suggested stop: </span>
                  <span className="font-mono">{symbolData.riskProfile.suggestedStop}%</span>
                  <span className="mx-2">·</span>
                  <span className="font-medium text-gray-300">Suggested target: </span>
                  <span className="font-mono">{symbolData.riskProfile.suggestedTarget}%</span>
                </div>
              )}
            </div>

            {symbolData.st.length > 0 && (
              <div className="bg-gray-800/30 border border-white/5 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-semibold text-white">Signal Timeline</h4>
                  <span className="text-[10px] text-gray-500">Last {Math.min(10, symbolData.st.length)} of {symbolData.st.length}</span>
                </div>
                <div className="max-h-48 overflow-y-auto space-y-0.5">
                  {[...symbolData.st]
                    .sort((a, b) => (b.signal_date || '').localeCompare(a.signal_date || ''))
                    .slice(0, 10)
                    .map((t, i) => (
                      <div key={i} className="flex justify-between items-center px-2.5 py-1.5 bg-gray-900/30 rounded text-xs font-mono">
                        <span className="text-gray-400">{t.signal_date}</span>
                        <span className={t.return_14d >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                          {formatPercent(t.return_14d)}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {symbolData.ps.n14 < 3 && (
              <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-400">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                Only {symbolData.ps.n14} trade{symbolData.ps.n14 !== 1 ? 's' : ''} with 14d data — unreliable.
              </div>
            )}
          </motion.div>
        ) : query.trim() && result === null ? (
          <motion.div key="notfound" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-gray-800/30 border border-white/5 rounded-xl p-4">
            <div className="flex items-center gap-2 text-gray-400 text-sm">
              <Info size={16} /> Symbol not found in this backtest
            </div>
          </motion.div>
        ) : query.trim() && result?.multiple ? (
          <motion.div key="multiple" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-gray-800/30 border border-white/5 rounded-xl p-4">
            <div className="flex items-center gap-2 text-amber-400 text-sm mb-3">
              <AlertTriangle size={16} /> Multiple matches
            </div>
            <div className="flex flex-wrap gap-2">
              {result.multiple.map(sym => (
                <button
                  key={sym}
                  onClick={() => { handleSelectSymbol(sym); }}
                  className="px-3 py-1.5 bg-gray-700/50 hover:bg-gray-700 rounded-lg text-sm font-mono text-gray-300 transition-colors"
                >
                  {sym}
                </button>
              ))}
            </div>
          </motion.div>
        ) : activeSymbol ? (
          <motion.div key="nostats" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-gray-800/30 border border-white/5 rounded-xl p-4">
            <div className="flex items-center gap-2 text-amber-400 text-sm">
              <AlertTriangle size={16} />
              <span>No analysis data for <span className="font-mono font-bold">{activeSymbol}</span></span>
            </div>
            <p className="text-xs text-gray-500 mt-1">Run a backtest first or select a different stock.</p>
          </motion.div>
        ) : (!query.trim() && !hasList) ? (
          <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-12 text-gray-500">
            <Search size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">Type a symbol to see per-stock analysis</p>
          </motion.div>
        ) : !query.trim() && hasList ? (
          <motion.div key="noselect" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-8 text-gray-500">
            <p className="text-sm">Select a stock from the list above to see analysis</p>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
