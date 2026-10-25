import Anthropic from "@anthropic-ai/sdk";

export type Provider = "gemini" | "anthropic" | "openai" | "ollama";

// The model used when the owner has not typed another one in Config > AI (model ids change
// often; Gemini free-tier availability changes per model, so check AI Studio if calls start
// failing with quota errors). Ollama's depends on what is installed, so this is only a start.
export const MODELS: Record<Provider, string> = {
  gemini: "gemini-3.5-flash-lite",
  anthropic: "claude-haiku-5-5",
  openai: "gpt-6-luna",
  ollama: "llama3.2",
};

export const PROVIDER_LABEL: Record<Provider, string> = {
  gemini: "Gemini",
  anthropic: "Claude",
  openai: "ChatGPT",
  ollama: "Ollama",
};

export const DEFAULT_OLLAMA_URL = "http://localhost:11434";

// Ollama runs on the owner's own machine and has no key.
export const providerNeedsKey = (provider: Provider): boolean => provider !== "ollama";

export type JsonSchema = Record<string, unknown>;

// Returns the model's parsed JSON answer for one batch. Shape validation
// happens in classify.ts so providers stay thin.
export type LlmCall = (system: string, user: string, schema: JsonSchema) => Promise<unknown>;

export interface LlmDeps {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  model?: string; // overrides MODELS[provider]
  baseUrl?: string; // Ollama server address
}

export class LlmError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES = 2;

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Gemini's responseSchema wants uppercase OpenAPI-style type names and has no
// additionalProperties.
function toGeminiSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(toGeminiSchema);
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
      if (key === "additionalProperties") continue;
      out[key] = key === "type" && typeof value === "string" ? value.toUpperCase() : toGeminiSchema(value);
    }
    return out;
  }
  return node;
}

// Google wraps errors as {"error": {"message": ...}}; show just the message.
async function errorDetail(res: Response): Promise<string> {
  const raw = await res.text();
  try {
    const message = JSON.parse(raw)?.error?.message;
    if (typeof message === "string") return message;
  } catch {
    // not JSON, fall through to the raw text
  }
  return raw.slice(0, 200);
}

// POSTs JSON, retrying the statuses that are worth retrying. Returns the OK response; anything
// else becomes an LlmError that names the service.
async function postJson(name: string, url: string, headers: Record<string, string>, body: unknown, deps: LlmDeps): Promise<Response> {
  const doFetch = deps.fetch ?? fetch;
  const sleep = deps.sleep ?? defaultSleep;
  const payload = JSON.stringify(body);

  for (let attempt = 0; ; attempt++) {
    const res = await doFetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: payload });
    if (res.ok) return res;
    if (RETRYABLE.has(res.status) && attempt < MAX_RETRIES) {
      await sleep(2000 * (attempt + 1));
      continue;
    }
    throw new LlmError(`${name} request failed (${res.status}): ${await errorDetail(res)}`, res.status);
  }
}

function geminiCall(apiKey: string, deps: LlmDeps): LlmCall {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${deps.model ?? MODELS.gemini}:generateContent`;

  return async (system, user, schema) => {
    const body = {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: toGeminiSchema(schema),
      },
    };

    const res = await postJson("Gemini", url, { "x-goog-api-key": apiKey }, body, deps);
    const data = (await res.json()) as {
      candidates?: { finishReason?: string; content?: { parts?: { text?: string }[] } }[];
      promptFeedback?: { blockReason?: string };
    };
    if (data.promptFeedback?.blockReason) {
      throw new LlmError(`Gemini blocked the request (${data.promptFeedback.blockReason})`);
    }
    const candidate = data.candidates?.[0];
    if (candidate?.finishReason && candidate.finishReason !== "STOP") {
      throw new LlmError(`Gemini stopped early (${candidate.finishReason})`);
    }
    const text = candidate?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    if (!text) throw new LlmError("Gemini returned an empty response");
    return JSON.parse(text);
  };
}

function anthropicCall(apiKey: string, deps: LlmDeps): LlmCall {
  // dangerouslyAllowBrowser: the key is the user's own, entered on their own
  // device and kept in the iOS Keychain; there is no shared backend to hide it behind.
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, fetch: deps.fetch });

  return async (system, user, schema) => {
    try {
      const res = await client.messages.create({
        model: deps.model ?? MODELS.anthropic,
        max_tokens: 8192,
        system,
        messages: [{ role: "user", content: user }],
        output_config: { effort: "low", format: { type: "json_schema", schema } },
      });

      if (res.stop_reason === "refusal") throw new LlmError("Claude declined to classify this batch");
      if (res.stop_reason === "max_tokens") throw new LlmError("Claude's answer was cut off; try a smaller batch");
      const block = res.content.find((b) => b.type === "text");
      if (!block || block.type !== "text") throw new LlmError("Claude returned no text");
      return JSON.parse(block.text);
    } catch (err) {
      if (err instanceof Anthropic.APIError) {
        const body = err.error as { error?: { message?: string } } | undefined;
        throw new LlmError(`Claude request failed (${err.status}): ${body?.error?.message ?? err.message}`, err.status);
      }
      throw err;
    }
  };
}

// Models that take a reasoning_effort setting; other OpenAI models reject the parameter.
const OPENAI_REASONING = /^(gpt-[56]|o\d)/;

function openaiCall(apiKey: string, deps: LlmDeps): LlmCall {
  const model = deps.model ?? MODELS.openai;

  return async (system, user, schema) => {
    const res = await postJson(
      "OpenAI",
      "https://api.openai.com/v1/chat/completions",
      { Authorization: `Bearer ${apiKey}` },
      {
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_schema", json_schema: { name: "classifications", strict: true, schema } },
        ...(OPENAI_REASONING.test(model) ? { reasoning_effort: "low" } : {}),
      },
      deps,
    );
    const data = (await res.json()) as {
      choices?: { finish_reason?: string; message?: { content?: string | null; refusal?: string | null } }[];
    };
    const choice = data.choices?.[0];
    if (choice?.message?.refusal) throw new LlmError(`OpenAI declined to classify this batch: ${choice.message.refusal}`);
    if (choice?.finish_reason === "length") throw new LlmError("OpenAI's answer was cut off; try a smaller batch");
    const text = choice?.message?.content;
    if (!text) throw new LlmError("OpenAI returned an empty response");
    return JSON.parse(text);
  };
}

// An Ollama server on the owner's own computer; nothing goes to a third party. On a phone the
// address must be that computer's address on the same Wi-Fi, not localhost.
export function normalizeOllamaUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (trimmed === "") return DEFAULT_OLLAMA_URL;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
}

function ollamaCall(deps: LlmDeps): LlmCall {
  const base = normalizeOllamaUrl(deps.baseUrl ?? "");
  const model = deps.model ?? MODELS.ollama;

  return async (system, user, schema) => {
    let res: Response;
    try {
      res = await postJson(
        "Ollama",
        `${base}/api/chat`,
        {},
        {
          model,
          stream: false,
          // Ollama advises repeating the schema in the prompt as well as in `format`.
          messages: [
            { role: "system", content: `${system}\n\nAnswer only with JSON that matches this schema:\n${JSON.stringify(schema)}` },
            { role: "user", content: user },
          ],
          format: schema,
          options: { temperature: 0 },
        },
        deps,
      );
    } catch (err) {
      if (err instanceof LlmError) {
        if (err.status === 404) throw new LlmError(`Ollama does not have the model "${model}". Run: ollama pull ${model}`, 404);
        throw err;
      }
      throw new LlmError(
        `Could not reach Ollama at ${base}. Check that it is running and that this device can open that address.`,
      );
    }
    const data = (await res.json()) as { done_reason?: string; message?: { content?: string } };
    if (data.done_reason === "length") throw new LlmError("Ollama's answer was cut off; try a larger model or fewer rows");
    const text = data.message?.content;
    if (!text) throw new LlmError("Ollama returned an empty response");
    try {
      return JSON.parse(text);
    } catch {
      throw new LlmError(`Ollama's answer was not valid JSON (the model "${model}" may be too small for this)`);
    }
  };
}

export function createLlmCall(provider: Provider, apiKey: string, deps: LlmDeps = {}): LlmCall {
  switch (provider) {
    case "anthropic":
      return anthropicCall(apiKey, deps);
    case "openai":
      return openaiCall(apiKey, deps);
    case "ollama":
      return ollamaCall(deps);
    default:
      return geminiCall(apiKey, deps);
  }
}
