# ADR 0004: Reference Implementation Pattern (Supabase Package)

**Status:** Accepted  
**Date:** 2026-04-29

## Context

`agent-memory-core` is deliberately database-agnostic: it depends on a `MemoryStore` interface, not a specific database. However, most users will want a working backend they can stand up in minutes rather than implementing the interface from scratch.

The question is where that implementation lives and how it is packaged.

## Decision

Ship a `packages/supabase` reference implementation alongside the core. It is:

- **Not published to npm** — it is intended to be copied, not installed.
- **Opinionated** — uses Supabase (Postgres + auth + edge functions) as the concrete backend.
- **Complete** — includes SQL migrations, edge functions, and environment variable documentation. Applying the migrations and deploying the functions produces a production-ready backend.

The core package remains ignorant of Supabase. The supabase package depends on the core via `workspace:*`.

## Consequences

- **Positive:** Users who use Supabase get a working backend in minutes.
- **Positive:** The core package stays zero-dependency and database-agnostic.
- **Positive:** The reference implementation documents the expected DB schema and data access patterns, which makes it easier to port to other databases.
- **Negative:** Users on non-Supabase stacks (Firebase, PlanetScale, Neon, etc.) must implement `MemoryStore` themselves. We provide no reference for those — they must use the interface definition and the Supabase implementation as inspiration.
