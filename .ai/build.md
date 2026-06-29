# build.md — BacktestBaba Build & CI/CD

> **Produced by**: Principal Engineer + Senior Architect joint discovery  
> **Method**: Every file read. Nothing invented. Gaps explicitly stated.

---

## Build Commands

### Frontend (Vite/React)

| Command | Script | Location | What it does |
|---|---|---|---|
| `npm run dev` | `"dev": "vite"` | `frontend/package.json:7` | Starts Vite development server with hot-reload on port 5173 |
| `npm run build` | `"build": "vite build"` | `frontend/package.json:8` | Creates production bundle in `frontend/dist/` |
| `npm run lint` | `"lint": "eslint ."` | `frontend/package.json:9` | Runs ESLint on all frontend source files |
| `npm run preview` | `"preview": "vite preview"` | `frontend/package.json:10` | Serves the production build locally for preview |

**Evidence**: `frontend/package.json:7-10`

### Backend (Python/FastAPI)

No build step — Python is interpreted. The equivalent is dependency installation:

| Command | What it does |
|---|---|
| `pip install -r backend/requirements.txt` | Installs all Python dependencies (fastapi, uvicorn, yfinance, pandas, diskcache, etc.) |
| `python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000` | Starts the development server with hot-reload |

**Evidence**: `backend/requirements.txt:1-50`, `README.md:57-72`

### Docker

| Command | What it does | Evidence |
|---|---|---|
| `docker-compose build` | Builds all 3 container images (backend, frontend, cache) | `docker-compose.yml:1-72` |
| `docker-compose up -d` | Starts all services in detached mode | `DOCKER_SETUP.md:36` |
| `docker-compose -f docker-compose.yml -f docker-compose.dev.yml up` | Starts with hot-reload volume mounts | `docker-compose.dev.yml:1-21` |
| `docker build -f Dockerfile.backend -t backtestbaba-backend:prod .` | Production backend image build | `DOCKER_SETUP.md:181` |
| `docker build -f Dockerfile.frontend -t backtestbaba-frontend:prod .` | Production frontend image build | `DOCKER_SETUP.md:182` |

## Test Commands

### Backend unit tests (no internet required)
```powershell
cd "d:\AI\Stock Market\ChartInk\BacktestBaba"
python -m pytest backend/tests/test_backtester.py -v --asyncio-mode=auto
```
**Evidence**: `backend/tests/test_backtester.py:1-83`

### All backend tests
```powershell
python -m pytest backend/tests/ -v --asyncio-mode=auto
```
**Evidence**: `backend/tests/test_backtester.py:1-83`, `backend/tests/test_integration.py:1-48`

### Regression test (internet required)
```powershell
python backend/tests/verify_regression.py
```
**Evidence**: `backend/tests/verify_regression.py:1-40`

### Frontend lint
```powershell
cd frontend
npm run lint
```
**Evidence**: `frontend/package.json:9`

### Docker test commands
```powershell
docker-compose exec backend pytest backend/tests/ -v --asyncio-mode=auto
docker-compose exec frontend npm run lint
```
**Evidence**: `DOCKER_SETUP.md:66-73`

## Lint Commands

| Tool | Command | Config file | Evidence |
|---|---|---|---|
| ESLint (frontend) | `cd frontend && npm run lint` | `frontend/eslint.config.js` (implied by `@eslint/js`) | `frontend/package.json:22,28-30` |
| Python lint | Not found in codebase | Not found in codebase | No linting configuration exists for Python files |

## Packaging Process

### Frontend production build
The `npm run build` command produces a static site in `frontend/dist/`. The build:
- Compiles JSX to JavaScript via `@vitejs/plugin-react`
- Bundles with Vite/Rollup
- Outputs minified CSS and JS files

**Evidence**: `frontend/vite.config.js:1-7`, `frontend/package.json:8`

### Backend
No packaging — Python files are deployed as-is. The `Dockerfile.backend:1-27` copies the entire project directory into the container.

## Release Process

### Vercel deployment (frontend)
Configured in `vercel.json:1-34`:
- Root directory: project root
- Frontend build via `@vercel/static-build` at `frontend/package.json`
- Backend Python via `@vercel/python` at `backend/**/*.py` (not currently used — backend is on Render)
- Routes: `/api/(.*)` → `backend/$1`, all others → `frontend/$1`
- Auto-deploys on push to `main` branch

### Render deployment (backend)
- Start command: `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`
- Build command: `pip install -r backend/requirements.txt`
- Auto-deploys on push to `main` branch
- Free tier sleeps after 15 minutes of inactivity

**Evidence**: `DEPLOYMENT.md:20-51`, `DOCKER_SETUP.md:178-189`

## CI/CD Workflow

### Automatic deployment
Both Render and Vercel support auto-deployment from GitHub:
1. Push to `main` branch
2. Render detects push → rebuilds backend (3-5 minutes)
3. Vercel detects push → rebuilds frontend (2-3 minutes)
4. Changes go live automatically

**Evidence**: `DEPLOYMENT.md:23-64`, `DEPLOYMENT_ROADMAP.md:23-62`

### Known CI gaps
- No pre-deploy test runner configured
- No GitHub Actions or similar CI pipeline found
- No linting gate before deployment
- No automated integration test run on push
- **Evidence**: No `.github/` directory found in repository

## Docker Image Artifacts

### Backend image (`Dockerfile.backend:1-27`)
- Base: `python:3.11-slim`
- System packages: `gcc`
- Python packages: all from `backend/requirements.txt`
- Working directory: `/app/project`
- CMD: `uvicorn backend.main:app --host 0.0.0.0 --port 8000`
- Health check: HTTP GET to port 8000

### Frontend image (`Dockerfile.frontend:1-38`)
- Stage 1 (build): `node:18-alpine`, `npm ci`, `npm run build`
- Stage 2 (runtime): `node:18-alpine`, `serve` package
- Serves static files from `/app/dist` on port 5174
- Health check: HTTP GET to port 5174
