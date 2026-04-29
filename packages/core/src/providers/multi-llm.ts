/**
 * Pure fetch-based multi-LLM router. No SDK dependencies.
 *
 * Supported providers: anthropic, openai, openrouter, google.
 * Caller passes their own API key per call — keys are never persisted here.
 */

export type LLMProvider = "anthropic" | "openai" | "openrouter" | "google";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  provider: LLMProvider;
  model: string;
  apiKey: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
}

export interface ChatResult {
  content: string;
  usage: { input: number; output: number };
}

export async function chat(opts: ChatOptions): Promise<ChatResult> {
  switch (opts.provider) {
    case "anthropic":
      return chatAnthropic(opts);
    case "openai":
      return chatOpenAI(opts);
    case "openrouter":
      return chatOpenRouter(opts);
    case "google":
      return chatGoogle(opts);
    default: {
      const exhaustive: never = opts.provider;
      throw new Error(`Unknown provider: ${exhaustive as string}`);
    }
  }
}

/* ────────── Anthropic ────────── */

async function chatAnthropic(opts: ChatOptions): Promise<ChatResult> {
  const system = opts.messages.find((m) => m.role === "system")?.content;
  const nonSystem = opts.messages.filter((m) => m.role !== "system");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": opts.apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 1024,
      temperature: opts.temperature ?? 0,
      ...(system ? { system } : {}),
      messages: nonSystem.map((m) => ({ role: m.role, content: m.content })),
    }),
  });

  if (!res.ok) {
    throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  const content = (data.content || [])
    .filter((c: { type: string }) => c.type === "text")
    .map((c: { text: string }) => c.text)
    .join("");
  return {
    content,
    usage: {
      input: data.usage?.input_tokens ?? 0,
      output: data.usage?.output_tokens ?? 0,
    },
  };
}

/* ────────── OpenAI ────────── */

async function chatOpenAI(opts: ChatOptions): Promise<ChatResult> {
  return chatOpenAICompatible(
    "https://api.openai.com/v1/chat/completions",
    opts
  );
}

/* ────────── OpenRouter (OpenAI-compatible) ────────── */

async function chatOpenRouter(opts: ChatOptions): Promise<ChatResult> {
  return chatOpenAICompatible(
    "https://openrouter.ai/api/v1/chat/completions",
    opts
  );
}

async function chatOpenAICompatible(
  url: string,
  opts: ChatOptions
): Promise<ChatResult> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      temperature: opts.temperature ?? 0,
      max_tokens: opts.maxTokens ?? 1024,
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenAI-compatible API error ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  return {
    content: data.choices?.[0]?.message?.content ?? "",
    usage: {
      input: data.usage?.prompt_tokens ?? 0,
      output: data.usage?.completion_tokens ?? 0,
    },
  };
}

/* ────────── Google ────────── */

async function chatGoogle(opts: ChatOptions): Promise<ChatResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(opts.model)}:generateContent?key=${encodeURIComponent(opts.apiKey)}`;

  const systemInstruction = opts.messages.find((m) => m.role === "system");
  const contents = opts.messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents,
      ...(systemInstruction
        ? { systemInstruction: { parts: [{ text: systemInstruction.content }] } }
        : {}),
      generationConfig: {
        temperature: opts.temperature ?? 0,
        maxOutputTokens: opts.maxTokens ?? 1024,
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`Google API error ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  const content =
    (data.candidates?.[0]?.content?.parts || [])
      .map((p: { text?: string }) => p.text || "")
      .join("") || "";
  return {
    content,
    usage: {
      input: data.usageMetadata?.promptTokenCount ?? 0,
      output: data.usageMetadata?.candidatesTokenCount ?? 0,
    },
  };
}
