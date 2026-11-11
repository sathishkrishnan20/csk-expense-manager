import { parseGoldHistory, type GoldHistoryRow } from "../domain/goldHistory";
import { IBJA_BASE_URL, ibjaAuthHeaders, PUBLIC_IBJA_BASE_URL } from "./ibjaApi";

// The Nagercoil gold history from our own backend. Only our deployment has this route (the public instance does not), and it
// answers 401 without the key, so this is a no-op until EXPO_PUBLIC_IBJA_BASE_URL and EXPO_PUBLIC_IBJA_API_KEY are set (see
// ibjaApi.ts). `fetchFn` can be replaced in tests.
type FetchFn = typeof fetch;

const TIMEOUT_MS = 10_000;

// The rows, newest first, or null when they cannot be had (not set up, no network, a timeout, 401/404, an unexpected body).
// Never throws.
export async function fetchGoldHistory(fetchFn: FetchFn = fetch, baseUrl: string = IBJA_BASE_URL): Promise<GoldHistoryRow[] | null> {
  if (baseUrl === PUBLIC_IBJA_BASE_URL) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetchFn(`${baseUrl}/api/gold-history`, { signal: controller.signal, headers: ibjaAuthHeaders(baseUrl) });
    if (!res.ok) return null;
    const rows = parseGoldHistory(await res.json());
    return rows.length > 0 ? rows : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
