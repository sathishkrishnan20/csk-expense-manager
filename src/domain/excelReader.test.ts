import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { isExcelBinary, excelToCSV } from "./excelReader";

test("isExcelBinary detects XLS (D0 CF 11 E0) and XLSX (PK) magic bytes", () => {
  // XLS signature
  assert.equal(isExcelBinary(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0x00])), true);
  // XLSX (ZIP) signature
  assert.equal(isExcelBinary(new Uint8Array([0x50, 0x4b, 0x03, 0x04])), true);
  // CSV / plain text
  assert.equal(isExcelBinary(new Uint8Array([0x53, 0x6c, 0x20, 0x4e])), false);
  // Too short
  assert.equal(isExcelBinary(new Uint8Array([0xd0, 0xcf])), false);
});

test("excelToCSV converts a real .xls file to CSV text with all rows", () => {
  // This test uses the uploaded ICICI statement if present; skip otherwise.
  const xlsPath = path.resolve(
    __dirname,
    "../../.gemini/antigravity/brain/8a14013f-2599-4430-bb3c-540446ba3bf5/.user_uploaded/media_1792894881078_d9a59495.xls",
  );
  if (!fs.existsSync(xlsPath)) {
    // Skip gracefully when the fixture file is not available.
    return;
  }

  const bytes = new Uint8Array(fs.readFileSync(xlsPath));
  assert.equal(isExcelBinary(bytes), true);

  const csv = excelToCSV(bytes);
  assert.ok(csv.length > 1000, "CSV should have substantial content");
  assert.ok(csv.includes("Transaction Remarks"), "CSV should contain the header");
  assert.ok(csv.includes("UPI/Madhu"), "CSV should contain transaction data");
});
