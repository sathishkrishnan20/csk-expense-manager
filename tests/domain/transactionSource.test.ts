import { test } from "node:test";
import assert from "node:assert/strict";
import { ADDED_PHRASE, SOURCE_LABEL, TRANSACTION_SOURCES, isTransactionSource, parseCreatedAt, parseSourceText } from "../../src/domain/transactionSource";

test("there are three sources, each with a label and a sentence", () => {
  assert.deepEqual(TRANSACTION_SOURCES, ["manual", "import", "sms"]);
  assert.deepEqual(TRANSACTION_SOURCES.map((s) => SOURCE_LABEL[s]), ["Manual", "Statement", "Bank SMS"]);
  for (const s of TRANSACTION_SOURCES) assert.ok(ADDED_PHRASE[s].length > 0);
  assert.ok(isTransactionSource("sms") && isTransactionSource("import") && isTransactionSource("manual"));
  assert.ok(!isTransactionSource("SMS") && !isTransactionSource("") && !isTransactionSource(undefined) && !isTransactionSource("statement"));
});

test("the Source column of a file is read as written, and anything unknown is manual", () => {
  assert.equal(parseSourceText("Import"), "import");
  assert.equal(parseSourceText("Sms"), "sms");
  assert.equal(parseSourceText(" sms "), "sms");
  assert.equal(parseSourceText("Manual"), "manual");
  assert.equal(parseSourceText(""), "manual");
  assert.equal(parseSourceText("Bank SMS"), "manual");
});

test("created_at is read as UTC, in SQLite's form or as an ISO time", () => {
  assert.equal(parseCreatedAt("2026-11-03 09:14:05")?.toISOString(), "2026-11-03T09:14:05.000Z");
  assert.equal(parseCreatedAt("2026-11-03T09:14:05.000Z")?.toISOString(), "2026-11-03T09:14:05.000Z");
  assert.equal(parseCreatedAt("nonsense"), null);
  assert.equal(parseCreatedAt(""), null);
  assert.equal(parseCreatedAt(null), null);
});
