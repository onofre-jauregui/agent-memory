import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { chat } from "../src/providers/multi-llm.js";

const ORIG_FETCH = globalThis.fetch;

function mockFetch(impl: (url: string, init: RequestInit) => Response | Promise<Response>) {
  globalThis.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    return impl(String(url), init || {});
  }) as unknown as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = ORIG_FETCH;
});

describe("chat router", () => {
  it("anthropic: posts to /v1/messages and parses content blocks", async () => {
    let captured: { url: string; body: any } | null = null;
    mockFetch(async (url, init) => {
      captured = { url, body: JSON.parse(String(init.body)) };
      return new Response(
        JSON.stringify({
          content: [{ type: "text", text: "hi there" }],
          usage: { input_tokens: 5, output_tokens: 3 },
        }),
        { status: 200 }
      );
    });

    const r = await chat({
      provider: "anthropic",
      model: "claude-x",
      apiKey: "sk-test",
      messages: [
        { role: "system", content: "be brief" },
        { role: "user", content: "hi" },
      ],
    });
    expect(r.content).toBe("hi there");
    expect(r.usage).toEqual({ input: 5, output: 3 });
    expect(captured!.url).toContain("anthropic.com");
    expect(captured!.body.system).toBe("be brief");
    expect(captured!.body.messages).toHaveLength(1);
  });

  it("openai: posts to /v1/chat/completions and reads choices[0].message.content", async () => {
    mockFetch(async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "ok" } }],
          usage: { prompt_tokens: 1, completion_tokens: 2 },
        }),
        { status: 200 }
      )
    );
    const r = await chat({
      provider: "openai",
      model: "gpt-x",
      apiKey: "sk",
      messages: [{ role: "user", content: "hi" }],
    });
    expect(r.content).toBe("ok");
    expect(r.usage).toEqual({ input: 1, output: 2 });
  });

  it("openrouter: same shape as openai", async () => {
    let captured = "";
    mockFetch(async (url) => {
      captured = url;
      return new Response(
        JSON.stringify({ choices: [{ message: { content: "yo" } }], usage: {} }),
        { status: 200 }
      );
    });
    const r = await chat({
      provider: "openrouter",
      model: "x",
      apiKey: "k",
      messages: [{ role: "user", content: "hi" }],
    });
    expect(r.content).toBe("yo");
    expect(captured).toContain("openrouter.ai");
  });

  it("google: parses candidates[0].content.parts", async () => {
    mockFetch(async () =>
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: "g1" }, { text: "g2" }] } }],
          usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 6 },
        }),
        { status: 200 }
      )
    );
    const r = await chat({
      provider: "google",
      model: "gemini-x",
      apiKey: "k",
      messages: [{ role: "user", content: "hi" }],
    });
    expect(r.content).toBe("g1g2");
    expect(r.usage).toEqual({ input: 4, output: 6 });
  });

  it("throws on non-2xx", async () => {
    mockFetch(async () => new Response("bad", { status: 500 }));
    await expect(
      chat({
        provider: "openai",
        model: "x",
        apiKey: "k",
        messages: [{ role: "user", content: "hi" }],
      })
    ).rejects.toThrow();
  });
});
