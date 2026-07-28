import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Info } from 'lucide-react';
import { computeRiskPlan } from './riskEngine';

const RISK_OPTIONS = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5];
const STOP_OPTIONS = [3, 4, 5, 6, 7, 8, 10, 12, 15];
const RR_OPTIONS = [1, 1.5, 2, 2.5, 3];

export default function RiskControlBar({ capital, riskPercent, stopLossPercent, rrRatio, onChange, selectedSymbol, entryPrice, onEntryPriceChange }) {
  const [inputPrice, setInputPrice] = useState('');

  useEffect(() => {
    if (entryPrice && entryPrice > 0) {
      setInputPrice(String(Math.round(entryPrice)));
    }
  }, [entryPrice]);

  const price = Math.max(1, parseInt(inputPrice, 10) || 300);

  const riskPlan = computeRiskPlan({
    capital: capital || 100000,
    riskPercent,
    stopLossPercent,
    rrRatio,
    entryPrice: price,
    isLadder: false,
  });

  const handlePriceChange = (e) => {
    const raw = e.target.value.replace(/[^0-9]/g, '');
    setInputPrice(raw);
    if (onEntryPriceChange) {
      onEntryPriceChange(parseInt(raw, 10) || 300);
    }
  };

  const handlePriceBlur = () => {
    if (!inputPrice || parseInt(inputPrice, 10) < 1) {
      setInputPrice('300');
      if (onEntryPriceChange) onEntryPriceChange(300);
    }
  };

  return (
    <div>
      <div className="grid grid-cols-3 gap-2 mb-2">
        <div>
          <label className="block text-[10px] text-gray-500 mb-0.5 font-medium">
            Risk per trade
            <Info size={11} className="inline ml-1 text-gray-600 cursor-help -mt-0.5 align-middle"
              title="Max ₹ you're willing to lose per trade. 2% on ₹1L = max loss ₹2,000." />
          </label>
          <select
            value={riskPercent}
            onChange={e => onChange({ riskPercent: +e.target.value })}
            className="w-full bg-gray-700/50 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          >
            {RISK_OPTIONS.map(v => (
              <option key={v} value={v}>{v}%</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] text-gray-500 mb-0.5 font-medium">
            Stop-loss
            <Info size={11} className="inline ml-1 text-gray-600 cursor-help -mt-0.5 align-middle"
              title="Exit when price falls this % from your entry. Entry ₹500, stop 5% = exit ₹475." />
          </label>
          <select
            value={stopLossPercent}
            onChange={e => onChange({ stopLossPercent: +e.target.value })}
            className="w-full bg-gray-700/50 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          >
            {STOP_OPTIONS.map(v => (
              <option key={v} value={v}>{v}%</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] text-gray-500 mb-0.5 font-medium">
            Reward:Risk
            <Info size={11} className="inline ml-1 text-gray-600 cursor-help -mt-0.5 align-middle"
              title="Target profit vs stop loss. 1:2 with 5% stop means target is +10%." />
          </label>
          <select
            value={rrRatio}
            onChange={e => onChange({ rrRatio: +e.target.value })}
            className="w-full bg-gray-700/50 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          >
            {RR_OPTIONS.map(v => (
              <option key={v} value={v}>1:{v}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="mb-2">
        <label className="block text-[10px] text-gray-500 mb-0.5 font-medium">Entry at</label>
        <div className="relative">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-500 font-mono">₹</span>
          <input
            type="text"
            inputMode="numeric"
            value={inputPrice}
            onChange={handlePriceChange}
            onBlur={handlePriceBlur}
            placeholder="300"
            className="w-full bg-gray-700/50 border border-white/10 rounded-lg pl-6 pr-2 py-1.5 text-xs text-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          />
        </div>
      </div>

      <motion.div
        key={`${riskPercent}-${stopLossPercent}-${rrRatio}-${price}`}
        initial={{ opacity: 0.6 }}
        animate={{ opacity: 1 }}
        className="grid grid-cols-4 gap-1.5"
      >
        <div className="bg-gray-900/50 rounded-lg p-2 text-center">
          <div className="text-[9px] text-gray-500 uppercase tracking-wider">Position</div>
          <div className="text-xs font-bold text-white font-mono">
            ₹{riskPlan.positionCost.toLocaleString('en-IN')}
          </div>
        </div>
        <div className="bg-gray-900/50 rounded-lg p-2 text-center">
          <div className="text-[9px] text-gray-500 uppercase tracking-wider">Target</div>
          <div className="text-xs font-bold text-emerald-400 font-mono">
            +{riskPlan.targetReturn.toFixed(1)}%
          </div>
          <div className="text-[9px] text-gray-600">
            ₹{Math.round(riskPlan.targetPrice).toLocaleString('en-IN')}
          </div>
        </div>
        <div className="bg-gray-900/50 rounded-lg p-2 text-center">
          <div className="text-[9px] text-gray-500 uppercase tracking-wider">Gain</div>
          <div className="text-xs font-bold text-emerald-400 font-mono">
            +₹{Math.round(riskPlan.netGain).toLocaleString('en-IN')}
          </div>
        </div>
        <div className="bg-gray-900/50 rounded-lg p-2 text-center">
          <div className="text-[9px] text-gray-500 uppercase tracking-wider">Loss</div>
          <div className="text-xs font-bold text-red-400 font-mono">
            -₹{Math.round(riskPlan.netLoss).toLocaleString('en-IN')}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
