# agent-memory

Memory, guardrails, and a multi-LLM router for AI agents. Carved out of a production trading agent and made open-source. **MIT.**

```
packages/
  core/      → @agent-memory/core (npm)
  supabase/  → reference Supabase implementation (migrations + edge functions)

examples/
  customer-support-agent/  → in-memory store + PII kill-switch
  trading-agent/           → synthetic market + action-stream evaluator

docs/
  architecture.md
  memory-confidence-model.md
  guardrail-patterns.md
```

## Install

```bash
pnpm add @agent-memory/core
```

## What you get

- **`evaluateRisk`** — pure function. Caps, halts, drawdown, concentration. Microseconds.
- **`recall` / `save` / `confirm` / `contradict`** — confidence-weighted memory with a +5%/-10% feedback loop.
- **`compact`** — cluster + merge related memories. Optional LLM summarization.
- **`chat`** — fetch-only multi-provider router. Anthropic, OpenAI, OpenRouter, Google.
- **`encryptSecret` / `decryptSecret`** — AES-256-GCM helpers built on Web Crypto.

## Why

Every agent that runs in production ends up rebuilding the same three layers — guardrails, memory, provider routing. This package is those layers, extracted clean.

## Develop

```bash
pnpm install
pnpm -r test
pnpm -r build
```

## License

MIT — see [LICENSE](./LICENSE).
