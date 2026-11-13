import { applyFetch, isCacheFresh, type CachedRates } from "../domain/metalRates";
import { loadRatesCache, saveRatesCache } from "../settings/metalRatesCache";
import { fetchRateParts } from "./ibjaApi";

// The IBJA gold and silver rates for something that is not the rates page (Ask AI): the saved copy when it is under an hour old, otherwise a
// fresh fetch that is saved the same way the page saves it. When the network fails the older copy is returned (its `fetchedAt` says how old),
// and null only when there never was one. Never throws.
export async function loadMetalRates(now: number = Date.now()): Promise<CachedRates | null> {
  try {
    const saved = await loadRatesCache();
    if (saved && isCacheFresh(saved, now)) return saved;
    const result = applyFetch(saved, await fetchRateParts(), now);
    if (result.error === null && result.cache) await saveRatesCache(result.cache).catch(() => undefined);
    return result.cache;
  } catch {
    return null;
  }
}
