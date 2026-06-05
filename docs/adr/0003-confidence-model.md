# ADR 0003: Asymmetric Confidence Model (+5% / -10%)

**Status:** Accepted  
**Date:** 2026-04-29

## Context

Memories need a confidence score that reflects how reliable the pattern has proven over time. A naive average treats confirmations and contradictions symmetrically, but this is not how beliefs should update: a single disconfirmation is stronger evidence than a single confirmation, because confirmations can come from lucky runs while a contradiction reveals a real gap in the model.

## Decision

Adopt an asymmetric update rule extracted from the source trading agent:

- `confirm()` adds `+0.05` (5%) to confidence, capped at `0.95`
- `contradict()` subtracts `0.10` (10%) from confidence, floored at `0.05`

This is the same ratio used in Bayesian-flavored belief update heuristics: negative evidence is weighted 2× positive evidence to model confirmation bias resistance.

The `auto-reflect` edge function applies these same deltas automatically on a schedule, driven by outcome scores from linked actions.

## Consequences

- **Positive:** Memories that are consistently useful float toward 0.95. Memories that predict badly decay quickly and can be deactivated.
- **Positive:** The same math runs in the core pure functions and in the scheduled edge function — no divergence.
- **Negative:** The 5/10 split is a heuristic. No claim is made that it is statistically optimal for any specific domain. Host applications may want to tune the deltas via configuration in future versions.
