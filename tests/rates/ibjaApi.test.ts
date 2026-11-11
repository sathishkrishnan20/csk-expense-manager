import { test } from "node:test";
import assert from "node:assert/strict";
import { IBJA_BASE_URL, fetchRateParts } from "../../src/rates/ibjaApi";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const GOLD = { date: "2026-11-03", lblGold999_AM: "138118", lblGold999_PM: "137576" };
const SILVER = { date: "2026-11-03", lblSilver999_AM: "177300", lblSilver999_PM: "176425" };
const HISTORY = { am: [{ date: "03/11/2026", gold_999: "138118", silver_999: "177300" }], pm: [{ date: "03/11/2026", gold_999: "137576", silver_999: "176425" }] };

// A fetch that answers by path and records what was asked.
function fake(routes: Record<string, () => Response | Promise<Response>>) {
  const asked: string[] = [];
  const fetchFn = (async (url: string) => {
    asked.push(url);
    const route = routes[url.replace(IBJA_BASE_URL, "")];
    if (!route) throw new Error("no route");
    return route();
  }) as unknown as typeof fetch;
  return { fetchFn, asked };
}

test("it asks for gold, silver and history, all at once, from the one base address", async () => {
  const { fetchFn, asked } = fake({ "/latest": () => json(GOLD), "/silver/latest": () => json(SILVER), "/history": () => json(HISTORY) });
  const parts = await fetchRateParts(fetchFn);
  assert.deepEqual([...asked].sort(), [`${IBJA_BASE_URL}/history`, `${IBJA_BASE_URL}/latest`, `${IBJA_BASE_URL}/silver/latest`]);
  assert.equal(parts.gold.status, "ok");
  assert.equal(parts.silver.status, "ok");
  assert.equal(parts.history.status, "ok");
  if (parts.history.status === "ok") assert.equal(parts.history.value[0].date, "2026-11-03");
});

test("a 404 means not published yet, an empty list means nothing, and neither is a failure", async () => {
  const { fetchFn } = fake({
    "/latest": () => json({ error: "Live gold rates not available currently." }, 404),
    "/silver/latest": () => json({ error: "Silver rates not available currently." }, 404),
    "/history": () => json({ am: [], pm: [] }),
  });
  const parts = await fetchRateParts(fetchFn);
  assert.equal(parts.gold.status, "unavailable");
  assert.equal(parts.silver.status, "unavailable");
  assert.equal(parts.history.status, "unavailable");
});

test("a server error, a network error and a body that is not JSON are failures, and one failing does not stop the others", async () => {
  const { fetchFn } = fake({
    "/latest": () => json({}, 500),
    "/silver/latest": () => new Response("<html>", { status: 200 }),
    "/history": () => json(HISTORY),
  });
  const parts = await fetchRateParts(fetchFn);
  assert.equal(parts.gold.status, "failed");
  assert.equal(parts.silver.status, "failed");
  assert.equal(parts.history.status, "ok");

  const down = await fetchRateParts((async () => {
    throw new TypeError("Network request failed");
  }) as unknown as typeof fetch);
  assert.deepEqual([down.gold.status, down.silver.status, down.history.status], ["failed", "failed", "failed"]);
});

test("a request that never answers is cut off", async () => {
  const hang = (async (_url: string, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))))) as unknown as typeof fetch;
  const timers: (() => void)[] = [];
  const realSetTimeout = globalThis.setTimeout;
  // Run the 10 second timeout straight away instead of waiting for it.
  globalThis.setTimeout = ((fn: () => void) => {
    timers.push(fn);
    return realSetTimeout(fn, 0);
  }) as unknown as typeof setTimeout;
  try {
    const parts = await fetchRateParts(hang);
    assert.deepEqual([parts.gold.status, parts.silver.status, parts.history.status], ["failed", "failed", "failed"]);
    assert.equal(timers.length, 3);
  } finally {
    globalThis.setTimeout = realSetTimeout;
  }
});
