# AI Operating Context

## Core Philosophy
- **Extreme Simplicity**: Prioritize developer velocity and maintainability. Avoid enterprise over-engineering (no Redis, K8s, microservices, or complex state machines).
- **Correctness First**: Backtest math and data alignment must remain absolutely correct. Auxiliary features (like metadata) must never crash the core loop.
- **Git-Native Memory**: Use ADRs for history. Keep this file small and focused on *current* constraints.

## Active Engineering Constraints
1. **Data Integrity**: Preserve deterministic processing order. Avoid unordered `set()` for operations requiring traceability.
2. **Raw Internal State**: Keep data types raw internally (e.g., `market_cap` as raw numerics). Formatting is strictly a frontend/UI responsibility.
3. **Optionality**: Enrichment features (sector/metadata) are strictly optional. They must degrade gracefully (to `null`) with structured logging, never silently swallowing errors or blocking execution.
4. **Resilience**: Never leave commented-out legacy code as a "rollback." Use explicit fallback paths (e.g., sequential fetch fallback if bulk fetch fails).
5. **No Schema Churn**: Avoid creating duplicate/aliased fields if the schema already supports the requirement.
6. **Fire-and-Forget Persistence**: DB writes are strictly fire-and-forget via `asyncio.create_task`, invoked only after the WebSocket send completes. Must never block, slow, or crash the backtest flow. Config-gated (`PERSISTENCE_ENABLED=false` by default) and quota-aware — worker failures log at WARNING level and silently drop.

## Workflow Rules
- Any architectural change must be validated by regression testing (e.g., `DeepDiff`) to ensure no calculation drift.
- Test suites must be kept green.
