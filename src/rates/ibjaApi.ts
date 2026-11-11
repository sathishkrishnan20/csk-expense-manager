import {
  parseHistory,
  parseLatestGold,
  parseLatestSilver,
  type FetchedParts,
  type Part,
} from "../domain/metalRates";

// Talks to the IBJA rates API (an open-source scraper). The one place that knows its address and its endpoints. What the answers
// mean is decided in domain/metalRates.ts. `fetchFn` can be replaced in tests.
//
// Your own deployment: set EXPO_PUBLIC_IBJA_BASE_URL (no trailing slash) and EXPO_PUBLIC_IBJA_API_KEY in `.env`; it must match
// APP_API_KEY on Vercel. Expo puts EXPO_PUBLIC_ values into the app when it starts. Without them the open public instance is used.
export const PUBLIC_IBJA_BASE_URL = "https://ibja-api.vercel.app";

function configuredBaseUrl(): string | null {
  const url = (process.env.EXPO_PUBLIC_IBJA_BASE_URL ?? "").trim().replace(/\/+$/, "");
  return /^https?:\/\/\S+$/.test(url) ? url : null;
}

export const IBJA_BASE_URL = configuredBaseUrl() ?? PUBLIC_IBJA_BASE_URL;

// The Authorization header for your own deployment. Never sent to the public instance: that is someone else's server and must not
// see the key. Empty when no key is set.
export function ibjaAuthHeaders(baseUrl: string = IBJA_BASE_URL, apiKey: string | undefined = process.env.EXPO_PUBLIC_IBJA_API_KEY): Record<string, string> {
  const key = (apiKey ?? "").trim();
  return key && baseUrl !== PUBLIC_IBJA_BASE_URL ? { Authorization: `Bearer ${key}` } : {};
}

type FetchFn = typeof fetch;

const TIMEOUT_MS = 10_000;

// A 404 is the API saying it has no rate yet (before the day's rates are published), not a fault. Anything else that goes wrong (no
// network, a timeout, a server error, a body that is not JSON) is "failed".
async function get<T>(fetchFn: FetchFn, path: string, parse: (json: unknown) => T | null): Promise<Part<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetchFn(`${IBJA_BASE_URL}${path}`, { signal: controller.signal, headers: ibjaAuthHeaders() });
    if (res.status === 404) return { status: "unavailable" };
    if (!res.ok) return { status: "failed" };
    const value = parse(await res.json());
    return value === null ? { status: "unavailable" } : { status: "ok", value };
  } catch {
    return { status: "failed" };
  } finally {
    clearTimeout(timer);
  }
}

// Gold, silver and the recent history, fetched at the same time. Never throws.
export async function fetchRateParts(fetchFn: FetchFn = fetch): Promise<FetchedParts> {
  const [gold, silver, history] = await Promise.all([
    get(fetchFn, "/latest", parseLatestGold),
    get(fetchFn, "/silver/latest", parseLatestSilver),
    get(fetchFn, "/history", (json) => {
      const days = parseHistory(json);
      return days.length > 0 ? days : null;
    }),
  ]);
  return { gold, silver, history };
}
