import { test } from "node:test";
import assert from "node:assert/strict";
import { createLlmCall, MODELS, normalizeOllamaUrl, providerNeedsKey } from "./providers";
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

test("a model typed in Config replaces the default one for every provider", async () => {
  let url = "";
  const gemini = createLlmCall("gemini", "k", {
    model: "gemini-custom",
    fetch: async (u) => {
      url = String(u);
      return json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(RESULTS) }] } }] });
    },
  });
  await gemini("s", "u", SCHEMA);
  assert.ok(url.includes("/models/gemini-custom:generateContent"));

  let anthropicModel = "";
  const claude = createLlmCall("anthropic", "k", {
    model: "claude-custom",
    fetch: async (_u, init) => {
      anthropicModel = JSON.parse(String(init!.body)).model;
      return json({ id: "m", type: "message", role: "assistant", model: "x", stop_reason: "end_turn", stop_sequence: null, content: [{ type: "text", text: JSON.stringify(RESULTS) }], usage: { input_tokens: 1, output_tokens: 1 } });
    },
  });
  await claude("s", "u", SCHEMA);
  assert.equal(anthropicModel, "claude-custom");
});

const openaiAnswer = (content: string | null, extra: Record<string, unknown> = {}, finish = "stop") =>
  json({ choices: [{ finish_reason: finish, message: { content, ...extra } }] });

test("openai: bearer key, strict json_schema, reasoning effort for reasoning models, parses the answer", async () => {
  let captured: { url: string; init: RequestInit } | undefined;
  const call = createLlmCall("openai", "sk-test", {
    fetch: async (url, init) => {
      captured = { url: String(url), init: init! };
      return openaiAnswer(JSON.stringify(RESULTS));
    },
  });
  assert.deepEqual(await call("SYS", "USER", SCHEMA), RESULTS);

  assert.equal(captured!.url, "https://api.openai.com/v1/chat/completions");
  assert.equal((captured!.init.headers as Record<string, string>).Authorization, "Bearer sk-test");
  const body = JSON.parse(String(captured!.init.body));
  assert.equal(body.model, MODELS.openai);
  assert.deepEqual(body.messages, [
    { role: "system", content: "SYS" },
    { role: "user", content: "USER" },
  ]);
  assert.equal(body.response_format.type, "json_schema");
  assert.equal(body.response_format.json_schema.strict, true);
  assert.deepEqual(body.response_format.json_schema.schema, SCHEMA);
  assert.equal(body.reasoning_effort, "low");
});

test("openai: reasoning_effort is only sent to models that take it", async () => {
  let body: Record<string, unknown> = {};
  const call = createLlmCall("openai", "k", {
    model: "gpt-4.1-mini",
    fetch: async (_u, init) => {
      body = JSON.parse(String(init!.body));
      return openaiAnswer(JSON.stringify(RESULTS));
    },
  });
  await call("s", "u", SCHEMA);
  assert.equal(body.model, "gpt-4.1-mini");
  assert.equal("reasoning_effort" in body, false);
});

test("openai: refusals, cut-off answers, empty answers and API errors are readable", async () => {
  const run = (res: () => Response) => createLlmCall("openai", "k", { fetch: async () => res() })("s", "u", SCHEMA);
  await assert.rejects(() => run(() => openaiAnswer(null, { refusal: "I cannot help" })), /declined.*I cannot help/);
  await assert.rejects(() => run(() => openaiAnswer("{", {}, "length")), /cut off/);
  await assert.rejects(() => run(() => openaiAnswer(null)), /empty response/);
  await assert.rejects(
    () => run(() => json({ error: { message: "Incorrect API key provided" } }, 401)),
    /^Error: OpenAI request failed \(401\): Incorrect API key provided$/,
  );
});

test("ollama: posts to the owner's server with the schema as format, no key, and parses message.content", async () => {
  let captured: { url: string; init: RequestInit } | undefined;
  const call = createLlmCall("ollama", "", {
    baseUrl: "192.168.1.20:11434/",
    model: "qwen3:8b",
    fetch: async (url, init) => {
      captured = { url: String(url), init: init! };
      return json({ done_reason: "stop", message: { role: "assistant", content: JSON.stringify(RESULTS) } });
    },
  });
  assert.deepEqual(await call("SYS", "USER", SCHEMA), RESULTS);

  assert.equal(captured!.url, "http://192.168.1.20:11434/api/chat");
  assert.equal((captured!.init.headers as Record<string, string>).Authorization, undefined);
  const body = JSON.parse(String(captured!.init.body));
  assert.equal(body.model, "qwen3:8b");
  assert.equal(body.stream, false);
  assert.deepEqual(body.format, SCHEMA);
  assert.equal(body.options.temperature, 0);
  assert.match(body.messages[0].content, /^SYS\n\nAnswer only with JSON/);
  assert.equal(body.messages[1].content, "USER");
});

test("ollama: unreachable server, missing model, cut-off and non-JSON answers are readable", async () => {
  const run = (fetchImpl: typeof fetch) =>
    createLlmCall("ollama", "", { baseUrl: "http://mac.local:11434", model: "llama3.2", fetch: fetchImpl, sleep: async () => {} })("s", "u", SCHEMA);

  await assert.rejects(() => run(async () => { throw new TypeError("Network request failed"); }), /Could not reach Ollama at http:\/\/mac\.local:11434/);
  await assert.rejects(() => run(async () => json({ error: "model not found" }, 404)), /does not have the model "llama3\.2".*ollama pull llama3\.2/);
  await assert.rejects(() => run(async () => json({ done_reason: "length", message: { content: "{" } })), /cut off/);
  await assert.rejects(() => run(async () => json({ done_reason: "stop", message: { content: "Sure! here you go" } })), /not valid JSON/);
});

test("ollama address: scheme added, trailing slashes dropped, empty means the local default", () => {
  assert.equal(normalizeOllamaUrl("  192.168.1.20:11434// "), "http://192.168.1.20:11434");
  assert.equal(normalizeOllamaUrl("https://ollama.example.com/"), "https://ollama.example.com");
  assert.equal(normalizeOllamaUrl(""), "http://localhost:11434");
  assert.equal(providerNeedsKey("ollama"), false);
  assert.equal(providerNeedsKey("openai"), true);
});
