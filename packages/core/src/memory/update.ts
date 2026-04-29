import type { MemoryEntry, MemoryStore } from "../types.js";

/**
 * Confidence feedback loop:
 *
 *   confirm(...)     → +5% confidence (capped at 0.95), +1 confirmation
 *   contradict(...)  → -10% confidence (floor 0.05), +1 contradiction
 *   deactivate(id)   → soft delete
 *
 * The asymmetric +5/-10 weighting is intentional: contradictions update beliefs
 * faster than confirmations. Same numbers used in the source trading agent.
 */

const CONFIRM_DELTA = 0.05;
const CONTRADICT_DELTA = 0.1;
const MAX_CONF = 0.95;
const MIN_CONF = 0.05;

export async function confirm(
  store: MemoryStore,
  memory: Pick<MemoryEntry, "id" | "confidence" | "confirmations">
): Promise<MemoryEntry> {
  const next = Math.min(MAX_CONF, (memory.confidence ?? 0.5) + CONFIRM_DELTA);
  return store.update(memory.id, {
    confidence: next,
    confirmations: (memory.confirmations ?? 0) + 1,
  });
}

export async function contradict(
  store: MemoryStore,
  memory: Pick<MemoryEntry, "id" | "confidence" | "contradictions">
): Promise<MemoryEntry> {
  const next = Math.max(MIN_CONF, (memory.confidence ?? 0.5) - CONTRADICT_DELTA);
  return store.update(memory.id, {
    confidence: next,
    contradictions: (memory.contradictions ?? 0) + 1,
  });
}

export async function deactivate(
  store: MemoryStore,
  id: string
): Promise<void> {
  await store.deactivate(id);
}

/** Generic patch — for any other field you want to update. */
export async function update(
  store: MemoryStore,
  id: string,
  patch: Partial<MemoryEntry>
): Promise<MemoryEntry> {
  return store.update(id, patch);
}
