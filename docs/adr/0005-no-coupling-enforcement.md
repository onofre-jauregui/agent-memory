# ADR 0005: No-Coupling Enforcement via Automated Test

**Status:** Accepted  
**Date:** 2026-04-29

## Context

`agent-memory-core` was extracted from a private trading agent. The extraction risk is that domain-specific terminology leaks back in — ticker symbols, market names, strategy identifiers — and makes the library feel like a trading tool rather than a generic agent primitive.

Manual code review is insufficient: it is easy to miss a comment or a variable name, and reviewers have context that future readers lack.

## Decision

Add a `no-coupling.test.ts` file that walks every `.ts`/`.js` file in `packages/core/src/` and asserts that a list of forbidden tokens does not appear (whole-word match, case-insensitive). The test runs as part of `pnpm -r test` and is required to pass before any PR merges.

The forbidden token list is maintained in the test file itself. Adding a new domain-specific term to core requires explicitly removing it from the forbidden list — a deliberate, visible decision.

## Consequences

- **Positive:** Domain leakage is caught automatically, not by human vigilance.
- **Positive:** The forbidden list serves as documentation of what "generic" means for this codebase.
- **Negative:** The test scans source text, not AST — so it can produce false positives if a generic word happens to collide with a domain term. The current list has been tuned to avoid this.
- **Negative:** Maintaining the forbidden list requires discipline. A reviewer must update it when the codebase is extended to new domains.
