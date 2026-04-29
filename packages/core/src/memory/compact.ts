/**
 * Memory compaction — group related memories and (optionally) merge them via
 * an LLM call. Pure logic in this module; the LLM call is supplied by the
 * caller as a `summarize` function so the core stays SDK-free.
 */

import type { MemoryEntry, MemoryStore } from "../types.js";

export interface CompactOptions {
  /** Memories with at least this many overlapping tags get clustered. */
  minTagOverlap?: number;
  /** Minimum cluster size before merging is attempted. */
  minClusterSize?: number;
  /** Cap on the number of merge operations per run. */
  maxMergesPerRun?: number;
  /**
   * Optional summarizer. Receives the cluster's title+content lines, returns
   * a `{ title, content }`. If not provided, compaction will only group; it
   * will not merge.
   */
  summarize?: (clusterText: string, count: number) => Promise<{ title: string; content: string } | null>;
}

export interface CompactResult {
  clustersFound: number;
  merged: number;
  tokensSaved: number;
}

/** Rough token estimate: ~4 chars per token for English. */
export function estimateTokens(text: string | null | undefined): number {
  return Math.ceil((text || "").length / 4);
}

/**
 * Cluster + (optionally) merge memories.
 *
 * Clustering rule: memories of the same `memory_type` and `context_id` with at
 * least `minTagOverlap` (default 1) tags in common form a cluster. Clusters
 * with `>= minClusterSize` (default 3) members are eligible for merging.
 */
export async function compact(
  store: MemoryStore,
  candidates: MemoryEntry[],
  opts: CompactOptions = {}
): Promise<CompactResult> {
  const minTagOverlap = opts.minTagOverlap ?? 1;
  const minClusterSize = opts.minClusterSize ?? 3;
  const maxMerges = opts.maxMergesPerRun ?? 3;

  const result: CompactResult = {
    clustersFound: 0,
    merged: 0,
    tokensSaved: 0,
  };

  // Group by (memory_type, context_id)
  const groups = new Map<string, MemoryEntry[]>();
  for (const m of candidates) {
    if (!m.is_active) continue;
    if (m.merged_into) continue;
    const key = `${m.memory_type}::${m.context_id || "global"}`;
    const list = groups.get(key) ?? [];
    list.push(m);
    groups.set(key, list);
  }

  let mergesDone = 0;

  for (const [groupKey, members] of groups) {
    if (members.length < minClusterSize) continue;

    const used = new Set<string>();
    const clusters: MemoryEntry[][] = [];

    for (let i = 0; i < members.length; i++) {
      const seed = members[i]!;
      if (used.has(seed.id)) continue;
      const cluster = [seed];
      used.add(seed.id);
      const tagBag = new Set(seed.tags || []);

      for (let j = i + 1; j < members.length; j++) {
        const other = members[j]!;
        if (used.has(other.id)) continue;
        const overlap = (other.tags || []).filter((t) => tagBag.has(t));
        if (overlap.length >= minTagOverlap) {
          cluster.push(other);
          used.add(other.id);
          for (const t of other.tags || []) tagBag.add(t);
        }
      }

      if (cluster.length >= minClusterSize) clusters.push(cluster);
    }

    result.clustersFound += clusters.length;

    if (!opts.summarize) continue;

    for (const cluster of clusters) {
      if (mergesDone >= maxMerges) break;

      const clusterText = cluster
        .map(
          (m, idx) =>
            `${idx + 1}. ${m.title}: ${(m.summary || m.content || "").slice(0, 200)}`
        )
        .join("\n");

      const merged = await opts.summarize(clusterText, cluster.length);
      if (!merged) continue;

      const allTags = [...new Set(cluster.flatMap((m) => m.tags || []))];
      const allActionIds = [
        ...new Set(cluster.flatMap((m) => m.related_action_ids || [])),
      ];
      const totalConf = cluster.reduce((s, m) => s + (m.confirmations || 0), 0);
      const totalContra = cluster.reduce((s, m) => s + (m.contradictions || 0), 0);
      const weightedConfidence =
        totalConf > 0
          ? cluster.reduce(
              (s, m) => s + (m.confidence || 0.5) * (m.confirmations || 0),
              0
            ) / totalConf
          : cluster.reduce((s, m) => s + (m.confidence || 0.5), 0) / cluster.length;
      const [type, contextId] = groupKey.split("::");

      const summaryWords = merged.content.split(/\s+/);
      const summary =
        summaryWords.length > 50
          ? summaryWords.slice(0, 50).join(" ") + "..."
          : merged.content;

      const inserted = await store.insert({
        memory_type: type as MemoryEntry["memory_type"],
        title: merged.title,
        content: merged.content,
        summary,
        source_type: "reflection",
        tags: allTags,
        context_id: contextId === "global" ? null : contextId,
        related_action_ids: allActionIds,
        confidence: Math.min(0.95, weightedConfidence),
        confirmations: totalConf,
        contradictions: totalContra,
        is_active: true,
        token_estimate: estimateTokens(summary),
        child_count: cluster.length,
      });

      // Link originals to the merged memory
      for (const m of cluster) {
        await store.update(m.id, { merged_into: inserted.id });
      }

      const tokensBefore = cluster.reduce(
        (s, m) => s + estimateTokens(m.summary || m.content),
        0
      );
      result.tokensSaved += Math.max(0, tokensBefore - estimateTokens(summary));
      result.merged += cluster.length;
      mergesDone++;
    }
  }

  return result;
}
