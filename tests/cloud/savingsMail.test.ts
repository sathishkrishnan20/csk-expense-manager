import { test } from "node:test";
import assert from "node:assert/strict";
import { receiveEmail, type EmailLike } from "../../server/src/mail";
import { handle, type Env } from "../../server/src/worker";
import { collectMail } from "../../src/import/savingsMailCollect";
import { readSipText } from "../../src/domain/fundMail";
import { addressFor, existingAddress, fixedDomain, isDomain, isToken, settingsFromAddress, tokenFromBytes } from "../../src/domain/savingsMail";
import type { ImportReport } from "../../src/db/savingsSql";
import { fakeKv } from "../server/fakeKv";

const BASE = "https://backup.example.workers.dev";
const TOKEN = "0123456789abcdef0123456789abcdef";

// The app's fetch goes straight into the Worker's code with an in-memory store, so both sides are tested together.
function server() {
  const env: Env = { BACKUPS: fakeKv() };
  const fetchFn = ((url: string, init?: RequestInit) => handle(new Request(url, init), env)) as typeof fetch;
  const deliver = async (name: string, body: string) => {
    const raw =
      `From: ecas@cdslstatement.com\r\nTo: savings-${TOKEN}@example.store\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary="b"\r\n\r\n--b\r\nContent-Type: text/plain\r\n\r\nhi\r\n` +
      `--b\r\nContent-Type: application/pdf; name="${name}"\r\nContent-Disposition: attachment; filename="${name}"\r\nContent-Transfer-Encoding: base64\r\n\r\n${Buffer.from(body).toString("base64")}\r\n--b--\r\n`;
    const bytes = new TextEncoder().encode(raw);
    const message: EmailLike = { from: "x@y.z", to: `savings-${TOKEN}@example.store`, rawSize: bytes.length, raw: new ReadableStream({ start: (c) => (c.enqueue(bytes), c.close()) }), forward: async () => {}, setReject: () => {} };
    await receiveEmail(message, env);
  };
  return { env, fetchFn, deliver };
}

const report = (what: string): ImportReport => ({ what, added: 1, updated: 0, same: 0, kept: 0, removed: 0, notes: [] });

test("an address is made of the secret token and the domain, and read back from a pasted one", () => {
  const token = tokenFromBytes(new Uint8Array(16).fill(171));
  assert.equal(token, "ab".repeat(16));
  assert.ok(isToken(token) && !isToken("xyz") && !isToken(token.toUpperCase()));
  assert.equal(addressFor(token, " Example.Store "), `savings-${token}@example.store`);
  assert.deepEqual(settingsFromAddress(`Savings-${token}@Example.Store`), { token, domain: "example.store" });
  assert.equal(settingsFromAddress("someone@example.store"), null);
  assert.ok(isDomain("vzykart.store") && isDomain("a-b.example.co.in"));
  assert.ok(!isDomain("not a domain") && !isDomain("http://x.com") && !isDomain("a@b.com") && !isDomain("nodot"));
});

test("a statement that arrived by email is collected, imported, and deleted from the server", async () => {
  const s = server();
  await s.deliver("OCT2026_TXN.pdf", "%PDF-1.4 invented one");
  const imported: string[] = [];
  const pull = await collectMail({ baseUrl: BASE, token: TOKEN }, { pdf: async (bytes) => (imported.push(Buffer.from(bytes).toString()), report("MF")), text: async () => report("MF") }, () => {}, s.fetchFn);
  assert.deepEqual(imported, ["%PDF-1.4 invented one"]);
  assert.equal(pull.found, 1);
  assert.equal(pull.reports.length, 1);
  assert.deepEqual(pull.errors, []);
  // Nothing is left to collect, so the next time nothing is imported.
  const again = await collectMail({ baseUrl: BASE, token: TOKEN }, { pdf: async () => report("MF"), text: async () => report("MF") }, () => {}, s.fetchFn);
  assert.equal(again.found, 0);
});

test("a statement that could not be read stays on the server and is reported with its name; the others are still imported", async () => {
  const s = server();
  await s.deliver("bad.pdf", "%PDF bad");
  await s.deliver("good.pdf", "%PDF good");
  const pull = await collectMail(
    { baseUrl: BASE, token: TOKEN },
    {
      pdf: async (bytes) => {
        if (Buffer.from(bytes).toString().includes("bad")) throw new Error("This PDF is password protected.");
        return report("MF");
      },
      text: async () => report("MF"),
    },
    () => {},
    s.fetchFn,
  );
  assert.equal(pull.found, 2);
  assert.equal(pull.reports.length, 1);
  assert.deepEqual(pull.errors, ["bad.pdf: This PDF is password protected."]);
  const left = await collectMail({ baseUrl: BASE, token: TOKEN }, { pdf: async () => report("MF"), text: async () => report("MF") }, () => {}, s.fetchFn);
  assert.equal(left.found, 1, "only the unreadable one is still waiting");
});

test("a server that cannot be reached is reported, not thrown", async () => {
  const pull = await collectMail({ baseUrl: BASE, token: TOKEN }, { pdf: async () => report("MF"), text: async () => report("MF") }, () => {}, (async () => {
    throw new TypeError("network down");
  }) as unknown as typeof fetch);
  assert.equal(pull.found, 0);
  assert.match(pull.errors[0], /Could not reach the server/);
});

test("another token has no statements", async () => {
  const s = server();
  await s.deliver("a.pdf", "%PDF x");
  const pull = await collectMail({ baseUrl: BASE, token: "f".repeat(32) }, { pdf: async () => report("MF"), text: async () => report("MF") }, () => {}, s.fetchFn);
  assert.equal(pull.found, 0);
});

test("a domain fixed in .env is used as it is, lower case; one that is missing or not a domain is not fixed", () => {
  assert.equal(fixedDomain("vzykart.store"), "vzykart.store");
  assert.equal(fixedDomain(" VzyKart.Store "), "vzykart.store");
  assert.equal(fixedDomain(undefined), null);
  assert.equal(fixedDomain(""), null);
  assert.equal(fixedDomain("me@vzykart.store"), null);
});

test("an address pasted to carry on with must be one of ours, and on the fixed domain when there is one", () => {
  const ok = existingAddress(`  Savings-${TOKEN}@Example.Store `, null);
  assert.deepEqual(ok, { ok: true, settings: { token: TOKEN, domain: "example.store" } });
  assert.deepEqual(existingAddress(`savings-${TOKEN}@example.store`, "example.store"), { ok: true, settings: { token: TOKEN, domain: "example.store" } });
  const other = existingAddress(`savings-${TOKEN}@other.com`, "example.store");
  assert.ok(!other.ok && /example\.store/.test(other.problem));
  for (const bad of ["", "someone@example.store", `savings-${TOKEN.slice(1)}@example.store`, TOKEN]) {
    const r = existingAddress(bad, null);
    assert.ok(!r.ok && /not one of your savings addresses/.test(r.problem), bad);
  }
});

test("a purchase confirmation email with no attachment is kept as text, collected, read and deleted", async () => {
  const s = server();
  const html =
    "<html><body><table><tr><td>Folio No</td><td>55555555</td></tr><tr><td>Scheme Name</td><td>ICICI Prudential Test Index Fund - Growth</td></tr><tr><td>Amount(Rs.)</td><td>5,000.00</td></tr><tr><td>Stamp Duty(Rs.)</td><td>0.25</td></tr>" +
    "<tr><td>Net Amount (Rs.)</td><td>4,999.75</td></tr><tr><td>Value Date</td><td>09-Nov-2026</td></tr><tr><td>Net Asset Value (Rs.)</td><td>63.9751</td></tr><tr><td>Units</td><td>78.151</td></tr></table></body></html>";
  const raw = `From: enq_P@camsonline.com\r\nTo: savings-${TOKEN}@example.store\r\nSubject: Folio 55555555 - Processing of systematic Purchase\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=utf-8\r\n\r\n${html}`;
  const bytes = new TextEncoder().encode(raw);
  await receiveEmail({ from: "x@y.z", to: `savings-${TOKEN}@example.store`, rawSize: bytes.length, raw: new ReadableStream({ start: (c) => (c.enqueue(bytes), c.close()) }), forward: async () => {}, setReject: () => {} }, s.env);

  const read: { units: number | undefined; folio: string | null | undefined }[] = [];
  const pull = await collectMail(
    { baseUrl: BASE, token: TOKEN },
    {
      pdf: async () => report("PDF"),
      text: async (mail) => {
        const p = readSipText(mail.subject, mail.text);
        read.push({ units: p?.unitsE4, folio: p?.folio });
        return report("Email");
      },
    },
    () => {},
    s.fetchFn,
  );
  assert.deepEqual(read, [{ units: 781510, folio: "55555555" }]);
  assert.deepEqual([pull.found, pull.reports.length, pull.errors.length], [1, 1, 0]);
  const left = await collectMail({ baseUrl: BASE, token: TOKEN }, { pdf: async () => report("PDF"), text: async () => report("Email") }, () => {}, s.fetchFn);
  assert.equal(left.found, 0);
});
