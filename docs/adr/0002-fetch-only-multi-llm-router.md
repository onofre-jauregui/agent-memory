# ADR 0002: Fetch-only Multi-LLM Router

**Status:** Accepted  
**Date:** 2026-04-29

## Context

Agents frequently need to call multiple LLM providers — sometimes within a single request (fallback chains, cost routing, capability routing). Existing solutions either lock into a single SDK or pull in a large abstraction layer (LangChain, etc.) that couples the rest of the system to its lifecycle.

The router needs to work on edge runtimes where Node built-ins are unavailable, making SDK-based solutions doubly unsuitable.

## Decision

Implement the multi-LLM router as a pure function in `packages/core/src/providers/multi-llm.ts` using only `fetch`. Each provider is a private function that constructs the correct request shape and parses the response. The public `chat()` function dispatches on a `provider` discriminant.

Supported providers at time of writing: `anthropic`, `openai`, `openrouter`, `google`. Adding a new provider requires adding a branch to the `LLMProvider` union and implementing one function — no new dependencies.

## Consequences

- **Positive:** Router runs in Node, Deno, Bun, Cloudflare Workers, and Supabase Edge Functions without modification.
- **Positive:** Zero added bundle weight — providers that aren't used are tree-shaken out.
- **Positive:** Switching providers at runtime is a one-line change for the caller.
- **Negative:** Provider request/response shapes must be manually maintained. Breaking API changes from providers require a code update.
- **Negative:** Advanced SDK features (streaming, tool use, file uploads) are not implemented in the core router — callers who need them should use the provider's SDK directly in their own code.
