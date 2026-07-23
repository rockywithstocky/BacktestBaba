const STT_RATE = 0.001;
const TXN_RATE = 0.0000325;
const STAMP_RATE = 0.00015;
const SEBI_RATE = 0.000001;
const GST_RATE = 0.18;
const DP_FLAT = 15.34;
const STCG_RATE = 0.156;

export function vl(v) {
  if (v === null || v === undefined || v === '') return NaN;
  const x = typeof v === 'string' ? +v : v;
  return isNaN(x) ? NaN : x;
}

export function costSingle(price) {
  const stt = STT_RATE * price * 2;
  const txn = TXN_RATE * price * 2;
  const stamp = STAMP_RATE * price;
  const sebi = SEBI_RATE * price * 2;
  const gst = GST_RATE * (txn + sebi);
  return stt + txn + stamp + sebi + gst + DP_FLAT;
}

export function costLadder(price, legs) {
  legs = legs || 4;
  let total = STT_RATE * price + STAMP_RATE * price;
  const each = price / legs;
  for (let i = 0; i < legs; i++) {
    total += STT_RATE * each + TXN_RATE * each + SEBI_RATE * each
      + GST_RATE * (TXN_RATE * each + SEBI_RATE * each) + DP_FLAT;
  }
  return total;
}

export function costBreakdown(price, isLadder) {
  const cFn = isLadder ? costLadder : costSingle;
  const total = cFn(price);
  const stt = STT_RATE * price * 2;
  const txn = TXN_RATE * price * 2;
  const stamp = STAMP_RATE * price;
  const sebi = SEBI_RATE * price * 2;
  const gst = GST_RATE * (txn + sebi);
  const dp = DP_FLAT;
  return { stt, txn, stamp, sebi, gst, dp, total, pct: (total / price) * 100 };
}

export function computeRiskPlan({ capital, riskPercent, stopLossPercent, rrRatio, entryPrice, isLadder }) {
  const cap = Math.max(0, capital || 0);
  const riskPct = Math.max(0.5, Math.min(20, riskPercent || 2)) / 100;
  const stopPct = Math.max(1, Math.min(30, stopLossPercent || 5)) / 100;
  const rr = Math.max(1, rrRatio || 2);

  const riskPerTrade = cap * riskPct;
  const maxLossPerShare = entryPrice > 0 ? entryPrice * stopPct : 0;
  const shares = maxLossPerShare > 0 ? Math.floor(riskPerTrade / maxLossPerShare) : 0;
  const positionCost = shares * entryPrice;

  const costs = isLadder ? costBreakdown(positionCost, true) : costBreakdown(positionCost, false);
  const netPosition = positionCost - costs.total;
  const rewardPerShare = entryPrice * stopPct * rr;
  const targetPrice = entryPrice + rewardPerShare;
  const targetReturn = (targetPrice - entryPrice) / entryPrice * 100;
  const grossGain = shares * rewardPerShare;
  const netGain = grossGain - (grossGain > 0 ? grossGain * STCG_RATE : 0);
  const grossLoss = shares * maxLossPerShare + costs.total;
  const netLoss = grossLoss;

  const actualRR = netLoss > 0 ? netGain / netLoss : 0;
  const pctOfCapital = cap > 0 ? (positionCost / cap) * 100 : 0;

  return {
    riskPerTrade,
    maxLossPerShare,
    shares,
    positionCost,
    costs,
    netPosition,
    rewardPerShare,
    targetPrice,
    targetReturn,
    grossGain,
    netGain,
    grossLoss,
    netLoss,
    actualRR,
    pctOfCapital,
    capital: cap,
    stopLossPercent: stopPct * 100,
    riskPercent: riskPct * 100,
  };
}

export function kellyFraction(winRate, avgWin, avgLoss) {
  if (!winRate || !avgWin || !avgLoss) return null;
  const w = winRate / 100;
  const b = avgWin / Math.abs(avgLoss);
  const k = w - ((1 - w) / b);
  return k > 0 ? k : null;
}

export function symbolRiskProfile(trades, symbol) {
  const st = trades.filter(t => t.symbol === symbol);
  if (st.length < 2) return null;

  const drawdowns = st
    .map(t => {
      const entry = vl(t.entry_price);
      const low = vl(t.max_low_90d);
      if (!isFinite(entry) || !isFinite(low) || entry <= 0) return NaN;
      return ((entry - low) / entry) * 100;
    })
    .filter(v => isFinite(v));

  const runups = st
    .map(t => {
      const entry = vl(t.entry_price);
      const high = vl(t.max_high_90d);
      if (!isFinite(entry) || !isFinite(high) || entry <= 0) return NaN;
      return ((high - entry) / entry) * 100;
    })
    .filter(v => isFinite(v));

  const returns = st.map(t => vl(t.return_14d)).filter(v => isFinite(v));
  const wins = returns.filter(v => v > 0).length;
  const winRate = returns.length > 0 ? (wins / returns.length) * 100 : 0;
  const avgWin = returns.length > 0
    ? returns.filter(v => v > 0).reduce((s, v) => s + v, 0) / Math.max(1, wins)
    : 0;
  const avgLoss = returns.length > 0
    ? Math.abs(returns.filter(v => v < 0).reduce((s, v) => s + v, 0)) / Math.max(1, returns.length - wins)
    : 0;

  const avgDrawdown = drawdowns.length > 0
    ? drawdowns.reduce((s, v) => s + v, 0) / drawdowns.length
    : 0;
  const maxDrawdown = drawdowns.length > 0 ? Math.max(...drawdowns) : 0;
  const avgRunup = runups.length > 0
    ? runups.reduce((s, v) => s + v, 0) / runups.length
    : 0;

  const suggestedStop = Math.max(5, Math.round(avgDrawdown * 1.2 / 5) * 5);
  const suggestedTarget = Math.round(avgRunup * 0.8 / 5) * 5;
  const avgReturn = returns.length > 0
    ? returns.reduce((s, v) => s + v, 0) / returns.length
    : 0;

  const kelly = kellyFraction(winRate, avgWin, avgLoss);

  return {
    trades: st.length,
    avgDrawdown,
    maxDrawdown,
    avgRunup,
    avgReturn,
    winRate,
    avgWin,
    avgLoss,
    kelly,
    suggestedStop: Math.max(3, Math.min(15, suggestedStop)),
    suggestedTarget,
    volatility: avgDrawdown > 0 ? avgDrawdown : null,
  };
}

export function tierConfig(capital) {
  const c = Math.max(2000, capital);
  const sS = Math.max(2000, Math.min(10000, Math.round(c * 0.15)));
  const bS = Math.max(2000, Math.min(7500, Math.round(c * 0.08)));
  const gS = Math.max(10000, Math.min(15000, Math.round(c * 0.10)));
  const sP = Math.max(1, Math.floor(c * 0.60 / sS));
  const bP = Math.max(1, Math.floor(c * 0.70 / bS));
  const gA = c * 0.75 >= gS;
  const gP = gA ? Math.max(1, Math.floor(c * 0.75 / gS)) : 0;

  return {
    starter: { size: sS, positions: sP, deployed: sS * sP, available: true, desc: 'Single exit' },
    balanced: { size: bS, positions: bP, deployed: bS * bP, available: c >= 20000, desc: 'Stops by horizon' },
    growth: { size: gS, positions: gP, deployed: gS * gP, available: gA && c >= 60000, desc: '4-way ladder' },
  };
}

export function riskBudget(tierName, capital, riskPercent) {
  const cfg = tierConfig(capital);
  const tier = cfg[tierName];
  if (!tier || !tier.available) return null;

  const riskPerTrade = capital * (riskPercent / 100);
  const maxPositionsByRisk = riskPerTrade > 0
    ? Math.floor(tier.deployed / riskPerTrade)
    : tier.positions;

  return {
    riskPerTrade,
    maxPositionsByRisk: Math.min(tier.positions, Math.max(1, maxPositionsByRisk)),
    totalPositions: tier.positions,
    capacityPct: Math.min(100, (maxPositionsByRisk / tier.positions) * 100),
  };
}
