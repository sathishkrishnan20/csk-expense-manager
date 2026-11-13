import PostalMime from "postal-mime";
import type { Env } from "./worker";

// The savings inbox: a PDF statement that arrives by email (the monthly CAS, forwarded by a Gmail filter) is kept here until the app collects it. So is the text of
// a fund house's purchase confirmation that has no attachment (ICICI Prudential and Kotak put the units, NAV and date in the email itself).
//
//   email to  savings-<32 hex>@<your domain>   Cloudflare Email Routing hands it to this Worker (a catch-all rule "Send to a Worker")
//   GET    /mail/<token>        the waiting PDFs: [{ id, name, size, receivedAt, from }]
//   GET    /mail/<token>/<id>   one PDF (application/pdf)
//   DELETE /mail/<token>/<id>   remove it (the app does this once it has saved the statement)
//
// The token is the 32 hex characters after "savings-" in the address the owner made in the app; it is the only secret, and it cannot be guessed. A
// statement PDF is locked with the owner's PAN by the sender, and the password stays on the phone, so what is kept here cannot be read. Each PDF is kept
// for 30 days at most. An email with no PDF (such as the confirmation code Gmail sends when a forwarding address is added) is passed on to FORWARD_TO, a
// secret holding the owner's own address, so it is not lost. ALLOWED_SENDERS (optional) lists the sender domains whose PDFs are kept.

// What the Worker uses of Cloudflare's incoming email message, so it can be tested without Cloudflare.
export interface EmailLike {
  from: string;
  to: string;
  raw: ReadableStream<Uint8Array>;
  rawSize: number;
  forward(to: string): Promise<void>;
  setReject(reason: string): void;
}

export interface InboxItem {
  id: string;
  name: string; // the PDF's file name, or the subject of an email kept as text
  size: number; // bytes of the PDF, or characters of the text
  receivedAt: string;
  from: string;
  kind?: "pdf" | "text"; // a PDF unless it says "text"
}

// What is kept for an email with no attachment: the text of a purchase confirmation. Stored as JSON text.
export interface MailText {
  subject: string;
  from: string;
  date: string; // when the email was sent, ISO
  text: string;
}

export const MAX_PDF_BYTES = 4_000_000;
export const MAX_RAW_BYTES = 12_000_000;
export const MAX_PDFS_PER_EMAIL = 5;
export const MAX_TEXT_CHARS = 60_000;
export const MAX_WAITING = 30;
export const KEEP_SECONDS = 30 * 24 * 60 * 60;

const TOKEN = /^[0-9a-f]{32}$/;
const ITEM = /^\d{13}-[0-9a-f]{6}$/;
const ADDRESS = /^savings-([0-9a-f]{32})$/;

const keyOf = (token: string, id: string): string => `mail:${token}:${id}`;

// The size in bytes of base64 text (its padding characters are not data).
const base64Bytes = (text: string): number => Math.floor((text.length * 3) / 4) - (text.endsWith("==") ? 2 : text.endsWith("=") ? 1 : 0);

// The token in an address like "savings-<32 hex>@example.com" (capitals do not matter), or null.
export function tokenOfAddress(address: string): string | null {
  const local = address.trim().toLowerCase().split("@")[0] ?? "";
  return ADDRESS.exec(local)?.[1] ?? null;
}

// Whether a sender's address is on the list of allowed domains ("cdslstatement.com, example.org"); no list means every sender. A subdomain counts.
export function senderAllowed(address: string, allowed: string | undefined): boolean {
  const domains = (allowed ?? "").split(/[,\s]+/).map((d) => d.trim().toLowerCase().replace(/^@/, "")).filter(Boolean);
  if (domains.length === 0) return true;
  const domain = address.trim().toLowerCase().split("@")[1] ?? "";
  return domains.some((d) => domain === d || domain.endsWith(`.${d}`));
}

const newId = (now: number = Date.now()): string => `${String(now).padStart(13, "0")}-${[...crypto.getRandomValues(new Uint8Array(3))].map((b) => b.toString(16).padStart(2, "0")).join("")}`;

// The visible text of an HTML email: tags become spaces, the common entities are decoded, and runs of white space become one space.
export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t\f\v\u00a0]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

// Whether an email with no attachment is a purchase confirmation worth keeping: it talks about units and a NAV. Gmail's forwarding confirmation and the like do not,
// so they are passed on to the owner instead.
export const looksLikePurchase = (text: string): boolean => /\bunits?\b/i.test(text) && /\bNAV\b|net asset value/i.test(text);

// A message sent to the inbox address. Returns what was done, for the tests.
export async function receiveEmail(message: EmailLike, env: Env, now: number = Date.now()): Promise<"stored" | "passed-on" | "rejected"> {
  const token = tokenOfAddress(message.to);
  if (!token) {
    message.setReject("No such address");
    return "rejected";
  }
  if (message.rawSize > MAX_RAW_BYTES) {
    message.setReject("Message too large");
    return "rejected";
  }

  const email = await PostalMime.parse(message.raw, { attachmentEncoding: "base64" });
  const from = email.from?.address ?? message.from;
  const pdfs = email.attachments.filter(
    (a) => typeof a.content === "string" && (a.mimeType === "application/pdf" || /\.pdf$/i.test(a.filename ?? "")) && base64Bytes(a.content) <= MAX_PDF_BYTES,
  );
  const waiting = (await env.BACKUPS.list({ prefix: `mail:${token}:` })).keys.length;

  const text = email.text?.trim() ? email.text.trim() : htmlToText(email.html ?? "");
  const wantText = pdfs.length === 0 && text.length > 0 && text.length <= MAX_TEXT_CHARS && looksLikePurchase(text);
  const room = waiting + (wantText ? 1 : Math.min(pdfs.length, MAX_PDFS_PER_EMAIL)) <= MAX_WAITING;

  if (!senderAllowed(from, env.ALLOWED_SENDERS) || !room || (pdfs.length === 0 && !wantText)) {
    if (env.FORWARD_TO) await message.forward(env.FORWARD_TO);
    return "passed-on";
  }
  if (wantText) {
    const subject = (email.subject ?? "").slice(0, 200);
    const meta: InboxItem = { id: newId(now), name: (subject || "Purchase confirmation").slice(0, 120), size: text.length, receivedAt: new Date(now).toISOString(), from: from.slice(0, 120), kind: "text" };
    const body: MailText = { subject, from: from.slice(0, 120), date: email.date ?? new Date(now).toISOString(), text };
    await env.BACKUPS.put(keyOf(token, meta.id), JSON.stringify(body), { metadata: meta, expirationTtl: KEEP_SECONDS });
    return "stored";
  }
  for (const [i, pdf] of pdfs.slice(0, MAX_PDFS_PER_EMAIL).entries()) {
    const content = pdf.content as string;
    const meta: InboxItem = {
      id: newId(now + i),
      name: (pdf.filename ?? "statement.pdf").slice(0, 120),
      size: base64Bytes(content),
      receivedAt: new Date(now).toISOString(),
      from: from.slice(0, 120),
    };
    await env.BACKUPS.put(keyOf(token, meta.id), content, { metadata: meta, expirationTtl: KEEP_SECONDS });
  }
  return "stored";
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

// The /mail routes. Null when the path is not one of them.
export async function handleMail(method: string, pathname: string, env: Env, reply: (status: number, body?: BodyInit | null, extra?: Record<string, string>) => Response): Promise<Response | null> {
  const match = /^\/mail\/([^/]+)(?:\/([^/]+))?$/.exec(pathname);
  if (!match) return null;
  const [, token, id] = match;
  if (!TOKEN.test(token) || (id !== undefined && !ITEM.test(id))) return reply(404, "Not found");

  if (id === undefined) {
    if (method !== "GET") return reply(405, "Method not allowed", { allow: "GET, OPTIONS" });
    const listed = await env.BACKUPS.list({ prefix: `mail:${token}:` });
    const items = listed.keys.map((k) => k.metadata as InboxItem | undefined).filter((m): m is InboxItem => !!m && typeof m.id === "string");
    return reply(200, JSON.stringify({ items }), { "content-type": "application/json" });
  }
  if (method === "GET") {
    const { value, metadata } = await env.BACKUPS.getWithMetadata<InboxItem>(keyOf(token, id));
    if (value === null) return reply(404, "Not found");
    if (metadata?.kind === "text") return reply(200, value, { "content-type": "application/json" });
    return reply(200, fromBase64(value), { "content-type": "application/pdf" });
  }
  if (method === "DELETE") {
    await env.BACKUPS.delete(keyOf(token, id));
    return reply(200, "Deleted");
  }
  return reply(405, "Method not allowed", { allow: "GET, DELETE, OPTIONS" });
}
