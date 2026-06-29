# 🤖 AI Workflow Guide: Graphify & Claude-Mem

This document explains how to use our new token-saving, memory-preserving tools in your daily workflow for the **BacktestBaba** project.

---

## 2. Graphify (The "Map")
**What it does:** It provides me (the AI) with a heavily compressed bird's-eye view of your entire codebase structure. Instead of manually reading 50 files to understand your architecture, I just read 1 map.

**How to use it:**
1. **Daily Updates:** At the end of the day, or after you add a bunch of new files/features, you need to update the map so I don't work off outdated information tomorrow.
2. **Update Command:** Run this inside our chat to update the map:
   ```text
   /graphify .
   ```
   *(Or since we created a custom runner script today, you can also run `uv run --with graphifyy python graphify-out/runner.py` in your terminal).*

## Summary Checklist
- [ ] Terminal: Your normal development server (`npm run dev`, etc.)
- [ ] AI Chat: Just talk normally! Graphify is doing all the heavy lifting to save you tokens.
