# @agent-memory/core

Memory, guardrails, and a multi-LLM router for production AI agents.  
Pure TypeScript · `fetch`-only · no SDK dependencies · MIT.

```bash
npm add @agent-memory/core
# or
pnpm add @agent-memory/core
```

**Requires Node 18+ (or any runtime with Web Crypto + `fetch`).**

---

## What it is

Three independent layers you can use together or separately:

| Layer | What it does |
|---|---|
| **Memory** | Persist, recall, and reinforce lessons across agent runs |
| **Guardrails** | Pure-function risk evaluation + kill-switches before any action |
| **Providers** | Fetch-based multi-LLM router (Anthropic, OpenAI, OpenRouter, Google) |

---

## Quick start — 60-second example

```ts
import {
  evaluateRisk,
  save,
  recall,
  confirm,
  chat,
  type RiskSettings,
  type RiskState,
  type ActionContext,
} from "@agent-memory/core";

// 1. Guardrail — pure function, no I/O
const settings: RiskSettings = {
  max_position_size: 200,
  max_daily_loss: 1000,
  max_open_positions: 50,
  max_drawdown_pct: 30,
};
const state: RiskState = {
  date: new Date().toISOString().slice(0, 10),
  is_trading_halted: false,
  halt_reason: null,
  daily_pnl: -200,
  open_position_count: 3,
  peak_portfolio_value: 5000,
};
const action: ActionContext = { amount: 150, mode: "live" };
const result = evaluateRisk(action, settings, state);
if (!result.passed) throw new Error(result.reason);

// 2. Memory — bring your own store (see MemoryStore section below)
const store = makeInMemoryStore(); // copy-paste implementation below
const lesson = await save(store, {
  memory_type: "lesson",
  title: "Always confirm amount before acting",
  content: "User X expects a confirmation message with the exact dollar amount before any refund.",
  tags: ["user-x", "refund"],
  confidence: 0.6,
});
await confirm(store, lesson); // confidence → 0.65

const past = await recall(store, { tags: ["refund"] });

// 3. LLM call — no SDK needed
const reply = await chat({
  provider: "anthropic",
  model: "claude-sonnet-4-6",
  apiKey: process.env.ANTHROPIC_KEY!,
  messages: [{ role: "user", content: "Summarize the user's complaint." }],
});
console.log(reply.content, reply.usage); // { input: 12, output: 48 }
```

---

## MemoryStore — bring your own

The memory layer is store-agnostic. You implement the four-method `MemoryStore` interface.

### Interface

```ts
interface MemoryStore {
  search(opts: MemorySearchOptions): Promise<MemoryEntry[]>;
  insert(entry: Omit<MemoryEntry, "id" | "created_at" | "updated_at">): Promise<MemoryEntry>;
  update(id: string, patch: Partial<MemoryEntry>): Promise<MemoryEntry>;
  deactivate(id: string): Promise<void>; // soft delete: set is_active = false
}

interface MemorySearchOptions {
  tags?: string[];
  context_id?: string | null;
  text?: string;           // substring match on title + content
  memory_type?: MemoryType;
  is_active?: boolean;
  limit?: number;
  user_id?: string | null;
}
```

### Copy-paste in-memory implementation (no DB needed)

```ts
import type { MemoryEntry, MemoryStore, MemorySearchOptions } from "@agent-memory/core";

function makeInMemoryStore(): MemoryStore {
  let nextId = 1;
  const rows: MemoryEntry[] = [];

  return {
    async search(opts: MemorySearchOptions) {
      let r = rows.filter((m) =>
        opts.is_active === undefined ? true : m.is_active === opts.is_active
      );
      if (opts.tags?.length)
        r = r.filter((m) => opts.tags!.every((t) => m.tags.includes(t)));
      if (opts.memory_type)
        r = r.filter((m) => m.memory_type === opts.memory_type);
      if (opts.context_id !== undefined)
        r = r.filter((m) => m.context_id === opts.context_id);
      if (opts.user_id !== undefined)
        r = r.filter((m) => m.user_id === opts.user_id);
      if (opts.text) {
        const t = opts.text.toLowerCase();
        r = r.filter(
          (m) =>
            m.title.toLowerCase().includes(t) ||
            m.content.toLowerCase().includes(t)
        );
      }
      return r
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, opts.limit ?? 50);
    },

    async insert(entry) {
      const row: MemoryEntry = {
        ...entry,
        id: `m_${nextId++}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      rows.push(row);
      return row;
    },

    async update(id, patch) {
      const i = rows.findIndex((r) => r.id === id);
      if (i < 0) throw new Error(`Memory not found: ${id}`);
      rows[i] = { ...rows[i]!, ...patch, updated_at: new Date().toISOString() };
      return rows[i]!;
    },

    async deactivate(id) {
      const i = rows.findIndex((r) => r.id === id);
      if (i >= 0) rows[i] = { ...rows[i]!, is_active: false };
    },
  };
}
```

A production Supabase implementation is in [`packages/supabase`](../../packages/supabase/README.md) — copy-paste SQL migrations + edge functions, not published to npm.

---

## Memory API

### `save(store, input): Promise<MemoryEntry>`

Persist a new memory. Only `memory_type`, `title`, and `content` are required.

```ts
const lesson = await save(store, {
  memory_type: "lesson",      // "lesson" | "pattern" | "mistake" | "success" | "observation" | "insight" | "feedback"
  title: "Short descriptive title",
  content: "Full text the agent should recall later.",

  // All optional:
  source_type: "reflection",  // "reflection" | "action_outcome" | "user_feedback" | "external_observation" | "manual" — default "reflection"
  tags: ["user-42", "billing"],
  context_id: "support-queue", // group memories by topic/channel
  confidence: 0.6,             // 0..1, default 0.5
  user_id: "usr_abc",          // for multi-tenant stores
  summary: "One-line summary.", // used by compact()
  related_action_ids: ["act_1"], // opaque strings linking to source actions
});
```

### `recall(store, opts?): Promise<MemoryEntry[]>`

Returns active memories sorted by confidence descending, capped at 50 by default.

```ts
const memories = await recall(store, {
  tags: ["billing"],
  context_id: "support-queue",
  text: "discount",
  memory_type: "lesson",
  limit: 10,
  user_id: "usr_abc",
});
```

### `confirm(store, memory): Promise<MemoryEntry>`

Reinforces a memory: confidence +5% (capped at 0.95), confirmations +1.

```ts
const updated = await confirm(store, memory); // needs .id, .confidence, .confirmations
```

### `contradict(store, memory): Promise<MemoryEntry>`

Weakens a memory: confidence −10% (floor 0.05), contradictions +1.  
Asymmetric by design — contradictions shift belief faster than confirmations.

```ts
const updated = await contradict(store, memory); // needs .id, .confidence, .contradictions
```

### `deactivate(store, id): Promise<void>`

Soft-deletes a memory (sets `is_active = false`).

```ts
await deactivate(store, "m_42");
```

### `update(store, id, patch): Promise<MemoryEntry>`

Generic patch for any field.

```ts
await update(store, "m_42", { title: "Updated title", tags: ["new-tag"] });
```

### `compact(store, candidates, opts?): Promise<CompactResult>`

Clusters related memories by tag overlap and optionally merges them via an LLM summarizer. Use this to keep context windows small after many agent runs.

```ts
import { recall, compact, chat } from "@agent-memory/core";

const all = await recall(store, { limit: 200 });
const result = await compact(store, all, {
  minTagOverlap: 2,     // memories need ≥2 overlapping tags to cluster (default 1)
  minClusterSize: 3,    // cluster must have ≥3 members to merge (default 3)
  maxMergesPerRun: 5,   // cap merges per call (default 3)

  // Optional LLM summarizer — without this, compact() groups but does not merge
  summarize: async (clusterText, count) => {
    const r = await chat({
      provider: "anthropic",
      model: "claude-haiku-4-5",
      apiKey: process.env.ANTHROPIC_KEY!,
      messages: [{
        role: "user",
        content: `Merge these ${count} agent memories into one.\n\n${clusterText}\n\nReply with: TITLE: ...\nCONTENT: ...`,
      }],
    });
    const title = r.content.match(/TITLE:\s*(.+)/)?.[1] ?? "Summary";
    const content = r.content.match(/CONTENT:\s*([\s\S]+)/)?.[1] ?? r.content;
    return { title, content };
  },
});

console.log(result);
// { clustersFound: 4, merged: 2, tokensSaved: 380 }
```

---

## Guardrails API

### `evaluateRisk(action, settings, state): RiskEvaluationResult`

Pure function — zero I/O. Evaluates one action against six checks in order:

1. Position size (`max_position_size`)
2. Agent already halted (`is_trading_halted`)
3. Daily loss limit (`max_daily_loss` vs `daily_pnl`)
4. Open positions count (`max_open_positions`)
5. Drawdown from peak (`max_drawdown_pct`)
6. Single-action concentration (hardcoded 25% of `peak_portfolio_value`)

Returns on the first failed check.

```ts
import {
  evaluateRisk,
  type ActionContext,
  type RiskSettings,
  type RiskState,
} from "@agent-memory/core";

const settings: RiskSettings = {
  max_position_size: 500,
  max_daily_loss: 2000,
  max_open_positions: 10,
  max_drawdown_pct: 25,
};
const state: RiskState = {
  date: "2026-05-12",
  is_trading_halted: false,
  halt_reason: null,
  daily_pnl: -400,            // negative = losses / spend so far today
  open_position_count: 3,
  peak_portfolio_value: 8000,
};

const result = evaluateRisk({ amount: 300, mode: "live" }, settings, state);

if (!result.passed) {
  console.error(result.code);   // "position_size" | "trading_halted" | "daily_loss_limit"
                                 // "open_positions_limit" | "drawdown_limit" | "concentration_limit"
  console.error(result.reason); // human-readable explanation

  // If newHaltReason is set, persist a halt before the next call
  if (result.newHaltReason) {
    state.is_trading_halted = true;
    state.halt_reason = result.newHaltReason;
  }
}

// simulate mode bypasses all checks:
evaluateRisk({ amount: 999999, mode: "simulate" }, settings, state); // { passed: true }
```

### `checkSpendingCap(history, proposed, cap): KillSwitchResult`

Sliding-window spend cap. Returns `{ tripped: true }` if accepting `proposed` would push the total over `cap.limit` within `cap.windowMs`.

```ts
import { checkSpendingCap, type ActionEvent, type SpendingCap } from "@agent-memory/core";

const history: ActionEvent[] = [
  { amount: 40, timestamp: Date.now() - 30_000 },
  { amount: 30, timestamp: Date.now() - 10_000 },
];
const cap: SpendingCap = { limit: 100, windowMs: 60_000 }; // $100/minute
const r = checkSpendingCap(history, { amount: 50, timestamp: Date.now() }, cap);
// r.tripped === true  (40 + 30 + 50 = 120 > 100)
// r.cause === "spending"
```

### `checkRateLimit(history, proposed, limit): KillSwitchResult`

Sliding-window action count cap.

```ts
import { checkRateLimit, type RateLimit } from "@agent-memory/core";

const limit: RateLimit = { maxActions: 5, windowMs: 60_000 }; // 5 actions/minute
const r = checkRateLimit(history, { amount: 1, timestamp: Date.now() }, limit);
// r.tripped === true if history has ≥5 events in the window
// r.cause === "rate"
```

### `buildEvent(type, severity, message, metadata?)`: compliance log

Build a structured audit event. Sink it wherever you want.

```ts
import { buildEvent, type ComplianceSink } from "@agent-memory/core";

const event = buildEvent("risk_rejected", "warning", "Position size exceeded", {
  action_amount: 600,
  limit: 500,
});
// { event_type, severity, message, metadata, timestamp: ISO string }

const sink: ComplianceSink = {
  log: async (e) => { await db.from("compliance_log").insert(e); },
};
await sink.log(event);
```

---

## Providers API

### `chat(opts): Promise<ChatResult>`

Fetch-based LLM router. No SDK installed — uses the raw HTTP API of each provider.  
**No env vars are read by this library.** You pass API keys explicitly on each call.

```ts
import { chat } from "@agent-memory/core";

// Anthropic
await chat({
  provider: "anthropic",
  model: "claude-sonnet-4-6",
  apiKey: process.env.ANTHROPIC_KEY!,
  messages: [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: "Hello" },
  ],
  temperature: 0.7,   // optional
  maxTokens: 512,     // optional
});

// OpenAI
await chat({ provider: "openai", model: "gpt-4o", apiKey: process.env.OPENAI_KEY!, messages: [...] });

// OpenRouter (access any model via one key)
await chat({ provider: "openrouter", model: "anthropic/claude-sonnet-4-6", apiKey: process.env.OPENROUTER_KEY!, messages: [...] });

// Google Gemini
await chat({ provider: "google", model: "gemini-2.0-flash", apiKey: process.env.GOOGLE_KEY!, messages: [...] });
```

Return shape:
```ts
interface ChatResult {
  content: string;
  usage: { input: number; output: number };
}
```

---

## Encryption API

AES-256-GCM via Web Crypto. Works in Node 18+, Deno, Bun, and modern browsers.

```ts
import { importMasterKey, encryptSecret, decryptSecret } from "@agent-memory/core";

// Generate a key once: openssl rand -base64 32
const key = await importMasterKey(process.env.MASTER_KEY!); // 32-byte base64 string

const { ciphertext, iv } = await encryptSecret(key, "my-api-token");
// Both are base64 strings — safe to store in DB

const plain = await decryptSecret(key, ciphertext, iv);
// plain === "my-api-token"
```

---

## Multi-tenancy helpers

Scope DB queries by `user_id`. Works with any Supabase-style query builder.

```ts
import {
  resolveTenant,
  applyTenantFilter,
  tenantInsertFields,
  loadTenantRow,
  type TenantContext,
} from "@agent-memory/core";

// Resolve tenant from a JWT Authorization header
const ctx: TenantContext = await resolveTenant(supabase, req.headers.get("authorization"));
// { userId: "usr_abc" | null, authenticated: boolean }

const query = applyTenantFilter(supabase.from("memories").select("*"), ctx);
const fields = tenantInsertFields(ctx); // { user_id: "usr_abc" } or {}
const row = await loadTenantRow(supabase, ctx, "risk_settings", "user_settings");
```

---

## Subpath imports

```ts
import { evaluateRisk } from "@agent-memory/core/guardrails";
import { recall, save }  from "@agent-memory/core/memory";
import { chat }          from "@agent-memory/core/providers";
```

---

## Full types reference

```ts
// Action
type AgentMode = "simulate" | "live";
interface ActionContext { amount: number; mode: AgentMode; metadata?: Record<string, unknown>; }

// Risk
interface RiskSettings { max_position_size: number; max_daily_loss: number; max_open_positions: number; max_drawdown_pct: number; }
interface RiskState { date: string; is_trading_halted: boolean; halt_reason: string | null; daily_pnl: number; open_position_count: number; peak_portfolio_value: number; }
interface RiskEvaluationResult { passed: boolean; reason?: string; code?: RiskRejectionCode; newHaltReason?: string; }
type RiskRejectionCode = "position_size" | "trading_halted" | "daily_loss_limit" | "open_positions_limit" | "drawdown_limit" | "concentration_limit";

// Kill-switch
interface SpendingCap { limit: number; windowMs: number; }
interface RateLimit { maxActions: number; windowMs: number; }
interface ActionEvent { amount: number; timestamp: number; }
interface KillSwitchResult { tripped: boolean; reason?: string; cause?: "spending" | "rate"; }

// Compliance
type ComplianceSeverity = "info" | "warning" | "error" | "critical";
interface ComplianceEvent { event_type: string; severity: ComplianceSeverity; message: string; metadata?: Record<string, unknown>; timestamp: string; }
interface ComplianceSink { log(event: ComplianceEvent): Promise<void> | void; }

// Memory
type MemoryType = "lesson" | "pattern" | "mistake" | "success" | "observation" | "insight" | "feedback";
type MemorySource = "reflection" | "action_outcome" | "user_feedback" | "external_observation" | "manual";
interface MemoryEntry {
  id: string; memory_type: MemoryType; title: string; content: string;
  summary?: string | null; source_type: MemorySource; related_action_ids?: string[];
  context_id?: string | null; tags: string[]; confidence: number;
  confirmations: number; contradictions: number; is_active: boolean;
  merged_into?: string | null; child_count?: number; token_estimate?: number;
  created_at?: string; updated_at?: string; user_id?: string | null;
}

// Providers
type LLMProvider = "anthropic" | "openai" | "openrouter" | "google";
interface ChatMessage { role: "system" | "user" | "assistant"; content: string; }
interface ChatOptions { provider: LLMProvider; model: string; apiKey: string; messages: ChatMessage[]; temperature?: number; maxTokens?: number; }
interface ChatResult { content: string; usage: { input: number; output: number }; }
```

---

## License

MIT © Onofre Jauregui — [github.com/onofre-jauregui/agent-memory](https://github.com/onofre-jauregui/agent-memory)
