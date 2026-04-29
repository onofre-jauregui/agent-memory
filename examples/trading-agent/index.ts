/**
 * Trading agent example — uses a synthetic "BinaryEventMarket" mock.
 *
 * IMPORTANT: this is NOT Kalshi, NOT Polymarket, NOT any real exchange.
 * It exists only to demonstrate the `evaluateActionStream` pattern that
 * `@agent-memory/core` deliberately leaves to the host application.
 */

import {
  evaluateRisk,
  save,
  type ActionContext,
  type RiskSettings,
  type RiskState,
  type MemoryEntry,
  type MemoryStore,
  type MemorySearchOptions,
} from "@agent-memory/core";

// ── Synthetic market ───────────────────────────────────────────
interface BinaryEventOutcome {
  /** Outcome score: positive = good for the agent, negative = bad. */
  outcome_score: number;
  /** Did this action complete in the time horizon? */
  status: "completed" | "open";
}

// ── Action-stream evaluator (host-implemented) ─────────────────
//
// This is the function the public library leaves empty by design.
// Every domain has its own version of "is the agent's recent stream
// healthy?" — for a trader it's consecutive losses; for a marketing
// agent it might be reply-rate; for a refund agent it might be
// repeat-refund rate.
//
// Here we copy the original consecutive-loss heuristic from the source
// repo, but generalised to any outcome stream.

interface StreamHealth {
  consecutiveLosses: number;
  totalScore: number;
  winRate: number;
  recommendation: "healthy" | "warn" | "suspend_24h" | "suspend_72h";
}

function evaluateActionStream(history: BinaryEventOutcome[]): StreamHealth {
  const completed = history.filter((h) => h.status === "completed");
  if (completed.length === 0)
    return { consecutiveLosses: 0, totalScore: 0, winRate: 0, recommendation: "healthy" };

  let consecutiveLosses = 0;
  for (let i = completed.length - 1; i >= 0; i--) {
    if (completed[i]!.outcome_score < 0) consecutiveLosses++;
    else break;
  }

  const totalScore = completed.reduce((s, t) => s + t.outcome_score, 0);
  const wins = completed.filter((t) => t.outcome_score > 0).length;
  const winRate = wins / completed.length;

  let recommendation: StreamHealth["recommendation"] = "healthy";
  if (consecutiveLosses >= 15) recommendation = "suspend_72h";
  else if (consecutiveLosses >= 10) recommendation = "suspend_24h";
  else if (consecutiveLosses >= 3) recommendation = "warn";

  return { consecutiveLosses, totalScore, winRate, recommendation };
}

// ── Tiny in-memory store ───────────────────────────────────────
function inMemoryStore(): MemoryStore {
  let id = 0;
  const rows: MemoryEntry[] = [];
  return {
    async search(opts: MemorySearchOptions) {
      let r = rows.filter((m) => (opts.is_active === undefined ? true : m.is_active === opts.is_active));
      if (opts.tags?.length) r = r.filter((m) => opts.tags!.every((t) => (m.tags || []).includes(t)));
      return r.slice(0, opts.limit ?? 50);
    },
    async insert(e) {
      const row: MemoryEntry = { ...e, id: `m_${++id}` };
      rows.push(row);
      return row;
    },
    async update(id, patch) {
      const i = rows.findIndex((r) => r.id === id);
      rows[i] = { ...rows[i]!, ...patch };
      return rows[i]!;
    },
    async deactivate(id) {
      const i = rows.findIndex((r) => r.id === id);
      if (i >= 0) rows[i] = { ...rows[i]!, is_active: false };
    },
  };
}

async function main() {
  const store = inMemoryStore();

  const settings: RiskSettings = {
    max_position_size: 100,
    max_daily_loss: 200,
    max_open_positions: 5,
    max_drawdown_pct: 25,
  };
  const state: RiskState = {
    date: new Date().toISOString().slice(0, 10),
    is_trading_halted: false,
    halt_reason: null,
    daily_pnl: 0,
    open_position_count: 0,
    peak_portfolio_value: 1000,
  };

  // Propose an action against the synthetic market
  const action: ActionContext = {
    amount: 75,
    mode: "live",
    metadata: { event_id: "synthetic-event-001" },
  };
  console.log("[risk]", evaluateRisk(action, settings, state));

  // Imagine a stream of outcomes from the synthetic market
  const history: BinaryEventOutcome[] = [
    { outcome_score: 5, status: "completed" },
    { outcome_score: -3, status: "completed" },
    { outcome_score: -2, status: "completed" },
    { outcome_score: -4, status: "completed" },
  ];
  const health = evaluateActionStream(history);
  console.log("[stream]", health);

  if (health.recommendation === "warn") {
    await save(store, {
      memory_type: "insight",
      title: "Recent stream shows warning signs",
      content: `${health.consecutiveLosses} consecutive losses; win rate ${(health.winRate * 100).toFixed(0)}%.`,
      tags: ["stream-warning"],
      confidence: 0.7,
    });
    console.log("[memory] saved warning insight");
  }
}

main().catch((e) => {
  console.error(e);
  (globalThis as { process?: { exit: (n: number) => void } }).process?.exit(1);
});
