import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * auto-reflect: scheduled feedback loop that updates memory confidence based
 * on the outcomes of the actions each memory was derived from.
 *
 * Generic — no domain-specific logic. The host application supplies:
 *   - an `actions` table with at least { id, outcome_score, status }
 *   - the `agent_memory` table from the @agent-memory schema
 *
 * Source repo extracted sections:
 *   - Section 1 (setup): kept
 *   - Section 2 (P&L confidence loop): renamed actions/outcome_score
 *   - Section 6 (compaction call + logging): kept, renamed
 * Domain-specific sections (strategy health, signal quality, lesson writing)
 * were intentionally NOT extracted. See docs/architecture.md for guidance
 * on implementing those in your host application.
 */

const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") || "*";
const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Confidence deltas — same numbers used in the original implementation.
const AUTO_CONFIRM_DELTA = 0.05;
const AUTO_CONTRADICT_DELTA = 0.10;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseKey) {
    return new Response(
      JSON.stringify({ error: "Missing Supabase credentials" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const results: Record<string, unknown> = {};

  try {
    // ── 1. Outcome-Score Confidence Updates ──────────────────────
    const { data: activeMemories } = await supabase
      .from("agent_memory")
      .select(
        "id, title, memory_type, confidence, confirmations, contradictions, related_action_ids, context_id, updated_at"
      )
      .eq("is_active", true)
      .not("related_action_ids", "eq", "{}");

    let confirmed = 0;
    let contradicted = 0;

    for (const mem of activeMemories || []) {
      const actionIds = (mem as { related_action_ids?: string[] }).related_action_ids || [];
      if (actionIds.length === 0) continue;

      const { data: linkedActions } = await supabase
        .from("actions")
        .select("id, outcome_score, status")
        .in("id", actionIds)
        .eq("status", "completed");

      if (!linkedActions || linkedActions.length === 0) continue;

      const totalScore = linkedActions.reduce(
        (sum: number, a: { outcome_score?: number }) => sum + (Number(a.outcome_score) || 0),
        0
      );
      const avgScore = totalScore / linkedActions.length;

      // Skip if no real outcome scores yet
      const hasRealOutcome = linkedActions.some(
        (a: { outcome_score?: number }) => (Number(a.outcome_score) || 0) !== 0
      );
      if (!hasRealOutcome) continue;

      const m = mem as { id: string; updated_at: string; confidence?: number; confirmations?: number; contradictions?: number; title: string; memory_type: string };
      const lastUpdate = new Date(m.updated_at).getTime();
      const oneHourAgo = Date.now() - 60 * 60 * 1000;
      if (lastUpdate > oneHourAgo) continue;

      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

      if (avgScore > 0) {
        updates.confirmations = (m.confirmations || 0) + 1;
        updates.confidence = Math.min(0.95, (m.confidence || 0.5) + AUTO_CONFIRM_DELTA);
        confirmed++;
      } else if (avgScore < 0) {
        updates.contradictions = (m.contradictions || 0) + 1;
        updates.confidence = Math.max(0.05, (m.confidence || 0.5) - AUTO_CONTRADICT_DELTA);
        if ((updates.confidence as number) < 0.15) {
          await supabase.from("compliance_log").insert({
            event_type: "memory_low_confidence",
            severity: "warning",
            message: `Memory low confidence: "${m.title}" — ${(((updates.confidence as number) || 0) * 100).toFixed(0)}% after unfavorable linked actions (avg score: ${avgScore.toFixed(2)}).`,
            metadata: {
              memory_id: m.id,
              memory_type: m.memory_type,
              current_confidence: updates.confidence,
              avg_outcome_score: avgScore,
            },
          });
        }
        contradicted++;
      }

      await supabase.from("agent_memory").update(updates).eq("id", m.id);
    }

    results.outcome_confidence = {
      memories_checked: (activeMemories || []).length,
      confirmed,
      contradicted,
    };

    // ── 2. Action-stream evaluation hook (left empty by design) ──
    // The original repo evaluated strategy health (consecutive losses,
    // suspension cooldowns) here. That logic is too domain-specific to
    // ship in the public library. Implement an `evaluateActionStream`
    // function in your host application and call it from this section.
    //
    // See examples/trading-agent for one possible implementation.
    results.action_stream = { skipped: true, reason: "host-implemented" };

    // ── 3. Memory Compaction ─────────────────────────────────────
    let compactionResult: unknown = null;
    try {
      const compactResp = await fetch(
        `${supabaseUrl}/functions/v1/compact-memory`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${supabaseKey}`,
            "Content-Type": "application/json",
          },
          body: "{}",
        }
      );
      if (compactResp.ok) {
        compactionResult = await compactResp.json();
      }
    } catch (e) {
      console.error("Compaction call failed:", e);
    }
    results.compaction = compactionResult;

    // ── 4. Log this run ──────────────────────────────────────────
    await supabase.from("compliance_log").insert({
      event_type: "auto_reflect_run",
      severity: "info",
      message: `Auto-reflect: ${confirmed} confirmed, ${contradicted} contradicted, compaction: ${(compactionResult as { summarized?: number } | null)?.summarized ?? 0} summarized`,
      metadata: results,
    });

    return new Response(JSON.stringify({ success: true, ...results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("auto-reflect error:", e);
    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : "Unknown error",
        partial_results: results,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
