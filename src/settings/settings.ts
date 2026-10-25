import * as SecureStore from "expo-secure-store";
import type { Provider } from "../llm/providers";

// The API key lives in the iOS Keychain via SecureStore; it is never bundled
// into the app or written to the SQLite database.
const PROVIDER_KEY = "llm_provider";
const API_KEY_PREFIX = "llm_api_key_";

export interface Settings {
  provider: Provider;
  apiKey: string | null;
}

export async function loadSettings(): Promise<Settings> {
  const stored = await SecureStore.getItemAsync(PROVIDER_KEY);
  const provider: Provider = stored === "anthropic" ? "anthropic" : "gemini";
  return { provider, apiKey: await SecureStore.getItemAsync(API_KEY_PREFIX + provider) };
}

export async function saveProvider(provider: Provider): Promise<void> {
  await SecureStore.setItemAsync(PROVIDER_KEY, provider);
}

export async function loadApiKey(provider: Provider): Promise<string | null> {
  return SecureStore.getItemAsync(API_KEY_PREFIX + provider);
}

export async function saveApiKey(provider: Provider, apiKey: string): Promise<void> {
  const trimmed = apiKey.trim();
  if (trimmed) await SecureStore.setItemAsync(API_KEY_PREFIX + provider, trimmed);
  else await SecureStore.deleteItemAsync(API_KEY_PREFIX + provider);
}
