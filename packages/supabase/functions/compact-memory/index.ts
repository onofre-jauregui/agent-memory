import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * compact-memory: token-saving pass over the agent's memory.
 *
 * Phase 1 SUMMARIZE: generate ~25-word summaries for memories without one.
 * Phase 2 MERGE: cluster memories of the same (memory_type, context_id)
 *   that share at least 1 tag, and merge clusters of 3+ into one entry.
 *
 * Generic — no references to trades, strategies, prices, etc.
 * The summarization LLM call accepts an OpenAI-compatible endpoint via
 * the SUMMARIZER_API_BASE / SUMMARIZER_API_KEY / SUMMARIZER_MODEL env vars.
 */

const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") || "*";
const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function estimateTokens(text: string | null | undefined): number {
  return Math.ceil((text || "").length / 4);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseKey) {
    return new Response(JSON.stringify({ error: "Missing Supabase credentials" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const results: Record<string, number> = { summarized: 0, merged: 0, tokens_saved: 0 };

  const aiKey = Deno.env.get("SUMMARIZER_API_KEY") || "";
  const aiBaseUrl = Deno.env.get("SUMMARIZER_API_BASE") || "https://api.openai.com/v1";
  const aiModel = Deno.env.get("SUMMARIZER_MODEL") || "gpt-4o-mini";

  try {
    // ── Phase 1: SUMMARIZE ──
    const { data: unsummarized } = await supabase
      .from("agent_memory")
      .select("id, title, content, memory_type, tags")
      .eq("is_active", true)
      .is("summary", null)
      .order("created_at", { ascending: true })
      .limit(20);

    if (unsummarized && unsummarized.length > 0 && aiKey) {
      const memoriesToSummarize = unsummarized
        .map((m: { memory_type: string; title: string; content: string }, i: number) =>
          `[${i + 1}] (${m.memory_type}) ${m.title}: ${(m.content || "").slice(0, 300)}`
        )
        .join("\n\n");

      const summaryResp = await fetch(`${aiBaseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${aiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: aiModel,
          messages: [
            {
              role: "system",
              content:
                "You compress agent insights into ultra-short summaries. For each numbered memory, output ONLY a single line: the number followed by a colon and a summary of max 25 words. No extra text.",
            },
            {
              role: "user",
              content: `Summarize each memory in max 25 words:\n\n${memoriesToSummarize}`,
            },
          ],
          temperature: 0,
          max_tokens: 1000,
        }),
      });

      if (summaryResp.ok) {
        const data = await summaryResp.json();
        const summaryText = data.choices?.[0]?.message?.content || "";
        const lines = summaryText.split("\n").filter((l: string) => l.trim());
        for (const line of lines) {
          const match = line.match(/^\[?(\d+)\]?\s*[:.\-–]\s*(.+)/);
          if (!match) continue;
          const idx = parseInt(match[1], 10) - 1;
          const summary = match[2].trim();
          if (idx >= 0 && idx < unsummarized.length && summary) {
            const mem = unsummarized[idx] as { id: string; content: string };
            const tokenEst = estimateTokens(summary);
            const tokensSaved = estimateTokens(mem.content) - tokenEst;
            await supabase.from("agent_memory").update({
              summary,
              token_estimate: tokenEst,
              updated_at: new Date().toISOString(),
            }).eq("id", mem.id);
            results.summarized++;
            results.tokens_saved += Math.max(0, tokensSaved);
          }
        }
      }
    }

    // ── Phase 2: MERGE ──
    const { data: activeMemories } = await supabase
      .from("agent_memory")
      .select(
        "id, title, content, summary, memory_type, tags, confidence, context_id, related_action_ids, confirmations, contradictions, created_at"
      )
      .eq("is_active", true)
      .is("merged_into", null)
      .order("confidence", { ascending: false });

    type Mem = {
      id: string;
      title: string;
      content: string;
      summary: string | null;
      memory_type: string;
      tags: string[];
      confidence: number;
      context_id: string | null;
      related_action_ids: string[];
      confirmations: number;
      contradictions: number;
    };

    if (activeMemories && activeMemories.length > 0) {
      const groups: Record<string, Mem[]> = {};
      for (const mem of activeMemories as Mem[]) {
        const key = `${mem.memory_type}::${mem.context_id || "global"}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(mem);
      }

      for (const [groupKey, members] of Object.entries(groups)) {
        if (members.length < 3) continue;

        const clusters: Mem[][] = [];
        const used = new Set<string>();

        for (let i = 0; i < members.length; i++) {
          const seed = members[i];
          if (used.has(seed.id)) continue;
          const cluster: Mem[] = [seed];
          used.add(seed.id);
          const baseTags = new Set(seed.tags || []);

          for (let j = i + 1; j < members.length; j++) {
            const other = members[j];
            if (used.has(other.id)) continue;
            const otherTags = other.tags || [];
            const overlap = otherTags.filter((t: string) => baseTags.has(t));
            if (overlap.length > 0) {
              cluster.push(other);
              used.add(other.id);
              for (const t of otherTags) baseTags.add(t);
            }
          }
          if (cluster.length >= 3) clusters.push(cluster);
        }

        const MAX_MERGES_PER_RUN = 3;
        let mergesDone = 0;

        for (const cluster of clusters) {
          if (!aiKey) break;
          if (mergesDone >= MAX_MERGES_PER_RUN) break;

          const clusterText = cluster
            .map((m, i) => `${i + 1}. ${m.title}: ${(m.summary || m.content || "").slice(0, 200)}`)
            .join("\n");

          const mergeResp = await fetch(`${aiBaseUrl}/chat/completions`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${aiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: aiModel,
              messages: [
                {
                  role: "system",
                  content:
                    "You merge multiple agent insights into one actionable memory. Output exactly two lines:\nLine 1: A title (max 10 words)\nLine 2: The merged insight (max 150 words). Preserve all specific numbers, thresholds, and edge cases. Do not generalise away details.",
                },
                {
                  role: "user",
                  content: `Merge these ${cluster.length} related insights into one:\n\n${clusterText}`,
                },
              ],
              temperature: 0,
              max_tokens: 400,
            }),
          });

          if (!mergeResp.ok) continue;

          const mergeData = await mergeResp.json();
          const mergeText = mergeData.choices?.[0]?.message?.content || "";
          const mergeLines = mergeText.split("\n").filter((l: string) => l.trim());
          if (mergeLines.length < 2) continue;

          const mergedTitle = mergeLines[0].replace(/^(title:\s*)/i, "").trim();
          const mergedContent = mergeLines.slice(1).join(" ").replace(/^(insight|content|merged):\s*/i, "").trim();
          const words = mergedContent.split(/\s+/);
          const mergedSummary = words.length > 50 ? words.slice(0, 50).join(" ") + "..." : mergedContent;

          const allTags = [...new Set(cluster.flatMap((m) => m.tags || []))];
          const allActionIds = [...new Set(cluster.flatMap((m) => m.related_action_ids || []))];
          const totalConfirmations = cluster.reduce((s, m) => s + (m.confirmations || 0), 0);
          const totalContradictions = cluster.reduce((s, m) => s + (m.contradictions || 0), 0);
          const weightedConfidence = totalConfirmations > 0
            ? cluster.reduce((s, m) => s + (m.confidence || 0.5) * (m.confirmations || 0), 0) / totalConfirmations
            : cluster.reduce((s, m) => s + (m.confidence || 0.5), 0) / cluster.length;
          const [type, contextId] = groupKey.split("::");

          const { data: merged } = await supabase
            .from("agent_memory")
            .insert({
              memory_type: type,
              title: mergedTitle,
              content: mergedContent,
              summary: mergedSummary,
              source_type: "reflection",
              tags: allTags,
              context_id: contextId === "global" ? null : contextId,
              confidence: Math.min(0.95, weightedConfidence),
              confirmations: totalConfirmations,
              contradictions: totalContradictions,
              related_action_ids: allActionIds,
              token_estimate: estimateTokens(mergedSummary),
              child_count: cluster.length,
            })
            .select("id")
            .single();

          if (merged) {
            const clusterIds = cluster.map((m) => m.id);
            await supabase
              .from("agent_memory")
              .update({ merged_into: merged.id, updated_at: new Date().toISOString() })
              .in("id", clusterIds);

            results.merged += cluster.length;
            const tokensBefore = cluster.reduce(
              (s, m) => s + estimateTokens(m.summary || m.content),
              0
            );
            results.tokens_saved += Math.max(0, tokensBefore - estimateTokens(mergedSummary));
            mergesDone++;
          }
        }
      }
    }

    await supabase.from("compliance_log").insert({
      event_type: "memory_compaction",
      severity: "info",
      message: `Memory compaction: ${results.summarized} summarized, ${results.merged} merged, ~${results.tokens_saved} tokens saved`,
      metadata: results,
    });

    return new Response(JSON.stringify({ success: true, ...results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("compact-memory error:", e);
    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : "Unknown error",
        partial_results: results,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
