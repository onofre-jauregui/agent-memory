import { describe, it, expect } from "vitest";
import { evaluateRisk } from "../src/guardrails/risk.js";
import type { ActionContext, RiskSettings, RiskState } from "../src/types.js";

const settings: RiskSettings = {
  max_position_size: 100,
  max_daily_loss: 50,
  max_open_positions: 5,
  max_drawdown_pct: 20,
};

const baseState: RiskState = {
  date: "2026-01-01",
  is_trading_halted: false,
  halt_reason: null,
  daily_pnl: 0,
  open_position_count: 0,
  peak_portfolio_value: 1000,
};

const action = (overrides: Partial<ActionContext> = {}): ActionContext => ({
  amount: 50,
  mode: "live",
  metadata: {},
  ...overrides,
});

describe("evaluateRisk", () => {
  it("simulate mode bypasses all checks", () => {
    const r = evaluateRisk(action({ amount: 999999, mode: "simulate" }), settings, baseState);
    expect(r.passed).toBe(true);
  });

  it("passes when settings null", () => {
    expect(evaluateRisk(action(), null, baseState).passed).toBe(true);
  });

  it("rejects oversized actions", () => {
    const r = evaluateRisk(action({ amount: 200 }), settings, baseState);
    expect(r.passed).toBe(false);
    expect(r.code).toBe("position_size");
  });

  it("rejects when already halted", () => {
    const r = evaluateRisk(
      action(),
      settings,
      { ...baseState, is_trading_halted: true, halt_reason: "manual" }
    );
    expect(r.passed).toBe(false);
    expect(r.code).toBe("trading_halted");
  });

  it("trips daily loss limit", () => {
    const r = evaluateRisk(
      action(),
      settings,
      { ...baseState, daily_pnl: -50 }
    );
    expect(r.passed).toBe(false);
    expect(r.code).toBe("daily_loss_limit");
    expect(r.newHaltReason).toBeTruthy();
  });

  it("trips open positions limit", () => {
    const r = evaluateRisk(
      action(),
      settings,
      { ...baseState, open_position_count: 5 }
    );
    expect(r.passed).toBe(false);
    expect(r.code).toBe("open_positions_limit");
  });

  it("trips drawdown limit", () => {
    // Loose daily loss cap so drawdown fires first (peak 1000, pnl -250 = 25% dd)
    const looseSettings = { ...settings, max_daily_loss: 10000 };
    const r = evaluateRisk(
      action(),
      looseSettings,
      { ...baseState, daily_pnl: -250, peak_portfolio_value: 1000 }
    );
    expect(r.passed).toBe(false);
    expect(r.code).toBe("drawdown_limit");
  });

  it("trips concentration when single action > 25% of peak", () => {
    const r = evaluateRisk(
      action({ amount: 90 }),
      { ...settings, max_position_size: 1000 },
      { ...baseState, peak_portfolio_value: 200 }
    );
    expect(r.passed).toBe(false);
    expect(r.code).toBe("concentration_limit");
  });

  it("passes a valid live action", () => {
    expect(evaluateRisk(action({ amount: 10 }), settings, baseState).passed).toBe(true);
  });
});
