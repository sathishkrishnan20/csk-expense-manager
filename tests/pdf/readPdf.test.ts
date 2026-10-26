import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PdfPasswordError, readPdfPages } from "../../src/pdf/readPdf";

// Both files hold the same invented, statement-like table (see tests/fixtures/); the second is locked with TEST1234.
const file = (name: string) => new Uint8Array(readFileSync(new URL(`../fixtures/${name}`, import.meta.url)));

test("an unlocked PDF is read with no password", async () => {
  const pages = await readPdfPages(file("plain-sample.pdf"), []);
  assert.equal(pages.length, 2);
  assert.ok(pages[0].some((i) => i.text === "DETAILED STATEMENT (SYNTHETIC TEST DATA)"));
  const first = pages[0].find((i) => i.text === "01/10/2026");
  assert.ok(first && Number.isFinite(first.x) && Number.isFinite(first.y) && first.width > 0);
});

test("a locked PDF opens with the right saved password, trying them in turn", async () => {
  const pages = await readPdfPages(file("locked-sample.pdf"), ["nope", "TEST1234", "other"]);
  assert.equal(pages.length, 2);
});

test("a locked PDF with no or wrong passwords says which", async () => {
  await assert.rejects(() => readPdfPages(file("locked-sample.pdf"), []), (e) => e instanceof PdfPasswordError && e.kind === "needed");
  await assert.rejects(() => readPdfPages(file("locked-sample.pdf"), ["a", "b"]), (e) => e instanceof PdfPasswordError && e.kind === "wrong");
});

test("something that is not a PDF is an ordinary error, not a password prompt", async () => {
  await assert.rejects(
    () => readPdfPages(new TextEncoder().encode("a,b,c\n1,2,3"), ["x"]),
    (e) => e instanceof Error && !(e instanceof PdfPasswordError),
  );
});
