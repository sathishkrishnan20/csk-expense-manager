import Anthropic from "@anthropic-ai/sdk";

export type Provider = "gemini" | "anthropic";

// Change model ids here only. Gemini free-tier availability changes per model,
// so check AI Studio if calls start failing with quota errors.
export const MODELS: Record<Provider, string> = {
  gemini: "gemini-3.5-flash-lite",
  anthropic: "claude-haiku-5-5",
};

export type JsonSchema = Record<string, unknown>;

// Returns the model's parsed JSON answer for one batch. Shape validation
// happens in classify.ts so providers stay thin.
export type LlmCall = (system: string, user: string, schema: JsonSchema) => Promise<unknown>;

export interface LlmDeps {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
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

function geminiCall(apiKey: string, deps: LlmDeps): LlmCall {
  const doFetch = deps.fetch ?? fetch;
  const sleep = deps.sleep ?? defaultSleep;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODELS.gemini}:generateContent`;

  return async (system, user, schema) => {
    const body = JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: toGeminiSchema(schema),
      },
    });

    for (let attempt = 0; ; attempt++) {
      const res = await doFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body,
      });

      if (res.ok) {
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
      }

      if (RETRYABLE.has(res.status) && attempt < MAX_RETRIES) {
        await sleep(2000 * (attempt + 1));
        continue;
      }
      throw new LlmError(`Gemini request failed (${res.status}): ${await errorDetail(res)}`, res.status);
    }
  };
}

function anthropicCall(apiKey: string, deps: LlmDeps): LlmCall {
  // dangerouslyAllowBrowser: the key is the user's own, entered on their own
  // device and kept in the iOS Keychain; there is no shared backend to hide it behind.
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, fetch: deps.fetch });

  return async (system, user, schema) => {
    try {
      const res = await client.messages.create({
        model: MODELS.anthropic,
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

export function createLlmCall(provider: Provider, apiKey: string, deps: LlmDeps = {}): LlmCall {
  return provider === "anthropic" ? anthropicCall(apiKey, deps) : geminiCall(apiKey, deps);
}
