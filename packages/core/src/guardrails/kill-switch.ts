/**
 * Spending caps and rate limits. A "kill switch" is a coarser guardrail than
 * `evaluateRisk` — it watches aggregates over a window and trips when
 * thresholds are exceeded.
 */

export interface SpendingCap {
  /** Max amount the agent may spend in the window. */
  limit: number;
  /** Window in milliseconds. */
  windowMs: number;
}

export interface RateLimit {
  /** Max number of actions in the window. */
  maxActions: number;
  /** Window in milliseconds. */
  windowMs: number;
}

export interface ActionEvent {
  amount: number;
  /** Epoch milliseconds. */
  timestamp: number;
}

export interface KillSwitchResult {
  tripped: boolean;
  reason?: string;
  /** Which constraint failed: "spending" or "rate". */
  cause?: "spending" | "rate";
}

/** Returns true if accepting `proposed` would exceed `cap` within the window. */
export function checkSpendingCap(
  history: ActionEvent[],
  proposed: ActionEvent,
  cap: SpendingCap
): KillSwitchResult {
  const cutoff = proposed.timestamp - cap.windowMs;
  const spentInWindow = history
    .filter((e) => e.timestamp >= cutoff)
    .reduce((sum, e) => sum + Math.abs(e.amount), 0);

  if (spentInWindow + Math.abs(proposed.amount) > cap.limit) {
    return {
      tripped: true,
      cause: "spending",
      reason: `Spending cap ${cap.limit} would be exceeded (current ${spentInWindow.toFixed(2)} + proposed ${Math.abs(proposed.amount)})`,
    };
  }
  return { tripped: false };
}

/** Returns true if accepting `proposed` would exceed `limit` within the window. */
export function checkRateLimit(
  history: ActionEvent[],
  proposed: ActionEvent,
  limit: RateLimit
): KillSwitchResult {
  const cutoff = proposed.timestamp - limit.windowMs;
  const countInWindow = history.filter((e) => e.timestamp >= cutoff).length;

  if (countInWindow + 1 > limit.maxActions) {
    return {
      tripped: true,
      cause: "rate",
      reason: `Rate limit ${limit.maxActions}/${limit.windowMs}ms would be exceeded (current ${countInWindow})`,
    };
  }
  return { tripped: false };
}
