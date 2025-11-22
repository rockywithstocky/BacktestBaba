# 📊 Stock Screener Backtester Pro

A professional full-stack application for backtesting stock trading signals with real-time progress tracking, interactive charts, and comprehensive performance analytics.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Python](https://img.shields.io/badge/python-3.8%2B-blue)
![React](https://img.shields.io/badge/react-18.2-blue)

## ✨ Features

- 🚀 **Real-time Progress Tracking** - Live updates during backtesting
- 📈 **Interactive Charts** - Click any return to view detailed price charts (Area/Line/Bar)
- 🎯 **Multiple Timeframes** - 7-day, 30-day, and 90-day analysis
- 📊 **Comprehensive Analytics** - Win rates, returns, max high/low tracking
- 🔍 **Advanced Search & Filtering** - Search, sort, and paginate through results
- 💰 **Capital Calculator** - See returns on different investment amounts
- 📥 **Easy Import** - CSV and Excel file support
- 🎨 **Modern UI** - Beautiful dark theme with smooth animations

## 🏗️ Tech Stack

### Backend
- **FastAPI** - High-performance Python web framework
- **yfinance** - Real-time stock data fetching
- **Pandas** - Data processing and analysis
- **Diskcache** - Efficient caching layer

### Frontend
- **React 18** - Modern UI library
- **Vite** - Lightning-fast build tool
- **Recharts** - Beautiful responsive charts
- **Framer Motion** - Smooth animations
- **Axios** - HTTP client

## 📋 Prerequisites

- **Python 3.8+**
- **Node.js 16+**
- **npm or yarn**

## 🚀 Quick Start

### 1. Clone the Repository

```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/stock-screener-backtester-pro.git

# Navigate to project directory
cd stock-screener-backtester-pro
```

### 2. Backend Setup

```bash
# Navigate to backend directory
cd backend

# Create virtual environment
python -m venv venv

# Activate virtual environment
# On Windows:
venv\Scripts\activate
# On Mac/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run the backend server
python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

Backend will be available at: `http://localhost:8000`

### 3. Frontend Setup

Open a **new terminal window**:

```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
npm install

# Run the development server
npm run dev
```

Frontend will be available at: `http://localhost:5174`

## 📁 Project Structure

```
stock-screener-backtester-pro/
├── backend/
│   ├── core/
│   │   ├── backtester.py       # Core backtesting logic
│   │   ├── data_fetcher.py     # Stock data fetching
│   │   └── symbol_resolver.py  # Symbol validation
│   ├── models/
│   │   └── schemas.py          # Pydantic data models
│   ├── tests/
│   │   ├── test_backtester.py
│   │   └── test_integration.py
│   ├── main.py                  # FastAPI application
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Dashboard.jsx   # Results dashboard
│   │   │   ├── UploadCard.jsx  # File upload component
│   │   │   └── *.css           # Component styles
│   │   ├── services/
│   │   │   └── api.js          # API service layer
│   │   ├── App.jsx             # Main application
│   │   └── main.jsx            # Entry point
│   ├── package.json
│   └── vite.config.js
├── .gitignore
├── README.md
└── DEPLOYMENT.md
```

## 📊 Usage

### 1. Prepare Your Data

Create a CSV file with the following columns:
- `symbol` - Stock ticker symbol (e.g., AAPL, MSFT)
- `signal_date` - Date when signal was generated (YYYY-MM-DD format)

Example CSV:
```csv
symbol,signal_date
AAPL,2024-01-15
MSFT,2024-01-16
GOOGL,2024-01-17
```

### 2. Upload and Run Backtest

1. Open `http://localhost:5174` in your browser
2. Click "Click to upload or drag and drop"
3. Select your CSV file
4. Click "Run Backtest"
5. Watch the real-time progress
6. Explore your results!

### 3. Analyze Results

- **Summary Cards** - View total signals, win rates, and best/worst performers
- **Performance Charts** - Bar charts showing top gainers for each timeframe
- **Statistics Table** - Detailed metrics with horizontal scrolling
- **Trade Log** - Search, sort, and filter all trades
- **Interactive Charts** - Click any return % to see price movements

## 🎯 Key Features Explained

### Real-Time Progress
Watch as the application processes each stock signal with live updates showing:
- Current symbol being processed
- Progress percentage
- Signals processed count

### Interactive Price Charts
Click on any 7d, 30d, or 90d return percentage to see:
- **Chart Types**: Toggle between Area, Line, and Bar charts
- **Marked Points**: Entry 🟢, Exit, Max High ⬆️, Max Low ⬇️
- **Dates for Each Point**: Know exactly when peaks and troughs occurred
- **Custom Tooltips**: Hover to see detailed price and date information

### Capital Calculator
Select different investment amounts (₹1L, ₹5L, ₹10L, ₹50L) to see how your strategy would perform with different capital levels.

## 🧪 Running Tests

### Backend Tests

```bash
cd backend
pytest
```

### Frontend Tests

```bash
cd frontend
npm test
```

## 🐛 Troubleshooting

### Issue: PowerShell Script Execution Error

**Error:**
```
npm : File C:\Program Files\nodejs\npm.ps1 cannot be loaded because running scripts is disabled
```

**Solution:**
```bash
# Use cmd instead
cmd /c npm run dev

# OR set execution policy (run PowerShell as Administrator)
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Issue: Backend Port Already in Use

**Error:**
```
Address already in use
```

**Solution:**
```bash
# Windows - Kill process on port 8000
taskkill /F /IM python.exe

# Then restart backend
python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

### Issue: Frontend Build Errors

**Solution:**
```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

### Issue: CORS Errors

**Solution:**
The backend is configured with CORS middleware. Ensure:
1. Backend is running on `http://localhost:8000`
2. Frontend is making requests to the correct URL
3. Check `backend/main.py` for CORS settings

### Issue: Stock Data Not Found

**Common Causes:**
- Invalid ticker symbol
- Symbol not available on Yahoo Finance
- Network connectivity issues

**Solution:**
- Verify ticker symbols are correct
- Use .NS suffix for Indian stocks (e.g., RELIANCE.NS)
- Check internet connection

### Issue: Slow Backtesting

**Optimization Tips:**
- The app caches stock data automatically
- First run will be slower as it fetches data
- Subsequent runs with same symbols will be faster
- Consider reducing the number of signals for testing

## 📝 Git Workflow & Best Practices

### Initial Setup

```bash
# Initialize git (if not already done)
git init

# Add all files
git add .

# Create initial commit
git commit -m "Initial commit: Stock Screener Backtester Pro"

# Add remote repository
git remote add origin https://github.com/YOUR_USERNAME/stock-screener-backtester-pro.git

# Push to GitHub
git push -u origin main
```

### Daily Workflow

```bash
# Check status
git status

# Add specific files
git add backend/core/backtester.py
git add frontend/src/components/Dashboard.jsx

# Or add all changes
git add .

# Commit with descriptive message
git commit -m "feat: Add interactive chart switcher"

# Push to GitHub
git push origin main
```

### Branch Management

```bash
# Create and switch to new feature branch
git checkout -b feature/new-chart-type

# Make your changes...
git add .
git commit -m "Add candlestick chart type"

# Push branch to GitHub
git push origin feature/new-chart-type

# Switch back to main
git checkout main

# Merge feature branch
git merge feature/new-chart-type

# Delete local branch
git branch -d feature/new-chart-type

# Delete remote branch
git push origin --delete feature/new-chart-type
```

### Commit Message Conventions

```bash
# Features
git commit -m "feat: Add new chart visualization"

# Bug fixes
git commit -m "fix: Resolve date sorting issue"

# Documentation
git commit -m "docs: Update README with deployment guide"

# Styling
git commit -m "style: Improve modal responsiveness"

# Refactoring
git commit -m "refactor: Optimize backtesting algorithm"

# Tests
git commit -m "test: Add integration tests for API"
```

### Useful Git Commands

```bash
# View commit history
git log --oneline

# View changes before committing
git diff

# Undo last commit (keep changes)
git reset --soft HEAD~1

# Discard all local changes
git reset --hard HEAD

# Pull latest changes
git pull origin main

# Clone repository
git clone https://github.com/YOUR_USERNAME/stock-screener-backtester-pro.git
```

## 🌐 Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed instructions on deploying to:
- **Render** (Backend - Free)
- **Vercel** (Frontend - Free)

Quick deployment:

### Backend (Render):
1. Push code to GitHub
2. Sign up at [Render.com](https://render.com)
3. Create new "Web Service"
4. Connect your GitHub repo
5. Configure build command: `pip install -r backend/requirements.txt`
6. Configure start command: `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`

### Frontend (Vercel):
1. Sign up at [Vercel.com](https://vercel.com)
2. Import your GitHub repository
3. Set root directory to `frontend`
4. Update API URL in `frontend/src/services/api.js`
5. Deploy!

## 🤝 Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License.

## 🙏 Acknowledgments

- **yfinance** for providing free stock data
- **FastAPI** for the amazing web framework
- **React** and **Recharts** for the beautiful UI

## 📧 Support

For issues and questions:
- Open an issue on GitHub
- Check the troubleshooting section above

## 🎯 Roadmap

- [ ] Add more chart types (Candlestick, OHLC)
- [ ] Export results to PDF/Excel
- [ ] Support for multiple strategies
- [ ] Real-time alerts
- [ ] Portfolio tracking
- [ ] Comparison with benchmarks

---

Made with ❤️ for traders and investors
