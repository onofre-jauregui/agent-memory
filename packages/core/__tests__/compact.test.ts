import { describe, it, expect } from "vitest";
import { compact, estimateTokens } from "../src/memory/compact.js";
import type { MemoryEntry, MemoryStore } from "../src/types.js";

function makeStore(): { store: MemoryStore; rows: MemoryEntry[] } {
  let id = 100;
  const rows: MemoryEntry[] = [];
  const store: MemoryStore = {
    async search() {
      return rows.filter((r) => r.is_active);
    },
    async insert(entry) {
      const row: MemoryEntry = { ...entry, id: `n_${++id}` };
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
  return { store, rows };
}

function entry(over: Partial<MemoryEntry> = {}): MemoryEntry {
  return {
    id: `seed_${Math.random()}`,
    memory_type: "lesson",
    title: "t",
    content: "lorem ipsum dolor sit amet consectetur adipiscing elit",
    source_type: "reflection",
    tags: ["foo"],
    confidence: 0.5,
    confirmations: 0,
    contradictions: 0,
    is_active: true,
    context_id: "ctx-a",
    ...over,
  };
}

describe("compact", () => {
  it("estimateTokens rough char/4 estimate", () => {
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens(null)).toBe(0);
  });

  it("groups by (memory_type, context_id) and reports clusters when summarize omitted", async () => {
    const { store, rows } = makeStore();
    rows.push(
      entry({ id: "a", tags: ["foo", "x"] }),
      entry({ id: "b", tags: ["foo", "y"] }),
      entry({ id: "c", tags: ["foo", "z"] })
    );
    const result = await compact(store, rows);
    expect(result.clustersFound).toBe(1);
    expect(result.merged).toBe(0);
  });

  it("does not cluster across different context_ids", async () => {
    const { store, rows } = makeStore();
    rows.push(
      entry({ id: "a", tags: ["foo"], context_id: "c1" }),
      entry({ id: "b", tags: ["foo"], context_id: "c2" }),
      entry({ id: "c", tags: ["foo"], context_id: "c3" })
    );
    const result = await compact(store, rows);
    expect(result.clustersFound).toBe(0);
  });

  it("merges via summarize callback and links originals", async () => {
    const { store, rows } = makeStore();
    rows.push(
      entry({ id: "a", tags: ["foo"], context_id: "x" }),
      entry({ id: "b", tags: ["foo"], context_id: "x" }),
      entry({ id: "c", tags: ["foo"], context_id: "x" })
    );
    const result = await compact(store, rows, {
      summarize: async () => ({ title: "merged", content: "summary content here" }),
    });
    expect(result.merged).toBe(3);
    const merged = rows.find((r) => r.title === "merged");
    expect(merged).toBeTruthy();
    const linked = rows.filter((r) => r.merged_into === merged!.id);
    expect(linked).toHaveLength(3);
  });
});
