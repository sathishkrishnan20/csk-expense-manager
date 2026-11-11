import { parseGoldApiInrPrice } from "../domain/tnGoldEstimate";

// The world spot price of gold from gold-api.com (free, no key, allows browsers). Kept apart from the IBJA client (ibjaApi.ts) because it
// is another service. `fetchFn` can be replaced in tests.
export const GOLD_API_BASE_URL = "https://api.gold-api.com";

type FetchFn = typeof fetch;

const TIMEOUT_MS = 10_000;

// Rupees for one troy ounce of gold, or null when it cannot be had (no network, a timeout, an error answer, an unexpected body). Never throws.
export async function fetchGoldOunceInr(fetchFn: FetchFn = fetch): Promise<number | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetchFn(`${GOLD_API_BASE_URL}/price/XAU/INR`, { signal: controller.signal });
    return res.ok ? parseGoldApiInrPrice(await res.json()) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
