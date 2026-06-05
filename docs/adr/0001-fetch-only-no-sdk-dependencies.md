# ADR 0001: Fetch-only, No SDK Dependencies in `packages/core`

**Status:** Accepted  
**Date:** 2026-04-29

## Context

`agent-memory-core` targets Node 18+, Deno, Bun, edge runtimes (Cloudflare Workers, Supabase Edge Functions), and modern browsers. Each environment has its own module system quirks. SDK packages (e.g. `@anthropic-ai/sdk`, `openai`) bundle Node-specific code and are not portable across all target runtimes. They also increase bundle size and pin consumers to a particular version of each provider's client.

## Decision

`packages/core` must have zero runtime dependencies. All external communication uses the global `fetch` API, which is available in every supported runtime since Node 18. Provider-specific SDKs are explicitly banned from the package.

This is enforced by the `no-coupling.test.ts` suite, which scans every file in `packages/core/src/` and fails if any SDK import is detected.

## Consequences

- **Positive:** The package installs in < 1 second, adds zero transitive dependencies to consumers, and runs in every JS runtime that supports `fetch` and Web Crypto.
- **Positive:** Adding a new LLM provider is a single function — no new dependency required.
- **Negative:** Error messages from provider APIs must be parsed manually rather than relying on SDK error classes.
- **Negative:** Provider API contracts (request/response shape) must be kept current by hand if they change.
