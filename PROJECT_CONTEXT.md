# Project Context — BacktestBaba

**What:** Stock screener backtester — upload a CSV of trading signals, get back 6-horizon returns (7/14/30/45/60/90d), sector enrichment, and trade analytics with real-time WebSocket progress.

**Live at:** [chartchampion.vercel.app](https://chartchampion.vercel.app) (frontend) + [backtestbaba-api.onrender.com](https://backtestbaba-api.onrender.com) (backend)

**Branch:** `feat/d1-persistence` — active development. Ready to merge to `main` for deployment.

**Architecture:** Fully self-contained Python backend + React SPA. Zero external service dependencies:
- Data from yfinance (free public API)
- Caching via diskcache (file-based SQLite)
- No database needed (`PERSISTENCE_ENABLED=false` by default)
- Optional PostgreSQL (Docker) or Cloudflare D1 (production)

**Latest work (Jul 18, 2026):** Fixed Latest Return column showing N/A. Root cause was stale per-entry-mode caches skipping Phase B. Fix: seed `{sym}_latest_price` in `persist_symbol_data` + add OHLCV cache fallback in `get_latest_prices_batch`. 85 backend tests, 21 frontend tests.

**Deployment:** Zero-cost. Render free tier (backend) + Vercel free tier (frontend). Push to `main` triggers auto-deploy.
