// Talks to the savings inbox on the backup server (server/src/mail.ts). It only moves what is there: what a PDF means is decided by the statement parsers.
// `fetchFn` can be replaced in tests.
export class SavingsMailError extends Error {}

type FetchFn = typeof fetch;

const TIMEOUT_MS = 60_000;

export interface MailItem {
  id: string;
  name: string; // the PDF's file name, or the subject of an email kept as text
  size: number;
  receivedAt: string;
  from: string;
  kind: "pdf" | "text"; // a PDF statement, or the text of a purchase confirmation email
}

// What the server keeps of an email with no attachment (server/src/mail.ts).
export interface MailText {
  subject: string;
  from: string;
  date: string;
  text: string;
}

async function call(fetchFn: FetchFn, url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetchFn(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw new SavingsMailError("The server did not answer in time.");
    throw new SavingsMailError("Could not reach the server. Check your internet connection.");
  } finally {
    clearTimeout(timer);
  }
}

const failed = (res: Response): SavingsMailError => new SavingsMailError(`The server answered with an error (${res.status}).`);

export async function listMail(baseUrl: string, token: string, fetchFn: FetchFn = fetch): Promise<MailItem[]> {
  const res = await call(fetchFn, `${baseUrl}/mail/${token}`, { method: "GET" });
  if (!res.ok) throw failed(res);
  const body: unknown = await res.json().catch(() => null);
  const items = (body as { items?: unknown })?.items;
  if (!Array.isArray(items)) throw new SavingsMailError("The server's answer was not what the app expected.");
  return items.filter((i): i is MailItem => typeof i?.id === "string" && typeof i?.name === "string").map((i) => ({ id: i.id, name: i.name, size: Number(i.size) || 0, receivedAt: String(i.receivedAt ?? ""), from: String(i.from ?? ""), kind: i.kind === "text" ? ("text" as const) : ("pdf" as const) }));
}

// Null when the PDF is not there any more.
export async function downloadMail(baseUrl: string, token: string, id: string, fetchFn: FetchFn = fetch): Promise<Uint8Array | null> {
  const res = await call(fetchFn, `${baseUrl}/mail/${token}/${id}`, { method: "GET" });
  if (res.status === 404) return null;
  if (!res.ok) throw failed(res);
  return new Uint8Array(await res.arrayBuffer());
}

export async function deleteMail(baseUrl: string, token: string, id: string, fetchFn: FetchFn = fetch): Promise<void> {
  const res = await call(fetchFn, `${baseUrl}/mail/${token}/${id}`, { method: "DELETE" });
  if (!res.ok) throw failed(res);
}

// The text of an email the server kept as text. Null when it is not there any more or is not what the app expects.
export function readMailText(bytes: Uint8Array): MailText | null {
  try {
    const body = JSON.parse(new TextDecoder().decode(bytes)) as Partial<MailText>;
    return typeof body.text === "string" ? { subject: String(body.subject ?? ""), from: String(body.from ?? ""), date: String(body.date ?? ""), text: body.text } : null;
  } catch {
    return null;
  }
}
