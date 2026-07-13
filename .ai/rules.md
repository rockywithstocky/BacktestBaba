# Doc Sync Gate — Strict Rule

## Purpose

Prevent drift between architecture, spec, plan, and build documents. A scope change in one document must propagate to all others before any code is written.

## The Gate

Before writing ANY code after a scope change:

1. Identify which of these 4 docs are affected:
   - `ARCHITECTURE.md` — system architecture, boundaries, deployment status
   - `SPEC-d1-persistence.md` — schema DDL, API contracts, Python ABC, config vars
   - `PLAN-d1-persistence.md` — phases, tasks, file inventory, rollback
   - `WHAT-WE-BUILD.md` — shopping list, before/after, fallback scenarios

2. Update ALL affected docs before writing a single line of code.

3. Validate consistency — these must agree across all docs:
   - Schema table count and table names
   - Worker endpoint list (methods + paths)
   - File inventory (new files vs edited files)
   - Scope boundaries (what's in scope, what's deferred)
   - Config environment variables and their defaults

4. Commit doc updates separately: `git commit -m "docs: sync all docs after <change-description>"`
5. Only then proceed to code.

## Violation Handling

If code is committed without doc sync being verified:
- Revert the code commit
- Fix the docs to match the code intent
- Re-commit docs first
- Re-commit code with note: `"code: <description> (doc sync verified)"`

## Rationale

A 5-minute doc sync before coding prevents hours of confusion later — especially for future AI sessions that load in cold without conversation history.
