import { describe, it, expect } from "vitest";
import { buildEvent } from "../src/guardrails/compliance-log.js";
import type { ComplianceSeverity } from "../src/guardrails/compliance-log.js";

describe("buildEvent", () => {
  it("returns an event with the correct shape", () => {
    const event = buildEvent("risk_tripped", "warning", "Daily loss limit hit");
    expect(event.event_type).toBe("risk_tripped");
    expect(event.severity).toBe("warning");
    expect(event.message).toBe("Daily loss limit hit");
    expect(event.metadata).toBeUndefined();
    expect(typeof event.timestamp).toBe("string");
    expect(() => new Date(event.timestamp)).not.toThrow();
  });

  it("includes metadata when provided", () => {
    const meta = { action_id: "abc-123", amount: 50 };
    const event = buildEvent("action_blocked", "error", "Blocked", meta);
    expect(event.metadata).toEqual(meta);
  });

  it("sets timestamp to approximately now", () => {
    const before = Date.now();
    const event = buildEvent("test", "info", "msg");
    const after = Date.now();
    const ts = new Date(event.timestamp).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  const severities: ComplianceSeverity[] = ["info", "warning", "error", "critical"];
  for (const severity of severities) {
    it(`accepts severity "${severity}"`, () => {
      const event = buildEvent("test", severity, "msg");
      expect(event.severity).toBe(severity);
    });
  }
});
