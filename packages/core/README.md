# @agent-memory/core

Memory + guardrails + multi-LLM router for AI agents. Pure TypeScript. No SDK lock-in.

```bash
pnpm add @agent-memory/core
```

## Why

Every production agent ends up writing the same three pieces:

1. A risk check that decides whether an action is safe.
2. A persistent memory of what's worked and what hasn't.
3. A provider router that lets you swap LLMs.

This library is those three pieces, extracted from a real agent that ran in production.

## Quick start

```ts
import {
  evaluateRisk,
  recall,
  save,
  confirm,
  contradict,
  chat,
  type ActionContext,
  type RiskSettings,
  type RiskState,
} from '@agent-memory/core';

// 1. Guardrail
const action: ActionContext = { amount: 100, mode: 'live', metadata: {} };
const result = evaluateRisk(action, settings, state);
if (!result.passed) throw new Error(result.reason);

// 2. Memory (you implement MemoryStore)
const lessons = await recall(store, { tags: ['customer-42'] });
const newLesson = await save(store, {
  memory_type: 'lesson',
  title: 'Always confirm refund amount',
  content: 'Customers expect a number in the first reply.',
  tags: ['customer-42'],
  confidence: 0.7,
});

// 3. Multi-LLM
const reply = await chat({
  provider: 'anthropic',
  model: 'claude-opus-4-6',
  apiKey: process.env.ANTHROPIC_KEY!,
  messages: [{ role: 'user', content: 'Hello' }],
});
```

## Modules

| Path                          | Purpose                                       |
| ----------------------------- | --------------------------------------------- |
| `@agent-memory/core`          | Everything — re-exports all submodules        |
| `@agent-memory/core/guardrails` | `evaluateRisk`, kill-switches, compliance log |
| `@agent-memory/core/memory`   | `recall`, `save`, `confirm`, `contradict`, `compact` |
| `@agent-memory/core/providers`| `chat()` — anthropic, openai, openrouter, google |

## MemoryStore interface

```ts
interface MemoryStore {
  search(opts: MemorySearchOptions): Promise<MemoryEntry[]>;
  insert(entry: Omit<MemoryEntry, 'id' | 'created_at' | 'updated_at'>): Promise<MemoryEntry>;
  update(id: string, patch: Partial<MemoryEntry>): Promise<MemoryEntry>;
  deactivate(id: string): Promise<void>;
}
```

A reference Supabase implementation lives in `packages/supabase` of the source repo. See `examples/customer-support-agent` for an in-memory implementation.

## License

MIT.
