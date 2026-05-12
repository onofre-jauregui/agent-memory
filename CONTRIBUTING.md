# Contributing to agent-memory

Thanks for your interest. This is a small, focused library — easy to contribute to, but with strong invariants. Read this whole file before opening a PR.

## Repo shape

This is a [pnpm workspaces](https://pnpm.io/workspaces) monorepo.

```
packages/
  core/      → agent-memory-core, the only npm-publishable artifact
  supabase/  → reference implementation (not published)

examples/
  customer-support-agent/
  trading-agent/

docs/
  architecture.md, memory-confidence-model.md, guardrail-patterns.md
  adr/  → architecture decision records
  recipes.md
```

`packages/core` is the contract. Everything else demonstrates how to use it.

## Dev setup

Requires **Node 18.18+** and **pnpm 10.33+**.

```bash
git clone https://github.com/onofre-jauregui/agent-memory
cd agent-memory
pnpm install
pnpm -r typecheck
pnpm -r test
pnpm -r build
```

Run a single example:

```bash
pnpm --filter example-customer-support-agent start
pnpm --filter example-trading-agent start
```

## Code style

- TypeScript **strict mode** + `noUncheckedIndexedAccess: true` are required for new code in `packages/core/src/`.
- No SDK dependencies in `packages/core/`. The package must run on Node, Deno, Bun, Edge, and modern browsers — `fetch` only.
- No domain-specific terms in `packages/core/src/`. The `no-coupling.test.ts` enforces this — see below.
- Public symbols require JSDoc with `@param`, `@returns`, and `@example` where it adds value.
- Prefer pure functions over classes. Where state is needed (e.g. `MemoryStore`), it lives behind an interface the caller implements.

Run the formatter before committing:

```bash
pnpm format
```

## Tests are required

Every PR must keep all tests green:

```bash
pnpm -r test
```

This includes `packages/core/__tests__/no-coupling.test.ts`, which scans every file in `packages/core/src/` for forbidden tokens (`kalshi`, `polymarket`, `pnl`, `ticker`, etc). If you find yourself fighting it, the code probably belongs in an example or in the consumer's repo — not in core.

New behavior needs a test in the same PR. Aim for ≥80% statement coverage on `agent-memory-core`:

```bash
pnpm --filter agent-memory-core test -- --coverage
```

## Adding a new primitive to `packages/core`

1. Decide which subdir it belongs in: `guardrails/`, `memory/`, `providers/`, or a new top-level dir.
2. Write the JSDoc-annotated implementation. No I/O at the boundary unless the primitive is explicitly an I/O primitive (e.g. `chat`).
3. Re-export it from the relevant `index.ts` and (if it should be top-level) from `src/index.ts`.
4. Add a unit test next to existing tests in `packages/core/__tests__/`.
5. If your code introduces any new forbidden token risk, audit `no-coupling.test.ts` and either rename or strengthen the list.
6. Update `packages/core/README.md` and add a recipe to `docs/recipes.md` if it's a new public API.

## Adding a new example

1. Create `examples/<name>/` with `package.json`, `tsconfig.json`, and `index.ts`.
2. Mark `"private": true` and add `"agent-memory-core": "workspace:*"` as a dependency.
3. Reference the example from the root `README.md` and from `docs/recipes.md` if it illustrates a recipe.

## Adding a new LLM provider

The provider router lives at `packages/core/src/providers/multi-llm.ts`. To add a provider:

1. Add a new branch to the `LLMProvider` union type.
2. Implement a `chat<Provider>(opts)` function below the existing implementations.
3. Add a case to the `switch` in `chat()`.
4. Add a test in `packages/core/__tests__/providers.test.ts` that mocks `fetch` and asserts on the request URL, headers, body shape, and the response parsing.
5. Update the keywords in `packages/core/package.json` and the modules table in both READMEs.
6. Document any provider-specific quirks (e.g. system messages handled separately) in JSDoc on the new function.

The branch must use `fetch` directly. **No SDK dependencies.** This is an architectural invariant — see [docs/adr/0002-fetch-only-multi-llm-router.md](./docs/adr/0002-fetch-only-multi-llm-router.md).

## Architectural decisions

If you're proposing a meaningful change to public API, storage interface, or build setup, write an ADR in `docs/adr/`. Number it sequentially. Existing ADRs are short — match the style.

## Commit format

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(core): add Mistral provider to multi-llm router
fix(core): clamp confidence in confirm() when input is NaN
docs(adr): add 0007 — vector store boundary
chore(ci): bump pnpm to 10.34
test(core): cover concentration_limit edge case
```

Allowed scopes: `core`, `supabase`, `examples`, `docs`, `ci`, `repo`. Use `!` for breaking changes (e.g. `feat(core)!: rename evaluateRisk return field`).

## Pull requests

The PR template covers what to fill in. The checkboxes are not optional — in particular:

- [ ] `pnpm -r typecheck` passes locally
- [ ] `pnpm -r test` passes locally (including `no-coupling.test.ts`)
- [ ] `pnpm -r build` passes locally
- [ ] CHANGELOG.md updated under `## [Unreleased]`
- [ ] New public API has JSDoc + a test

## Releasing (maintainers)

1. Land all changes for the release on `main`.
2. Move `## [Unreleased]` entries in root + per-package CHANGELOGs to a new `## [X.Y.Z] - YYYY-MM-DD` section.
3. Bump version in `packages/core/package.json`.
4. Commit: `chore(release): vX.Y.Z`.
5. Tag: `git tag vX.Y.Z && git push --tags`.
6. The `release.yml` workflow publishes `agent-memory-core` to npm with provenance.

## Code of conduct

By participating you agree to abide by [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md). Security issues go through [SECURITY.md](./SECURITY.md), not the public issue tracker.
