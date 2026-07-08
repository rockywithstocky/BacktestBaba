# Project Context
## BacktestBaba – Performance & Persistence Initiative

Status: Architecture Frozen
Date: YYYY-MM-DD

---

# 1. Objective

The goal of this initiative is to improve the scalability and execution time of the BacktestBaba backtesting engine without changing any user-facing functionality or backtesting logic.

The focus is architectural efficiency, not feature development.

Expected outcome:

- repeated backtests become significantly faster
- unnecessary Yahoo Finance requests are eliminated
- application scales to much larger datasets
- existing behaviour remains identical

---

# 2. Current Requirement

The system must continue to produce exactly the same backtesting results while reducing unnecessary work.

Functional behaviour must remain unchanged.

The only acceptable changes are internal architectural improvements.

This initiative is NOT introducing new features.

---

# 3. Current Architecture

Current pipeline

CSV
↓

Phase A
Resolve Symbols

↓

Phase B
Download Historical Data

↓

Phase C
Compute Returns

↓

Discard Downloaded Data

Every execution starts from scratch.

The application has no long-term memory.

---

# 4. Current Technical Problems

## Problem 1

Repeated Symbol Resolution

Every execution resolves the same symbols again using Yahoo Finance.

Example

TCS

↓

Yahoo

↓

TCS.NS

This happens every run.

---

## Problem 2

Repeated Historical Downloads

Historical OHLCV data is downloaded repeatedly.

Completed market data is effectively immutable, but is fetched again every execution.

---

## Problem 3

No Persistent Knowledge

The application forgets everything after each run.

Knowledge that could be reused:

- resolved symbols
- historical prices

is discarded.

---

## Problem 4

Performance Does Not Improve

Execution N costs almost the same as execution 1.

Current behaviour

Run 1

↓

Network

Run 2

↓

Network

Run 3

↓

Network

Desired behaviour

Run 1

↓

Network

Run 2

↓

Local

Run 3

↓

Local

---

# 5. Root Cause

The architecture is stateless.

Everything is treated as temporary runtime information instead of application knowledge.

---

# 6. Design Principles

This initiative follows:

- KISS
- YAGNI
- Kaizen
- Local-first architecture
- Small reviewable commits
- Build → Measure → Optimize

No speculative optimisation.

No premature abstractions.

---

# 7. Requirements

Must

✓ Preserve existing functionality

✓ Preserve existing results

✓ Preserve public interfaces where practical

✓ Improve repeated-run performance

✓ Reduce Yahoo Finance dependency

Must NOT

✗ Change trading logic

✗ Change calculation logic

✗ Introduce new user features

✗ Modify frontend behaviour

✗ Change report format

---

# 8. Evidence Collected

Architecture review identified:

• repeated symbol resolution

• repeated historical downloads

• stateless execution

• redundant external requests

• scalability degradation as executions increase

Large datasets amplify these costs.

---

# 9. Architecture Decisions (Frozen)

Accepted

✓ Local-first data access

✓ Persistent symbol mapping

✓ Persistent historical OHLCV

✓ DataProvider owns persistence

✓ SymbolResolver uses persistent mappings

✓ SQLite selected as embedded database

✓ Yahoo Finance remains source of truth

Rejected

✗ Planner architecture

✗ Additional abstraction layers

✗ Premature computation optimisation

✗ Metadata persistence (deferred)

✗ Backtest history (deferred)

---

# 10. Target Architecture

Backtester

↓

SymbolResolver

↓

DataProvider

↓

Persistent Store

↓

Yahoo Finance (only when required)

The application should learn once and reuse forever.

---

# 11. Success Criteria

The milestone is complete when:

✓ repeated backtests reuse local data

✓ repeated symbol resolution disappears

✓ historical data is downloaded only once

✓ incremental gap filling works

✓ functionality remains unchanged

✓ all regression tests pass

---

# 12. Current Milestone

Persistent Knowledge Store

Deliverables

- persistent symbol map

- persistent historical OHLCV

- local-first DataProvider

- incremental gap filling

Nothing else.

---

# 13. Deferred Work

Not part of this milestone

- metadata persistence

- computation optimisation

- report optimisation

- UI improvements

- multi-provider support

- distributed storage

These will only be considered after profiling demonstrates a real need.

---

# 14. Guiding Principle

The application should progressively accumulate knowledge.

Every execution should make future executions cheaper.

The objective is not to make the first execution infinitely fast.

The objective is to ensure the application never performs the same work twice unless correctness requires it.