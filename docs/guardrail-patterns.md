# Guardrail patterns

Three guardrail layers ship with `@agent-memory/core/guardrails`:

| Layer            | What it stops                          | When to use                  |
|------------------|----------------------------------------|------------------------------|
| `evaluateRisk`   | Single oversized / out-of-policy action| Every action, every time     |
| `checkSpendingCap`| Cumulative spend over a window        | Outbound agents, paid APIs   |
| `checkRateLimit` | Too many actions per window            | Anti-spam, fairness          |

## Pattern: every action goes through the gauntlet

```ts
function safeExecute(action: ActionContext, history: ActionEvent[]) {
  // 1. Static policy check
  const r1 = evaluateRisk(action, settings, state);
  if (!r1.passed) return { ok: false, reason: r1.reason };

  // 2. Cumulative spend
  const proposedEvent = { amount: action.amount, timestamp: Date.now() };
  const r2 = checkSpendingCap(history, proposedEvent, { limit: 1000, windowMs: 86400000 });
  if (r2.tripped) return { ok: false, reason: r2.reason };

  // 3. Rate
  const r3 = checkRateLimit(history, proposedEvent, { maxActions: 50, windowMs: 3600000 });
  if (r3.tripped) return { ok: false, reason: r3.reason };

  return { ok: true };
}
```

## Pattern: simulate vs live

```ts
const action = { amount: 100, mode: isPaperMode ? 'simulate' : 'live', metadata: {} };
```

`evaluateRisk` short-circuits to `passed: true` whenever `mode === 'simulate'`. This is intentional: simulations should never be blocked by real-world caps, but they should still travel through the same code path so production and simulation stay isomorphic.

## Pattern: kill-switch on content

The risk evaluator only knows about `amount`. For agents that produce free-form output (emails, messages, code), add a content-level kill switch:

```ts
function piiKillSwitch(draft: string) {
  if (/\b\d{3}-\d{2}-\d{4}\b/.test(draft)) return { tripped: true, reason: "SSN" };
  if (/\b(?:\d[ -]*?){13,16}\b/.test(draft)) return { tripped: true, reason: "card number" };
  return { tripped: false };
}
```

See `examples/customer-support-agent` for a full implementation.

## Pattern: log everything

The `compliance-log` module gives you a uniform shape for audit events. Pair it with any append-only store (Supabase table, S3 file, log line):

```ts
const event = buildEvent('refund_blocked', 'warning', `Blocked refund: ${r.reason}`, {
  ticket: action.metadata?.ticket,
  amount: action.amount,
});
await sink.log(event);
```
