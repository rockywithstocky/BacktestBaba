# 005 — Priority Assessment of Existing Plans

**Date**: 2026-07-06
**Context**: Full codebase review + assessment of plans 000–004 by AI agent
**Decision**: Pending (set aside for later)

---

## Summary Assessment

| Plan | Title | Stated Priority | Assessment | Recommendation |
|------|-------|----------------|------------|----------------|
| 001 | Entry Mode | P1 Active | Well-specced, user-facing, no deps, low risk | **Pick first** |
| 004 | Regression Gate | P0 Infra | Over-scoped for current team size; valuable parts are the backend test cases | **Pick second, scope down to pytest only** |
| 003 | Next 5 Days | P2 | Depends on 001's `entry_date` field; cosmetic feature | **Pick third** |
| 002 | Dynamic Horizons | P3 Shelf | Major refactor across entire stack; high risk | **Skip unless explicitly requested** |
| 000 | Premortem | — | Bug catalog (40+ items), not a development plan | **Cherry-pick critical fixes (C5, C2, C1/C6, H1, H10) into feature branches** |

---

## Detailed Analysis

### Plan 001 — Entry Mode → Pick First
- User-facing: preserves original `signal_date`, adds Open/Close toggle, `entry_date`, `signal_close_price`
- ~133 lines across 10 files, all additive changes
- Old reports degrade gracefully via `||` fallbacks
- No architectural changes

### Plan 004 — Regression Gate → Scope Down
- Full spec (vitest + @testing-library/react + CI + 100+ tests) is over-engineered
- Valuable subset: backend pytest cases (sections A–E, ~30 test functions)
- Write these inline during 001 development using existing pytest-asyncio infra
- Frontend lint + manual verification sufficient for now

### Plan 003 — Next 5 Days → After 001
- Depends on `entry_date` from 001
- ~63 lines across 4 files
- Nice visual feature but cosmetic

### Plan 002 — Dynamic Horizons → Skip
- Replaces 6 hardcoded Pydantic fields with dynamic `List[HorizonResult]`
- Rewrites half of Dashboard.jsx
- Breaks backward compat without migration
- Marked P3 — keep shelved

### Plan 000 — Premortem → Cherry-pick Bugs
- C5: HTTP fallback Content-Type boundary missing (1-line fix, breaks entire redundancy path)
- C2: `tz_localize(None)` on already-aware index raises TypeError (can crash backtests)
- C1/C6: yfinance calls lack try/catch + timeout (backtest dies on transient errors)
- H1: backtester doesn't read `signal_date` column name, only `date`/`Date`
- H10: no double-submit guard (clicking Run twice creates racing WS connections)

---

## Proposed Order of Work

```
Phase A: Plan 001 (Entry Mode) + critical bug fixes from 000 + backend regression tests from 004
Phase B: Plan 003 (Next 5 Days) — depends on entry_date from Phase A
Phase C: Frontend test infra + CI workflow — if justified later
Plan 002: Stays shelved unless explicitly requested
```
