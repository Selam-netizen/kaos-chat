import assert from "node:assert/strict";
import test from "node:test";
import { getChatProviderStatus, getProviderModel, requestProviderReply, ProviderRequestError } from "./providers.ts";

const input = {
  topic: "Şehir içi ulaşım",
  messages: [{ role: "user", speakerName: "Kullanıcı", content: "Toplu taşıma neden önemli?" }],
};

test("uses documented default model names and reports only whether keys are configured", () => {
  assert.equal(getProviderModel("openai", {}), "gpt-4.1-mini");
  assert.equal(getProviderModel("gemini", {}), "gemini-2.5-flash");
  assert.deepEqual(getChatProviderStatus({ OPENAI_API_KEY: "dummy-openai", GEMINI_API_KEY: "dummy-gemini" }), {
    openai: { configured: true, model: "gpt-4.1-mini" },
    gemini: { configured: true, model: "gemini-2.5-flash" },
  });
  assert.equal(JSON.stringify(getChatProviderStatus({ OPENAI_API_KEY: "secret-value" })).includes("secret-value"), false);
});

test("OpenAI provider request uses server-side key and parses text without a real network call", async () => {
  let captured;
  const result = await requestProviderReply("openai", input, {
    env: { OPENAI_API_KEY: "test-only-secret" },
    fetchImpl: async (url, options) => {
      captured = { url, options, body: JSON.parse(options.body) };
      return new Response(JSON.stringify({ choices: [{ message: { content: "ChatGPT test yanıtı" } }] }), { status: 200 });
    },
  });
  assert.equal(result.text, "ChatGPT test yanıtı");
  assert.equal(result.model, "gpt-4.1-mini");
  assert.equal(captured.url, "https://api.openai.com/v1/chat/completions");
  assert.equal(captured.options.headers.authorization, "Bearer test-only-secret");
  assert.equal(captured.body.model, "gpt-4.1-mini");
  assert.equal(JSON.stringify(result).includes("test-only-secret"), false);
});

test("Gemini provider request uses server-side key and parses text without a real network call", async () => {
  let captured;
  const result = await requestProviderReply("gemini", input, {
    env: { GEMINI_API_KEY: "test-only-secret" },
    fetchImpl: async (url, options) => {
      captured = { url, options, body: JSON.parse(options.body) };
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "Gemini test yanıtı" }] } }] }), { status: 200 });
    },
  });
  assert.equal(result.text, "Gemini test yanıtı");
  assert.equal(result.model, "gemini-2.5-flash");
  assert.match(captured.url, /gemini-2\.5-flash:generateContent/u);
  assert.equal(captured.options.headers["x-goog-api-key"], "test-only-secret");
  assert.equal(JSON.stringify(result).includes("test-only-secret"), false);
});

test("missing provider key fails safely without making a request", async () => {
  let called = false;
  await assert.rejects(
    requestProviderReply("openai", input, {
      env: {},
      fetchImpl: async () => { called = true; return new Response("{}", { status: 200 }); },
    }),
    (error) => error instanceof ProviderRequestError && error.statusCode === 503 && error.code === "missing_api_key",
  );
  assert.equal(called, false);
});
