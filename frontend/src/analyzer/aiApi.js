const PROXY_ENDPOINT = (import.meta.env.VITE_API_URL || 'http://localhost:8000/api') + '/ai/chat';

function getAuthToken() {
  try {
    return localStorage.getItem('auth_token');
  } catch { return null; }
}

function normalizeConfig(config) {
  const { provider, baseUrl, model } = config;
  let normalizedUrl = baseUrl ? baseUrl.replace(/\/+$/, '') : '';
  let normalizedModel = model || '';

  if (normalizedModel.startsWith('opencode/')) {
    normalizedModel = normalizedModel.replace('opencode/', '');
  }

  if (provider === 'openai' && normalizedUrl && !normalizedUrl.endsWith('/chat/completions') && !normalizedUrl.includes('/chat/completions')) {
    if (!normalizedUrl.match(/\/v1\/?$/) && !normalizedUrl.match(/\/v1\/\w+$/)) {
      normalizedUrl += '/chat/completions';
    } else {
      normalizedUrl = normalizedUrl.replace(/\/?$/, '/chat/completions');
    }
  }

  return { provider, baseUrl: normalizedUrl, model: normalizedModel };
}

export function buildSystemPrompt(ctx) {
  if (!ctx || !ctx.ps) return '';

  const { ps, plan, riskProfile, st } = ctx;
  const n = st ? st.length : 0;

  return `You are a direct, no-nonsense market analyst for Indian stocks.
You receive a trader's backtest data and risk plan for a specific stock.
Output ONLY valid JSON. No markdown, no comments, no code fences.

INPUT DATA:
Symbol: ${typeof ps === 'object' && ps !== null && ps.constructor === Object ? (ps.n14 !== undefined ? 'present' : 'present') : 'unknown'}
- Avg 14d return: ${ps.avg14 != null ? ps.avg14.toFixed(2) + '%' : 'N/A'}
- Win rate (14d): ${ps.win14 != null ? ps.win14.toFixed(1) + '%' : 'N/A'}
- Risk score: ${ps.sharpe14 != null ? ps.sharpe14.toFixed(2) : 'N/A'}
- Data tier: ${ps.tier || 'N/A'}
- Trades with 14d data: ${ps.n14 != null ? ps.n14 : 'N/A'}

Risk Plan:
- Capital: ₹${plan?.capital != null ? Math.round(plan.capital).toLocaleString('en-IN') : 'N/A'}
- Position size: ₹${plan?.positionCost != null ? Math.round(plan.positionCost).toLocaleString('en-IN') : 'N/A'}
- Shares: ~${plan?.shares != null ? plan.shares : 'N/A'}
- Entry price: ₹${plan?.capital != null && plan?.shares != null && plan.shares > 0 ? Math.round(plan.capital * (plan.positionCost / plan.capital) / plan.shares) : 'N/A'}
- Target: ${plan?.targetReturn != null ? '+' + plan.targetReturn.toFixed(1) + '%' : 'N/A'} (₹${plan?.targetPrice != null ? Math.round(plan.targetPrice).toLocaleString('en-IN') : 'N/A'})
- Stop: -${plan?.stopLossPercent != null ? plan.stopLossPercent.toFixed(1) + '%' : 'N/A'}
- Risk:Reward: 1:${plan?.actualRR != null ? plan.actualRR.toFixed(1) : 'N/A'}
- Net gain if target hit: +₹${plan?.netGain != null ? Math.round(plan.netGain).toLocaleString('en-IN') : 'N/A'}
- Net loss if stopped: -₹${plan?.netLoss != null ? Math.round(plan.netLoss).toLocaleString('en-IN') : 'N/A'}

${riskProfile ? `Historical Risk Profile:
- Avg drawdown: ${riskProfile.avgDrawdown != null ? riskProfile.avgDrawdown.toFixed(1) + '%' : 'N/A'}
- Max drawdown: ${riskProfile.maxDrawdown != null ? riskProfile.maxDrawdown.toFixed(1) + '%' : 'N/A'}
- Avg run-up: ${riskProfile.avgRunup != null ? riskProfile.avgRunup.toFixed(1) + '%' : 'N/A'}
- Kelly fraction: ${riskProfile.kelly != null ? (riskProfile.kelly * 100).toFixed(1) + '%' : 'N/A'}
- Historical win rate: ${riskProfile.winRate != null ? riskProfile.winRate.toFixed(1) + '%' : 'N/A'}
` : ''}

RULES:
1. Use your training data for current market context (price levels, sector trends, recent news).
2. NEVER use uncertain language: no "may", "could", "might", "probably", "I think", "suggests", "potentially".
3. Every statement must be direct and deterministic.
4. Never give buy/sell/hold advice.
5. Evaluate the user's risk plan against market context.

OUTPUT JSON SCHEMA (adhere strictly):
{
  "market_context": {
    "adx": <number or null>,
    "adx_label": "Trending" | "Ranging" | "Weak" | null,
    "rsi": <number or null>,
    "rsi_label": "Overbought" | "Neutral" | "Oversold" | null,
    "volume_insight": "<string>",
    "vcp_pattern": "<string or null>",
    "driving_forces": ["<bullet 1>", "<bullet 2>", ...]
  },
  "stress_test": {
    "adverse_scenario": "<string>",
    "impact_on_position": "<string>"
  },
  "scoring": {
    "risk": <0-10>,
    "opportunity": <0-10>,
    "readiness": "HIGH" | "MODERATE" | "LOW"
  },
  "position_check": {
    "verdict": "VERIFIED" | "CAUTION" | "RECONSIDER",
    "reasons": ["<reason 1>", "<reason 2>", ...]
  },
  "ai_verdict": ["<bullet 1>", "<bullet 2>", "<bullet 3>"]
}

APPEND this exact disclaimer at the end of your ai_verdict array:
"For educational purposes only. Not a recommendation."`;
}

async function tryDirectCall({ provider, baseUrl, model, apiKey, messages }) {
  if (provider === 'anthropic') {
    const systemMsg = messages.find(m => m.role === 'system');
    const otherMessages = messages.filter(m => m.role !== 'system');

    const body = {
      model,
      max_tokens: 4096,
      system: systemMsg ? systemMsg.content : '',
      messages: otherMessages.map(m => ({
        role: m.role,
        content: m.content,
      })),
    };

    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Anthropic API error (${res.status}): ${err}`);
    }

    const data = await res.json();
    const text = data.content?.[0]?.text || '';
    return parseAIResponse(text);
  }

  const body = {
    model,
    messages: messages.map(m => ({
      role: m.role,
      content: m.content,
    })),
    max_tokens: 4096,
    temperature: 0.1,
  };

  const res = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API error (${res.status}): ${err}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || '';
  return parseAIResponse(text);
}

async function tryProxyCall({ provider, model, messages, apiKey, baseUrl }) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getAuthToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(PROXY_ENDPOINT, {
    method: 'POST',
    headers,
    body: JSON.stringify({ provider, model, messages, apiKey, baseUrl }),
  });

  if (!res.ok) {
    const err = await res.text();
    let msg = `Proxy error (${res.status})`;
    try { const j = JSON.parse(err); msg = j.detail || msg; } catch {}
    throw new Error(msg);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || '';
  return parseAIResponse(text);
}

export async function callLLM({ messages, config, apiKey }) {
  const { provider, baseUrl, model } = normalizeConfig(config);

  if (!apiKey) throw new Error('API key is required');
  if (!baseUrl) throw new Error('Base URL is required');
  if (!model) throw new Error('Model is required');

  try {
    return await tryDirectCall({ provider, baseUrl, model, apiKey, messages });
  } catch (directErr) {
    if (directErr instanceof TypeError || directErr.message === 'Failed to fetch' || directErr.message.includes('NetworkError')) {
      try {
        return await tryProxyCall({ provider, model, messages, apiKey, baseUrl });
      } catch (proxyErr) {
        throw new Error(`Direct call failed (likely CORS), and proxy also failed: ${proxyErr.message}`);
      }
    }
    throw directErr;
  }
}

async function testDirectConnection({ provider, baseUrl, model, apiKey }) {
  if (provider === 'anthropic') {
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      }),
    });
    if (res.ok) return { ok: true };
    const err = await res.text();
    const short = err.length > 200 ? err.slice(0, 200) + '…' : err;
    return { ok: false, error: `HTTP ${res.status}: ${short}` };
  }

  const res = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 1,
      temperature: 0,
    }),
  });
  if (res.ok) return { ok: true };
  const err = await res.text();
  const short = err.length > 200 ? err.slice(0, 200) + '…' : err;
  return { ok: false, error: `HTTP ${res.status}: ${short}` };
}

export async function testConnection({ config, apiKey }) {
  const { provider, baseUrl, model } = normalizeConfig(config);

  if (!apiKey) return { ok: false, error: 'API key is required' };
  if (!baseUrl) return { ok: false, error: 'Base URL is required' };
  if (!model) return { ok: false, error: 'Model is required' };

  try {
    return await testDirectConnection({ provider, baseUrl, model, apiKey });
  } catch (e) {
    if (e instanceof TypeError || e.message === 'Failed to fetch' || e.message.includes('NetworkError')) {
      try {
        const proxyHeaders = { 'Content-Type': 'application/json' };
        const ptoken = getAuthToken();
        if (ptoken) proxyHeaders['Authorization'] = `Bearer ${ptoken}`;
        const res = await fetch(PROXY_ENDPOINT, {
          method: 'POST',
          headers: proxyHeaders,
          body: JSON.stringify({ provider, model, messages: [{ role: 'user', content: 'hi' }], apiKey, baseUrl }),
        });
        if (res.ok) return { ok: true };
        const err = await res.text();
        let msg;
        try { const j = JSON.parse(err); msg = j.detail || err; } catch { msg = err; }
        const short = msg.length > 200 ? msg.slice(0, 200) + '…' : msg;
        return { ok: false, error: `Proxy HTTP ${res.status}: ${short}` };
      } catch (proxyErr) {
        return { ok: false, error: `CORS error (direct failed) and proxy also failed: ${proxyErr.message}` };
      }
    }
    return { ok: false, error: e.message || 'Network error — check base URL' };
  }
}

export async function fetchLatestPrice(symbol, signal) {
  const base = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';
  try {
    const res = await fetch(`${base}/latest-price/${encodeURIComponent(symbol)}`, { signal });
    if (!res.ok) return null;
    const data = await res.json();
    return data.price;
  } catch {
    return null;
  }
}

function parseAIResponse(text) {
  const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  try {
    const parsed = JSON.parse(cleaned);
    return parsed;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {}
    }
    throw new Error('AI response was not valid JSON. Try again or switch model.');
  }
}
