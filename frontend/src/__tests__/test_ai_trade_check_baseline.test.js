import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock aiBridge ───────────────────────────────────────────────────────────
const mockContext = {
  ps: { avg14: 12.5, win14: 65, sharpe14: 1.2, tier: 'Well-tested', n14: 42 },
  plan: { capital: 100000, positionCost: 25000, shares: 50, targetReturn: 15, targetPrice: 1150, stopLossPercent: 5, actualRR: 3, netGain: 3750, netLoss: 1250 },
  riskProfile: { avgDrawdown: -3.2, maxDrawdown: -8.1, avgRunup: 6.5, kelly: 0.25, winRate: 62 },
};

const subscribers = new Set();
vi.mock('../analyzer/aiBridge', () => ({
  getContext: () => null,
  subscribe: (fn) => { subscribers.add(fn); return () => subscribers.delete(fn); },
  setContext: (ctx) => subscribers.forEach(fn => fn(ctx)),
}));

const mockCallLLM = vi.fn().mockResolvedValue({ position_check: { verdict: 'VERIFIED' }, market_context: null });
vi.mock('../analyzer/aiApi', async () => {
  const actual = await vi.importActual('../analyzer/aiApi');
  return {
    ...actual,
    callLLM: (...args) => mockCallLLM(...args),
    testConnection: vi.fn(),
  };
});

vi.mock('../analyzer/aiConfig', () => ({
  getSavedConfig: () => ({ presetId: 'openai', model: 'gpt-4o', baseUrl: 'https://api.openai.com/v1/chat/completions' }),
  saveConfig: vi.fn(),
  getApiKey: () => 'sk-test-key',
  saveApiKey: vi.fn(),
  getPresets: () => [
    { id: 'openai', name: 'OpenAI', provider: 'openai', baseUrl: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o' },
    { id: 'custom', name: 'Custom', provider: 'openai', baseUrl: '', model: '' },
  ],
  resolveConfig: (pid, overrides) => ({
    provider: 'openai',
    baseUrl: overrides?.baseUrl || 'https://api.openai.com/v1/chat/completions',
    model: overrides?.model || 'gpt-4o',
  }),
}));

// ── REGRESSION BASELINE: Current behavior before refactor ───────────────────

describe('Baseline: AITradeCheck render stability', () => {
  beforeEach(() => { subscribers.clear(); mockCallLLM.mockReset(); document.body.innerHTML = ''; });

  it('renders the bubble button without crashing (no context)', async () => {
    const AITradeCheck = (await import('../analyzer/AITradeCheck')).default;
    const { render } = await import('@testing-library/react');
    const { default: React } = await import('react');
    const container = document.createElement('div');
    document.body.appendChild(container);
    render(React.createElement(AITradeCheck), { container });
    expect(document.querySelector('[title="AI Trade Check"]')).toBeTruthy();
    document.body.removeChild(container);
  });

  it('shows idle state text when no stock selected', async () => {
    const AITradeCheck = (await import('../analyzer/AITradeCheck')).default;
    const { render, fireEvent } = await import('@testing-library/react');
    const { default: React } = await import('react');
    const container = document.createElement('div');
    document.body.appendChild(container);
    render(React.createElement(AITradeCheck), { container });
    fireEvent.click(document.querySelector('[title="AI Trade Check"]'));
    await vi.dynamicImportSettled?.();
    const body = document.body.textContent || '';
    expect(body).toContain('Ask anything about trading');
    document.body.removeChild(container);
  });
});

describe('Baseline: buildSystemPrompt output stability', () => {
  it('returns empty string for null context', async () => {
    const { buildSystemPrompt } = await import('../analyzer/aiApi');
    expect(buildSystemPrompt(null)).toBe('');
  });

  it('includes avg14 and win14 when context provided', async () => {
    const { buildSystemPrompt } = await import('../analyzer/aiApi');
    const result = buildSystemPrompt(mockContext);
    expect(result).toContain('12.50%');
    expect(result).toContain('65.0%');
  });
});

describe('Baseline: aiBridge subscription fires on setContext', () => {
  it('notifies subscribers when context changes', async () => {
    const { subscribe, setContext } = await import('../analyzer/aiBridge');
    const handler = vi.fn();
    const unsub = subscribe(handler);
    setContext(mockContext);
    expect(handler).toHaveBeenCalledWith(mockContext);
    unsub();
  });
});

// ── PRICE INJECTION: Pattern detection ──────────────────────────────────────

describe('Price injection: keyword pattern detection', () => {
  const PRICE_PATTERNS = [
    /current\s+price/i,
    /live\s+price/i,
    /what('s| is) (the )?price/i,
    /how\s+much\s+is/i,
    /market\s+price/i,
    /today('s)?\s*price/i,
    /spot\s+price/i,
    /last\s+trade/i,
    /ltp/i,
  ];

  function hasPriceIntent(text) {
    return PRICE_PATTERNS.some(p => p.test(text));
  }

  const SYMBOL_PATTERN = /\b[A-Z]{1,8}\b/g;

  function extractSymbol(text, knownSymbols) {
    const matches = text.match(SYMBOL_PATTERN);
    if (!matches) return null;
    for (const m of matches) {
      const s = m + '.NS';
      if (knownSymbols.includes(s)) return s;
    }
    return null;
  }

  it('detects "current price" intent', () => {
    expect(hasPriceIntent('what is the current price of RELIANCE')).toBe(true);
  });

  it('detects "live price" intent', () => {
    expect(hasPriceIntent('show live price for HDFCBANK')).toBe(true);
  });

  it('detects "how much is" intent', () => {
    expect(hasPriceIntent('how much is INFY trading at')).toBe(true);
  });

  it('detects LTP intent', () => {
    expect(hasPriceIntent('what is the LTP of TCS')).toBe(true);
  });

  it('does not trigger on unrelated text', () => {
    expect(hasPriceIntent('explain the moving average crossover')).toBe(false);
    expect(hasPriceIntent('what is your opinion on this stock')).toBe(false);
  });

  it('extracts symbol from message text', () => {
    const known = ['RELIANCE.NS', 'HDFCBANK.NS', 'TCS.NS'];
    expect(extractSymbol('what about RELIANCE', known)).toBe('RELIANCE.NS');
    expect(extractSymbol('check TCS price', known)).toBe('TCS.NS');
  });

  it('returns null for unknown symbol', () => {
    const known = ['RELIANCE.NS', 'HDFCBANK.NS'];
    expect(extractSymbol('what about INFY', known)).toBeNull();
  });

  it('returns null when no symbol pattern in message', () => {
    expect(extractSymbol('what is the current price', ['RELIANCE.NS'])).toBeNull();
  });
});

// ── DRAG: Pointer event isolation ───────────────────────────────────────────

describe('Drag: event isolation', () => {
  it('header pointerdown should initiate drag', () => {
    const header = { tagName: 'DIV', dataset: { dragHandle: 'true' }, closest: (s) => {
      if (s === '[data-drag-handle]') return header;
      return null;
    }};
    const body = { tagName: 'BUTTON', dataset: {}, closest: (s) => null };
    const isDragHandle = (el) => el?.closest?.('[data-drag-handle]') || el?.dataset?.dragHandle === 'true';
    expect(isDragHandle(header)).toBeTruthy();
    expect(isDragHandle(body)).toBeFalsy();
  });

  it('click on body is not swallowed by drag', () => {
    let dragActive = false;
    const bodyClick = vi.fn();
    const onPointerDown = (e) => {
      if (e.target.closest('[data-drag-handle]')) { dragActive = true; return; }
    };
    const onPointerUp = () => { if (!dragActive) bodyClick(); dragActive = false; };
    const mockEvent = { target: { closest: () => null } };
    onPointerDown(mockEvent);
    onPointerUp();
    expect(bodyClick).toHaveBeenCalled();
  });
});
