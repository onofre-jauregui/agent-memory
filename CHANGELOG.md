# Changelog

All notable changes to this monorepo are documented in this file. See per-package CHANGELOGs in `packages/core/CHANGELOG.md` and `packages/supabase/CHANGELOG.md` for package-scoped changes.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-04-30

### Added
- `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md` at repo root.
- `docs/adr/` with six initial ADRs covering monorepo layout, fetch-only router, confidence model, reference-implementation pattern, no-coupling enforcement, and pure-function risk API.
- `docs/recipes.md` cookbook with five end-to-end scenarios.
- `docs/migration-from-trading-agent.md` for users carving from similar codebases.
- Mermaid diagrams in `docs/architecture.md`, `docs/memory-confidence-model.md`, and `docs/guardrail-patterns.md`.
- Comprehensive JSDoc on every public symbol in `agent-memory-core` (params, returns, examples, throws).
- Per-package READMEs polished for npm-registry rendering.
- GitHub repo metadata: issue templates, PR template, dependabot config.
- `release.yml` workflow for tagged npm publishes with provenance.
- Vitest coverage on `agent-memory-core` (≥80% statements target).
- `tsconfig.base.json` now sets `noUncheckedIndexedAccess: true`.

### Changed
- Root `README.md` rewritten for OSS audience with badges, when-to-use guidance, performance notes, and roadmap.
- `packages/core/package.json` adds `repository`, `bugs`, `homepage`, `engines.node ≥ 18.18.0`, `publishConfig` with provenance, expanded keywords, and a `release` script.

### Fixed
- README quickstart examples now match the actual exported field names (`passed` not `allowed`, `max_position_size` not `per_action_cap`, etc).

## [0.1.0] - 2026-04-29

### Added
- Initial public release of `agent-memory-core` carved from a private trading-agent codebase.
- Three primitives: `evaluateRisk`, memory CRUD with `+5/-10` confidence loop, fetch-only multi-LLM router.
- Reference Supabase implementation in `packages/supabase` (4 migrations + 3 edge functions).
- Two end-to-end examples: `customer-support-agent`, `trading-agent`.
- 39 tests including a `no-coupling.test.ts` that bans domain-specific tokens from `packages/core/src/`.
- Initial conceptual docs: `architecture.md`, `memory-confidence-model.md`, `guardrail-patterns.md`.
- MIT license.

[Unreleased]: https://github.com/onofre-jauregui/agent-memory/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/onofre-jauregui/agent-memory/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/onofre-jauregui/agent-memory/releases/tag/v0.1.0
