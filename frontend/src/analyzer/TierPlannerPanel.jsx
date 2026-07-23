import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, CheckCircle, Info } from 'lucide-react';
import { fmtRS, fmtPC, pC } from './analyzerUtils';
import { tierConfig, computeRiskPlan, costBreakdown, riskBudget } from './riskEngine';

const TIER_LABELS = { starter: 'Starter', balanced: 'Balanced', growth: 'Growth' };
const TIER_FOCUS = {
  starter: 'Largecap, single exit',
  balanced: 'Mid+Smallcap, stops by horizon',
  growth: 'Smallcap, 4-way ladder',
};

function TierCard({ name, cfg, selected, onClick, budget }) {
  const avail = cfg.available;
  return (
    <button
      onClick={avail ? onClick : undefined}
      className={`flex-1 p-3 rounded-lg border text-left transition-all ${
        !avail ? 'opacity-40 cursor-not-allowed border-white/5' :
        selected ? 'border-blue-500 bg-blue-500/10' : 'border-white/10 bg-gray-800/30 hover:border-gray-500'
      }`}
    >
      <div className="text-sm font-bold text-white">{TIER_LABELS[name]}</div>
      <div className="text-[10px] text-gray-500 mb-1">{cfg.desc}</div>
      <div className="text-lg font-bold font-mono text-white">{fmtRS(cfg.size)}</div>
      <div className="text-[10px] text-gray-500">per position</div>
      <div className="text-xs text-gray-400 mt-1">{cfg.positions} positions</div>
      <div className="text-xs text-gray-500">₹{cfg.deployed.toLocaleString('en-IN')} deployed</div>
      {!avail && (
        <div className="text-[10px] text-amber-400 mt-1">
          Needs {name === 'balanced' ? '₹20,000+' : '₹60,000+'}
        </div>
      )}
      {avail && budget && (
        <div className="mt-2">
          <div className="flex justify-between text-[10px] text-gray-500 mb-0.5">
            <span>Risk capacity</span>
            <span>{budget.maxPositionsByRisk}/{budget.totalPositions} pos</span>
          </div>
          <div className="h-1.5 bg-gray-700/50 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                budget.capacityPct > 80 ? 'bg-red-500' : budget.capacityPct > 60 ? 'bg-amber-500' : 'bg-emerald-500'
              }`}
              style={{ width: `${budget.capacityPct}%` }}
            />
          </div>
        </div>
      )}
    </button>
  );
}

export default function TierPlannerPanel({ stats, capital, riskPercent }) {
  const [selectedTier, setSelectedTier] = useState('balanced');
  const [plannerCapital, setPlannerCapital] = useState(capital);

  const cfg = useMemo(() => tierConfig(plannerCapital), [plannerCapital]);
  const budget = useMemo(() => riskBudget(selectedTier, plannerCapital, riskPercent), [selectedTier, plannerCapital, riskPercent]);

  if (!cfg[selectedTier] || !cfg[selectedTier].available) {
    const fallback = cfg.balanced.available ? 'balanced' : 'starter';
    if (selectedTier !== fallback) setSelectedTier(fallback);
  }

  const s = stats;
  const currentCfg = cfg[selectedTier] || cfg.starter;
  const sz = currentCfg.size;
  const pos = currentCfg.positions;
  const dep = currentCfg.deployed;
  const buf = plannerCapital - dep;

  const isLadder = selectedTier === 'growth';
  const costInfo = costBreakdown(sz, isLadder);
  const rS = selectedTier === 'starter'
    ? (s.caps.Largecap && s.caps.Largecap.n > 0 ? s.caps.Largecap : s.hstats[14])
    : selectedTier === 'balanced'
    ? s.hstats[14]
    : (s.ls && s.ls.n > 0 ? s.ls : s.hstats[14]);

  const rP = rS && isFinite(rS.mean) ? rS.mean : 0;
  const rL = selectedTier === 'growth' ? 'Ladder' : selectedTier === 'balanced' ? 'All-cap 14d' : 'Largecap 14d';

  const totalCost = costInfo.total;
  const costPct = costInfo.pct;
  const nRP = rP - costPct;
  const tA = nRP > 0 ? nRP * (1 - 0.156) : nRP;

  const mSig = s.monthly ? (s.monthly[selectedTier] || 1) : 1;
  const tPM = Math.min(pos, Math.max(1, Math.round(mSig)));
  const mRR = tPM * (tA / 100) * sz;

  const stP = selectedTier === 'starter' ? 8 : (selectedTier === 'balanced' ? 10 : 12);
  const sD = pos * (stP / 100) * sz;
  const sDP = plannerCapital > 0 ? (sD / plannerCapital) * 100 : 0;

  const mP = s.ps && s.ps.median ? s.ps.median : 329;
  const eSh = Math.floor(sz / mP);
  const eGr = isFinite(rP) ? sz * rP / 100 : 0;
  const eNt = eGr - totalCost;
  const eTx = eNt > 0 ? eNt * (1 - 0.156) : eNt;

  const bM = {};
  for (const t of s.allTrades) {
    let p = false;
    if (selectedTier === 'starter') p = t.market_cap === 'Largecap';
    else if (selectedTier === 'balanced') p = t.market_cap === 'Midcap' || t.market_cap === 'Smallcap';
    else p = t.market_cap === 'Smallcap';
    if (!p) continue;
    const ym = t.signal_date ? t.signal_date.slice(0, 7) : null;
    if (!ym) continue;
    if (!bM[ym]) bM[ym] = [];
    const r = t.return_14d;
    if (r !== null && r !== undefined && !isNaN(r)) bM[ym].push(r);
  }

  const mA = Object.values(bM).map(v => v.reduce((sum, x) => sum + x, 0) / v.length).sort((a, b) => a - b);
  const mN = mA.length;
  const p10 = mN > 0 ? mA[Math.max(0, Math.floor(mN * 0.1))] : NaN;
  const p50 = mN > 0 ? mA[Math.floor(mN * 0.5)] : NaN;
  const p90 = mN > 0 ? mA[Math.min(mN - 1, Math.floor(mN * 0.9))] : NaN;
  const mP10 = isFinite(p10) ? tPM * (p10 / 100) * sz : NaN;
  const mP50 = isFinite(p50) ? tPM * (p50 / 100) * sz : NaN;
  const mP90 = isFinite(p90) ? tPM * (p90 / 100) * sz : NaN;

  const riskPlan = computeRiskPlan({
    capital: plannerCapital,
    riskPercent,
    stopLossPercent: 5,
    rrRatio: 2,
    entryPrice: mP,
    isLadder,
  });

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
      <div className="bg-gray-800/30 border border-white/5 rounded-xl p-4">
        <div className="flex items-center gap-2 flex-wrap mb-4">
          <label className="text-sm font-semibold text-white whitespace-nowrap">Your capital</label>
          <input
            type="text"
            value={plannerCapital.toLocaleString('en-IN')}
            onChange={e => {
              const v = parseInt(e.target.value.replace(/[^0-9]/g, '')) || 0;
              setPlannerCapital(Math.max(2000, v));
            }}
            className="w-36 bg-gray-700/50 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white font-mono text-right focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          />
        </div>

        <div className="flex gap-3 flex-wrap">
          {Object.keys(TIER_LABELS).map(name => (
            <TierCard
              key={name}
              name={name}
              cfg={cfg[name]}
              selected={selectedTier === name}
              onClick={() => setSelectedTier(name)}
              budget={name === selectedTier ? budget : null}
            />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <StatBox label="Position size" value={fmtRS(sz)} />
        <StatBox label="Positions" value={String(pos)} />
        <StatBox label="Deployed" value={fmtRS(dep)} />
        <StatBox label="Cash buffer" value={`${fmtRS(buf)} (${plannerCapital > 0 ? (buf / plannerCapital * 100).toFixed(0) : 0}%)`} />
        <StatBox label="Trades/month" value={String(tPM)} />
        <StatBox label="Worst drawdown" value={`${fmtRS(Math.round(sD))} (${sDP.toFixed(1)}%)`} cls="text-red-400" />
      </div>

      <div className="bg-gray-800/30 border border-white/5 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-white mb-3">Return Projection</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <StatBox label={`Raw return (${rL})`} value={fmtPC(rP, 2)} cls={rP >= 0 ? 'text-emerald-400' : 'text-red-400'} />
          <StatBox label="Cost per trade" value={`${fmtRS(Math.round(totalCost))} (${costPct.toFixed(2)}%)`} cls="text-red-400" />
          <StatBox label="Net, post-tax" value={fmtPC(tA, 2)} cls={tA >= 0 ? 'text-emerald-400' : 'text-red-400'} />
          <StatBox label="Est. monthly" value={fmtRS(Math.round(mRR))} cls={mRR >= 0 ? 'text-emerald-400' : 'text-red-400'} />
        </div>
        {mN > 0 && (
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="bg-red-500/10 rounded-lg p-2.5 text-center">
              <div className="text-[10px] text-gray-500">Bad month (10%)</div>
              <div className={`text-sm font-bold font-mono ${isFinite(mP10) && mP10 >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {isFinite(mP10) ? fmtRS(Math.round(mP10)) : '—'}
              </div>
            </div>
            <div className="bg-blue-500/10 rounded-lg p-2.5 text-center">
              <div className="text-[10px] text-gray-500">Typical month</div>
              <div className={`text-sm font-bold font-mono ${isFinite(mP50) && mP50 >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {isFinite(mP50) ? fmtRS(Math.round(mP50)) : '—'}
              </div>
            </div>
            <div className="bg-emerald-500/10 rounded-lg p-2.5 text-center">
              <div className="text-[10px] text-gray-500">Good month (10%)</div>
              <div className={`text-sm font-bold font-mono ${isFinite(mP90) && mP90 >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {isFinite(mP90) ? fmtRS(Math.round(mP90)) : '—'}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="bg-gray-800/30 border border-white/5 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-white mb-3">Risk Budget</h3>
        {budget && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <StatBox label="Risk per trade" value={fmtRS(Math.round(budget.riskPerTrade))} cls="text-amber-400" />
            <StatBox label="Max positions (risk)" value={String(budget.maxPositionsByRisk)} />
            <StatBox label="Capacity used" value={`${budget.capacityPct.toFixed(0)}%`} cls={budget.capacityPct > 80 ? 'text-red-400' : budget.capacityPct > 60 ? 'text-amber-400' : 'text-emerald-400'} />
          </div>
        )}
      </div>

      <div className="bg-gray-800/30 border border-white/5 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-white mb-3">Cost Breakdown at {fmtRS(sz)}</h3>
        <div className="flex h-5 rounded-md overflow-hidden mb-2 text-[9px] font-bold">
          {[
            { l: 'STT', v: costInfo.stt, c: '#3B82F6' },
            { l: 'DP', v: costInfo.dp, c: '#F59E0B' },
            { l: 'Stamp', v: costInfo.stamp, c: '#10B981' },
            { l: 'Txn', v: costInfo.txn, c: '#8B5CF6' },
            { l: 'GST', v: costInfo.gst, c: '#EC4899' },
          ].map((seg, i) => {
            const pct = (seg.v / costInfo.total) * 100;
            return (
              <div key={i} className="flex items-center justify-center" style={{ width: `${Math.max(2, pct)}%`, backgroundColor: seg.c }}>
                {pct > 8 ? seg.l : ''}
              </div>
            );
          })}
        </div>
        <p className="text-[10px] text-gray-500">Total: {fmtRS(Math.round(costInfo.total))} ({costInfo.pct.toFixed(2)}% of position)</p>
      </div>

      <div className="bg-gray-800/30 border border-white/5 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-white mb-2">Example Trade</h3>
        <p className="text-xs text-gray-400">
          At {fmtRS(sz)} buying a stock at {fmtRS(mP)}: <strong className="text-white">~{eSh} shares</strong>.
          At avg return ({fmtPC(rP, 2)}): gross={fmtRS(Math.round(eGr))}, after costs={fmtRS(Math.round(eNt))},
          after STCG=<strong className="text-white">{fmtRS(Math.round(eTx))}</strong>.
        </p>
        {riskPlan && (
          <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            <RiskMini label="At risk%" value={`${riskPlan.riskPercent}%`} />
            <RiskMini label="Position" value={fmtRS(riskPlan.positionCost)} />
            <RiskMini label="Target" value={`+${riskPlan.targetReturn.toFixed(1)}%`} cls="text-emerald-400" />
            <RiskMini label="Stop loss" value={`-${riskPlan.stopLossPercent}%`} cls="text-red-400" />
          </div>
        )}
      </div>

      {pos > 20 && (
        <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-400">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          {pos} positions — monitoring overhead. Consider capping at 15-20.
        </div>
      )}
      {pos < 4 && selectedTier !== 'starter' && (
        <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-400">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          Only {pos} positions — consider a lower tier for diversification.
        </div>
      )}

      <div className="bg-gray-800/30 border border-white/5 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-white mb-2">Before You Start</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs">
          {[
            'Broker supports GTT stop-loss orders',
            'Check once daily after market close',
            selectedTier === 'growth' ? 'Track 4 exit dates per trade (day 7/14/30/60)' : 'Act on single exit signal per trade',
            'Capital can stay invested up to 90 days',
            'Stop-loss can slip past set price at circuit limit',
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-2 text-gray-400">
              <CheckCircle size={12} className="text-emerald-500 shrink-0" />
              {item}
            </div>
          ))}
        </div>
        <p className="text-[10px] text-gray-600 mt-2">{TIER_FOCUS[selectedTier]}. Stop: {stP}%.</p>
      </div>
    </motion.div>
  );
}

function StatBox({ label, value, cls }) {
  return (
    <div className="bg-gray-900/50 rounded-lg p-3 text-center">
      <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-base font-bold font-mono ${cls || 'text-white'}`}>{value}</div>
    </div>
  );
}

function RiskMini({ label, value, cls }) {
  return (
    <div className="bg-gray-900/30 rounded p-2 text-center">
      <div className="text-[10px] text-gray-500">{label}</div>
      <div className={`text-xs font-bold font-mono ${cls || 'text-white'}`}>{value}</div>
    </div>
  );
}
