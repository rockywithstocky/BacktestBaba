# 🚀 Git Setup & First Push Guide

## Step 1: Fix Git Path (Windows)

Git is installed but PowerShell doesn't recognize it. Here's how to fix:

### Quick Fix: Restart Terminal
Close PowerShell and reopen it. Git should work now.

### If that doesn't work:

**Use Command Prompt (cmd) instead of PowerShell:**
1. Press `Win + R`
2. Type `cmd` and press Enter
3. Navigate to your project:
   ```cmd
   cd "d:\AI\Stock Market\Stock Screener Backtester Pro"
   ```

---

## Step 2: Initialize Git Repository

Open **Command Prompt (cmd)** in your project folder and run:

```cmd
:: Initialize Git
git init

:: Check Git status
git status
```

---

## Step 3: Configure Git (First Time Only)

```cmd
:: Set your name
git config --global user.name "Your Name"

:: Set your email (use your GitHub email)
git config --global user.email "your.email@example.com"

:: Verify configuration
git config --list
```

---

## Step 4: Add Files and Make First Commit

```cmd
:: Add all files
git add .

:: Check what will be committed
git status

:: Create first commit
git commit -m "Initial commit: Stock Screener Backtester Pro"
```

---

## Step 5: Create GitHub Repository

1. Go to [GitHub.com](https://github.com)
2. Click **"+"** → **"New repository"**
3. Repository name: `stock-screener-backtester-pro`
4. Description: `Professional stock backtesting tool with interactive charts`
5. **Public** or **Private** (your choice)
6. **DON'T** check "Initialize with README" (we already have one)
7. Click **"Create repository"**

---

## Step 6: Connect to GitHub and Push

Copy the commands GitHub shows you, or use these:

```cmd
:: Add GitHub repository as remote
git remote add origin https://github.com/YOUR_USERNAME/stock-screener-backtester-pro.git

:: Verify remote was added
git remote -v

:: Push to GitHub (first time)
git push -u origin main
```

**If you get an error about "master" vs "main":**
```cmd
:: Rename branch to main
git branch -M main

:: Then push again
git push -u origin main
```

---

## 📝 Daily Git Workflow

### Making Changes

```cmd
:: 1. Check what changed
git status

:: 2. Add specific files
git add backend/core/backtester.py
git add frontend/src/components/Dashboard.jsx

:: OR add all changes
git add .

:: 3. Commit with message
git commit -m "feat: Add candlestick chart type"

:: 4. Push to GitHub
git push
```

### Commit Message Guidelines

```cmd
:: New feature
git commit -m "feat: Add export to PDF functionality"

:: Bug fix
git commit -m "fix: Resolve date parsing issue"

:: Documentation
git commit -m "docs: Update deployment guide"

:: Styling/UI
git commit -m "style: Improve modal animations"

:: Refactoring
git commit -m "refactor: Optimize data fetching"

:: Testing
git commit -m "test: Add unit tests for backtester"
```

---

## 🌿 Working with Branches

### Create Feature Branch

```cmd
:: Create and switch to new branch
git checkout -b feature/add-pdf-export

:: Make your changes...
git add .
git commit -m "feat: Implement PDF export"

:: Push branch to GitHub
git push origin feature/add-pdf-export
```

### Merge Feature Branch

```cmd
:: Switch back to main
git checkout main

:: Pull latest changes
git pull origin main

:: Merge your feature
git merge feature/add-pdf-export

:: Push merged code
git push origin main

:: Delete local branch (optional)
git branch -d feature/add-pdf-export

:: Delete remote branch (optional)
git push origin --delete feature/add-pdf-export
```

---

## 🔄 Syncing with GitHub

### Pull Latest Changes

```cmd
:: Pull from main branch
git pull origin main
```

### Fetch Changes Without Merging

```cmd
:: Fetch changes
git fetch origin

:: View what changed
git log --oneline origin/main

:: Merge when ready
git merge origin/main
```

---

## 🛠️ Useful Git Commands

```cmd
:: View commit history
git log --oneline

:: View changes before committing
git diff

:: View changes for specific file
git diff backend/main.py

:: Undo last commit (keep changes)
git reset --soft HEAD~1

:: Discard all local changes (CAREFUL!)
git reset --hard HEAD

:: View all branches
git branch -a

:: Switch to existing branch
git checkout branch-name

:: Create new branch
git checkout -b new-branch-name

:: Delete branch
git branch -d branch-name

:: View remote repositories
git remote -v

:: Remove a file from Git (but keep locally)
git rm --cached filename
```

---

## 🐛 Common Issues & Solutions

### Issue: "fatal: not a git repository"
**Solution:**
```cmd
git init
```

### Issue: "Please tell me who you are"
**Solution:**
```cmd
git config --global user.email "you@example.com"
git config --global user.name "Your Name"
```

### Issue: "failed to push some refs"
**Solution:**
```cmd
:: Pull first, then push
git pull origin main --rebase
git push origin main
```

### Issue: "Your branch is behind 'origin/main'"
**Solution:**
```cmd
git pull origin main
```

### Issue: Merge conflicts
**Solution:**
1. Open conflicted files
2. Look for `<<<<<<<`, `=======`, `>>>>>>>`
3. Edit to resolve conflicts
4. Remove conflict markers
5. Add and commit:
   ```cmd
   git add .
   git commit -m "Resolve merge conflicts"
   git push
   ``
`

### Issue: Want to undo last commit
**Solution:**
```cmd
:: Undo commit but keep changes
git reset --soft HEAD~1

:: Undo commit and discard changes
git reset --hard HEAD~1
```

---

## 📦 .gitignore

Already created! `.gitignore` file excludes:
- `node_modules/`
- `__pycache__/`
- `.env` files
- Cache files
- IDE settings
- Build folders

---

## 🔐 GitHub Authentication

### HTTPS (Recommended)

First time you push, you'll be asked to login:
1. Use GitHub username
2. For password, use a **Personal Access Token** (not your GitHub password)

**Create Token:**
1. GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Generate new token
3. Select scopes: `repo`, `workflow`
4. Copy token (save it somewhere safe!)
5. Use token as password when pushing

### SSH (Alternative)

```cmd
:: Generate SSH key
ssh-keygen -t ed25519 -C "your.email@example.com"

:: Copy public key
type %USERPROFILE%\.ssh\id_ed25519.pub

:: Add to GitHub:
:: GitHub → Settings → SSH and GPG keys → New SSH key
:: Paste the key

:: Test connection
ssh -T git@github.com

:: Use SSH remote URL
git remote set-url origin git@github.com:YOUR_USERNAME/stock-screener-backtester-pro.git
```

---

## 🎯 Quick Reference

| Task | Command |
|------|---------|
| Initialize repo | `git init` |
| Check status | `git status` |
| Add all files | `git add .` |
| Commit | `git commit -m "message"` |
| Push | `git push` |
| Pull | `git pull` |
| Create branch | `git checkout -b branch-name` |
| Switch branch | `git checkout branch-name` |
| Merge branch | `git merge branch-name` |
| View history | `git log --oneline` |
| Undo last commit | `git reset --soft HEAD~1` |

---

## 🎓 Learning Resources

- [Official Git Documentation](https://git-scm.com/doc)
- [GitHub Guides](https://guides.github.com/)
- [Interactive Git Tutorial](https://learngitbranching.js.org/)
- [Git Cheat Sheet](https://training.github.com/downloads/github-git-cheat-sheet.pdf)

---

## ✅ Next Steps

After pushing to GitHub:

1. ✅ Code is backed up on GitHub
2. ✅ Others can collaborate
3. ✅ Deploy to Render & Vercel (see DEPLOYMENT.md)
4. ✅ Enable GitHub Actions for CI/CD
5. ✅ Add collaborators if needed

---

**Need Help?** Open an issue on GitHub or check the troubleshooting section!

Happy coding! 🚀
