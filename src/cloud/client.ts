import { CloudBackupError } from "../domain/cloudBackup";

// Talks to the backup server (server/src/worker.ts). It only moves text: what the body means is decided in
// domain/cloudBackup.ts. `fetchFn` can be replaced in tests.
type FetchFn = typeof fetch;

const TIMEOUT_MS = 60_000;

export interface Downloaded {
  body: string;
  updatedAt: string | null;
}

async function call(fetchFn: FetchFn, url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetchFn(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw new CloudBackupError("The backup server did not answer in time. Try again.");
    throw new CloudBackupError("Could not reach the backup server. Check your internet connection.");
  } finally {
    clearTimeout(timer);
  }
}

async function failed(res: Response): Promise<CloudBackupError> {
  if (res.status === 413) return new CloudBackupError("The server says this backup is too large. Use Export data instead.");
  if (res.status === 429) return new CloudBackupError("The server is busy right now. Try again in a minute.");
  const detail = (await res.text().catch(() => "")).slice(0, 120);
  return new CloudBackupError(`The backup server answered with an error (${res.status}${detail ? `: ${detail}` : ""}).`);
}

const backupUrl = (baseUrl: string, id: string) => `${baseUrl}/backup/${id}`;

export async function uploadBackup(baseUrl: string, id: string, body: string, fetchFn: FetchFn = fetch): Promise<void> {
  const res = await call(fetchFn, backupUrl(baseUrl, id), { method: "PUT", headers: { "content-type": "text/plain" }, body });
  if (!res.ok) throw await failed(res);
}

// Null when the server has no backup under this id.
export async function downloadBackup(baseUrl: string, id: string, fetchFn: FetchFn = fetch): Promise<Downloaded | null> {
  const res = await call(fetchFn, backupUrl(baseUrl, id), { method: "GET" });
  if (res.status === 404) return null;
  if (!res.ok) throw await failed(res);
  return { body: await res.text(), updatedAt: res.headers.get("x-updated-at") || null };
}

export async function deleteBackup(baseUrl: string, id: string, fetchFn: FetchFn = fetch): Promise<void> {
  const res = await call(fetchFn, backupUrl(baseUrl, id), { method: "DELETE" });
  if (!res.ok) throw await failed(res);
}
