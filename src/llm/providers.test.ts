import { test } from "node:test";
import assert from "node:assert/strict";
import { createLlmCall, MODELS } from "./providers";
import { buildSchema } from "./classify";

const SCHEMA = buildSchema(["Food", "Others"]);
const RESULTS = { results: [{ id: 0, category: "Food", subcategory: "Groceries" }] };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

test("gemini: sends key in header, model in URL, the given schema + JSON mime, and parses the answer", async () => {
  let captured: { url: string; init: RequestInit } | undefined;
  const call = createLlmCall("gemini", "KEY123", {
    fetch: async (url, init) => {
      captured = { url: String(url), init: init! };
      return json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(RESULTS) }] } }] });
    },
  });

  assert.deepEqual(await call("SYS", "USER", SCHEMA), RESULTS);

  assert.ok(captured!.url.includes(`/models/${MODELS.gemini}:generateContent`));
  assert.ok(!captured!.url.includes("KEY123"), "key must not be in the URL");
  assert.equal((captured!.init.headers as Record<string, string>)["x-goog-api-key"], "KEY123");

  const body = JSON.parse(String(captured!.init.body));
  assert.equal(body.systemInstruction.parts[0].text, "SYS");
  assert.equal(body.contents[0].parts[0].text, "USER");
  assert.equal(body.generationConfig.responseMimeType, "application/json");
  assert.equal(body.generationConfig.responseSchema.type, "OBJECT");
  const item = body.generationConfig.responseSchema.properties.results.items;
  assert.equal(item.type, "OBJECT");
  assert.equal(item.properties.id.type, "INTEGER");
  assert.deepEqual(item.properties.category.enum, ["Food", "Others"]);
  assert.ok(!JSON.stringify(body).includes("additionalProperties"));
});

test("gemini: retries 429 then succeeds; gives up after two retries", async () => {
  let attempts = 0;
  const ok = json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(RESULTS) }] } }] });
  const retried = createLlmCall("gemini", "k", {
    sleep: async () => {},
    fetch: async () => (++attempts < 3 ? json({ error: "slow down" }, 429) : ok.clone()),
  });
  assert.deepEqual(await retried("s", "u", SCHEMA), RESULTS);
  assert.equal(attempts, 3);

  attempts = 0;
  const failing = createLlmCall("gemini", "k", {
    sleep: async () => {},
    fetch: async () => (attempts++, json({ error: "quota" }, 429)),
  });
  await assert.rejects(() => failing("s", "u", SCHEMA), /429/);
  assert.equal(attempts, 3);
});

test("gemini: does not retry auth errors, and surfaces blocked/truncated answers", async () => {
  let attempts = 0;
  const bad = createLlmCall("gemini", "k", {
    fetch: async () => (attempts++, json({ error: { code: 400, message: "API key not valid." } }, 400)),
  });
  await assert.rejects(() => bad("s", "u", SCHEMA), /Gemini request failed \(400\): API key not valid\.$/);
  assert.equal(attempts, 1);

  const cut = createLlmCall("gemini", "k", {
    fetch: async () => json({ candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: "{" }] } }] }),
  });
  await assert.rejects(() => cut("s", "u", SCHEMA), /MAX_TOKENS/);

  const blocked = createLlmCall("gemini", "k", { fetch: async () => json({ promptFeedback: { blockReason: "SAFETY" } }) });
  await assert.rejects(() => blocked("s", "u", SCHEMA), /SAFETY/);
});

test("anthropic: uses the SDK with the given structured-output schema and parses the text block", async () => {
  let captured: { url: string; init: RequestInit } | undefined;
  const call = createLlmCall("anthropic", "sk-ant-test", {
    fetch: async (url, init) => {
      captured = { url: String(url), init: init! };
      return json({
        id: "msg_1",
        type: "message",
        role: "assistant",
        model: MODELS.anthropic,
        stop_reason: "end_turn",
        stop_sequence: null,
        content: [{ type: "text", text: JSON.stringify(RESULTS) }],
        usage: { input_tokens: 1, output_tokens: 1 },
      });
    },
  });

  assert.deepEqual(await call("SYS", "USER", SCHEMA), RESULTS);

  assert.ok(captured!.url.endsWith("/v1/messages"));
  const body = JSON.parse(String(captured!.init.body));
  assert.equal(body.model, "claude-haiku-5-5");
  assert.equal(body.system, "SYS");
  assert.equal(body.output_config.format.type, "json_schema");
  assert.equal(body.output_config.effort, "low");
  assert.equal(body.temperature, undefined);
  assert.deepEqual(body.output_config.format.schema.properties.results.items.properties.category.enum, [
    "Food",
    "Others",
  ]);
});

test("anthropic: refusal and API errors become readable errors", async () => {
  const refusing = createLlmCall("anthropic", "k", {
    fetch: async () =>
      json({
        id: "m",
        type: "message",
        role: "assistant",
        model: MODELS.anthropic,
        stop_reason: "refusal",
        stop_sequence: null,
        content: [],
        usage: { input_tokens: 1, output_tokens: 0 },
      }),
  });
  await assert.rejects(() => refusing("s", "u", SCHEMA), /declined/);

  const unauthorized = createLlmCall("anthropic", "bad", {
    fetch: async () => json({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }, 401),
  });
  await assert.rejects(() => unauthorized("s", "u", SCHEMA), /^Error: Claude request failed \(401\): invalid x-api-key$/);
});
