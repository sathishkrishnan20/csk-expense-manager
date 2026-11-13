import { test } from "node:test";
import assert from "node:assert/strict";
import { KEEP_SECONDS, MAX_PDF_BYTES, MAX_WAITING, htmlToText, looksLikePurchase, receiveEmail, senderAllowed, tokenOfAddress, type EmailLike, type InboxItem } from "../../server/src/mail";
import { handle, type Env } from "../../server/src/worker";
import { fakeKv } from "./fakeKv";

const TOKEN = "0123456789abcdef0123456789abcdef";
const ADDRESS = `savings-${TOKEN}@vzykart.store`;
const PDF = "%PDF-1.4 invented statement, not a real one";
const b64 = (text: string) => Buffer.from(text).toString("base64");

// A MIME email as a mail server would hand it over: a plain-text part and any number of attachments (name, bytes as text, type).
function mime(from: string, attachments: { name: string; body: string; type?: string }[], to = ADDRESS): string {
  const parts = [
    "--b1\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nYour statement is attached.\r\n",
    ...attachments.map(
      (a) => `--b1\r\nContent-Type: ${a.type ?? "application/pdf"}; name="${a.name}"\r\nContent-Disposition: attachment; filename="${a.name}"\r\nContent-Transfer-Encoding: base64\r\n\r\n${b64(a.body)}\r\n`,
    ),
    "--b1--\r\n",
  ];
  return `From: Statements <${from}>\r\nTo: ${to}\r\nSubject: Your statement\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary="b1"\r\n\r\n${parts.join("")}`;
}

function message(raw: string, to = ADDRESS, from = "forwarder@example.com") {
  const bytes = new TextEncoder().encode(raw);
  const seen = { forwarded: [] as string[], rejected: [] as string[] };
  const m: EmailLike = {
    from,
    to,
    rawSize: bytes.length,
    raw: new ReadableStream({ start: (c) => (c.enqueue(bytes), c.close()) }),
    forward: async (addr) => void seen.forwarded.push(addr),
    setReject: (reason) => void seen.rejected.push(reason),
  };
  return { m, seen };
}

const env = (over: Partial<Env> = {}): Env => ({ BACKUPS: fakeKv(), ...over });
const get = (e: Env, method: string, path: string) => handle(new Request(`https://x.workers.dev${path}`, { method }), e);

test("an address is the word savings, a dash and 32 hex characters; anything else is no inbox", () => {
  assert.equal(tokenOfAddress(ADDRESS), TOKEN);
  assert.equal(tokenOfAddress(ADDRESS.toUpperCase()), TOKEN);
  assert.equal(tokenOfAddress(`savings-${TOKEN.slice(1)}@vzykart.store`), null);
  assert.equal(tokenOfAddress("someone@vzykart.store"), null);
});

test("sender domains: no list allows everyone; a listed domain and its subdomains are allowed", () => {
  assert.ok(senderAllowed("a@anything.com", undefined));
  assert.ok(senderAllowed("ecas@cdslstatement.com", "cdslstatement.com, example.org"));
  assert.ok(senderAllowed("ecas@mail.cdslstatement.com", "cdslstatement.com"));
  assert.ok(!senderAllowed("ecas@evilcdslstatement.com", "cdslstatement.com"));
  assert.ok(!senderAllowed("x@other.com", "cdslstatement.com"));
});

test("a statement PDF is kept under the address's token, listed, collected and deleted", async () => {
  const e = env();
  const { m, seen } = message(mime("ecas@cdslstatement.com", [{ name: "OCT2026_TXN.pdf", body: PDF }]));
  assert.equal(await receiveEmail(m, e, Date.parse("2026-12-03T05:00:00Z")), "stored");
  assert.deepEqual(seen, { forwarded: [], rejected: [] });

  const listed = await (await get(e, "GET", `/mail/${TOKEN}`)).json();
  assert.equal(listed.items.length, 1);
  const item: InboxItem = listed.items[0];
  assert.equal(item.name, "OCT2026_TXN.pdf");
  assert.equal(item.size, PDF.length);
  assert.equal(item.from, "ecas@cdslstatement.com");
  assert.equal(item.receivedAt, "2026-12-03T05:00:00.000Z");

  const pdf = await get(e, "GET", `/mail/${TOKEN}/${item.id}`);
  assert.equal(pdf.headers.get("content-type"), "application/pdf");
  assert.equal(Buffer.from(await pdf.arrayBuffer()).toString(), PDF);

  assert.equal((await get(e, "DELETE", `/mail/${TOKEN}/${item.id}`)).status, 200);
  assert.equal((await get(e, "GET", `/mail/${TOKEN}/${item.id}`)).status, 404);
  assert.deepEqual((await (await get(e, "GET", `/mail/${TOKEN}`)).json()).items, []);
});

test("a kept PDF expires after 30 days, and nothing else of the email is kept", async () => {
  const e = env();
  await receiveEmail(message(mime("ecas@cdslstatement.com", [{ name: "a.pdf", body: PDF }])).m, e);
  const [entry] = [...(e.BACKUPS as ReturnType<typeof fakeKv>).data.values()];
  assert.equal(entry.expirationTtl, KEEP_SECONDS);
  assert.equal(KEEP_SECONDS, 2_592_000);
  assert.ok(!entry.value.includes("Your statement is attached"), "only the attachment is stored");
});

test("each address has its own inbox", async () => {
  const e = env();
  const other = "f".repeat(32);
  await receiveEmail(message(mime("a@b.com", [{ name: "a.pdf", body: PDF }])).m, e);
  assert.deepEqual((await (await get(e, "GET", `/mail/${other}`)).json()).items, []);
});

test("an address that is not an inbox is refused", async () => {
  const e = env();
  const { m, seen } = message(mime("a@b.com", [{ name: "a.pdf", body: PDF }], "someone@vzykart.store"), "someone@vzykart.store");
  assert.equal(await receiveEmail(m, e), "rejected");
  assert.equal(seen.rejected.length, 1);
  assert.equal((e.BACKUPS as ReturnType<typeof fakeKv>).data.size, 0);
});

test("an email with no PDF is passed on to the owner's own address, so Gmail's confirmation code is not lost", async () => {
  const e = env({ FORWARD_TO: "me@example.com" });
  const { m, seen } = message(mime("forwarding-noreply@google.com", []));
  assert.equal(await receiveEmail(m, e), "passed-on");
  assert.deepEqual(seen.forwarded, ["me@example.com"]);
  assert.equal((e.BACKUPS as ReturnType<typeof fakeKv>).data.size, 0);
  // With no address set it is simply not kept.
  const none = message(mime("forwarding-noreply@google.com", []));
  assert.equal(await receiveEmail(none.m, env()), "passed-on");
  assert.deepEqual(none.seen.forwarded, []);
});

test("a PDF from a sender that is not on the list is not kept", async () => {
  const e = env({ ALLOWED_SENDERS: "cdslstatement.com", FORWARD_TO: "me@example.com" });
  const bad = message(mime("someone@other.com", [{ name: "a.pdf", body: PDF }]));
  assert.equal(await receiveEmail(bad.m, e), "passed-on");
  assert.equal((e.BACKUPS as ReturnType<typeof fakeKv>).data.size, 0);
  assert.deepEqual(bad.seen.forwarded, ["me@example.com"]);
  const good = message(mime("ecas@cdslstatement.com", [{ name: "a.pdf", body: PDF }]));
  assert.equal(await receiveEmail(good.m, e), "stored");
});

test("only PDFs are kept: other attachments are ignored, a large PDF is skipped, and at most five are taken from one email", async () => {
  const e = env();
  const many = Array.from({ length: 7 }, (_, i) => ({ name: `s${i}.pdf`, body: PDF + i }));
  await receiveEmail(message(mime("a@b.com", [{ name: "pic.png", body: "png", type: "image/png" }, { name: "big.pdf", body: "x".repeat(MAX_PDF_BYTES + 10) }, ...many])).m, e);
  const items = (await (await get(e, "GET", `/mail/${TOKEN}`)).json()).items as InboxItem[];
  assert.deepEqual(items.map((i) => i.name).sort(), ["s0.pdf", "s1.pdf", "s2.pdf", "s3.pdf", "s4.pdf"]);
});

test("an inbox that already holds the most waiting PDFs takes no more", async () => {
  const e = env({ FORWARD_TO: "me@example.com" });
  const kv = e.BACKUPS as ReturnType<typeof fakeKv>;
  for (let i = 0; i < MAX_WAITING; i++) await kv.put(`mail:${TOKEN}:${String(1000000000000 + i)}-abcdef`, b64(PDF), { metadata: { id: `${1000000000000 + i}-abcdef`, name: "x.pdf", size: 1, receivedAt: "", from: "" } });
  const { m, seen } = message(mime("a@b.com", [{ name: "new.pdf", body: PDF }]));
  assert.equal(await receiveEmail(m, e), "passed-on");
  assert.deepEqual(seen.forwarded, ["me@example.com"]);
});

test("the routes refuse a token or an id of the wrong shape and any method they do not offer", async () => {
  const e = env();
  assert.equal((await get(e, "GET", "/mail/short")).status, 404);
  assert.equal((await get(e, "GET", `/mail/${TOKEN}/not-an-id`)).status, 404);
  assert.equal((await get(e, "PUT", `/mail/${TOKEN}`)).status, 405);
  assert.equal((await get(e, "PUT", `/mail/${TOKEN}/1234567890123-abcdef`)).status, 405);
  assert.equal((await get(e, "GET", `/mail/${TOKEN}/1234567890123-abcdef`)).status, 404);
});

test("the backup routes still work beside the mail routes", async () => {
  const e = env();
  const id = "a".repeat(64);
  assert.equal((await handle(new Request(`https://x.workers.dev/backup/${id}`, { method: "PUT", body: "RU1CA" + "QUJD".repeat(20) }), e)).status, 200);
  assert.equal((await get(e, "GET", `/backup/${id}`)).status, 200);
});

// ---- purchase confirmations with no attachment (ICICI Prudential and Kotak put the details in the email)

const htmlMail = (subject: string, html: string, from = "enq_P@camsonline.com") =>
  `From: ${from}\r\nTo: ${ADDRESS}\r\nSubject: ${subject}\r\nDate: Tue, 10 Nov 2026 05:33:28 +0530\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=utf-8\r\n\r\n${html}`;

const ICICI_HTML =
  "<html><head><style>p{color:red}</style></head><body><p>Dear Investor,</p><table><tr><td>Folio No</td><td><b>36626254</b></td></tr><tr><td>Scheme Name</td><td>ICICI Prudential Nifty Next 50 Index Fund &amp; Growth</td></tr>" +
  "<tr><td>Net Amount (Rs.)</td><td>4,999.75</td></tr><tr><td>Value Date</td><td>09-Nov-2026</td></tr><tr><td>Net Asset Value (Rs.)</td><td>63.9751</td></tr><tr><td>Units</td><td>78.151</td></tr></table></body></html>";

test("the text of an HTML email is its visible words", () => {
  assert.equal(htmlToText("<p>Hi&nbsp;there</p><style>x{}</style><td>A &amp; B</td><br>next"), "Hi there\nA & B\nnext");
});

test("only an email that talks about units and a NAV counts as a purchase confirmation", () => {
  assert.ok(looksLikePurchase("Your purchase has been processed at the NAV of 118.998 for 42.015 Units."));
  assert.ok(looksLikePurchase("Net Asset Value (Rs.) 63.9751 Units 78.151"));
  assert.ok(!looksLikePurchase("Gmail Forwarding Confirmation: confirm that you own this address"));
  assert.ok(!looksLikePurchase("Units are on sale"));
});

test("an HTML-only purchase confirmation is kept as text, listed, collected as JSON and deleted", async () => {
  const e = env();
  const { m, seen } = message(htmlMail("Folio 36626254 - Processing of systematic Purchase in ICICI Prudential Mutual Fund", ICICI_HTML));
  assert.equal(await receiveEmail(m, e, Date.parse("2026-11-10T00:10:00Z")), "stored");
  assert.deepEqual(seen, { forwarded: [], rejected: [] });

  const [item]: InboxItem[] = (await (await get(e, "GET", `/mail/${TOKEN}`)).json()).items;
  assert.equal(item.kind, "text");
  assert.match(item.name, /^Folio 36626254/);

  const res = await get(e, "GET", `/mail/${TOKEN}/${item.id}`);
  assert.equal(res.headers.get("content-type"), "application/json");
  const body = await res.json();
  assert.equal(body.from, "enq_P@camsonline.com");
  assert.match(body.subject, /ICICI Prudential/);
  assert.match(body.text, /Folio No\s+36626254/);
  assert.match(body.text, /Scheme Name\s+ICICI Prudential Nifty Next 50 Index Fund & Growth/);
  assert.match(body.text, /Net Asset Value \(Rs\.\)\s+63\.9751/);
  assert.match(body.text, /Units\s+78\.151/);
  assert.ok(!body.text.includes("color:red"), "style rules are not text");

  assert.equal((await get(e, "DELETE", `/mail/${TOKEN}/${item.id}`)).status, 200);
  assert.deepEqual((await (await get(e, "GET", `/mail/${TOKEN}`)).json()).items, []);
});

test("a plain-text purchase confirmation is kept as it is", async () => {
  const e = env();
  const raw = `From: enq_k@camsonline.com\r\nTo: ${ADDRESS}\r\nSubject: Folio 10798071 - Processing of Purchase in Kotak Mutual Fund\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nYour purchase request in Kotak ELSS Tax Saver Fund - Growth (Regular Plan) for Rs. 4,999.75 has been processed at the NAV of 118.998 on 05-Nov-2026 for 42.015 Units.\r\n`;
  assert.equal(await receiveEmail(message(raw).m, e), "stored");
  const [item]: InboxItem[] = (await (await get(e, "GET", `/mail/${TOKEN}`)).json()).items;
  const body = await (await get(e, "GET", `/mail/${TOKEN}/${item.id}`)).json();
  assert.match(body.text, /42\.015 Units/);
  assert.equal(body.subject, "Folio 10798071 - Processing of Purchase in Kotak Mutual Fund");
});

test("an email with no attachment that is not a purchase confirmation is passed on, not kept", async () => {
  const e = env({ FORWARD_TO: "me@example.com" });
  const { m, seen } = message(htmlMail("Gmail Forwarding Confirmation", "<p>Click the link to confirm that you own this address.</p>", "forwarding-noreply@google.com"));
  assert.equal(await receiveEmail(m, e), "passed-on");
  assert.deepEqual(seen.forwarded, ["me@example.com"]);
  assert.equal((e.BACKUPS as ReturnType<typeof fakeKv>).data.size, 0);
});
