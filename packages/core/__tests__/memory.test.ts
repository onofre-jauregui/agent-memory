import { describe, it, expect, beforeEach } from "vitest";
import { recall, save, confirm, contradict, deactivate } from "../src/memory/index.js";
import type { MemoryEntry, MemoryStore, MemorySearchOptions } from "../src/types.js";

function makeStore(): MemoryStore {
  let id = 0;
  const rows: MemoryEntry[] = [];
  return {
    async search(opts: MemorySearchOptions) {
      let r = rows.slice();
      if (opts.is_active !== undefined) r = r.filter((m) => m.is_active === opts.is_active);
      if (opts.memory_type) r = r.filter((m) => m.memory_type === opts.memory_type);
      if (opts.context_id !== undefined) r = r.filter((m) => m.context_id === opts.context_id);
      if (opts.tags && opts.tags.length) {
        r = r.filter((m) => opts.tags!.every((t) => (m.tags || []).includes(t)));
      }
      if (opts.text) {
        const t = opts.text.toLowerCase();
        r = r.filter(
          (m) =>
            m.title.toLowerCase().includes(t) ||
            m.content.toLowerCase().includes(t)
        );
      }
      r.sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
      return r.slice(0, opts.limit ?? 50);
    },
    async insert(entry) {
      const row: MemoryEntry = { ...entry, id: `m_${++id}`, created_at: new Date().toISOString() };
      rows.push(row);
      return row;
    },
    async update(id, patch) {
      const i = rows.findIndex((r) => r.id === id);
      if (i < 0) throw new Error(`not found: ${id}`);
      rows[i] = { ...rows[i]!, ...patch };
      return rows[i]!;
    },
    async deactivate(id) {
      const i = rows.findIndex((r) => r.id === id);
      if (i >= 0) rows[i] = { ...rows[i]!, is_active: false };
    },
  };
}

describe("memory api", () => {
  let store: MemoryStore;
  beforeEach(() => {
    store = makeStore();
  });

  it("save persists with sane defaults", async () => {
    const m = await save(store, {
      memory_type: "lesson",
      title: "Don't double-charge",
      content: "Refund the duplicate immediately.",
      tags: ["billing"],
    });
    expect(m.id).toBeTruthy();
    expect(m.confidence).toBe(0.5);
    expect(m.is_active).toBe(true);
    expect(m.source_type).toBe("reflection");
  });

  it("recall filters by tags + active", async () => {
    await save(store, { memory_type: "lesson", title: "A", content: "x", tags: ["foo"] });
    await save(store, { memory_type: "lesson", title: "B", content: "y", tags: ["bar"] });
    const r = await recall(store, { tags: ["foo"] });
    expect(r).toHaveLength(1);
    expect(r[0]!.title).toBe("A");
  });

  it("confirm raises confidence by 5%, capped at 0.95", async () => {
    const m = await save(store, {
      memory_type: "pattern",
      title: "T",
      content: "c",
      confidence: 0.5,
    });
    const after = await confirm(store, m);
    expect(after.confidence).toBeCloseTo(0.55, 5);
    expect(after.confirmations).toBe(1);
  });

  it("contradict reduces confidence by 10%, floor 0.05", async () => {
    const m = await save(store, {
      memory_type: "pattern",
      title: "T",
      content: "c",
      confidence: 0.5,
    });
    const after = await contradict(store, m);
    expect(after.confidence).toBeCloseTo(0.4, 5);
    expect(after.contradictions).toBe(1);
  });

  it("contradict floor at 0.05", async () => {
    const m = await save(store, {
      memory_type: "pattern",
      title: "T",
      content: "c",
      confidence: 0.05,
    });
    const after = await contradict(store, m);
    expect(after.confidence).toBe(0.05);
  });

  it("deactivate flips is_active false and excludes from default recall", async () => {
    const m = await save(store, { memory_type: "lesson", title: "A", content: "x" });
    await deactivate(store, m.id);
    const r = await recall(store);
    expect(r).toHaveLength(0);
  });
});
