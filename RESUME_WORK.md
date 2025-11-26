
**Project:** ChartChampion (formerly BacktestBaba)
**Status:** Live & Deployed 🚀

## 1. Start Your Local Environment
Open 2 terminals:

**Terminal 1 (Backend):**
```powershell
cd "d:\AI\Stock Market\Stock Screener Backtester Pro"
python -m uvicorn backend.main:app --reload
```

**Terminal 2 (Frontend):**
```powershell
cd "d:\AI\Stock Market\Stock Screener Backtester Pro\frontend"
npm run dev
```

## 2. Current State
- **Live Frontend:** https://chartchampion.vercel.app/ (or backtestbaba.vercel.app if rename pending)
- **Live Backend:** https://backtestbaba-api.onrender.com/
- **GitHub:** https://github.com/rockywithstocky/BacktestBaba

## 3. Next Tasks (To-Do)
- [ ] **Authentication:** Add Login/Signup (Phase 2)
- [ ] **Database:** Connect PostgreSQL for user data
- [ ] **Rename:** Ensure Vercel project is fully renamed to `chartchampion`

## 4. Quick Commands
- **Push changes:** `git add .` → `git commit -m "msg"` → `git push`
- **Update deps:** `pip freeze > backend/requirements.txt`

Have a great session! ☕
