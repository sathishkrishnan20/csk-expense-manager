import { test } from "node:test";
import assert from "node:assert/strict";
import { canGiveInExchange, describePiece, exchangeWeights, gramsMg, readExchangeForm } from "../../src/domain/assetExchanges";

test("an exchange needs a piece given and a date, and an extra amount that is a number", () => {
  const ok = readExchangeForm({ date: "2026-11-05", shop: "  Joyalukkas ", extraText: " 2,500 ", note: "", givenIds: ["a", "b", "a"] });
  assert.deepEqual(ok, { ok: true, fields: { exchangeDate: "2026-11-05", shop: "Joyalukkas", extraPaise: 250000, note: null }, givenIds: ["a", "b"] });
  assert.deepEqual(readExchangeForm({ date: "2026-11-05", shop: "", extraText: "", note: "", givenIds: [] }), { ok: false, error: "Choose the pieces you gave to the shop" });
  assert.deepEqual(readExchangeForm({ date: null, shop: "", extraText: "", note: "", givenIds: ["a"] }), { ok: false, error: "Choose the date" });
  assert.deepEqual(readExchangeForm({ date: "2026-11-05", shop: "", extraText: "lots", note: "", givenIds: ["a"] }), { ok: false, error: "Extra amount should be a number, such as 2500" });
  const bare = readExchangeForm({ date: "2026-11-05", shop: "", extraText: "", note: "  ", givenIds: ["a"] });
  assert.ok(bare.ok && bare.fields.shop === null && bare.fields.extraPaise === null && bare.fields.note === null);
});

test("only gold that is held and not pledged can be given", () => {
  const gold = { type: "gold" as const, status: "ACTIVE" as const, lender: null };
  assert.equal(canGiveInExchange(gold), true);
  assert.equal(canGiveInExchange({ ...gold, lender: "Muthoot" }), false); // with the lender
  assert.equal(canGiveInExchange({ ...gold, status: "SOLD" }), false);
  assert.equal(canGiveInExchange({ ...gold, type: "land" }), false);
});

test("the weights are added in milligrams, only for grams, and the difference says which way", () => {
  const piece = (quantity: number | null, unit: "g" | "cent" | null = "g") => ({ quantity, unit });
  assert.equal(gramsMg([piece(4000), piece(3360), piece(null), piece(5000, "cent")]), 7360);
  assert.deepEqual(exchangeWeights([piece(12000), piece(4000)], [piece(15000)]), { gaveMg: 16000, gotMg: 15000, moreMg: -1000 });
  assert.deepEqual(exchangeWeights([piece(10000)], [piece(10000), piece(2000)]), { gaveMg: 10000, gotMg: 12000, moreMg: 2000 });
  assert.deepEqual(exchangeWeights([piece(1000)], []), { gaveMg: 1000, gotMg: 0, moreMg: -1000 });
});

test("a piece in a line has its name, weight and purity", () => {
  assert.equal(describePiece({ name: "Thishi - Bangles", quantity: 4000, unit: "g", purityK: 22 }), "Thishi - Bangles · 4 g · 22K");
  assert.equal(describePiece({ name: "Anklet", quantity: null, unit: null, purityK: null }), "Anklet");
});
