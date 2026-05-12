# Architecture

`agent-memory-core` is a small, pure-TypeScript library that supplies three things every production agent eventually needs:

1. **Guardrails** — synchronous, side-effect-free checks that decide whether an action is safe to take.
2. **Memory** — persistent, confidence-weighted lessons that survive across sessions.
3. **Provider router** — a single `chat()` function that talks to Anthropic, OpenAI, OpenRouter, or Google without an SDK.

## Layers

```
┌──────────────────────────────────────────────┐
│  Your agent                                  │
│   ├─ proposes action                         │
│   └─ writes lessons after outcomes           │
├──────────────────────────────────────────────┤
│  agent-memory-core                          │
│   ├─ guardrails/  evaluateRisk, kill-switch  │
│   ├─ memory/      recall, save, update,      │
│   │               compact                    │
│   └─ providers/   chat (multi-LLM)           │
├──────────────────────────────────────────────┤
│  Storage (you supply)                        │
│   └─ MemoryStore { search, insert, update,   │
│                    deactivate }              │
└──────────────────────────────────────────────┘
```

## The three flows

### 1. "Should I take this action?"

```ts
const result = evaluateRisk(
  { amount: 100, mode: 'live', metadata: { ticket: 'T-1234' } },
  settings,
  state
);
if (!result.passed) refuse(result.reason);
```

Pure function. Returns in microseconds. Never throws.

### 2. "What have I learned?"

```ts
const lessons = await recall(store, { tags: ['customer-42'] });
const newLesson = await save(store, {
  memory_type: 'lesson',
  title: 'Customer 42 wants a discount',
  content: '...',
  tags: ['customer-42'],
  confidence: 0.6,
});
```

### 3. "Was that lesson right?"

```ts
const updated = await confirm(store, lesson);   // +5%
const updated = await contradict(store, lesson); // -10%
```

See [memory-confidence-model.md](./memory-confidence-model.md) for why the deltas are asymmetric.

## What this library does NOT do

- **It does not know about your domain.** Trading, support, growth — none of it is in the core. Everything is `ActionContext`/`MemoryEntry`/`tags`.
- **It does not own a database.** You implement `MemoryStore`. The Supabase reference package is one option of many.
- **It does not call LLMs unless you call `chat()`.** Compaction takes an optional `summarize` callback so you stay in control of cost.
