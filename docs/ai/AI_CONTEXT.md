# AI Operating Context

## Core Philosophy
- **Extreme Simplicity**: Prioritize developer velocity and maintainability. Avoid enterprise over-engineering (no Redis, K8s).
- **Correctness First**: Backtest math and data alignment must remain absolutely correct. Auxiliary features (like persistence) must never crash the core loop.
- **Git-Native Memory**: Use ADRs, `.ai/` docs for history. Keep this file small and focused on *current* constraints.

## Active Engineering Constraints
1. **Data Integrity**: Preserve deterministic processing order. Avoid unordered `set()` for operations requiring traceability.
2. **Optionality**: Persistence features are strictly optional. They must degrade gracefully with structured logging, never blocking execution.
3. **Resilience**: Never leave commented-out legacy code. Use explicit fallback paths (NullBackend when Worker is unreachable).
4. **No Schema Churn**: Avoid creating duplicate fields. signal_hashes.results_json absorbs all horizon data in one TEXT column.
5. **Fire-and-Forget Persistence**: D1 writes run AFTER WebSocket response is delivered. User never waits for the database.
6. **DB-Agnostic Abstraction**: `PersistenceBackend` ABC allows swapping D1 for Postgres/Mongo/LocalSQLite without touching backtester code.
7. **Row-Level Dedup**: `row_hash = SHA256(symbol + "|" + date + "|" + entry_mode)` with UNIQUE constraint. No application-level dedup logic needed.
8. **Hard Quota Block**: D1 writes auto-stop at 95% of 1M monthly limit. Manual export + clear is the only recovery path.

## Workflow Rules
- Any architectural change must be validated by regression testing to ensure no calculation drift.
- Persistence test suite (`test_persistence.py`) must be kept green alongside existing tests.
- All D1 integration happens on feature branch `feat/d1-persistence`. Never commit directly to `main`.
