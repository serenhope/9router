import { afterEach, describe, expect, it, vi } from "vitest";

import REGISTRY from "../../open-sse/providers/registry/index.js";
import { handleSearchCore } from "../../open-sse/handlers/search/index.js";
import { PROVIDER_MEDIA } from "../../open-sse/providers/index.js";

const CREDENTIALS = {
  accessToken: "ag_test_token",
  projectId: "ag-test-project",
};

const MOCK_ANTIGRAVITY_RESPONSE = {
  response: {
    candidates: [
      {
        content: {
          parts: [{ text: "The latest news about AI is exciting." }],
        },
        groundingMetadata: {
          groundingChunks: [
            {
              web: {
                uri: "https://example.com/ai-news",
                title: "AI News Today",
              },
            },
          ],
          groundingSupports: [
            {
              segment: { text: "The latest news about AI is exciting.", startIndex: 0, endIndex: 37 },
              groundingChunkIndices: [0],
            },
          ],
        },
      },
    ],
    usageMetadata: {
      totalTokenCount: 150,
    },
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Antigravity web search", () => {
  it("uses gemini-3.8-flash as the default search model in the registry", () => {
    const entry = REGISTRY.find((candidate) => candidate.id === "antigravity");
    expect(entry?.searchViaChat?.defaultModel).toBe("gemini-3.8-flash");
    expect(PROVIDER_MEDIA.antigravity?.searchViaChat?.defaultModel).toBe("gemini-3.8-flash");
  });

  it("sends gemini-3.8-flash by default to Antigravity v1internal:generateContent", async () => {
    let capturedUrl = "";
    let capturedBody = null;

    vi.stubGlobal("fetch", vi.fn(async (url, init) => {
      capturedUrl = String(url);
      capturedBody = JSON.parse(init.body);
      return new Response(JSON.stringify(MOCK_ANTIGRAVITY_RESPONSE), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }));

    const provider = REGISTRY.find((p) => p.id === "antigravity");
    const result = await handleSearchCore({
      body: { query: "What is the latest news about AI?", max_results: 5 },
      provider,
      credentials: CREDENTIALS,
    });

    expect(result.success).toBe(true);
    expect(capturedUrl).toContain("/v1internal:generateContent");
    expect(capturedBody).toMatchObject({
      project: "ag-test-project",
      model: "gemini-3.8-flash-tiered",
      userAgent: "antigravity",
      requestType: "search",
      request: {
        contents: [{ role: "user", parts: [{ text: "What is the latest news about AI?" }] }],
        tools: [{ googleSearch: {} }],
      },
    });

    const payload = await result.response.json();
    expect(payload.results.length).toBe(1);
    expect(payload.results[0].title).toBe("AI News Today");
    expect(payload.results[0].url).toBe("https://example.com/ai-news");
  });

  it("allows custom model override when provided in request body", async () => {
    let capturedBody = null;

    vi.stubGlobal("fetch", vi.fn(async (url, init) => {
      capturedBody = JSON.parse(init.body);
      return new Response(JSON.stringify(MOCK_ANTIGRAVITY_RESPONSE), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }));

    const provider = REGISTRY.find((p) => p.id === "antigravity");
    const result = await handleSearchCore({
      body: { query: "AI news", model: "gemini-3.7-flash" },
      provider,
      credentials: CREDENTIALS,
    });

    expect(result.success).toBe(true);
    expect(capturedBody.model).toBe("gemini-3.7-flash");
  });

  it("preserves explicit tier models like gemini-3.8-flash-low", async () => {
    let capturedBody = null;

    vi.stubGlobal("fetch", vi.fn(async (url, init) => {
      capturedBody = JSON.parse(init.body);
      return new Response(JSON.stringify(MOCK_ANTIGRAVITY_RESPONSE), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }));

    const provider = REGISTRY.find((p) => p.id === "antigravity");
    const result = await handleSearchCore({
      body: { query: "AI news", model: "gemini-3.8-flash-low" },
      provider,
      credentials: CREDENTIALS,
    });

    expect(result.success).toBe(true);
    expect(capturedBody.model).toBe("gemini-3.8-flash-low");
  });

  it("routes Claude and GPT models to gemini-3.8-flash-tiered for search grounding", async () => {
    let capturedBody = null;

    vi.stubGlobal("fetch", vi.fn(async (url, init) => {
      capturedBody = JSON.parse(init.body);
      return new Response(JSON.stringify(MOCK_ANTIGRAVITY_RESPONSE), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }));

    const provider = REGISTRY.find((p) => p.id === "antigravity");
    const result = await handleSearchCore({
      body: { query: "AI news", model: "claude-sonnet-4-6" },
      provider,
      credentials: CREDENTIALS,
    });

    expect(result.success).toBe(true);
    expect(capturedBody.model).toBe("gemini-3.8-flash-tiered");
  });

  it("falls back to gemini-3.8-flash-tiered when an unrecognized combo name is passed as model", async () => {
    let capturedBody = null;

    vi.stubGlobal("fetch", vi.fn(async (url, init) => {
      capturedBody = JSON.parse(init.body);
      return new Response(JSON.stringify(MOCK_ANTIGRAVITY_RESPONSE), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }));

    const provider = REGISTRY.find((p) => p.id === "antigravity");
    const result = await handleSearchCore({
      body: { query: "AI news", model: "search-combo" },
      provider,
      credentials: CREDENTIALS,
    });

    expect(result.success).toBe(true);
    expect(capturedBody.model).toBe("gemini-3.8-flash-tiered");
  });
});
