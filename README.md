# agent-memory

Memory, guardrails, and a multi-LLM router for production AI agents. Carved out of a production trading agent. **MIT.**

> Every agent that runs in production ends up rebuilding the same three layers — risk guardrails, persistent memory, and provider routing. This is those three layers, extracted clean. No SDK lock-in, no DB lock-in. Pure TypeScript. `fetch`-only.

```
packages/
  core/      → agent-memory-core (npm-publishable, framework-free)
  supabase/  → reference Supabase implementation (migrations + edge functions)

examples/
  customer-support-agent/  → in-memory store + PII kill-switch demo
  trading-agent/           → synthetic market + action-stream evaluator

docs/
  architecture.md            → end-to-end data flow
  memory-confidence-model.md → +5/-10% feedback loop, explained
  guardrail-patterns.md      → spending caps, rate limits, kill switches
```

## Install

```bash
pnpm add agent-memory-core
```

## What you get

- **`evaluateRisk`** — pure function. Caps, halts, drawdown, concentration. Microseconds. No I/O.
- **`recall` / `save` / `confirm` / `contradict`** — confidence-weighted memory with a +5/-10% feedback loop.
- **`compact`** — cluster + merge related memories. Optional LLM summarization callback.
- **`chat`** — fetch-only multi-provider router. Anthropic, OpenAI, OpenRouter, Google. No SDK deps.
- **`encryptSecret` / `decryptSecret`** — AES-256-GCM via Web Crypto. Runs in Node, Deno, Edge, browser.

## Quickstart — guardrails

```ts
import { evaluateRisk } from "agent-memory-core";

const settings = {
  per_action_cap: 100,
  daily_loss_limit: 500,
  max_drawdown_pct: 20,
  concentration_cap_pct: 25,
};

const state = {
  daily_loss: 120,
  open_exposure: 300,
  peak_value: 1000,
  current_value: 950,
};

const result = evaluateRisk(
  { amount: 50, mode: "live" },
  settings,
  state,
);

if (!result.allowed) {
  console.log(result.reason); // e.g. "concentration_limit"
  return;
}
// safe to proceed
```

## Quickstart — memory

```ts
import { save, recall, confirm } from "agent-memory-core";

// Persist a lesson tied to an action
await save(store, {
  agent_id: "support-bot",
  context_id: "ticket-9342",
  type: "lesson",
  content: "When customer mentions 'urgent', pull SLA tier before replying.",
  confidence: 0.5,
});

// Retrieve later when handling a similar context
const memories = await recall(store, {
  agent_id: "support-bot",
  context_id: "ticket-9342",
  limit: 5,
});

// Reinforce after a successful outcome
await confirm(store, memoryId, { outcome_score: 1.0 });
// → confidence floats toward 1.0 (+5%)
```

## Quickstart — multi-provider chat

```ts
import { chat } from "agent-memory-core";

const { content, usage } = await chat({
  provider: "anthropic", // or "openai" | "openrouter" | "google"
  model: "claude-sonnet-4-5-20250929",
  apiKey: process.env.ANTHROPIC_API_KEY!,
  messages: [
    { role: "system", content: "You are a helpful agent." },
    { role: "user", content: "What's the weather like?" },
  ],
  temperature: 0.7,
  maxTokens: 1024,
});
```

## Examples

Two end-to-end examples in `examples/`:

- **`customer-support-agent/`** — in-memory store, PII regex kill-switch, recall/save loop on incoming tickets. Run with `pnpm --filter customer-support-agent start`.
- **`trading-agent/`** — synthetic `BinaryEventMarket` (deliberately not Kalshi/Polymarket), implements the `evaluateActionStream` pattern showing how host code wraps the generic guardrails for a specific domain. Run with `pnpm --filter trading-agent start`.

## Reference architecture (Supabase)

`packages/supabase/` ships a reference implementation showing how the core primitives compose against a real database:

- 4 migrations (`agent_memory`, `memory_compaction`, `risk_settings`, `compliance_log`)
- 3 Edge Functions (`auto-reflect` for the hourly confidence feedback loop, `compact-memory` for token-budgeted summarization, `list-ai-models` for the multi-provider router endpoint)

Apply the migrations to any Supabase project, deploy the functions, and you have a production-ready agent backend. See `packages/supabase/README.md` for setup.

## Why this exists

Most "agent frameworks" couple memory + risk + provider routing into a monolith you can't extract from. This is the opposite — three small primitives that compose, with a working reference implementation showing how to compose them. Use the core package as a lib, copy the Supabase reference as a starting point, or fork either.

## Develop

```bash
pnpm install
pnpm -r test       # 39/39 tests, including no-coupling enforcement
pnpm -r typecheck
pnpm -r build      # ESM + .d.ts
```

## Contributing

Issues and PRs welcome. The `no-coupling.test.ts` enforces zero domain-specific tokens in `packages/core/src/` — keep it that way. Domain-specific logic (trading, support, scheduling, etc.) belongs in `examples/` or in your own consumer code, never in `core`.

## License

MIT — see [LICENSE](./LICENSE).
