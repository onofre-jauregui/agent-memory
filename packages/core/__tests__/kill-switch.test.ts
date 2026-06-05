import { describe, it, expect } from "vitest";
import {
  checkSpendingCap,
  checkRateLimit,
} from "../src/guardrails/kill-switch.js";
import type { ActionEvent, SpendingCap, RateLimit } from "../src/guardrails/kill-switch.js";

const NOW = 1_700_000_000_000;

function event(amount: number, msBefore = 0): ActionEvent {
  return { amount, timestamp: NOW - msBefore };
}

describe("checkSpendingCap", () => {
  const cap: SpendingCap = { limit: 100, windowMs: 60_000 };

  it("allows action that stays under the cap", () => {
    const result = checkSpendingCap([event(30, 1000)], event(40), cap);
    expect(result.tripped).toBe(false);
  });

  it("trips when cumulative spend would exceed cap", () => {
    const result = checkSpendingCap([event(80, 1000)], event(30), cap);
    expect(result.tripped).toBe(true);
    expect(result.cause).toBe("spending");
    expect(result.reason).toBeTruthy();
  });

  it("ignores history outside the window", () => {
    const oldEvent = event(99, cap.windowMs + 1);
    const result = checkSpendingCap([oldEvent], event(99), cap);
    expect(result.tripped).toBe(false);
  });

  it("handles empty history", () => {
    const result = checkSpendingCap([], event(50), cap);
    expect(result.tripped).toBe(false);
  });

  it("trips at exact boundary (proposed pushes total over limit)", () => {
    const result = checkSpendingCap([event(80, 500)], event(21), cap);
    expect(result.tripped).toBe(true);
  });
});

describe("checkRateLimit", () => {
  const limit: RateLimit = { maxActions: 3, windowMs: 60_000 };

  it("allows action within the rate limit", () => {
    const history = [event(1, 5000), event(1, 10000)];
    const result = checkRateLimit(history, event(1), limit);
    expect(result.tripped).toBe(false);
  });

  it("trips when count would exceed maxActions", () => {
    const history = [event(1, 1000), event(1, 2000), event(1, 3000)];
    const result = checkRateLimit(history, event(1), limit);
    expect(result.tripped).toBe(true);
    expect(result.cause).toBe("rate");
    expect(result.reason).toBeTruthy();
  });

  it("ignores history outside the window", () => {
    const history = [
      event(1, limit.windowMs + 1),
      event(1, limit.windowMs + 2),
      event(1, limit.windowMs + 3),
    ];
    const result = checkRateLimit(history, event(1), limit);
    expect(result.tripped).toBe(false);
  });
});
