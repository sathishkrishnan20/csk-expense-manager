import { DEFAULT_OLLAMA_URL, MODELS, normalizeOllamaUrl, providerNeedsKey, type Provider } from "../llm/providers";
import { plainStorage, secureStorage } from "../platform/secureStorage";

// Exactly one provider is active at a time (PROVIDER_KEY); each provider remembers its own API
// key and model, but only the active one is ever called. The API key lives in the iOS Keychain
// (encrypted with a passkey on web, see platform/secureStorage); it is never bundled into the
// app or written to the SQLite database. Reading it can throw while the web build is locked.
// The model name and Ollama address are not secret and are kept in plain storage.
const PROVIDER_KEY = "llm_provider";
const API_KEY_PREFIX = "llm_api_key_";
const MODEL_PREFIX = "llm_model_";
const OLLAMA_URL_KEY = "llm_ollama_url";

const PROVIDERS: Provider[] = ["gemini", "anthropic", "openai", "ollama"];

export interface Settings {
  provider: Provider;
  apiKey: string | null; // always null for providers without a key (Ollama)
  model: string;
  ollamaUrl: string;
}

export async function loadProvider(): Promise<Provider> {
  const stored = await plainStorage.get(PROVIDER_KEY);
  return PROVIDERS.find((p) => p === stored) ?? "gemini";
}

export async function loadSettings(): Promise<Settings> {
  const provider = await loadProvider();
  return {
    provider,
    apiKey: providerNeedsKey(provider) ? await secureStorage.get(API_KEY_PREFIX + provider) : null,
    model: await loadModel(provider),
    ollamaUrl: await loadOllamaUrl(),
  };
}

export async function saveProvider(provider: Provider): Promise<void> {
  await plainStorage.set(PROVIDER_KEY, provider);
}

export async function loadApiKey(provider: Provider): Promise<string | null> {
  return secureStorage.get(API_KEY_PREFIX + provider);
}

// True when a key is saved for the provider (also while the web build is locked).
export async function hasApiKey(provider: Provider): Promise<boolean> {
  return secureStorage.has(API_KEY_PREFIX + provider);
}

export async function saveApiKey(provider: Provider, apiKey: string): Promise<void> {
  const trimmed = apiKey.trim();
  if (trimmed) await secureStorage.set(API_KEY_PREFIX + provider, trimmed);
  else await secureStorage.remove(API_KEY_PREFIX + provider);
}

// The model the owner typed, or the provider's default when none was saved.
export async function loadModel(provider: Provider): Promise<string> {
  return (await plainStorage.get(MODEL_PREFIX + provider))?.trim() || MODELS[provider];
}

export async function saveModel(provider: Provider, model: string): Promise<void> {
  const trimmed = model.trim();
  if (trimmed && trimmed !== MODELS[provider]) await plainStorage.set(MODEL_PREFIX + provider, trimmed);
  else await plainStorage.remove(MODEL_PREFIX + provider);
}

export async function loadOllamaUrl(): Promise<string> {
  return (await plainStorage.get(OLLAMA_URL_KEY)) || DEFAULT_OLLAMA_URL;
}

export async function saveOllamaUrl(url: string): Promise<void> {
  const normalized = normalizeOllamaUrl(url);
  if (normalized === DEFAULT_OLLAMA_URL) await plainStorage.remove(OLLAMA_URL_KEY);
  else await plainStorage.set(OLLAMA_URL_KEY, normalized);
}
