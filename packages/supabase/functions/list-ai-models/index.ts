import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

/**
 * Pure router for listing available LLM models across providers.
 *
 * Sanitization: this version does NOT read API keys from a database. The
 * caller passes their own `apiKey` per provider in the request body. Keys
 * are never persisted by this endpoint.
 *
 * Request body:
 *   { providers: { openrouter?: string; openai?: string; google?: string; anthropic?: string } }
 */

const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") || "*";
const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export interface AIModel {
  id: string;
  name: string;
  provider: string;
  contextLength?: number;
  pricing?: { prompt: string; completion: string };
}

async function isProviderAvailable(modelId: string, apiKey: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: "user", content: "." }],
        max_tokens: 1,
        stream: false,
      }),
      signal: controller.signal,
    });
    if (res.ok) return true;
    const body = await res.json().catch(() => ({}));
    const msg: string = body?.error?.message || "";
    if (
      msg.includes("No allowed providers") ||
      msg.includes("No endpoints available matching your guardrail") ||
      msg.includes("No endpoints found")
    ) return false;
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const providerKeys: Record<string, string | undefined> = body.providers || {};

    const allModels: AIModel[] = [];
    const errors: Record<string, string> = {};
    let blockedProviders: string[] = [];

    const orKey = providerKeys.openrouter;
    if (orKey) {
      try {
        const res = await fetch("https://openrouter.ai/api/v1/models", {
          headers: { Authorization: `Bearer ${orKey}`, "Content-Type": "application/json" },
        });
        if (res.ok) {
          const data = await res.json();
          const models: AIModel[] = (data.data || [])
            .filter((m: { context_length?: number }) => (m.context_length || 0) >= 32768)
            .sort((a: { name?: string; id: string }, b: { name?: string; id: string }) =>
              (a.name || a.id).localeCompare(b.name || b.id)
            )
            .slice(0, 200)
            .map((m: { id: string; name?: string; context_length?: number; pricing?: { prompt: string; completion: string } }) => ({
              id: m.id,
              name: m.name || m.id,
              provider: "OpenRouter",
              contextLength: m.context_length,
              pricing: m.pricing,
            }));

          const prefixGroups = new Map<string, AIModel[]>();
          for (const m of models) {
            const prefix = m.id.split("/")[0];
            if (!prefixGroups.has(prefix)) prefixGroups.set(prefix, []);
            prefixGroups.get(prefix)!.push(m);
          }

          const checks = await Promise.allSettled(
            Array.from(prefixGroups.entries()).map(async ([prefix, group]) => ({
              prefix,
              available: await isProviderAvailable(group[0].id, orKey),
            }))
          );

          const blocked = new Set<string>();
          for (const r of checks) {
            if (r.status === "fulfilled" && !r.value.available) blocked.add(r.value.prefix);
          }
          blockedProviders = Array.from(blocked);

          allModels.push(...models.filter((m) => !blocked.has(m.id.split("/")[0])));
        } else {
          errors["openrouter"] = `HTTP ${res.status}`;
        }
      } catch (e) {
        errors["openrouter"] = e instanceof Error ? e.message : String(e);
      }
    }

    const oaiKey = providerKeys.openai;
    if (oaiKey && !orKey) {
      try {
        const res = await fetch("https://api.openai.com/v1/models", {
          headers: { Authorization: `Bearer ${oaiKey}` },
        });
        if (res.ok) {
          const data = await res.json();
          const models: AIModel[] = (data.data || [])
            .filter((m: { id: string }) =>
              m.id.includes("gpt") || m.id.startsWith("o1") || m.id.startsWith("o3") || m.id.startsWith("o4")
            )
            .sort((a: { created: number }, b: { created: number }) => b.created - a.created)
            .slice(0, 20)
            .map((m: { id: string }) => ({ id: m.id, name: m.id, provider: "OpenAI" }));
          allModels.push(...models);
        } else {
          errors["openai"] = `HTTP ${res.status}`;
        }
      } catch (e) {
        errors["openai"] = e instanceof Error ? e.message : String(e);
      }
    }

    const googleKey = providerKeys.google;
    if (googleKey && !orKey) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${googleKey}`
        );
        if (res.ok) {
          const data = await res.json();
          const models: AIModel[] = (data.models || [])
            .filter(
              (m: { name: string; supportedGenerationMethods?: string[] }) =>
                m.name.includes("gemini") &&
                m.supportedGenerationMethods?.includes("generateContent")
            )
            .map((m: { name: string; displayName?: string }) => ({
              id: m.name.replace("models/", ""),
              name: m.displayName || m.name.replace("models/", ""),
              provider: "Google",
            }));
          allModels.push(...models);
        } else {
          errors["google"] = `HTTP ${res.status}`;
        }
      } catch (e) {
        errors["google"] = e instanceof Error ? e.message : String(e);
      }
    }

    const antKey = providerKeys.anthropic;
    if (antKey && !orKey) {
      // Anthropic has no list endpoint — return a stable curated set.
      allModels.push(
        { id: "claude-opus-4-6", name: "Claude Opus 4.6", provider: "Anthropic" },
        { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", provider: "Anthropic" },
        { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5", provider: "Anthropic" }
      );
    }

    if (allModels.length === 0) {
      const hint = blockedProviders.length > 0
        ? ` Your OpenRouter data policy blocks: ${blockedProviders.join(", ")}.`
        : "";
      return new Response(
        JSON.stringify({
          models: [],
          error: `No available AI models.${hint}`,
          blockedProviders,
          errors,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ models: allModels, blockedProviders, errors }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
