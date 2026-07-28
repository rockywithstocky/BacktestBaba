# ADR-004: AI Proxy Security Hardening

**Status:** Implemented  
**Date:** 2026-07-23  

## Context

The AI Trade Check widget (ADR-003) calls external LLM APIs (OpenAI, Anthropic, DeepSeek, Groq, Google, Zen) from the browser. Major providers (OpenAI, Anthropic, etc.) support CORS and can be called directly. Providers like OpenCode Zen do not support CORS, requiring a backend proxy (`POST /api/ai/chat`) to forward requests server-to-server.

The initial implementation had several security gaps:

1. **Open relay / SSRF** — The proxy accepted arbitrary `baseUrl` values and proxied POST requests to any HTTP(S) endpoint with no domain validation.
2. **No authentication** — Anyone who could reach the backend could call the proxy.
3. **API key in cleartext localStorage** — Persisted across sessions, readable by any script via XSS.
4. **No Content Security Policy** — Frontend had no CSP headers, increasing XSS blast radius.
5. **No rate limiting** — Proxy could be abused for large-scale requests.
6. **Upstream error leakage** — Raw error bodies from external AI APIs were forwarded to the frontend.

## Decision

### 1. Domain Allowlist (SSRF Mitigation)

Replace the open `_build_ai_url()` with `_resolve_endpoint()` that validates the `baseUrl` hostname against a hardcoded allowlist before proxying:

```python
AI_PROXY_ALLOWLIST = {
    "opencode.ai",
    "api.openai.com",
    "api.anthropic.com",
    "api.deepseek.com",
    "api.groq.com",
    "generativelanguage.googleapis.com",
}
```

Extensible via `AI_PROXY_ALLOWLIST` env var (comma-separated domains). Unknown providers (no `baseUrl`) resolve from `AI_KNOWN_ENDPOINTS` dict. SSRF attempts (internal IPs, cloud metadata endpoints) are blocked at the allowlist check.

### 2. Auth Gate

The `/api/ai/chat` endpoint requires a valid `Authorization: Bearer <session_token>` header, using the same `_validate_token()` function as all other protected endpoints. The frontend reads the token from `localStorage['auth_token']` (already stored by the auth service) and includes it in proxy requests.

**Design choice:** Auth is checked BEFORE the allowlist and rate limiter — fail-fast on auth prevents unnecessary work.

### 3. sessionStorage for API Keys

The AI provider API key (`ai_api_key`) was moved from `localStorage` to `sessionStorage`:
- Cleared when the browser tab is closed (reduced exposure window)
- Not persisted to disk by the browser
- One-time migration: on first read, if a key exists in `localStorage` but not in `sessionStorage`, it is moved and the `localStorage` entry is deleted
- The model config (preset, model name, base URL) remains in `localStorage` (not sensitive)

### 4. Content Security Policy

Added `<meta http-equiv="Content-Security-Policy">` to `index.html`:
- `default-src 'self'` — baseline
- `style-src 'self' 'unsafe-inline'` — required for Framer Motion inline styles
- `connect-src 'self' ws: wss: http://localhost:* https://*.render.com https://*.vercel.app https://*.up.railway.app` — API and WebSocket connections
- `img-src 'self' data:` — Recharts SVG rendering
- `font-src 'self'` — Tailwind font assets

### 5. Rate Limiting

Simple in-memory per-IP counter: 30 requests per 60-second sliding window. Implemented with a dict of IP → timestamp list, cleaned on each check. Separate from auth — fires after auth gate, before upstream call.

### 6. Sanitized Error Messages

All upstream AI API error bodies are replaced with generic messages:
- `"Upstream AI provider is unreachable. Check the endpoint URL."` (network errors)
- `"Upstream AI provider returned HTTP {status}. Verify your API key and model name."` (HTTP errors)

Full error details are logged server-side via `logger.warning` for debugging, but never forwarded to the client.

## File Changes

| File | Change |
|------|--------|
| `backend/main.py` | Replaced `_build_ai_url/_build_ai_body/_build_ai_headers` with `_resolve_endpoint` (allowlist), `_check_rate_limit` (rate limiter), added auth gate to `ai_proxy` handler, sanitized error messages |
| `frontend/src/analyzer/aiConfig.js` | `getApiKey` / `saveApiKey` migrated from `localStorage` to `sessionStorage` with migration path |
| `frontend/src/analyzer/aiApi.js` | `tryProxyCall` and test connection fallback include `Authorization: Bearer <token>` header from `localStorage['auth_token']` |
| `frontend/index.html` | Added `Content-Security-Policy` meta tag |

## New Test Files

| File | Tests | What It Covers |
|------|-------|----------------|
| `backend/tests/test_ai_proxy.py` | 20 | Endpoint resolution for known/custom/unknown providers, SSRF blocking (metadata, internal IPs, evil domains), rate limiter boundary conditions (first, under, at limit, per-IP independence, window expiry), error message sanitization |
| `frontend/src/__tests__/test_ai_proxy_security.test.js` | 10 | sessionStorage read/write, localStorage migration, auth token header injection in proxy calls |

## Verification

- All 6 security layers tested independently via unit tests (20 backend + 10 frontend)
- Integration test confirms proxy returns 401 without auth, 403 for disallowed domains, 429 over rate limit
- Zero regressions in existing tests: 92 frontend + 85 backend (177 total)
- Docker compose: 4/4 containers healthy
- Frontend build: 2792 modules, no errors
