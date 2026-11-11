import { parseCachedRates, type CachedRates } from "../domain/metalRates";
import { plainStorage } from "../platform/secureStorage";

// The last good gold and silver rates, with when they were fetched, so the Gold & Silver Rates page opens with something to show and only
// asks the network when they are over an hour old. Nothing secret. It is a small JSON text (about 1.5 KB for five days).
const KEY = "metal_rates_cache";

// Null when nothing is saved, it is damaged, or the storage cannot be read.
export async function loadRatesCache(): Promise<CachedRates | null> {
  try {
    return parseCachedRates(await plainStorage.get(KEY));
  } catch {
    return null;
  }
}

export const saveRatesCache = (cache: CachedRates): Promise<void> => plainStorage.set(KEY, JSON.stringify(cache));
