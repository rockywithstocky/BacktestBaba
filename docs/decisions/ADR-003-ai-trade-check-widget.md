# ADR-003: AI Trade Check Widget — Floating Chat Bubble for Live Market Context

## Status
Accepted

## Date
2026-07-23

## Context
Traders using the backtester need a quick "second opinion" on a selected stock before committing real capital. They want:

1. Live market context (ADX, RSI, volume pattern, VCP, driving forces) for a specific stock
2. A sanity check on their risk plan (position size, target, stop-loss, RR ratio)
3. All presented in a crisp, glanceable format — no narrative fluff, no uncertain language

Key constraints:
- **Zero backend changes** — the AI runs entirely from the browser using the user's own API key
- **Zero visual impact on existing UI** — no existing component is visually modified or nudged
- **Self-contained** — the widget must be mountable with +1 line in App.jsx
- **Multi-provider** — support OpenAI, Anthropic, Google, DeepSeek, Groq, and any OpenAI-compatible endpoint
- **Structured output** — the AI must return deterministic JSON that the widget renders as cards

## Decision
Build a **floating AI chat bubble** (AITradeCheck) that sits at bottom-right, reads per-stock analysis context via a silent module bridge (aiBridge.js), and calls the user's chosen LLM directly from the browser.

### Architecture

```
StockLookupPanel ──useEffect──→ aiBridge.setContext(symbolData)
                                       ↓
AITradeCheck widget ──getContext()──→ aiBridge
       │
       ├── user clicks "Run Analysis"
       ├── callLLM(systemPrompt + context, config)
       ├── LLM returns structured JSON
       └── renders two cards: Market Context + Trade Plan + AI Verdict
```

### Components

| File | Role |
|------|------|
| `aiBridge.js` | Module-level store (~10 lines). `setContext`/`getContext`. No React state, no renders. |
| `aiConfig.js` | 6 model presets (OpenAI, Anthropic, Google, DeepSeek, Groq, Custom). localStorage persistence for key + config. |
| `aiApi.js` | `buildSystemPrompt(context)` assembles a zero-uncertainty system prompt with the user's actual numbers. `callLLM()` routes to OpenAI-compatible or Anthropic API format. |
| `AITradeCheck.jsx` | Floating widget (~280 lines). Bubble → settings flyout → Run Analysis → result with verdict bar + cards + follow-up input. |

### Design
- **Verdict bar** — signature element: a colored strip (green/amber/red) at the top of the result that tells the trader in 100ms whether the AI sees alignment or conflict
- **Indigo accent** — deliberately departs from dashboard's emerald to visually distinguish the AI voice from the platform
- **Spring animation** matching AnalyzerPanel's motion language
- **Surface colors** `#0f1119` / `#1a1d2e` — slightly cooler than dashboard grays for visual separation

## Alternatives Considered

### Embed AI chat in AnalyzerPanel as a 4th tab
- Pros: No floating widget needed
- Cons: Tab would need to persist across stock changes; would visually alter the AnalyzerPanel; harder to access when AnalyzerPanel is closed

### Backend proxy for LLM calls
- Pros: API key stays server-side; can add web search enrichment
- Cons: Requires backend changes, adds latency, introduces cost/rate-limit concerns
- **Rejected:** User explicitly requires "zero backend changes"

### Streamed response (SSE/WebSocket)
- Pros: Real-time token-by-token display
- Cons: Structured JSON output is single-shot; streaming adds complexity for no UX benefit with structured data
- **Rejected:** One-shot JSON parse is simpler and faster

## Consequences
- **Positive:** No backend changes needed; user brings their own API key and model; zero regression on existing tests and builds
- **Positive:** Widget auto-detects the selected stock in AnalyzerPanel via aiBridge — no user action needed to "connect" them
- **Positive:** Multi-provider support means users can choose cost/performance tradeoffs
- **Trade-off:** AI market context depends on the model's training data recency — models with web search (GPT-4o browsing, Gemini grounding) will give more current data
- **Trade-off:** API key stored in localStorage — acceptable for this use case (personal tool, no sensitive data), but users should be aware

## Verification
- [x] 76/76 frontend tests pass (no regression)
- [x] `npm run build` succeeds (no new warnings)
- [x] Docker compose builds both images (backend + frontend)
- [x] Docker compose starts 4/4 containers healthy (db, backend, frontend, pgadmin)
- [x] Backend (port 8000) and frontend (port 5174) return HTTP 200
- [x] Only 2 existing files modified: `App.jsx` (+2 lines), `StockLookupPanel.jsx` (+3 lines)
