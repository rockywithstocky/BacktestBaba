import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, X, Settings, Send, Loader2, ChevronDown } from 'lucide-react';
import { getContext, subscribe } from './aiBridge';
import { getSavedConfig, saveConfig, getApiKey, saveApiKey, getPresets, resolveConfig } from './aiConfig';
import { buildSystemPrompt, callLLM, testConnection, fetchLatestPrice } from './aiApi';
import { fmtRS, fmtPC } from './analyzerUtils';

function fmtN(n) {
  if (n == null || !isFinite(n)) return '—';
  return Math.round(n).toLocaleString('en-IN');
}

const bubbleVariants = {
  idle: { scale: 1 },
  hover: { scale: 1.08 },
};

const flyoutVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', damping: 28, stiffness: 260 } },
  exit: { opacity: 0, y: 20, scale: 0.95, transition: { duration: 0.12 } },
};

const cardVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: (i) => ({ opacity: 1, y: 0, transition: { delay: i * 0.08, duration: 0.2 } }),
};

function VerdictBar({ verdict }) {
  let colors;
  if (verdict === 'VERIFIED') colors = 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400';
  else if (verdict === 'CAUTION') colors = 'bg-amber-500/20 border-amber-500/40 text-amber-400';
  else colors = 'bg-red-500/20 border-red-500/40 text-red-400';

  return (
    <div className={`px-4 py-2 rounded-lg border text-sm font-bold ${colors}`}>
      {verdict === 'VERIFIED' ? '✓ VERIFIED — Plan aligns with market context' :
       verdict === 'CAUTION' ? '⚠ CAUTION — Review before committing' :
       '✗ RECONSIDER — Plan conflicts with market signals'}
    </div>
  );
}

function ReadinessBadge({ readiness }) {
  let c;
  if (readiness === 'HIGH') c = 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
  else if (readiness === 'MODERATE') c = 'bg-amber-500/15 text-amber-400 border-amber-500/30';
  else c = 'bg-red-500/15 text-red-400 border-red-500/30';
  return <span className={`px-2 py-0.5 rounded text-xs font-bold border ${c}`}>{readiness}</span>;
}

function ScoreBar({ label, score, color }) {
  const pct = Math.min(100, Math.max(0, (score / 10) * 100));
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-400 w-20 shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono font-bold text-white w-6 text-right">{score}/10</span>
    </div>
  );
}

function TradePlanCard({ ctx }) {
  if (!ctx || !ctx.plan) return null;
  const { plan, ps } = ctx;
  return (
    <div className="bg-[#1a1d2e] border border-[#252940] rounded-xl p-4 space-y-3">
      <h4 className="text-sm font-bold text-white flex items-center gap-2">
        <span className="w-1.5 h-4 bg-indigo-400 rounded-full" />
        Your Trade Plan
      </h4>
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-[#0f1119] rounded-lg p-2.5">
          <div className="text-[10px] text-gray-500">Position</div>
          <div className="text-sm font-bold text-white font-mono">{fmtRS(plan.positionCost)}</div>
        </div>
        <div className="bg-[#0f1119] rounded-lg p-2.5">
          <div className="text-[10px] text-gray-500">Shares</div>
          <div className="text-sm font-bold text-white font-mono">~{fmtN(plan.shares)}</div>
        </div>
        <div className="bg-[#0f1119] rounded-lg p-2.5">
          <div className="text-[10px] text-gray-500">Target</div>
          <div className="text-sm font-bold text-emerald-400 font-mono">+{plan.targetReturn != null ? plan.targetReturn.toFixed(1) : '?'}%</div>
          {plan.targetPrice != null && <div className="text-[10px] text-gray-500 font-mono">{fmtRS(Math.round(plan.targetPrice))}</div>}
        </div>
        <div className="bg-[#0f1119] rounded-lg p-2.5">
          <div className="text-[10px] text-gray-500">Stop</div>
          <div className="text-sm font-bold text-red-400 font-mono">-{plan.stopLossPercent != null ? plan.stopLossPercent.toFixed(1) : '?'}%</div>
        </div>
        <div className="bg-[#0f1119] rounded-lg p-2.5">
          <div className="text-[10px] text-gray-500">Net Gain</div>
          <div className="text-sm font-bold text-emerald-400 font-mono">+{fmtRS(Math.round(plan.netGain))}</div>
        </div>
        <div className="bg-[#0f1119] rounded-lg p-2.5">
          <div className="text-[10px] text-gray-500">Net Loss</div>
          <div className="text-sm font-bold text-red-400 font-mono">-{fmtRS(Math.round(plan.netLoss))}</div>
        </div>
      </div>
      <div className="flex items-center gap-2 text-xs text-gray-400">
        <span>RR: 1:{plan.actualRR != null ? plan.actualRR.toFixed(1) : '?'}</span>
        <span className="text-gray-600">|</span>
        <span>Data: {ps?.tier || 'N/A'}</span>
        <span className="text-gray-600">|</span>
        <span>{ps?.n14 != null ? ps.n14 : '?'} trades</span>
      </div>
    </div>
  );
}

function MarketContextCard({ result }) {
  const { market_context, scoring } = result;
  if (!market_context) return null;

  return (
    <div className="bg-[#1a1d2e] border border-[#252940] rounded-xl p-4 space-y-3">
      <h4 className="text-sm font-bold text-white flex items-center gap-2">
        <span className="w-1.5 h-4 bg-indigo-400 rounded-full" />
        Live Market Context
      </h4>

      <div className="grid grid-cols-3 gap-2">
        <div className="bg-[#0f1119] rounded-lg p-2.5 text-center">
          <div className="text-[10px] text-gray-500">ADX(14)</div>
          <div className={`text-sm font-bold font-mono ${market_context.adx != null && market_context.adx >= 25 ? 'text-emerald-400' : 'text-amber-400'}`}>
            {market_context.adx != null ? market_context.adx : '—'}
          </div>
          {market_context.adx_label && <div className="text-[9px] text-gray-500">{market_context.adx_label}</div>}
        </div>
        <div className="bg-[#0f1119] rounded-lg p-2.5 text-center">
          <div className="text-[10px] text-gray-500">RSI(14)</div>
          <div className={`text-sm font-bold font-mono ${
            market_context.rsi != null && market_context.rsi > 70 ? 'text-red-400' :
            market_context.rsi != null && market_context.rsi < 30 ? 'text-emerald-400' : 'text-white'
          }`}>
            {market_context.rsi != null ? market_context.rsi : '—'}
          </div>
          {market_context.rsi_label && <div className="text-[9px] text-gray-500">{market_context.rsi_label}</div>}
        </div>
        <div className="bg-[#0f1119] rounded-lg p-2.5 text-center">
          <div className="text-[10px] text-gray-500">Volume</div>
          <div className="text-xs font-bold font-mono text-white truncate max-w-[80px]" title={market_context.volume_insight || ''}>
            {market_context.volume_insight ? market_context.volume_insight.slice(0, 12) + (market_context.volume_insight.length > 12 ? '…' : '') : '—'}
          </div>
        </div>
      </div>

      {market_context.vcp_pattern && (
        <div className="bg-[#0f1119] rounded-lg px-3 py-2">
          <span className="text-[10px] text-gray-500">VCP Pattern: </span>
          <span className="text-xs text-white">{market_context.vcp_pattern}</span>
        </div>
      )}

      {market_context.driving_forces && market_context.driving_forces.length > 0 && (
        <div className="space-y-1">
          <div className="text-[10px] text-gray-500 font-medium">Driving Forces</div>
          {market_context.driving_forces.map((f, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-gray-300">
              <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-indigo-500/60 shrink-0" />
              {f}
            </div>
          ))}
        </div>
      )}

      {scoring && (
        <div className="space-y-1.5 pt-2 border-t border-[#252940]">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-gray-500 font-medium">Risk vs Opportunity</span>
            {scoring.readiness && <ReadinessBadge readiness={scoring.readiness} />}
          </div>
          <ScoreBar label="Risk" score={scoring.risk} color="bg-red-500" />
          <ScoreBar label="Opportunity" score={scoring.opportunity} color="bg-emerald-500" />
        </div>
      )}
    </div>
  );
}

function AiVerdictCard({ result }) {
  const { position_check, ai_verdict, stress_test } = result;
  if (!ai_verdict && !position_check) return null;

  return (
    <div className="bg-[#1a1d2e] border border-[#252940] rounded-xl p-4 space-y-3">
      {position_check && (
        <>
          <h4 className="text-sm font-bold text-white flex items-center gap-2">
            <span className="w-1.5 h-4 bg-indigo-400 rounded-full" />
            AI Position Check
          </h4>
          {position_check.reasons && position_check.reasons.map((r, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-gray-300">
              <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-indigo-500/60 shrink-0" />
              {r}
            </div>
          ))}
        </>
      )}

      {ai_verdict && ai_verdict.length > 0 && (
        <>
          {!position_check && (
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <span className="w-1.5 h-4 bg-indigo-400 rounded-full" />
              AI Verdict
            </h4>
          )}
          {position_check && <div className="border-t border-[#252940]" />}
          <div className="space-y-1.5">
            {ai_verdict.map((v, i) => (
              <div key={i} className={`flex items-start gap-2 text-xs ${v.startsWith('For educational purposes only') ? 'text-gray-500 italic' : 'text-gray-300'}`}>
                {v.startsWith('For educational purposes') ? (
                  <span className="text-gray-600">ⓘ</span>
                ) : (
                  <span className={`mt-0.5 w-1.5 h-1.5 rounded-full shrink-0 ${
                    v.startsWith('✓') ? 'bg-emerald-500/80' :
                    v.startsWith('⚠') ? 'bg-amber-500/80' :
                    'bg-gray-500/60'
                  }`} />
                )}
                {v}
              </div>
            ))}
          </div>
        </>
      )}

      {stress_test && (
        <>
          <div className="border-t border-[#252940]" />
          <h4 className="text-sm font-bold text-white flex items-center gap-2">
            <span className="w-1.5 h-4 bg-amber-400 rounded-full" />
            Stress Test
          </h4>
          <div className="text-xs text-gray-300 space-y-1">
            <p><span className="text-gray-500">Scenario: </span>{stress_test.adverse_scenario}</p>
            <p><span className="text-gray-500">Impact: </span>{stress_test.impact_on_position}</p>
          </div>
        </>
      )}
    </div>
  );
}

function SymbolContextBar({ ctx }) {
  if (!ctx || !ctx.ps) return null;
  const { ps, symbol } = ctx;
  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-indigo-500/5 border-b border-[#252940]">
      <Sparkles size={14} className="text-indigo-400 shrink-0" />
      <span className="text-sm font-bold text-white font-mono">
        {symbol || 'Selected Stock'}
        {ps.n14 !== undefined && ' — '}
        {ps.avg14 != null && (
          <span className={ps.avg14 >= 0 ? 'text-emerald-400' : 'text-red-400'}>
            {fmtPC(ps.avg14, 2)} avg 14d
          </span>
        )}
      </span>
    </div>
  );
}

const DRAG_STORAGE_KEY = 'ai_trade_check_pos';
const FLYOUT_WIDTH = 380;
const FLYOUT_MIN_HEIGHT = 120;

export default function AITradeCheck() {
  const [isOpen, setIsOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [followUp, setFollowUp] = useState('');
  const [followUpLoading, setFollowUpLoading] = useState(false);
  const [localApiKey, setLocalApiKey] = useState('');
  const [localConfig, setLocalConfig] = useState({ presetId: 'openai', model: 'gpt-4o', baseUrl: 'https://api.openai.com/v1/chat/completions' });
  const [testStatus, setTestStatus] = useState(null);
  const resultRef = useRef(null);
  const flyoutRef = useRef(null);
  const [pos, setPos] = useState(() => {
    try {
      const saved = sessionStorage.getItem(DRAG_STORAGE_KEY);
      if (saved) {
        const p = JSON.parse(saved);
        if (typeof p.x === 'number' && typeof p.y === 'number') return p;
      }
    } catch {}
    return null;
  });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, left: 0, top: 0 });

  const handleDragStart = useCallback((e) => {
    if (e.button !== 0) return;
    const flyout = flyoutRef.current;
    if (!flyout) return;
    const rect = flyout.getBoundingClientRect();
    dragStartRef.current = { x: e.clientX, y: e.clientY, left: rect.left, top: rect.top };
    setIsDragging(true);
    e.preventDefault();

    const handleMove = (e) => {
      setPos({
        x: dragStartRef.current.left + e.clientX - dragStartRef.current.x,
        y: dragStartRef.current.top + e.clientY - dragStartRef.current.y,
      });
    };
    const handleUp = () => {
      setIsDragging(false);
      setPos(prev => {
        if (!prev) return prev;
        const clamped = {
          x: Math.max(0, Math.min(window.innerWidth - FLYOUT_WIDTH, prev.x)),
          y: Math.max(0, Math.min(window.innerHeight - FLYOUT_MIN_HEIGHT, prev.y)),
        };
        try { sessionStorage.setItem(DRAG_STORAGE_KEY, JSON.stringify(clamped)); } catch {}
        return clamped;
      });
      document.removeEventListener('pointermove', handleMove);
      document.removeEventListener('pointerup', handleUp);
    };

    document.addEventListener('pointermove', handleMove);
    document.addEventListener('pointerup', handleUp);
  }, []);

  useEffect(() => {
    setLocalApiKey(getApiKey());
    const saved = getSavedConfig();
    setLocalConfig(saved);
  }, []);

  const [ctx, setCtx] = useState(() => getContext());

  useEffect(() => {
    setCtx(getContext());
    const unsub = subscribe((newCtx) => {
      setCtx(newCtx);
    });
    return unsub;
  }, []);

  const hasContext = !!(ctx && ctx.ps && ctx.plan);

  const handleRunAnalysis = useCallback(async () => {
    if (!hasContext) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const config = resolveConfig(localConfig.presetId, { baseUrl: localConfig.baseUrl, model: localConfig.model });
      const systemPrompt = buildSystemPrompt(ctx);
      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Analyze this stock and my trade plan. Give me direct market context and tell me if my plan makes sense.` },
      ];
      const res = await callLLM({ messages, config, apiKey: localApiKey });
      setResult(res);
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 200);
    } catch (err) {
      setError(err.message || 'Analysis failed. Check your API key and model settings.');
    } finally {
      setLoading(false);
    }
  }, [hasContext, localConfig, localApiKey, ctx]);

  const handleSendMessage = useCallback(async () => {
    if (!followUp.trim()) return;
    setFollowUpLoading(true);
    setError(null);

    let livePriceInjected = null;
    const PRICE_KEYWORDS = /current price|live price|how much is|ltp|stock price|price of|trading at/i;
    const SYMBOL_PATTERN = /\b[A-Z]{1,8}\b/g;
    function extractSymbol(msg, knownSymbols) {
      const upper = msg.toUpperCase();
      const matches = upper.match(SYMBOL_PATTERN);
      if (!matches) return null;
      for (const m of matches) {
        if (knownSymbols.includes(m)) return m;
        if (knownSymbols.includes(m + '.NS')) return m + '.NS';
        if (knownSymbols.includes(m + '.BO')) return m + '.BO';
      }
      return null;
    }

    if (PRICE_KEYWORDS.test(followUp)) {
      const knownSymbols = [];
      const ctxSymbol = ctx?.symbol;
      if (ctxSymbol && !knownSymbols.includes(ctxSymbol)) knownSymbols.push(ctxSymbol);
      const extracted = extractSymbol(followUp, knownSymbols);
      const targetSymbol = extracted || ctxSymbol;
      if (targetSymbol) {
        const ac = new AbortController();
        const timeoutId = setTimeout(() => ac.abort(), 2000);
        const price = await fetchLatestPrice(targetSymbol, ac.signal);
        clearTimeout(timeoutId);
        if (price != null) {
          livePriceInjected = `[Live Price — ${targetSymbol}: ₹${price.toFixed(2)} as of now]`;
        }
      }
    }

    try {
      const config = resolveConfig(localConfig.presetId, { baseUrl: localConfig.baseUrl, model: localConfig.model });
      let systemContent;
      if (hasContext) {
        systemContent = buildSystemPrompt(ctx);
      } else {
        systemContent = `You are a helpful trading assistant. Answer the user's question about trading, markets, or stocks concisely and accurately. Respond in JSON with a "reply" field containing your answer in plain text (no markdown).`;
      }
      if (livePriceInjected) {
        systemContent = systemContent + '\n\n' + livePriceInjected;
      }
      let messages;
      if (hasContext) {
        if (result) {
          messages = [
            { role: 'system', content: systemContent },
            { role: 'user', content: `Analyze this stock and my trade plan. Give me direct market context.` },
            { role: 'assistant', content: JSON.stringify(result) },
            { role: 'user', content: followUp },
          ];
        } else {
          messages = [
            { role: 'system', content: systemContent },
            { role: 'user', content: followUp },
          ];
        }
      } else {
        messages = [
          { role: 'system', content: systemContent },
          { role: 'user', content: followUp },
        ];
      }
      const res = await callLLM({ messages, config, apiKey: localApiKey });
      setResult(res);
      setFollowUp('');
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 200);
    } catch (err) {
      setError(err.message || 'Request failed.');
    } finally {
      setFollowUpLoading(false);
    }
  }, [followUp, result, localConfig, localApiKey, ctx, hasContext]);

  const presets = getPresets();
  const selectedPreset = presets.find(p => p.id === localConfig.presetId) || presets[0];
  const isCustom = localConfig.presetId === 'custom';

  return (
    <>
      <motion.button
        variants={bubbleVariants}
        initial="idle"
        whileHover="hover"
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-[40] w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-indigo-600 shadow-lg shadow-indigo-500/30 flex items-center justify-center hover:shadow-indigo-500/50 transition-shadow"
        title="AI Trade Check"
      >
        <Sparkles size={20} className="text-white" />
        {hasContext && !isOpen && (
          <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-400 border-2 border-[#0f1119]" />
        )}
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={flyoutRef}
            variants={flyoutVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            style={{
              position: 'fixed',
              left: pos?.x ?? undefined,
              top: pos?.y ?? undefined,
              bottom: pos ? undefined : '6rem',
              right: pos ? undefined : '1.5rem',
            }}
            className="z-[61] w-[380px] max-h-[620px] bg-[#0f1119] border border-[#252940] rounded-2xl shadow-2xl shadow-black/60 flex flex-col overflow-hidden"
          >
            <div
              data-drag-handle
              onPointerDown={handleDragStart}
              className="flex items-center justify-between px-4 py-3 border-b border-[#252940] shrink-0"
              style={{ cursor: isDragging ? 'grabbing' : 'grab', userSelect: 'none' }}
            >
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-indigo-400" />
                <h2 className="text-sm font-bold text-white">AI Trade Check</h2>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setShowSettings(!showSettings)}
                  className={`p-1.5 rounded-lg transition-colors ${showSettings ? 'bg-indigo-500/20 text-indigo-400' : 'text-gray-500 hover:text-white hover:bg-white/5'}`}
                  title="Settings"
                >
                  <Settings size={16} />
                </button>
                <button onClick={() => { setIsOpen(false); setShowSettings(false); }} className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/5 transition-colors" title="Close">
                  <X size={16} />
                </button>
              </div>
            </div>

            <AnimatePresence mode="wait">
              {showSettings ? (
                <motion.div key="settings" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-4 space-y-4 overflow-y-auto">
                  <div>
                    <label className="text-xs text-gray-400 font-medium block mb-1.5">API Key</label>
                    <input
                      type="password"
                      value={localApiKey}
                      onChange={e => { setLocalApiKey(e.target.value); setTestStatus(null); }}
                      placeholder="sk-..."
                      className="w-full bg-[#1a1d2e] border border-[#252940] rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 font-medium block mb-1.5">Model</label>
                    <select
                      value={localConfig.presetId}
                      onChange={e => {
                        const preset = presets.find(p => p.id === e.target.value) || presets[0];
                        setLocalConfig({ presetId: preset.id, baseUrl: preset.baseUrl, model: preset.model });
                        setTestStatus(null);
                      }}
                      className="w-full bg-[#1a1d2e] border border-[#252940] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                    >
                      {presets.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                  {isCustom && (
                    <>
                      <div>
                          <label className="text-xs text-gray-400 font-medium block mb-1.5">Base URL</label>
                        <input
                          type="text"
                          value={localConfig.baseUrl}
                          onChange={e => { setLocalConfig(prev => ({ ...prev, baseUrl: e.target.value })); setTestStatus(null); }}
                          placeholder="https://api.openai.com/v1/chat/completions"
                          className="w-full bg-[#1a1d2e] border border-[#252940] rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 font-mono"
                        />
                        <p className="text-[10px] text-gray-600 mt-1">Must end with <span className="font-mono text-gray-500">/chat/completions</span> for OpenAI-compatible APIs</p>
                      </div>
                      <div>
                        <label className="text-xs text-gray-400 font-medium block mb-1.5">Model Name</label>
                        <input
                          type="text"
                          value={localConfig.model}
                          onChange={e => { setLocalConfig(prev => ({ ...prev, model: e.target.value })); setTestStatus(null); }}
                          placeholder="gpt-4o"
                          className="w-full bg-[#1a1d2e] border border-[#252940] rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 font-mono"
                        />
                        <p className="text-[10px] text-gray-600 mt-1">For OpenCode Zen: use <span className="font-mono text-gray-500">deepseek-v4-flash-free</span> (no <span className="font-mono text-gray-500">opencode/</span> prefix)</p>
                      </div>
                    </>
                  )}

                  {testStatus === 'testing' && (
                    <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg text-xs bg-blue-500/10 border border-blue-500/20 text-blue-400">
                      <span className="mt-0.5 shrink-0">⟳</span>
                      <span>Testing connection…</span>
                    </div>
                  )}
                  {testStatus && testStatus !== 'testing' && (
                    <div className={`flex items-start gap-2 px-3 py-2.5 rounded-lg text-xs ${
                      testStatus.ok
                        ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                        : 'bg-red-500/10 border border-red-500/20 text-red-400'
                    }`}>
                      <span className="mt-0.5 shrink-0">{testStatus.ok ? '✓' : '✗'}</span>
                      <span>{testStatus.ok ? 'Connected successfully' : testStatus.error}</span>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={async () => {
                        setTestStatus('testing');
                        const config = resolveConfig(localConfig.presetId, { baseUrl: localConfig.baseUrl, model: localConfig.model });
                        const result = await testConnection({ config, apiKey: localApiKey });
                        setTestStatus(result);
                      }}
                      disabled={testStatus === 'testing' || !localApiKey}
                      className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-600 rounded-lg text-sm font-medium text-white transition-colors"
                    >
                      {testStatus === 'testing' ? 'Testing…' : 'Test Connection'}
                    </button>
                    <button
                      onClick={() => { saveApiKey(localApiKey); saveConfig(localConfig); setShowSettings(false); setTestStatus(null); }}
                      className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-semibold text-white transition-colors"
                    >
                      Save
                    </button>
                  </div>
                </motion.div>
              ) : (
                <motion.div key="main" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col flex-1 overflow-hidden">
                  <SymbolContextBar ctx={ctx} />

                  <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                    {hasContext && (
                      <button
                        onClick={handleRunAnalysis}
                        disabled={loading || !localApiKey}
                        className={`w-full py-2.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                          loading
                            ? 'bg-indigo-600/30 text-indigo-300 cursor-not-allowed'
                            : !localApiKey
                            ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                            : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20'
                        }`}
                      >
                        {loading ? (
                          <><Loader2 size={16} className="animate-spin" /> Analyzing…</>
                        ) : (
                          <><Sparkles size={16} /> Run Analysis</>
                        )}
                      </button>
                    )}

                    {!localApiKey && (
                      <p className="text-xs text-amber-400 text-center">Set your API key in settings ⚙</p>
                    )}

                    {error && (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-red-500/10 border border-red-500/20 rounded-xl p-3">
                        <p className="text-xs text-red-400">{error}</p>
                      </motion.div>
                    )}

                    {!result && !loading && (
                      <div className="text-center py-8 text-gray-500">
                        <Sparkles size={32} className="mx-auto mb-2 opacity-30" />
                        <p className="text-sm">{hasContext ? 'Run an analysis or ask a question' : 'Ask anything about trading'}</p>
                      </div>
                    )}

                    {result && result.reply && (
                      <div className="bg-[#1a1d2e] border border-[#252940] rounded-xl p-4">
                        <p className="text-sm text-gray-200 whitespace-pre-wrap">{result.reply}</p>
                      </div>
                    )}

                    {result && (result.position_check || result.market_context) && (
                      <motion.div key="result" ref={resultRef} initial="hidden" animate="visible" className="space-y-3">
                        <motion.div variants={cardVariants} custom={0}>
                          {result.position_check && <VerdictBar verdict={result.position_check.verdict} />}
                        </motion.div>
                        <motion.div variants={cardVariants} custom={1}>
                          <MarketContextCard result={result} />
                        </motion.div>
                        <motion.div variants={cardVariants} custom={2}>
                          <TradePlanCard ctx={ctx} />
                        </motion.div>
                        <motion.div variants={cardVariants} custom={3}>
                          <AiVerdictCard result={result} />
                        </motion.div>
                      </motion.div>
                    )}
                  </div>

                  <div className="shrink-0 px-4 py-3 border-t border-[#252940]">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={followUp}
                        onChange={e => setFollowUp(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !followUpLoading) handleSendMessage(); }}
                        placeholder={hasContext ? 'Ask a follow-up…' : 'Ask anything about trading…'}
                        className="flex-1 bg-[#1a1d2e] border border-[#252940] rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                      />
                      <button
                        onClick={handleSendMessage}
                        disabled={!followUp.trim() || followUpLoading}
                        className="p-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-800 disabled:text-gray-600 rounded-lg text-white transition-colors"
                      >
                        {followUpLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
