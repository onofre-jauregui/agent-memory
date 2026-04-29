# Memory confidence model

Every memory has a `confidence` field in `[0, 1]`. The library updates it via two operations:

| Operation     | Δ confidence | Floor / cap |
|---------------|--------------|-------------|
| `confirm`     | +0.05        | cap 0.95    |
| `contradict`  | -0.10        | floor 0.05  |

## Why asymmetric

A pattern needs many confirmations to become trusted, but a single contradiction is strong evidence the pattern is wrong. The 5%/10% split was tuned in the source trading agent over ~6 months of paper trading — confirming was cheap (most things kept working), contradictions were rare and load-bearing.

## When to call which

```
Action completes → outcome positive  → confirm()
Action completes → outcome negative  → contradict()
Action completes → outcome neutral   → no change
```

For batched / scheduled feedback (e.g., the `auto-reflect` Supabase function), use the average outcome across all linked actions to decide direction. The function uses the same +5/-10 numbers.

## When confidence drops below 0.15

The reference `auto-reflect` function logs a `memory_low_confidence` compliance event but **does not** auto-deactivate. The reasoning:

- Aggregate evidence may still be useful even if recent batches contradict.
- A human (or higher-level agent) should decide when to retire a memory.
- Soft floor at 0.05 prevents the value from becoming meaningless.

If you want auto-deactivation, call `deactivate(store, id)` from your own scheduler when `confidence < threshold` and `contradictions > N`.
