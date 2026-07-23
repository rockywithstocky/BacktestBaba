import React from 'react';
import { motion } from 'framer-motion';
import { Info, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';
import { fmtRS, fmtPC, pC } from './analyzerUtils';
import { costBreakdown } from './riskEngine';

function StatBox({ label, value, cls }) {
  return (
    <div className="bg-gray-900/50 rounded-lg p-3 text-center">
      <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-base font-bold font-mono ${cls || 'text-white'}`}>{value}</div>
    </div>
  );
}

export default function VerifiedStatsPanel({ stats }) {
  if (!stats) return null;

  const s = stats;
  const ttl = s.allTrades.length;
  const v14 = s.a14.length;
  const hasExcluded = v14 < ttl;
  const oa = s.hstats[14] ? s.hstats[14].mean : 0;

  const now = new Date();
  let staleC = 0;
  for (const [sym, t] of Object.entries(s.sm)) {
    const d = t.map(x => x.signal_date).filter(Boolean);
    if (!d.length) continue;
    const mo = (now - new Date(Math.max(...d.map(x => new Date(x))))) / (30 * 86400000);
    if (mo > 24) staleC++;
  }

  const renderDistribution = () => {
    if (!s.dBins.length) return null;
    const mx = Math.max(...s.dBins.map(b => b.count));
    return (
      <div className="space-y-1">
        {s.dBins.map((b, i) => {
          const w = Math.max(2, (b.count / mx) * 100);
          return (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className="w-16 text-right font-mono text-gray-500 shrink-0">{fmtPC(b.lo, 1)}</span>
              <div className="flex-1 h-3 bg-gray-700/50 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${b.lo >= 0 ? 'bg-emerald-500/60' : 'bg-red-500/60'}`}
                  style={{ width: `${w}%` }}
                />
              </div>
              <span className="w-20 font-mono text-gray-400 shrink-0 text-right">{b.count} ({b.pct.toFixed(1)}%)</span>
            </div>
          );
        })}
      </div>
    );
  };

  const renderRiskBars = () => {
    const mS = Math.max(1, ...[7, 14, 30, 45, 60, 90]
      .map(d => { const hh = s.hstats[d]; return hh && isFinite(hh.sharpe) ? hh.sharpe : 0; }));
    return (
      <div className="space-y-1.5">
        {[7, 14, 30, 45, 60, 90].map(d => {
          const hh = s.hstats[d];
          if (!hh || !hh.n) return null;
          const w = Math.max(2, ((hh.sharpe || 0) / mS) * 100);
          return (
            <div key={d} className="flex items-center gap-2 text-xs">
              <span className="w-10 text-right font-mono text-gray-500 shrink-0">{d}d</span>
              <div className="flex-1 h-4 bg-gray-700/50 rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-blue-500/60 transition-all" style={{ width: `${w}%` }} />
              </div>
              <span className="w-12 font-mono text-gray-400 shrink-0 text-right">{isFinite(hh.sharpe) ? hh.sharpe.toFixed(2) : '—'}</span>
            </div>
          );
        })}
        {s.ls && s.ls.n > 0 && isFinite(s.ls.sharpe) && (
          <div className="flex items-center gap-2 text-xs">
            <span className="w-10 text-right font-mono text-emerald-400 font-bold shrink-0">Ladder</span>
            <div className="flex-1 h-4 bg-gray-700/50 rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-emerald-500/60 transition-all" style={{ width: `${Math.max(2, (s.ls.sharpe / mS) * 100)}%` }} />
            </div>
            <span className="w-12 font-mono text-emerald-400 font-bold shrink-0 text-right">{s.ls.sharpe.toFixed(2)}</span>
          </div>
        )}
      </div>
    );
  };

  const renderHorizonTable = () => {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500 border-b border-white/5">
              <th className="text-left py-2 pr-3 font-semibold">Horizon</th>
              <th className="text-right py-2 px-2 font-semibold">Trades</th>
              <th className="text-right py-2 px-2 font-semibold">Avg</th>
              <th className="text-right py-2 px-2 font-semibold">Spread</th>
              <th className="text-right py-2 px-2 font-semibold">Risk</th>
              <th className="text-right py-2 px-2 font-semibold">Win%</th>
              <th className="text-right py-2 px-2 font-semibold">PF</th>
              <th className="text-right py-2 px-2 font-semibold">Bet%</th>
              <th className="text-right py-2 px-2 font-semibold">Worst</th>
              <th className="text-right py-2 px-2 font-semibold">Typical</th>
              <th className="text-right py-2 pl-2 font-semibold">Best</th>
            </tr>
          </thead>
          <tbody>
            {[7, 14, 30, 45, 60, 90].map(d => {
              const hh = s.hstats[d];
              if (!hh || !hh.n) return null;
              return (
                <tr key={d} className="border-b border-white/5 hover:bg-white/5">
                  <td className="py-2 pr-3 font-mono text-gray-300">{d}d</td>
                  <td className="py-2 px-2 text-right font-mono">{hh.n.toLocaleString()}</td>
                  <td className={`py-2 px-2 text-right font-mono ${pC(hh.mean)}`}>{fmtPC(hh.mean, 2)}</td>
                  <td className="py-2 px-2 text-right font-mono">{fmtPC(hh.std, 2)}</td>
                  <td className="py-2 px-2 text-right font-mono">{isFinite(hh.sharpe) ? hh.sharpe.toFixed(2) : '—'}</td>
                  <td className="py-2 px-2 text-right font-mono">{isFinite(hh.winRate) ? hh.winRate.toFixed(1) + '%' : '—'}</td>
                  <td className="py-2 px-2 text-right font-mono">{isFinite(hh.pf) ? hh.pf.toFixed(2) : '—'}</td>
                  <td className="py-2 px-2 text-right font-mono">{isFinite(hh.kelly) ? (hh.kelly * 100).toFixed(1) : '—'}</td>
                  <td className={`py-2 px-2 text-right font-mono ${pC(hh.p5)}`}>{fmtPC(hh.p5, 2)}</td>
                  <td className={`py-2 px-2 text-right font-mono ${pC(hh.p50)}`}>{fmtPC(hh.p50, 2)}</td>
                  <td className={`py-2 px-2 text-right font-mono ${pC(hh.p90)}`}>{fmtPC(hh.p90, 2)}</td>
                </tr>
              );
            })}
            {s.ls && s.ls.n > 0 && (
              <tr className="border-b border-blue-500/20 bg-blue-500/5">
                <td className="py-2 pr-3 font-mono text-blue-400 font-bold">Ladder</td>
                <td className="py-2 px-2 text-right font-mono">{s.ls.n.toLocaleString()}</td>
                <td className={`py-2 px-2 text-right font-mono font-bold ${pC(s.ls.mean)}`}>{fmtPC(s.ls.mean, 2)}</td>
                <td className="py-2 px-2 text-right font-mono">{fmtPC(s.ls.std, 2)}</td>
                <td className="py-2 px-2 text-right font-mono font-bold">{isFinite(s.ls.sharpe) ? s.ls.sharpe.toFixed(2) : '—'}</td>
                <td className="py-2 px-2 text-right font-mono font-bold">{isFinite(s.ls.winRate) ? s.ls.winRate.toFixed(1) + '%' : '—'}</td>
                <td className="py-2 px-2 text-right font-mono">{isFinite(s.ls.pf) ? s.ls.pf.toFixed(2) : '—'}</td>
                <td className="py-2 px-2 text-right font-mono">{isFinite(s.ls.kelly) ? (s.ls.kelly * 100).toFixed(1) : '—'}</td>
                <td className={`py-2 px-2 text-right font-mono ${pC(s.ls.p5)}`}>{fmtPC(s.ls.p5, 2)}</td>
                <td className={`py-2 px-2 text-right font-mono ${pC(s.ls.p50)}`}>{fmtPC(s.ls.p50, 2)}</td>
                <td className={`py-2 px-2 text-right font-mono ${pC(s.ls.p90)}`}>{fmtPC(s.ls.p90, 2)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  };

  const renderCostBreakdown = () => {
    const sp = 25000;
    const cb = costBreakdown(sp);
    const segs = [
      { l: 'STT', v: cb.stt, tip: '0.1% each side' },
      { l: 'DP', v: cb.dp, tip: '₹15.34 per sell' },
      { l: 'Stamp', v: cb.stamp, tip: '0.015% on buy' },
      { l: 'Txn', v: cb.txn, tip: '0.00325%' },
      { l: 'GST', v: cb.gst, tip: '18% on txn+sebi' },
    ];
    return (
      <div>
        <div className="flex h-5 rounded-md overflow-hidden mb-2 cursor-help text-[9px] font-bold">
          {segs.map((seg, i) => {
            const pct = (seg.v / cb.total) * 100;
            return (
              <div
                key={i}
                className="flex items-center justify-center"
                style={{ width: `${Math.max(2, pct)}%`, backgroundColor: ['#3B82F6', '#F59E0B', '#10B981', '#8B5CF6', '#EC4899'][i] }}
                title={`${seg.l}: ${fmtRS(Math.round(seg.v))} (${seg.tip})`}
              >
                {pct > 8 ? seg.l : ''}
              </div>
            );
          })}
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
          {segs.map((seg, i) => (
            <div key={i} className="bg-gray-900/50 rounded p-2 text-center" title={seg.tip}>
              <div className="text-[10px] text-gray-500">{seg.l}</div>
              <div className="text-xs font-mono text-gray-300">{fmtRS(Math.round(seg.v))}</div>
              <div className="text-[10px] text-gray-600">{(seg.v / cb.total * 100).toFixed(0)}%</div>
            </div>
          ))}
          <div className="bg-blue-500/10 rounded p-2 text-center">
            <div className="text-[10px] text-gray-500">Total</div>
            <div className="text-xs font-mono text-blue-400 font-bold">{fmtRS(Math.round(cb.total))}</div>
            <div className="text-[10px] text-blue-400/60">{cb.pct.toFixed(2)}%</div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
      {hasExcluded && (
        <div className="flex items-start gap-2 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-xs text-blue-400">
          <Info size={14} className="mt-0.5 shrink-0" />
          {ttl - v14} recent trade{(ttl - v14) !== 1 ? 's' : ''} excluded from 14d stats (horizon not yet reached).
        </div>
      )}
      {staleC > 0 && (
        <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-400">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          {staleC} of {s.totalSymbols} symbols have no signal in the last 2 years.
        </div>
      )}

      <div className="bg-gray-800/30 border border-white/5 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-white mb-3">Returns by Horizon</h3>
        {renderHorizonTable()}
        <p className="text-[10px] text-gray-600 mt-2">Risk score &gt;1 = good. PF = ₹ earned per ₹1 lost. Bet% = optimal position size %.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-gray-800/30 border border-white/5 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-white mb-3">
            14d Return Distribution
            <Info size={13} className="inline ml-1.5 text-gray-500 cursor-help -mt-0.5 align-middle"
              title="Shows the spread of 14-day returns — from worst to best. Tight cluster = predictable. Wide spread = risky." />
          </h3>
          {renderDistribution()}
        </div>

        <div className="bg-gray-800/30 border border-white/5 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-white mb-3">
            Risk Score by Horizon
            <Info size={13} className="inline ml-1.5 text-gray-500 cursor-help -mt-0.5 align-middle"
              title="How consistent your returns are. 0.5 = okay, 1 = good, 2+ = excellent. Higher = less guesswork." />
          </h3>
          <p className="text-[10px] text-gray-500 mb-2">Higher = more consistent. 1+ good, 2+ excellent.</p>
          {renderRiskBars()}
        </div>
      </div>

      {s.ps && s.ps.median && (
        <div className="bg-gray-800/30 border border-white/5 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-white mb-3">Entry Price</h3>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <StatBox label="Typical" value={fmtRS(s.ps.median)} />
            <StatBox label="Lowest 5%" value={fmtRS(s.ps.p5)} />
            <StatBox label="Highest 95%" value={fmtRS(s.ps.p95)} />
            <StatBox label="Under ₹100" value={s.ps.pctU100.toFixed(0) + '%'} />
            <StatBox label="Under ₹50" value={s.ps.pctU50.toFixed(1) + '%'} />
          </div>
          {s.ps.pctU50 > 5 && (
            <p className="text-[10px] text-amber-400 mt-2">{s.ps.pctU50.toFixed(1)}% of entries under ₹50 (circuit risk).</p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-gray-800/30 border border-white/5 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-white mb-3">14d by Market Cap</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 border-b border-white/5">
                  <th className="text-left py-2 pr-3 font-semibold">Cap</th>
                  <th className="text-right py-2 px-2 font-semibold">Trades</th>
                  <th className="text-right py-2 px-2 font-semibold">Avg</th>
                  <th className="text-right py-2 px-2 font-semibold">Win%</th>
                  <th className="text-right py-2 pl-2 font-semibold">Risk</th>
                </tr>
              </thead>
              <tbody>
                {['Largecap', 'Midcap', 'Smallcap'].map(c => {
                  const cc = s.caps[c];
                  if (!cc || !cc.n) return (
                    <tr key={c} className="border-b border-white/5">
                      <td className="py-2 pr-3">{c}</td>
                      <td className="py-2 px-2 text-right text-gray-500" colSpan={4}>No data</td>
                    </tr>
                  );
                  return (
                    <tr key={c} className="border-b border-white/5 hover:bg-white/5">
                      <td className="py-2 pr-3">{c}</td>
                      <td className="py-2 px-2 text-right font-mono">{cc.n.toLocaleString()}</td>
                      <td className={`py-2 px-2 text-right font-mono ${pC(cc.mean)}`}>{fmtPC(cc.mean, 2)}</td>
                      <td className="py-2 px-2 text-right font-mono">{cc.winRate.toFixed(1)}%</td>
                      <td className="py-2 px-2 text-right font-mono">{isFinite(cc.sharpe) ? cc.sharpe.toFixed(2) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-gray-800/30 border border-white/5 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-white mb-3">Reversal Rate</h3>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-gray-900/50 rounded-lg p-3 text-center">
              <div className="text-[10px] text-gray-500">7d win → 90d loss</div>
              <div className={`text-lg font-bold font-mono ${s.rr90 > 20 ? 'text-red-400' : 'text-emerald-400'}`}>
                {s.rr90.toFixed(1)}%
              </div>
            </div>
            <div className="bg-gray-900/50 rounded-lg p-3 text-center">
              <div className="text-[10px] text-gray-500">7d win → 14d loss</div>
              <div className={`text-lg font-bold font-mono ${s.rr14 > 15 ? 'text-red-400' : 'text-emerald-400'}`}>
                {s.rr14.toFixed(1)}%
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-gray-800/30 border border-white/5 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-white mb-3">By Year</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 border-b border-white/5">
                  <th className="text-left py-2 pr-3 font-semibold">Year</th>
                  <th className="text-right py-2 px-2 font-semibold">Trades</th>
                  <th className="text-right py-2 px-2 font-semibold">Avg 14d</th>
                  <th className="text-right py-2 pl-2 font-semibold">Win%</th>
                </tr>
              </thead>
              <tbody>
                {s.yrStats.map(yr => {
                  const isL = yr.n < 10;
                  const isH = yr.avg > oa * 1.8 && yr.n >= 20;
                  return (
                    <tr key={yr.year} className={`border-b border-white/5 hover:bg-white/5 ${isL || isH ? 'bg-amber-500/5' : ''}`}>
                      <td className="py-2 pr-3">
                        {yr.year}
                        {isH && <span className="ml-1 text-[10px] text-amber-400">exceptional</span>}
                        {isL && <span className="ml-1 text-[10px] text-gray-500">low</span>}
                      </td>
                      <td className="py-2 px-2 text-right font-mono">{yr.n}</td>
                      <td className={`py-2 px-2 text-right font-mono ${pC(yr.avg)}`}>{fmtPC(yr.avg, 2)}</td>
                      <td className="py-2 px-2 text-right font-mono">{yr.winRate.toFixed(1)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-gray-800/30 border border-white/5 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-white mb-3">By Month</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 border-b border-white/5">
                  <th className="text-left py-2 pr-3 font-semibold">Month</th>
                  <th className="text-right py-2 px-2 font-semibold">Trades</th>
                  <th className="text-right py-2 px-2 font-semibold">Avg 14d</th>
                  <th className="text-right py-2 pl-2 font-semibold">Win%</th>
                </tr>
              </thead>
              <tbody>
                {s.moStats.map(mo => (
                  <tr key={mo.month} className={`border-b border-white/5 hover:bg-white/5 ${mo.n < 10 ? 'bg-amber-500/5' : ''}`}>
                    <td className="py-2 pr-3">{mo.month}{mo.n < 10 && <span className="ml-1 text-[10px] text-gray-500">low</span>}</td>
                    <td className="py-2 px-2 text-right font-mono">{mo.n.toLocaleString()}</td>
                    <td className={`py-2 px-2 text-right font-mono ${pC(mo.avg)}`}>{isFinite(mo.avg) ? fmtPC(mo.avg, 2) : '—'}</td>
                    <td className="py-2 px-2 text-right font-mono">{isFinite(mo.winRate) ? mo.winRate.toFixed(1) + '%' : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="bg-gray-800/30 border border-white/5 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-white mb-3">Signal Week of Month</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {s.wkStats.map(w => (
            <div key={w.week} className="bg-gray-900/50 rounded-lg p-3 text-center">
              <div className="text-[10px] text-gray-500">{w.week}</div>
              <div className={`text-base font-bold font-mono ${pC(w.avg)}`}>{isFinite(w.avg) ? fmtPC(w.avg, 2) : '—'}</div>
              <div className="text-[10px] text-gray-500">{w.n} trades</div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-gray-800/30 border border-white/5 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-white mb-3">
          Most-Signaled Stocks
          <span className="text-xs text-gray-500 ml-2 font-normal">vs strategy baseline ({s.hstats[14] ? s.hstats[14].winRate.toFixed(0) : '?'}%)</span>
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500 border-b border-white/5">
                <th className="text-left py-2 pr-3 font-semibold">Symbol</th>
                <th className="text-right py-2 px-2 font-semibold">Trades</th>
                <th className="text-right py-2 px-2 font-semibold">Avg 14d</th>
                <th className="text-right py-2 px-2 font-semibold">Win%</th>
                <th className="text-right py-2 pl-2 font-semibold">vs Strategy</th>
              </tr>
            </thead>
            <tbody>
              {s.conc.map(c => {
                const vs = isFinite(c.winRate) ? c.winRate - (s.hstats[14] ? s.hstats[14].winRate : 0) : 0;
                return (
                  <tr key={c.symbol} className="border-b border-white/5 hover:bg-white/5">
                    <td className="py-2 pr-3 font-mono">{c.symbol}</td>
                    <td className="py-2 px-2 text-right font-mono">{c.count}</td>
                    <td className={`py-2 px-2 text-right font-mono ${pC(c.avg)}`}>{isFinite(c.avg) ? fmtPC(c.avg, 2) : '—'}</td>
                    <td className="py-2 px-2 text-right font-mono">{isFinite(c.winRate) ? c.winRate.toFixed(1) + '%' : '—'}</td>
                    <td className={`py-2 px-2 text-right font-mono ${pC(vs)}`}>{vs > 0 ? '+' : ''}{vs.toFixed(1)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-gray-800/30 border border-white/5 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-white mb-3">Cost Breakdown</h3>
        <p className="text-[10px] text-gray-500 mb-2">Per trade at {fmtRS(25000)}. Hover bars.</p>
        {renderCostBreakdown()}
      </div>
    </motion.div>
  );
}
