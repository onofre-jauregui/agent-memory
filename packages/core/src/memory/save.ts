import type { MemoryEntry, MemoryStore } from "../types.js";

export interface SaveMemoryInput {
  memory_type: MemoryEntry["memory_type"];
  title: string;
  content: string;
  source_type?: MemoryEntry["source_type"];
  tags?: string[];
  context_id?: string | null;
  related_action_ids?: string[];
  confidence?: number;
  user_id?: string | null;
  summary?: string | null;
}

/**
 * Persist a new memory entry. Sets sane defaults for confidence (0.5),
 * confirmations/contradictions (0), is_active (true), and source_type
 * ("reflection").
 */
export async function save(
  store: MemoryStore,
  input: SaveMemoryInput
): Promise<MemoryEntry> {
  return store.insert({
    memory_type: input.memory_type,
    title: input.title,
    content: input.content,
    summary: input.summary ?? null,
    source_type: input.source_type ?? "reflection",
    tags: input.tags ?? [],
    context_id: input.context_id ?? null,
    related_action_ids: input.related_action_ids ?? [],
    confidence: clamp01(input.confidence ?? 0.5),
    confirmations: 0,
    contradictions: 0,
    is_active: true,
    user_id: input.user_id ?? null,
  });
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}
