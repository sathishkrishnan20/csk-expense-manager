import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateTodayPrice, parseGoldApiInrPrice } from "../../src/domain/tnGoldEstimate";

test("the estimate follows the formula: ounce to gram, 22K, Tamil Nadu premium, rounded to a rupee", () => {
  assert.equal(calculateTodayPrice(373230.6913232271), Math.round((373230.6913232271 / 31.1035) * 0.916 * 1.1648));
  assert.equal(calculateTodayPrice(373230.6913232271), 12803);
  assert.equal(calculateTodayPrice(100000), 3430);
});

test("the gold-api.com answer is read only when it is a positive rupee price", () => {
  const live = { currency: "INR", currencySymbol: "₹", exchangeRate: 94.8321, name: "Gold", price: 373230.6913232271, symbol: "XAU" };
  assert.equal(parseGoldApiInrPrice(live), 373230.6913232271);
  assert.equal(parseGoldApiInrPrice({ ...live, currency: "USD" }), null, "a dollar price would be wrong in this formula");
  for (const bad of [null, "x", [], {}, { currency: "INR" }, { currency: "INR", price: "373230" }, { currency: "INR", price: 0 }, { currency: "INR", price: NaN }]) {
    assert.equal(parseGoldApiInrPrice(bad), null, JSON.stringify(bad));
  }
});
