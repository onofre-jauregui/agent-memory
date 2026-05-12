/**
 * Customer support agent example.
 *
 * Demonstrates:
 *   - in-memory MemoryStore implementation (no DB)
 *   - evaluateRisk for spend caps on refunds
 *   - kill-switch that trips when a draft contains PII patterns
 *   - confidence feedback loop on lessons
 */

import {
  evaluateRisk,
  recall,
  save,
  confirm,
  contradict,
  type ActionContext,
  type RiskSettings,
  type RiskState,
  type MemoryEntry,
  type MemoryStore,
  type MemorySearchOptions,
} from "agent-memory-core";

// ── In-memory store ─────────────────────────────────────────────
function inMemoryStore(): MemoryStore {
  let id = 0;
  const rows: MemoryEntry[] = [];
  return {
    async search(opts: MemorySearchOptions) {
      let r = rows.filter((m) => (opts.is_active === undefined ? true : m.is_active === opts.is_active));
      if (opts.tags?.length) r = r.filter((m) => opts.tags!.every((t) => (m.tags || []).includes(t)));
      if (opts.text) {
        const t = opts.text.toLowerCase();
        r = r.filter((m) => m.title.toLowerCase().includes(t) || m.content.toLowerCase().includes(t));
      }
      return r.sort((a, b) => b.confidence - a.confidence).slice(0, opts.limit ?? 50);
    },
    async insert(entry) {
      const row: MemoryEntry = { ...entry, id: `m_${++id}` };
      rows.push(row);
      return row;
    },
    async update(id, patch) {
      const i = rows.findIndex((r) => r.id === id);
      if (i < 0) throw new Error(id);
      rows[i] = { ...rows[i]!, ...patch };
      return rows[i]!;
    },
    async deactivate(id) {
      const i = rows.findIndex((r) => r.id === id);
      if (i >= 0) rows[i] = { ...rows[i]!, is_active: false };
    },
  };
}

// ── PII kill-switch ─────────────────────────────────────────────
const SSN = /\b\d{3}-\d{2}-\d{4}\b/;
const CREDIT_CARD = /\b(?:\d[ -]*?){13,16}\b/;
function piiKillSwitch(draft: string): { tripped: boolean; reason?: string } {
  if (SSN.test(draft)) return { tripped: true, reason: "draft contains SSN" };
  if (CREDIT_CARD.test(draft)) return { tripped: true, reason: "draft contains credit card number" };
  return { tripped: false };
}

// ── Demo run ────────────────────────────────────────────────────
async function main() {
  const store = inMemoryStore();

  const settings: RiskSettings = {
    max_position_size: 200,    // max single refund: $200
    max_daily_loss: 1000,      // max daily refund spend: $1,000
    max_open_positions: 50,
    max_drawdown_pct: 100,
  };
  const state: RiskState = {
    date: new Date().toISOString().slice(0, 10),
    is_trading_halted: false,
    halt_reason: null,
    daily_pnl: -750, // already refunded $750 today
    open_position_count: 0,
    peak_portfolio_value: 0,
  };

  // Propose a $300 refund — exceeds the $200 cap
  const refund: ActionContext = { amount: 300, mode: "live", metadata: { ticket: "T-1234" } };
  const risk = evaluateRisk(refund, settings, state);
  console.log("[refund-300]", risk);

  // Smaller refund passes
  const smallRefund: ActionContext = { amount: 50, mode: "live", metadata: { ticket: "T-1235" } };
  console.log("[refund-50]", evaluateRisk(smallRefund, settings, state));

  // Kill-switch on a draft message
  const draft = "Here is a refund. Confirmation: 4111-1111-1111-1111";
  console.log("[draft-kill-switch]", piiKillSwitch(draft));

  // Save a lesson
  const lesson = await save(store, {
    memory_type: "lesson",
    title: "Customer X always asks for a discount",
    content: "When customer X (id 42) opens a ticket, they typically ask for a 10% discount within the first message.",
    tags: ["customer-42", "discount"],
    context_id: "support-channel",
    confidence: 0.6,
  });
  console.log("[saved-lesson]", lesson.id, "conf", lesson.confidence);

  // Recall lessons by tag
  const found = await recall(store, { tags: ["customer-42"] });
  console.log("[recalled]", found.length);

  // Feedback loop
  const after = await confirm(store, lesson);
  console.log("[after-confirm]", after.confidence);
  const after2 = await contradict(store, after);
  console.log("[after-contradict]", after2.confidence);
}

main().catch((e) => {
  console.error(e);
  (globalThis as { process?: { exit: (n: number) => void } }).process?.exit(1);
});
