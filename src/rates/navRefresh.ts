import { Platform } from "react-native";
import { loadSavings, saveLiveNavs } from "../db/savings";
import { navUpdatesFor } from "../domain/navFiles";
import { plainStorage } from "../platform/secureStorage";
import { fetchAmfiNavText, fetchNpsNavText } from "./navApi";

// Looks up today's NAV for the funds and NPS schemes the owner holds, so the Savings page can show units x NAV (the live value) instead of only the value
// the last statement printed. Asks the network at most once every few hours unless the owner taps Refresh. On the phone only: the NAV files are not
// served for a browser page, so the web build keeps the statement's value and says so.
const KEY = "savings_nav_checked";
const FRESH_MS = 3 * 60 * 60 * 1000;

export const liveNavSupported: boolean = Platform.select({ ios: true, android: true, web: false, default: false });

export type NavRefreshStatus = "unsupported" | "nothing" | "fresh" | "updated" | "failed";

export async function refreshLiveNavs(opts: { force?: boolean; now?: number } = {}): Promise<{ status: NavRefreshStatus; updated: number }> {
  const now = opts.now ?? Date.now();
  if (!liveNavSupported) return { status: "unsupported", updated: 0 };
  try {
    const { holdings } = await loadSavings();
    if (holdings.length === 0) return { status: "nothing", updated: 0 };
    if (!opts.force) {
      const last = Number(await plainStorage.get(KEY).catch(() => null));
      if (Number.isFinite(last) && last > 0 && now - last < FRESH_MS) return { status: "fresh", updated: 0 };
    }
    const [amfi, nps] = await Promise.all([
      holdings.some((h) => h.kind === "mf") ? fetchAmfiNavText() : Promise.resolve(null),
      holdings.some((h) => h.kind === "nps") ? fetchNpsNavText() : Promise.resolve(null),
    ]);
    if (amfi === null && nps === null) return { status: "failed", updated: 0 };
    const updates = navUpdatesFor(holdings, amfi, nps);
    await saveLiveNavs(updates);
    await plainStorage.set(KEY, String(now)).catch(() => undefined);
    return { status: "updated", updated: updates.length };
  } catch {
    return { status: "failed", updated: 0 };
  }
}
