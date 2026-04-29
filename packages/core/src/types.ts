/**
 * Core public types for @agent-memory/core.
 *
 * These types intentionally avoid any domain-specific terminology (trading,
 * markets, customer support, etc.). They describe a generic "agent acts on
 * the world; we evaluate and remember the action" loop.
 */

/**
 * The mode in which the agent is operating.
 *
 * - `simulate` — dry run / paper / sandbox; guardrails are bypassed.
 * - `live`     — real-world action; guardrails enforced.
 */
export type AgentMode = "simulate" | "live";

/**
 * A single proposed action the agent wants to take. The library is agnostic
 * to what the action actually does — it could be a trade, an outbound email,
 * a refund, anything. The risk evaluator only inspects `amount`, `mode`, and
 * (optionally) `metadata`.
 */
export interface ActionContext {
  /** Numeric magnitude of the action. Currency, tokens, items — caller chooses. */
  amount: number;
  /** Whether this is a real-world action (`live`) or a dry run (`simulate`). */
  mode: AgentMode;
  /** Free-form bag for caller-specific data. The core library does not read this. */
  metadata?: Record<string, unknown>;
}

/**
 * Caps and limits a host application supplies to the risk evaluator.
 *
 * Generic by design: the same struct is used whether the agent is placing
 * orders, sending messages, or making API calls.
 */
export interface RiskSettings {
  /** Hard cap on a single action's amount. */
  max_position_size: number;
  /** Cumulative loss / spend cap per day. */
  max_daily_loss: number;
  /** Number of in-flight actions allowed at once. */
  max_open_positions: number;
  /** Drawdown percentage at which the agent must halt. */
  max_drawdown_pct: number;
}

/**
 * Live state the host application supplies. Updated after every action.
 */
export interface RiskState {
  /** ISO date string for the current trading/operational day. */
  date: string;
  /** True if the agent has already been halted today. */
  is_trading_halted: boolean;
  /** Human-readable reason for the halt, if any. */
  halt_reason: string | null;
  /** Net outcome score for today (negative = losses / spend). */
  daily_pnl: number;
  /** Number of currently in-flight actions. */
  open_position_count: number;
  /** Highest portfolio value observed so far (for drawdown math). */
  peak_portfolio_value: number;
}

export type RiskRejectionCode =
  | "position_size"
  | "trading_halted"
  | "daily_loss_limit"
  | "open_positions_limit"
  | "drawdown_limit"
  | "concentration_limit";

export interface RiskEvaluationResult {
  passed: boolean;
  reason?: string;
  code?: RiskRejectionCode;
  /** When set, the host should persist a halt with this reason. */
  newHaltReason?: string;
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Memory                                                                    */
/* ────────────────────────────────────────────────────────────────────────── */

export type MemoryType =
  | "lesson"
  | "pattern"
  | "mistake"
  | "success"
  | "observation"
  | "insight"
  | "feedback";

export type MemorySource =
  | "reflection"
  | "action_outcome"
  | "user_feedback"
  | "external_observation"
  | "manual";

export interface MemoryEntry {
  id: string;
  memory_type: MemoryType;
  title: string;
  content: string;
  summary?: string | null;
  source_type: MemorySource;
  /** IDs of actions this memory was derived from. Caller-defined opaque strings. */
  related_action_ids?: string[];
  /** Generic context label — strategy name, channel, vertical, etc. No FK. */
  context_id?: string | null;
  tags: string[];
  confidence: number; // 0..1
  confirmations: number;
  contradictions: number;
  is_active: boolean;
  merged_into?: string | null;
  child_count?: number;
  token_estimate?: number;
  created_at?: string;
  updated_at?: string;
  user_id?: string | null;
}

/** Minimal storage adapter the memory helpers depend on. */
export interface MemoryStore {
  search(opts: MemorySearchOptions): Promise<MemoryEntry[]>;
  insert(entry: Omit<MemoryEntry, "id" | "created_at" | "updated_at">): Promise<MemoryEntry>;
  update(id: string, patch: Partial<MemoryEntry>): Promise<MemoryEntry>;
  /** Soft delete: set is_active=false. */
  deactivate(id: string): Promise<void>;
}

export interface MemorySearchOptions {
  tags?: string[];
  context_id?: string | null;
  text?: string;
  memory_type?: MemoryType;
  is_active?: boolean;
  limit?: number;
  user_id?: string | null;
}
