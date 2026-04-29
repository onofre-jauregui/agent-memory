import type {
  MemoryEntry,
  MemorySearchOptions,
  MemoryStore,
} from "../types.js";

/**
 * Recall memories matching the given filters. Thin wrapper over the store's
 * search method, with sensible defaults: only active memories, ordered by
 * confidence descending, capped at 50.
 */
export async function recall(
  store: MemoryStore,
  opts: MemorySearchOptions = {}
): Promise<MemoryEntry[]> {
  const merged: MemorySearchOptions = {
    is_active: true,
    limit: 50,
    ...opts,
  };
  return store.search(merged);
}
