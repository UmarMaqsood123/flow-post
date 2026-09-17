import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AIProviderError } from "../src/integrations/ai/errors";
import {
  OpenAICompatibleProvider,
  type StructuredMode,
} from "../src/integrations/ai/openaiCompatible.provider";
import { createStructuredSchema } from "../src/integrations/ai/schema";

const schema = createStructuredSchema(
  "greeting",
  z.object({ message: z.string().max(20), note: z.string().nullable() }),
);

const request = {
  model: "openai/gpt-oss-20b",
  instructions: "Say hello",
  input: "Brand: Acme",
  schema,
  maxOutputTokens: 500,
};

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });

const completion = (content: string, overrides: Record<string, unknown> = {}) =>
  json(
    200,
    {
      id: "chatcmpl-1",
      model: "openai/gpt-oss-20b",
      choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content } }],
      usage: {
        prompt_tokens: 120,
        completion_tokens: 30,
        prompt_tokens_details: { cached_tokens: 20 },
      },
      ...overrides,
    },
    { "x-request-id": "req_compat" },
  );

interface FetchCall {
  url: string;
  init: RequestInit;
}

const createProvider = (
  responses: (Response | Error)[],
  options: {
    apiKey?: string;
    structuredMode?: StructuredMode;
    maxRetries?: number;
    baseUrl?: string;
    model?: string;
  } = {},
) => {
  const calls: FetchCall[] = [];
  const sleeps: number[] = [];
  const provider = new OpenAICompatibleProvider({
    apiKey: "apiKey" in options ? options.apiKey : "gsk-test",
    baseUrl: options.baseUrl ?? "https://api.groq.test/openai/v1/",
    defaultModel: options.model ?? "openai/gpt-oss-20b",
    structuredMode: options.structuredMode ?? "json_schema",
    label: "groq",
    timeoutMs: 5000,
    maxRetries: options.maxRetries ?? 2,
    random: () => 0.5,
    sleep: (ms) => {
      sleeps.push(ms);
      return Promise.resolve();
    },
    fetch: (url, init) => {
      calls.push({ url, init: init ?? {} });
      const next = responses.shift();
      if (!next) throw new Error("Unexpected fetch");
      return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
    },
  });
  return { provider, calls, sleeps };
};

const failure = (promise: Promise<unknown>) =>
  promise.then(
    () => {
      throw new Error("Expected the request to fail");
    },
    (error: unknown) => {
      expect(error).toBeInstanceOf(AIProviderError);
      return error as AIProviderError;
    },
  );

const bodyOf = (call: FetchCall) => JSON.parse(call.init.body as string) as Record<string, unknown>;

describe("OpenAICompatibleProvider", () => {
  it("asks for a strict JSON schema over chat completions", async () => {
    const { provider, calls } = createProvider([completion('{"message":"Hello","note":null}')]);

    const result = await provider.generateStructured(request);

    expect(result).toEqual({
      data: { message: "Hello", note: null },
      model: "openai/gpt-oss-20b",
      usage: { inputTokens: 120, outputTokens: 30, cachedInputTokens: 20 },
      attempts: 1,
      requestId: "req_compat",
    });
    expect(calls[0].url).toBe("https://api.groq.test/openai/v1/chat/completions");
    expect(calls[0].init.headers).toMatchObject({ Authorization: "Bearer gsk-test" });
    expect(bodyOf(calls[0])).toEqual({
      model: "openai/gpt-oss-20b",
      messages: [
        { role: "system", content: "Say hello" },
        { role: "user", content: "Brand: Acme" },
      ],
      max_tokens: 500,
      response_format: {
        type: "json_schema",
        json_schema: { name: "greeting", schema: schema.jsonSchema, strict: true },
      },
    });
  });

  it("falls back to JSON mode with the schema in the prompt", async () => {
    const { provider, calls } = createProvider([completion('{"message":"Hi","note":null}')], {
      structuredMode: "json_object",
    });

    const result = await provider.generateStructured(request);

    expect(result.data).toEqual({ message: "Hi", note: null });
    const body = bodyOf(calls[0]);
    expect(body.response_format).toEqual({ type: "json_object" });
    const system = (body.messages as { content: string }[])[0].content;
    expect(system).toContain("Say hello");
    expect(system).toContain(JSON.stringify(schema.jsonSchema));
  });

  it("works without an API key, for local runtimes", async () => {
    const { provider, calls } = createProvider([completion('{"message":"Local","note":null}')], {
      apiKey: undefined,
      baseUrl: "http://localhost:11434/v1",
    });

    expect(provider.isAvailable()).toBe(true);
    await provider.generateStructured(request);
    expect(calls[0].init.headers).not.toHaveProperty("Authorization");
  });

  it("reports missing configuration instead of calling out", async () => {
    const { provider, calls } = createProvider([], { model: "" });

    expect(provider.isAvailable()).toBe(false);
    const error = await failure(provider.generateStructured(request));
    expect(error.kind).toBe("NOT_CONFIGURED");
    expect(calls).toHaveLength(0);
  });

  it("needs a key for a hosted service, but not for a local one", async () => {
    const hosted = createProvider([], { apiKey: undefined });
    expect(hosted.provider.isAvailable()).toBe(false);
    const error = await failure(hosted.provider.generateStructured(request));
    expect(error.kind).toBe("NOT_CONFIGURED");
    expect(error.message).toContain("AI_API_KEY");
    expect(hosted.calls).toHaveLength(0);

    const local = createProvider([], {
      apiKey: undefined,
      baseUrl: "http://127.0.0.1:11434/v1",
    });
    expect(local.provider.isAvailable()).toBe(true);
  });

  it("accepts content parts and strips code fences", async () => {
    const fenced = completion('```json\n{"message":"Fenced","note":null}\n```');
    const { provider } = createProvider([fenced]);
    expect((await provider.generateStructured(request)).data.message).toBe("Fenced");

    const parts = json(200, {
      model: "m",
      choices: [
        {
          finish_reason: "stop",
          message: { content: [{ type: "text", text: '{"message":"Parts","note":null}' }] },
        },
      ],
    });
    const second = createProvider([parts]);
    expect((await second.provider.generateStructured(request)).data.message).toBe("Parts");
  });

  it.each([
    ["length", "INCOMPLETE"],
    ["content_filter", "REFUSED"],
  ])("maps finish_reason %s to %s", async (finishReason, kind) => {
    const { provider } = createProvider([
      json(200, {
        model: "m",
        choices: [{ finish_reason: finishReason, message: { content: "{}" } }],
      }),
    ]);
    expect((await failure(provider.generateStructured(request))).kind).toBe(kind);
  });

  it("treats a refusal as REFUSED", async () => {
    const { provider } = createProvider([
      json(200, {
        model: "m",
        choices: [{ finish_reason: "stop", message: { refusal: "I can't help with that" } }],
      }),
    ]);
    expect((await failure(provider.generateStructured(request))).kind).toBe("REFUSED");
  });

  it("catches an error body returned with a 200", async () => {
    const { provider } = createProvider([
      json(200, { error: { message: "Upstream provider is down", code: 502 } }),
    ]);
    const error = await failure(provider.generateStructured(request));
    expect(error.kind).toBe("PROVIDER_ERROR");
    expect(error.retryable).toBe(true);
  });

  it.each([
    [401, "AUTHENTICATION"],
    [402, "QUOTA_EXCEEDED"],
    [404, "MODEL_UNAVAILABLE"],
    [400, "INVALID_REQUEST"],
  ])("doesn't retry HTTP %i (%s)", async (status, kind) => {
    const { provider, calls } = createProvider([json(status, { error: { message: "nope" } })]);
    const error = await failure(provider.generateStructured(request));
    expect(error.kind).toBe(kind);
    expect(error.retryable).toBe(false);
    expect(calls).toHaveLength(1);
  });

  it("retries rate limits and server errors, honoring Retry-After", async () => {
    const { provider, calls, sleeps } = createProvider([
      json(429, { error: { message: "slow down" } }, { "retry-after": "2" }),
      json(503, { error: { message: "overloaded" } }),
      completion('{"message":"Third","note":null}'),
    ]);

    const result = await provider.generateStructured(request);

    expect(result.data.message).toBe("Third");
    expect(result.attempts).toBe(3);
    expect(calls).toHaveLength(3);
    expect(sleeps).toEqual([2000, 750]);
    // Tokens from the failed attempts count too.
    expect(result.usage.inputTokens).toBe(120);
  });

  it("retries output that doesn't match the schema, then gives up", async () => {
    const { provider, calls } = createProvider(
      [completion("not json"), completion('{"message":"far too long to fit in twenty"}')],
      { maxRetries: 1 },
    );
    const error = await failure(provider.generateStructured(request));
    expect(error.kind).toBe("INVALID_OUTPUT");
    expect(error.attempts).toBe(2);
    expect(calls).toHaveLength(2);
  });

  it("records no cost estimate, since free tiers and services differ", () => {
    const { provider } = createProvider([]);
    expect(provider.estimateCostUsd()).toBeNull();
  });
});
