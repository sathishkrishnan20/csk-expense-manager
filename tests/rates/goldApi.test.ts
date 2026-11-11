import { test } from "node:test";
import assert from "node:assert/strict";
import { GOLD_API_BASE_URL, fetchGoldOunceInr } from "../../src/rates/goldApi";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

test("it asks for gold in rupees and returns the ounce price", async () => {
  let asked = "";
  const fetchFn = (async (url: string) => {
    asked = url;
    return json({ currency: "INR", price: 373230.69, symbol: "XAU" });
  }) as unknown as typeof fetch;
  assert.equal(await fetchGoldOunceInr(fetchFn), 373230.69);
  assert.equal(asked, `${GOLD_API_BASE_URL}/price/XAU/INR`);
});

test("an error answer, a dollar answer, junk and a network error are all just null", async () => {
  const answer = (make: () => Response) => (async () => make()) as unknown as typeof fetch;
  assert.equal(await fetchGoldOunceInr(answer(() => json({ error: "Symbol not found" }, 404))), null);
  assert.equal(await fetchGoldOunceInr(answer(() => json({ currency: "USD", price: 3935.7 }))), null);
  assert.equal(await fetchGoldOunceInr(answer(() => new Response("<html>", { status: 200 }))), null);
  const down = (async () => {
    throw new TypeError("Network request failed");
  }) as unknown as typeof fetch;
  assert.equal(await fetchGoldOunceInr(down), null);
});
