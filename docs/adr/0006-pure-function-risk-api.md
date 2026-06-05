# ADR 0006: Pure Function Risk API

**Status:** Accepted  
**Date:** 2026-04-29

## Context

Risk evaluation could be designed as a stateful object (a `RiskManager` class that owns its own state), or as a pure function that the caller invokes with explicit inputs.

The stateful approach is common in trading SDKs: you configure the manager once and call `.evaluate(action)`. The manager reads its own internal state and updates it.

## Decision

`evaluateRisk` is a pure function with the signature:

```ts
evaluateRisk(action: ActionContext, settings: RiskSettings | null, state: RiskState | null): RiskEvaluationResult
```

All inputs are explicit parameters. The function has no side effects: it reads nothing from the environment and writes nothing to any store. The caller is responsible for loading settings and state, and for persisting any state changes implied by the result (e.g. setting `is_trading_halted = true` when `newHaltReason` is set).

## Consequences

- **Positive:** The function is trivially testable — pass inputs, assert outputs, no mocks needed.
- **Positive:** The function is safe to call speculatively (to check what would happen without committing to it).
- **Positive:** State persistence strategy is left entirely to the caller — works with Supabase, Redis, SQLite, or an in-memory map.
- **Negative:** The caller must correctly load and save state around every call. A bug in the caller's persistence code will cause guardrails to silently reset (e.g. daily loss counter never accumulating). This is a footgun that a stateful API would prevent.
