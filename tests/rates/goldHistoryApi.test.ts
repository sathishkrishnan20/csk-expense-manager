import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchGoldHistory } from "../../src/rates/goldHistoryApi";
import { ibjaAuthHeaders, PUBLIC_IBJA_BASE_URL } from "../../src/rates/ibjaApi";
import { parseGoldHistory } from "../../src/domain/goldHistory";

const OWN = "https://my-ibja.vercel.app";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const ROWS = [
  { date: "2026-11-03", price22k: 12800, price24k: 13964, unit: "INR_PER_GRAM" },
  { date: "2026-11-04", price22k: 12801, price24k: 13965, unit: "INR_PER_GRAM" },
];

test("the key is sent as a bearer token to your own deployment only", () => {
  assert.deepEqual(ibjaAuthHeaders(OWN, " secret "), { Authorization: "Bearer secret" });
  assert.deepEqual(ibjaAuthHeaders(OWN, ""), {});
  assert.deepEqual(ibjaAuthHeaders(OWN, undefined), {});
  assert.deepEqual(ibjaAuthHeaders(PUBLIC_IBJA_BASE_URL, "secret"), {});
});

test("the history is asked for with the Authorization header and comes back newest first", async () => {
  let seen: { url: string; headers: Record<string, string> } | null = null;
  const fetchFn = (async (url: string, init: RequestInit) => {
    seen = { url, headers: init.headers as Record<string, string> };
    return json(ROWS);
  }) as unknown as typeof fetch;
  const previous = process.env.EXPO_PUBLIC_IBJA_API_KEY;
  process.env.EXPO_PUBLIC_IBJA_API_KEY = "secret";
  try {
    const rows = await fetchGoldHistory(fetchFn, OWN);
    assert.equal(rows?.[0].date, "2026-11-04");
    assert.equal(rows?.length, 2);
    assert.equal(seen!.url, `${OWN}/api/gold-history`);
    assert.equal(seen!.headers.Authorization, "Bearer secret");
  } finally {
    if (previous === undefined) delete process.env.EXPO_PUBLIC_IBJA_API_KEY;
    else process.env.EXPO_PUBLIC_IBJA_API_KEY = previous;
  }
});

test("it never calls the public instance, and every failure is just null", async () => {
  let called = false;
  const spy = (async () => {
    called = true;
    return json(ROWS);
  }) as unknown as typeof fetch;
  assert.equal(await fetchGoldHistory(spy, PUBLIC_IBJA_BASE_URL), null);
  assert.equal(called, false);

  const answer = (make: () => Response) => (async () => make()) as unknown as typeof fetch;
  assert.equal(await fetchGoldHistory(answer(() => json({ error: "Unauthorized" }, 401)), OWN), null);
  assert.equal(await fetchGoldHistory(answer(() => json({ error: "none yet" }, 404)), OWN), null);
  assert.equal(await fetchGoldHistory(answer(() => json({ not: "an array" })), OWN), null);
  const down = (async () => {
    throw new TypeError("Network request failed");
  }) as unknown as typeof fetch;
  assert.equal(await fetchGoldHistory(down, OWN), null);
});

test("rows that do not look right are skipped", () => {
  const rows = parseGoldHistory([{ date: "2026-11-04", price22k: 1, price24k: 2 }, { date: "bad", price22k: 1, price24k: 2 }, { date: "2026-11-03", price22k: "x", price24k: 2 }, null]);
  assert.equal(rows.length, 1);
  assert.deepEqual(parseGoldHistory("nope"), []);
});
