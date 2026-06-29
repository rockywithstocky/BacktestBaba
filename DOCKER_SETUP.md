# Docker Setup Guide — BacktestBaba

Complete containerized local development environment with separate app and infra services.

## Architecture

```
┌─────────────────────────────────────────────────┐
│        backtestbaba-network (bridge)            │
├──────────────────┬──────────────┬───────────────┤
│  Frontend        │   Backend    │    Cache      │
│  (Node/React)    │   (Python)   │   (Redis)     │
│  Port: 5174      │  Port: 8000  │   Port: 6379  │
└──────────────────┴──────────────┴───────────────┘
```

- **App Layer**: Frontend (React/Vite) + Backend (FastAPI)
- **Infra Layer**: Redis cache (bridge-networked)
- **Communication**: Docker bridge network (`backtestbaba-network`)

## Prerequisites

- Docker 20.10+
- Docker Compose 1.29+
- Windows: WSL2 + Docker Desktop

## Quick Start

### Build and Run All Services

```bash
# Build all containers
docker-compose build

# Start all services (frontend, backend, cache)
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f
```

### Access the Application

- **Frontend**: http://localhost:5174
- **Backend API**: http://localhost:8000
- **Swagger Docs**: http://localhost:8000/docs
- **Cache**: localhost:6379 (Redis, internal only)

## Development Workflow

### Hot-Reload Mode (Recommended)

```bash
# Start with development overrides (hot-reload enabled)
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up

# Changes to src/ auto-rebuild both frontend and backend
```

### Running Tests

```bash
# Backend tests (inside container)
docker-compose exec backend pytest backend/tests/ -v --asyncio-mode=auto

# Regression test
docker-compose exec backend python backend/tests/verify_regression.py

# Frontend lint
docker-compose exec frontend npm run lint
```

### Inspect Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend
docker-compose logs -f frontend
docker-compose logs -f cache

# Last 50 lines
docker-compose logs --tail=50 backend
```

### Shell Access

```bash
# Backend shell
docker-compose exec backend bash

# Frontend shell
docker-compose exec frontend sh

# Cache CLI
docker-compose exec cache redis-cli
```

## Stopping & Cleanup

```bash
# Stop all containers
docker-compose stop

# Stop and remove containers
docker-compose down

# Remove volumes (clean cache)
docker-compose down -v

# Remove all images
docker-compose down --rmi all
```

## Environment Variables

### Backend (Dockerfile.backend)
- `CORS_ORIGINS`: Comma-separated list of allowed origins
- `PORT`: Default 8000

### Frontend (Dockerfile.frontend)
- `VITE_API_URL`: Backend API URL (default: http://localhost:8000/api)
- `VITE_WS_URL`: WebSocket URL (default: ws://localhost:8000/ws)

Override in `docker-compose.yml` environment section.

## Health Checks

All services include health checks:

```bash
# Check individual service health
docker-compose exec backend curl http://localhost:8000/
docker-compose exec frontend curl http://localhost:5174/
docker-compose exec cache redis-cli ping
```

## Common Issues

### Frontend Can't Connect to Backend

**Problem**: `CORS` errors or connection refused
**Solution**: Ensure backend is running (`docker-compose ps`) and `CORS_ORIGINS` includes frontend URL

### Port Already in Use

```bash
# Find process using port 8000
lsof -i :8000  # macOS/Linux
netstat -aon | findstr :8000  # Windows

# Change port in docker-compose.yml
# Example: "8001:8000" to use 8001 locally but 8000 in container
```

### Build Fails

```bash
# Clear Docker cache and rebuild
docker-compose down --rmi all
docker-compose build --no-cache
docker-compose up
```

### Slow Performance

- Ensure Docker Desktop has sufficient CPU/RAM (recommend 4GB RAM, 2 CPU)
- On Windows WSL2, check WSL2 resource limits

## Production Deployment

For production, use separate services:

```bash
# Build images with production tags
docker build -f Dockerfile.backend -t backtestbaba-backend:prod .
docker build -f Dockerfile.frontend -t backtestbaba-frontend:prod .

# Push to registry (e.g., Docker Hub)
docker push backtestbaba-backend:prod
docker push backtestbaba-frontend:prod

# Deploy to cloud (Render, AWS, GCP, etc.)
# See DEPLOYMENT.md for cloud-specific instructions
```

## Next Steps

- Test backtest functionality: Upload CSV/Excel in UI
- Monitor WebSocket progress: Open DevTools → Network → WS
- Run full test suite: `docker-compose exec backend pytest -v`
- Check architecture: [docs/ai/CURRENT_STATE.md](docs/ai/CURRENT_STATE.md)
