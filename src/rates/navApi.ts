// Downloads the two public daily NAV files. The one place that knows their addresses; what they contain is read in domain/navFiles.ts. Both files are
// the whole list (every fund, every scheme), so nothing about the owner's own holdings is sent anywhere. `fetchFn` can be replaced in tests.
export const AMFI_NAV_URL = "https://portal.amfiindia.com/spages/NAVAll.txt";
export const NPS_NAV_URL = "https://npstrust.org.in/nav-report-excel";

type FetchFn = typeof fetch;

const TIMEOUT_MS = 30_000; // the AMFI file is about 1.5 MB

// The text of the file, or null when anything goes wrong (no network, a timeout, an error answer). Never throws.
async function download(url: string, fetchFn: FetchFn): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetchFn(url, { signal: controller.signal });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export const fetchAmfiNavText = (fetchFn: FetchFn = fetch): Promise<string | null> => download(AMFI_NAV_URL, fetchFn);
export const fetchNpsNavText = (fetchFn: FetchFn = fetch): Promise<string | null> => download(NPS_NAV_URL, fetchFn);
