# 🚀 Deployment Guide

This guide will help you deploy the Stock Screener Backtester Pro to free hosting services.

## 🎯 Overview

We'll use:
- **Render** (Backend - Free tier: 750 hours/month)
- **Vercel** (Frontend - Unlimited free hosting for personal projects)

## 📋 Prerequisites

1. GitHub account
2. Code pushed to GitHub repository
3. Render account (sign up at [render.com](https://render.com))
4. Vercel account (sign up at [vercel.com](https://vercel.com))

---

## ⚡ Quick Deploy: Updating Existing Projects

**For existing deployed services on Render & Vercel, deployment is automatic!**

### For Backend (Render)

1. **Make changes locally**
   ```bash
   # Make your code changes
   git add .
   git commit -m "fix: description of change"
   git push origin main
   ```

2. **Render auto-deploys**
   - Render detects the push to `main` branch
   - Automatically rebuilds and redeploys backend
   - Monitor deployment at: https://dashboard.render.com → backtestbaba-api → Deployments tab
   - Takes ~3-5 minutes

3. **Verify deployment**
   ```bash
   # Check backend is live
   curl https://backtestbaba-api.onrender.com/docs
   ```

### For Frontend (Vercel)

1. **Make changes locally**
   ```bash
   # Make your code changes
   git add .
   git commit -m "fix: description of change"
   git push origin main
   ```

2. **Vercel auto-deploys**
   - Vercel detects the push to `main` branch
   - Automatically rebuilds and redeploys frontend
   - Monitor deployment at: https://vercel.com/dashboard → chartchampion → Deployments tab
   - Takes ~2-3 minutes

3. **Verify deployment**
   - Visit: `https://chartchampion.vercel.app`
   - Check browser console (F12) for any errors

### Verify End-to-End

```bash
# Open frontend in browser
https://chartchampion.vercel.app

# Test by running a backtest
# Should connect to backend at: https://backtestbaba-api.onrender.com
```

### Troubleshooting Live Deployment

| Issue | Solution |
|-------|----------|
| **Backend not updating** | Check Render → backtestbaba-api → Logs for build errors; verify `requirements.txt` has all dependencies |
| **Frontend not updating** | Check Vercel → chartchampion → Deployments → Build Logs; verify `npm run build` succeeds |
| **CORS errors** | Backend may be on old code; check `backend/main.py` CORS settings include `https://chartchampion.vercel.app` |
| **Backend slow/timing out** | Render free tier sleeps after 15 min inactivity; first request takes ~30s to wake up |
| **Environment variables not working** | Vercel: Check chartchampion → Settings → Environment Variables; Render: Check backtestbaba-api → Environment |

---

## 🔧 Part 1: Initial Deploy - Backend to Render (First Time Only)

### Step 1: Prepare Backend for Deployment (First Time Only)

1. Create `render.yaml` in project root:

```yaml
services:
  - type: web
    name: stock-backtester-api
    env: python
    region: singapore  # or your preferred region
    buildCommand: pip install -r backend/requirements.txt
    startCommand: uvicorn backend.main:app --host 0.0.0.0 --port $PORT
    envVars:
      - key: PYTHON_VERSION
        value: 3.11.0
```

2. Update `backend/main.py` CORS settings:

```python
# Update origins to include your Vercel frontend URL
origins = [
    "http://localhost:5173",
    "http://localhost:5174",
    "https://chartchampion.vercel.app",  # Vercel deployment
    "*"  # Remove in production for security
]
```

### Step 2: Deploy to Render

1. **Go to [Render Dashboard](https://dashboard.render.com/)**

2. **Click "New +" → "Web Service"**

3. **Connect GitHub Repository**
   - Click "Connect a repository"
   - Select your repo: `stock-screener-backtester-pro`

4. **Configure Service**
   - **Name**: `backtestbaba-api`
   - **Region**: Select closest to you
   - **Branch**: `main`
   - **Root Directory**: Leave empty (or `backend` if structured differently)
   - **Environment**: `Python 3`
   - **Build Command**: 
     ```bash
     pip install -r backend/requirements.txt
     ```
   - **Start Command**: 
     ```bash
     uvicorn backend.main:app --host 0.0.0.0 --port $PORT
     ```

5. **Select Free Plan**

6. **Click "Create Web Service"**

7. **Wait for Deployment** (3-5 minutes)

8. **Copy Your Backend URL**: 
   - `https://backtestbaba-api.onrender.com`

### Step 3: Test Backend

Visit: `https://backtestbaba-api.onrender.com/docs`

You should see the FastAPI Swagger documentation.

---

## 🎨 Part 2: Initial Deploy - Frontend to Vercel (First Time Only)

### Step 1: Prepare Frontend (First Time Only)

1. Update `frontend/src/services/api.js`:

```javascript
// Replace localhost URL with your Render backend URL
const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://backtestbaba-api.onrender.com';

export const runBacktest = async (file, onProgress) => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await axios.post(`${API_BASE_URL}/api/backtest`, formData, {
        headers: {
            'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
            if (onProgress) {
                const percentCompleted = Math.round(
                    (progressEvent.loaded * 100) / progressEvent.total
                );
                onProgress(percentCompleted);
            }
        },
    });

    return response.data;
};
```

2. Create `frontend/.env.production`:

```env
VITE_API_URL=https://backtestbaba-api.onrender.com
```

3. Add to `frontend/vite.config.js`:

```javascript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/',
  build: {
    outDir: 'dist',
    sourcemap: false,
  }
})
```

4. Create `frontend/vercel.json`:

```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

### Step 2: Deploy to Vercel

#### Option A: Using Vercel CLI (Recommended)

```bash
# Install Vercel CLI
npm install -g vercel

# Login to Vercel
vercel login

# Navigate to frontend directory
cd frontend

# Deploy
vercel

# Follow prompts:
# - Set up and deploy? Yes
# - Which scope? Your account
# - Link to existing project? No
# - Project name? chartchampion
# - Directory? ./
# - Override settings? No

# For production deployment
vercel --prod
```

#### Option B: Using Vercel Dashboard

1. **Go to [Vercel Dashboard](https://vercel.com/dashboard)**

2. **Click "Add New..." → "Project"**

3. **Import Git Repository**
   - Select your GitHub repository
   - Click "Import"

4. **Configure Project**
   - **Framework Preset**: Vite
   - **Root Directory**: `frontend`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Install Command**: `npm install`

5. **Environment Variables**
   - Click "Environment Variables"
   - Add: `VITE_API_URL` = `https://backtestbaba-api.onrender.com`

6. **Click "Deploy"**

7. **Wait for Deployment** (2-3 minutes)

8. **Copy Your Frontend URL**:
   - `https://chartchampion.vercel.app`
   - **Project ID**: `prj_3nME2iUL17NQTr82IpwuX21tjG5O`

### Step 3: Update Backend CORS

Go back to Render and update `backend/main.py`:

```python
origins = [
    "https://chartchampion.vercel.app",  # Your Vercel URL
    "https://*.vercel.app",  # Allow all Vercel preview deployments
]
```

Commit and push - Render will auto-deploy!

---

## ✅ Verification Checklist

- [ ] Backend is live and `/docs` endpoint works
- [ ] Frontend is live and loads correctly
- [ ] File upload works from frontend to backend
- [ ] Backtesting completes successfully
- [ ] Charts and data display correctly
- [ ] No CORS errors in browser console

---

## 🔍 Monitoring & Logs

### Render Logs
1. Go to Render Dashboard → backtestbaba-api
2. Click "Logs" tab
3. Monitor real-time logs

### Vercel Logs
1. Go to Vercel Dashboard → chartchampion
2. Click "Deployments" tab
3. Click on a deployment
4. View "Build Logs" or "Function Logs"

---

## 🐛 Common Deployment Issues

### Issue: Render Service Won't Start

**Check:**
```bash
# Verify requirements.txt has all dependencies
pip freeze > backend/requirements.txt

# Ensure start command is correct
uvicorn backend.main:app --host 0.0.0.0 --port $PORT
```

### Issue: Backend Runs But Returns 500 Error

**Solution:**
- Check Render logs for Python errors
- Verify all environment variables are set
- Test locally first with production settings

### Issue: CORS Error on Frontend

**Solution:**
```python
# backend/main.py - Update CORS origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://chartchampion.vercel.app"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### Issue: Vercel Build Fails

**Check:**
- `package.json` has all dependencies
- `vite.config.js` is configured correctly
- Root directory is set to `frontend`
- Build command is `npm run build`

### Issue: Environment Variables Not Working

**Solution:**
```bash
# Vercel (chartchampion) - Add in dashboard under "Environment Variables"
VITE_API_URL=https://backtestbaba-api.onrender.com

# Must start with VITE_ to be accessible in Vite
```

### Issue: Backend Sleeps After Inactivity (Render Free Tier)

**Limitation:** Render free tier services sleep after 15 minutes of inactivity

**Solutions:**
1. Use a service like [cron-job.org](https://cron-job.org) to ping your backend every 14 minutes
2. Upgrade to Render paid plan ($7/month)
3. Accept the cold start delay (~30 seconds) on first request

---

## 💰 Cost Breakdown

| Service | Plan | Cost | Limitations |
|---------|------|------|-------------|
| Render (Backend) | Free | $0/month | 750 hours/month, Sleeps after 15min inactivity |
| Vercel (Frontend) | Free | $0/month | Unlimited bandwidth for personal use |
| **Total** | | **$0/month** | |

**Upgrade Options:**
- Render Starter: $7/month (Always on, no sleep)
- Vercel Pro: $20/month (More build time, advanced analytics)

---

## 🔄 Continuous Deployment

Both Render and Vercel support automatic deployments:

### Auto-Deploy on Git Push

1. **Push to GitHub**:
   ```bash
   git add .
   git commit -m "Update feature"
   git push origin main
   ```

2. **Automatic Deployment**:
   - Render detects the push and redeploys backend
   - Vercel detects the push and redeploys frontend

3. **Preview Deployments** (Vercel):
   - Every pull request gets a unique preview URL
   - Test changes before merging

---

## 🌐 Custom Domain (Optional)

### Add Custom Domain to Vercel (chartchampion)

1. Go to Project Settings → Domains
2. Add your domain (e.g., `backtester.yourdomain.com`)
3. Update DNS records as instructed
4. SSL certificate is automatically provisioned

### Add Custom Domain to Render (backtestbaba-api)

1. Go to Service Settings → Custom Domain
2. Add your domain (e.g., `api.yourdomain.com`)
3. Update DNS records
4. SSL certificate is automatically provisioned

---

## 📊 Performance Optimization

### Backend (Render)

```python
# backend/main.py
from fastapi.middleware.gzip import GZipMiddleware

app.add_middleware(GZipMiddleware, minimum_size=1000)

# Use caching for repeated requests
from diskcache import Cache
cache = Cache("./cache")
```

### Frontend (Vercel)

```javascript
// vite.config.js
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          charts: ['recharts'],
        }
      }
    }
  }
})
```

---

## 🎉 Success!

Your Stock Screener Backtester Pro is now live and accessible worldwide! 

**Share your app:**
- Frontend: `https://chartchampion.vercel.app`
- Backend API: `https://backtestbaba-api.onrender.com`

---

## 📞 Support

If you encounter issues:
1. Check the troubleshooting section above
2. Review deployment logs
3. Open an issue on GitHub
4. Contact Render/Vercel support

---

Made with ❤️ | Free hosting for everyone!
