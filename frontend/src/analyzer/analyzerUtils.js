import { vl } from './riskEngine';

function mn(a) { return a.reduce((s, v) => s + v, 0) / a.length; }

function stdv(a, m) {
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1));
}

function md(a) {
  const s = [...a].sort((x, y) => x - y);
  return s.length % 2 === 0
    ? (s[s.length / 2 - 1] + s[s.length / 2]) / 2
    : s[Math.floor(s.length / 2)];
}

export function fmtRS(n) {
  if (!isFinite(n)) return '—';
  return '₹' + Math.round(n).toLocaleString('en-IN');
}

export function fmtPC(n, d) {
  d = d === undefined ? 1 : d;
  if (!isFinite(n)) return '—';
  return (n >= 0 ? '+' : '') + n.toFixed(d) + '%';
}

export function pC(n) { return n >= 0 ? 'pos' : 'neg'; }

function horizonStats(trades, key) {
  const v = trades.map(t => vl(t[key])).filter(v => isFinite(v));
  const n = v.length;
  if (!n) return { n: 0, mean: NaN, std: NaN, sharpe: NaN, winRate: NaN, pf: NaN, kelly: NaN, p5: NaN, p50: NaN, p90: NaN };

  const mu = mn(v);
  const sd = n > 1 ? stdv(v, mu) : 0;
  const w = v.filter(x => x > 0).length;
  const l = v.filter(x => x < 0).length;
  const wr = (w / n) * 100;

  const sG = v.filter(x => x > 0).reduce((a, b) => a + b, 0);
  const sL = Math.abs(v.filter(x => x < 0).reduce((a, b) => a + b, 0));
  const pf = sL > 0 ? sG / sL : (sG > 0 ? Infinity : 0);
  const aW = w > 0 ? sG / w : 0;
  const aL = l > 0 ? sL / l : 0;
  const kelly = aL > 0 ? (wr / 100 - (1 - wr / 100) / (aW / aL)) : 1;

  const sv = [...v].sort((a, b) => a - b);
  return {
    n, mean: mu, std: sd,
    sharpe: sd > 0 ? (mu / sd) * Math.sqrt(252) : 0,
    winRate: wr, pf, kelly,
    p5: sv[Math.max(0, Math.floor(n * 0.05))],
    p50: sv[Math.floor(n * 0.5)],
    p90: sv[Math.min(n - 1, Math.floor(n * 0.9))],
  };
}

export function computeAllStats(trades) {
  const hstats = {};
  for (const d of [7, 14, 30, 45, 60, 90]) {
    hstats[d] = horizonStats(trades, 'return_' + d + 'd');
  }

  const lV = trades
    .map(t => {
      const r7 = vl(t.return_7d), r14 = vl(t.return_14d);
      const r30 = vl(t.return_30d), r60 = vl(t.return_60d);
      return isFinite(r7) && isFinite(r14) && isFinite(r30) && isFinite(r60)
        ? 0.25 * (r7 + r14 + r30 + r60) : NaN;
    })
    .filter(v => isFinite(v));

  const ls = horizonStats(trades, 'return_14d');
  if (lV.length > 0) {
    const lmu = mn(lV), lsd = lV.length > 1 ? stdv(lV, lmu) : 0;
    const lw = lV.filter(v => v > 0).length, ll = lV.filter(v => v < 0).length;
    const lG = lV.filter(v => v > 0).reduce((a, b) => a + b, 0);
    const lL = Math.abs(lV.filter(v => v < 0).reduce((a, b) => a + b, 0));
    const lpf = lL > 0 ? lG / lL : (lG > 0 ? Infinity : 0);
    const law = lw > 0 ? lG / lw : 0, lal = ll > 0 ? lL / ll : 0;
    const lk = lal > 0 ? (lw / lV.length - (1 - lw / lV.length) / (law / lal)) : 1;
    const sv = [...lV].sort((a, b) => a - b);
    Object.assign(ls, {
      n: lV.length, mean: lmu, std: lsd,
      sharpe: lsd > 0 ? (lmu / lsd) * Math.sqrt(252) : 0,
      winRate: (lw / lV.length) * 100, pf: lpf, kelly: lk,
      p5: sv[Math.max(0, Math.floor(lV.length * 0.05))],
      p50: sv[Math.floor(lV.length * 0.5)],
      p90: sv[Math.min(lV.length - 1, Math.floor(lV.length * 0.9))],
    });
  }

  const caps = {};
  for (const c of ['Largecap', 'Midcap', 'Smallcap']) {
    const f = trades.filter(t => t.market_cap === c);
    caps[c] = horizonStats(f, 'return_14d');
  }

  const years = {};
  for (const t of trades) {
    const y = t.signal_date ? t.signal_date.slice(0, 4) : '?';
    const r = vl(t.return_14d);
    if (!years[y]) years[y] = [];
    if (isFinite(r)) years[y].push(r);
  }
  const yrStats = Object.entries(years)
    .map(([yr, v]) => ({
      year: yr, n: v.length, avg: mn(v),
      winRate: v.filter(x => x > 0).length / v.length * 100,
    }))
    .sort((a, b) => a.year.localeCompare(b.year));

  const mNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const months = {};
  for (const t of trades) {
    const m = t.signal_date ? parseInt(t.signal_date.slice(5, 7), 10) : 0;
    const r = vl(t.return_14d);
    if (!m || !isFinite(r)) continue;
    if (!months[m]) months[m] = [];
    months[m].push(r);
  }
  const moStats = Object.entries(months)
    .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
    .map(([m, v]) => ({
      month: mNames[parseInt(m) - 1], n: v.length,
      avg: mn(v), winRate: v.filter(x => x > 0).length / v.length * 100,
    }));

  const weeks = { 1: [], 2: [], 3: [], 4: [] };
  for (const t of trades) {
    if (!t.signal_date) continue;
    const d = parseInt(t.signal_date.slice(8, 10), 10);
    const wk = d <= 7 ? 1 : d <= 14 ? 2 : d <= 21 ? 3 : 4;
    const r = vl(t.return_14d);
    if (isFinite(r)) weeks[wk].push(r);
  }
  const wkStats = Object.entries(weeks).map(([wk, v]) => ({
    week: 'Week ' + wk, n: v.length,
    avg: v.length ? mn(v) : NaN,
    winRate: v.length ? v.filter(x => x > 0).length / v.length * 100 : NaN,
  }));

  const prices = trades
    .map(t => vl(t.entry_price))
    .filter(v => isFinite(v) && v > 0)
    .sort((a, b) => a - b);
  const ps = {};
  if (prices.length > 0) {
    const n = prices.length;
    ps.median = md(prices);
    ps.p5 = prices[Math.floor(n * 0.05)];
    ps.p95 = prices[Math.floor(n * 0.95)];
    ps.pctU100 = prices.filter(p => p < 100).length / n * 100;
    ps.pctU500 = prices.filter(p => p < 500).length / n * 100;
    ps.pctU50 = prices.filter(p => p < 50).length / n * 100;
  }

  const sc = {};
  for (const t of trades) sc[t.symbol] = (sc[t.symbol] || 0) + 1;
  const top = Object.entries(sc).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const conc = top.map(([sym, cnt]) => {
    const st = trades.filter(t => t.symbol === sym);
    const rt = st.map(t => vl(t.return_14d)).filter(v => isFinite(v));
    const w = rt.filter(v => v > 0).length;
    return { symbol: sym, count: cnt, avg: rt.length ? mn(rt) : NaN, winRate: rt.length ? (w / rt.length) * 100 : NaN, nr: rt.length };
  });

  const both = trades.filter(t => isFinite(vl(t.return_7d)) && isFinite(vl(t.return_90d)));
  const rev90 = both.filter(t => vl(t.return_7d) > 0 && vl(t.return_90d) < 0);
  const rev90W = both.filter(t => vl(t.return_7d) > 0);
  const rr90 = rev90W.length ? (rev90.length / rev90W.length) * 100 : 0;

  const b14 = trades.filter(t => isFinite(vl(t.return_7d)) && isFinite(vl(t.return_14d)));
  const rev14 = b14.filter(t => vl(t.return_7d) > 0 && vl(t.return_14d) < 0);
  const rev14W = b14.filter(t => vl(t.return_7d) > 0);
  const rr14 = rev14W.length ? (rev14.length / rev14W.length) * 100 : 0;

  function mAvg(fn) {
    const bm = {};
    for (const t of trades) {
      if (!fn(t)) continue;
      const ym = t.signal_date ? t.signal_date.slice(0, 7) : '?';
      bm[ym] = (bm[ym] || 0) + 1;
    }
    const cnt = Object.values(bm);
    return cnt.length ? mn(cnt) : 0;
  }

  const mS = mAvg(t => t.market_cap === 'Largecap');
  const mB = mAvg(t => t.market_cap === 'Midcap' || t.market_cap === 'Smallcap');
  const mG = mAvg(t => t.market_cap === 'Smallcap');

  const a14 = trades.map(t => vl(t.return_14d)).filter(v => isFinite(v)).sort((a, b) => a - b);
  let dBins = [];
  if (a14.length > 0) {
    const bc = 10, min = a14[0], max = a14[a14.length - 1], bw = (max - min) / bc || 1;
    for (let i = 0; i < bc; i++) {
      const lo = min + i * bw, hi = lo + bw;
      const cnt = a14.filter(v => v >= lo && (i < bc - 1 ? v < hi : v <= hi)).length;
      dBins.push({ lo, hi, count: cnt, pct: (cnt / a14.length) * 100 });
    }
  }

  const sm = {};
  for (const t of trades) {
    if (!sm[t.symbol]) sm[t.symbol] = [];
    sm[t.symbol].push(t);
  }

  const stopFrequency = {};
  for (const pct of [3, 5, 8, 10]) {
    const hit = trades.filter(t => {
      const entry = vl(t.entry_price);
      const low = vl(t.max_low_90d);
      if (!isFinite(entry) || !isFinite(low) || entry <= 0) return false;
      return ((entry - low) / entry) * 100 >= pct;
    });
    stopFrequency[pct] = {
      hits: hit.length,
      total: trades.length,
      pct: trades.length > 0 ? (hit.length / trades.length) * 100 : 0,
    };
  }

  const targetFrequency = {};
  for (const pct of [5, 10, 15, 20]) {
    const hit = trades.filter(t => {
      const entry = vl(t.entry_price);
      const high = vl(t.max_high_90d);
      if (!isFinite(entry) || !isFinite(high) || entry <= 0) return false;
      return ((high - entry) / entry) * 100 >= pct;
    });
    targetFrequency[pct] = {
      hits: hit.length,
      total: trades.length,
      pct: trades.length > 0 ? (hit.length / trades.length) * 100 : 0,
    };
  }

  return {
    hstats, caps, ls, yrStats, moStats, wkStats, ps, conc,
    rr90, rr14, rev90n: rev90.length,
    monthly: { starter: mS, balanced: mB, growth: mG },
    dBins, sm,
    totalTrades: trades.length,
    totalSymbols: Object.keys(sm).length,
    a14, allTrades: trades,
    stopFrequency, targetFrequency,
  };
}

export function findSymbol(trades, input) {
  if (!input || !input.trim()) return null;
  const q = input.trim().toUpperCase();
  const noNS = q.endsWith('.NS') ? q.slice(0, -3) : q;

  const ex = trades.find(t => t.symbol === q || t.symbol === noNS + '.NS' || t.symbol === q + '.NS');
  if (ex) return ex.symbol;

  const cand = [...new Set(
    trades
      .filter(t => {
        const s = t.symbol;
        return s === noNS
          || s.includes(q)
          || s.includes(noNS)
          || (s.endsWith('.NS') && s.slice(0, -3).includes(q));
      })
      .map(t => t.symbol)
  )];
  if (cand.length === 1) return cand[0];
  if (cand.length > 1) return { multiple: cand.slice(0, 8) };
  return null;
}

export function perSymbolStats(st, ss) {
  const n = st.length;
  const r14 = st.map(t => vl(t.return_14d)).filter(v => isFinite(v));
  const r7 = st.map(t => vl(t.return_7d)).filter(v => isFinite(v));
  const n14 = r14.length;

  const avg14 = n14 ? mn(r14) : NaN;
  const win14 = n14 ? (r14.filter(v => v > 0).length / n14) * 100 : NaN;
  const best14 = n14 ? Math.max(...r14) : NaN;
  const worst14 = n14 ? Math.min(...r14) : NaN;
  const sd14 = n14 > 1 ? stdv(r14, avg14) : 0;
  const sharpe14 = sd14 > 0 ? (avg14 / sd14) * Math.sqrt(252) : 0;

  const prices = st.map(t => vl(t.entry_price)).filter(v => isFinite(v) && v > 0);
  const medPrice = prices.length ? md(prices) : NaN;

  const dates = st.map(t => t.signal_date).filter(Boolean).sort();
  const fD = dates[0] || '—';
  const lD = dates[dates.length - 1] || '—';
  const yrsR = lD !== '—' && fD !== '—'
    ? Math.round((new Date(lD) - new Date(fD)) / (365.25 * 86400000) * 10) / 10 : 0;
  const moSince = lD !== '—'
    ? Math.round((new Date() - new Date(lD)) / (30 * 86400000)) : null;

  const cw = [];
  for (let i = 1; i < dates.length; i++) {
    const d1 = new Date(dates[i - 1]), d2 = new Date(dates[i]);
    if ((d2 - d1) / 86400000 <= 30) cw.push(dates[i - 1] + ' to ' + dates[i]);
  }

  let sD = 0;
  for (let i = 0; i < dates.length; i++) {
    const ws = new Date(dates[i]), we = new Date(ws);
    we.setDate(we.getDate() + 90);
    const cnt = dates.filter(d => {
      const dt = new Date(d);
      return dt >= ws && dt <= we;
    }).length;
    sD = Math.max(sD, cnt);
  }

  let tier, tc;
  if (n14 < 2) { tier = 'Insufficient data'; tc = 'insufficient'; }
  else if (n14 < 3) { tier = 'Very limited'; tc = 'insufficient'; }
  else if (n14 < 5) { tier = 'Limited data'; tc = 'limited'; }
  else if (n14 < 10) { tier = 'Moderate sample'; tc = 'moderate'; }
  else { tier = 'Well-tested'; tc = 'tested'; }

  const cr = medPrice < 50 ? true : (medPrice < 100 ? 'amber' : false);

  return {
    n, n14, avg14, win14, best14, worst14, sharpe14, medPrice,
    fD, lD, yrsR, moSince, cw, sD, tier, tc, cr,
    oAvg14: ss.hstats[14].mean, oWin14: ss.hstats[14].winRate,
  };
}

const FRESH_CUTOFF_DAYS = 30;

export function getFreshStocks(trades) {
  if (!Array.isArray(trades) || trades.length === 0) return [];
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - FRESH_CUTOFF_DAYS);
  const grouped = {};
  for (const t of trades) {
    if (!t.signal_date) continue;
    const d = new Date(t.signal_date);
    if (d < cutoff) continue;
    const sym = t.symbol;
    if (!grouped[sym]) grouped[sym] = { symbol: sym, trades: [], dates: [] };
    grouped[sym].trades.push(t);
    grouped[sym].dates.push(t.signal_date);
  }
  return Object.values(grouped)
    .map(entry => {
      const dates = entry.dates.sort();
      const rtns = entry.trades.map(t => vl(t.return_14d)).filter(v => isFinite(v));
      return {
        symbol: entry.symbol,
        count: entry.trades.length,
        lastDate: dates[dates.length - 1] || '',
        avgReturn14d: rtns.length ? mn(rtns) : NaN,
        trades: entry.trades,
      };
    })
    .sort((a, b) => new Date(b.lastDate) - new Date(a.lastDate));
}
