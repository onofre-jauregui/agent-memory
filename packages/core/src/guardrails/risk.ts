/**
 * Pure risk-management evaluation. No I/O, no SDK imports.
 *
 * The caller is responsible for:
 *  - Loading RiskSettings and RiskState from their store
 *  - Persisting compliance log entries based on the result
 *  - Updating RiskState after an action completes
 *
 * This module only answers: "given these inputs, should this action be allowed?"
 *
 * Order of checks (matches the original production policy):
 *   1. position size
 *   2. halted state
 *   3. daily loss limit
 *   4. open positions limit
 *   5. drawdown limit
 *   6. single-action concentration (>25% of peak portfolio)
 */

import type {
  ActionContext,
  RiskEvaluationResult,
  RiskSettings,
  RiskState,
} from "../types.js";

export function evaluateRisk(
  action: ActionContext,
  settings: RiskSettings | null,
  state: RiskState | null
): RiskEvaluationResult {
  const { amount, mode } = action;

  // simulate mode bypasses all checks
  if (mode === "simulate") return { passed: true };
  if (!settings) return { passed: true };

  // 1. Position size
  if (amount > settings.max_position_size) {
    return {
      passed: false,
      code: "position_size",
      reason: `Action amount ${amount} exceeds max position size ${settings.max_position_size}`,
    };
  }

  if (!state) return { passed: true };

  // 2. Already halted
  if (state.is_trading_halted) {
    return {
      passed: false,
      code: "trading_halted",
      reason: `Agent halted: ${state.halt_reason || "daily limits exceeded"}`,
    };
  }

  // 3. Daily loss limit
  if (
    Math.abs(state.daily_pnl) >= settings.max_daily_loss &&
    state.daily_pnl < 0
  ) {
    return {
      passed: false,
      code: "daily_loss_limit",
      reason: `Daily loss limit of ${settings.max_daily_loss} reached. Halted for today.`,
      newHaltReason: `Daily loss limit of ${settings.max_daily_loss} reached`,
    };
  }

  // 4. Max open positions
  if (state.open_position_count >= settings.max_open_positions) {
    return {
      passed: false,
      code: "open_positions_limit",
      reason: `Maximum open actions (${settings.max_open_positions}) reached. Resolve one first.`,
    };
  }

  // 5. Drawdown limit
  if (state.peak_portfolio_value > 0 && state.daily_pnl < 0) {
    const currentValue = state.peak_portfolio_value + state.daily_pnl;
    const drawdownPct =
      ((state.peak_portfolio_value - currentValue) /
        state.peak_portfolio_value) *
      100;
    if (drawdownPct >= settings.max_drawdown_pct) {
      return {
        passed: false,
        code: "drawdown_limit",
        reason: `Max drawdown of ${settings.max_drawdown_pct}% exceeded (current: ${drawdownPct.toFixed(1)}%). Halted.`,
        newHaltReason: `Max drawdown of ${settings.max_drawdown_pct}% exceeded (current: ${drawdownPct.toFixed(1)}%)`,
      };
    }
  }

  // 6. Single-action concentration: no action > 25% of peak portfolio value
  if (state.peak_portfolio_value > 0) {
    const concentrationPct = (amount / state.peak_portfolio_value) * 100;
    if (concentrationPct > 25) {
      return {
        passed: false,
        code: "concentration_limit",
        reason: `Action amount ${amount} exceeds 25% portfolio concentration limit (portfolio: ${state.peak_portfolio_value}).`,
      };
    }
  }

  return { passed: true };
}
