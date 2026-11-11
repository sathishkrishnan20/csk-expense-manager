import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyFetch,
  buildSnapshot,
  currentRate,
  formatChange,
  goldPer8g,
  goldPerGram,
  historyRows,
  isCacheFresh,
  isToday,
  parseCachedRates,
  parseHistory,
  parseIndianDate,
  parseIsoDate,
  parseLatestGold,
  parseLatestSilver,
  parseRate,
  rateChange,
  silverPerGram,
  type CachedRates,
  type FetchedParts,
  type GoldRates,
  type HistoryDay,
} from "../../src/domain/metalRates";

// Shapes copied from the live API.
const LATEST_GOLD = {
  date: "2026-11-03",
  lblGold999_AM: "138118",
  lblGold995_AM: "137565",
  lblGold916_AM: "126516",
  lblGold750_AM: "103589",
  lblGold585_AM: "80799",
  lblGold585_PM: "80482",
  lblGold750_PM: "103182",
  lblGold916_PM: "126020",
  lblGold995_PM: "137025",
  lblGold999_PM: "137576",
};
const LATEST_SILVER = { date: "2026-11-03", lblSilver999_AM: "177300", lblSilver999_PM: "176425" };
const HISTORY = {
  updated: "2026-11-04T01:15:00.836Z",
  am: [
    { date: "03/11/2026", gold_999: "138118", gold_995: "137565", gold_916: "126516", gold_750: "103589", gold_585: "80799", silver_999: "177300", platinum_999: "54720" },
    { date: "02/11/2026", gold_999: "137772", gold_995: "137220", gold_916: "126199", gold_750: "103329", gold_585: "80597", silver_999: "180080", platinum_999: "53583" },
    { date: "30/10/2026", gold_999: "140891", gold_995: "140327", gold_916: "129056", gold_750: "105668", gold_585: "82421", silver_999: "183800", platinum_999: "59303" },
  ],
  pm: [
    { date: "03/11/2026", gold_999: "137576", gold_995: "137025", gold_916: "126020", gold_750: "103182", gold_585: "80482", silver_999: "176425", platinum_999: "55133" },
    { date: "02/11/2026", gold_999: "137524", gold_995: "136973", gold_916: "125990", gold_750: "103158", gold_585: "80463", silver_999: "179972", platinum_999: "55453" },
    { date: "30/10/2026", gold_999: "140054", gold_995: "139493", gold_916: "128289", gold_750: "105041", gold_585: "81932", silver_999: "181344", platinum_999: "53597" },
  ],
};

const ok = <T>(value: T) => ({ status: "ok" as const, value });
const UNAVAILABLE = { status: "unavailable" as const };
const FAILED = { status: "failed" as const };

test("rates are read safely: blanks, junk and non-positive numbers are missing", () => {
  assert.equal(parseRate("126020"), 126020);
  assert.equal(parseRate(" 1,26,020 "), 126020);
  assert.equal(parseRate(126020), 126020);
  for (const bad of ["", "  ", "abc", "0", "-5", null, undefined, {}, [], NaN]) assert.equal(parseRate(bad), null, String(bad));
});

test("dates: ISO as it is, day-first history dates converted, impossible dates refused", () => {
  assert.equal(parseIsoDate("2026-11-03"), "2026-11-03");
  assert.equal(parseIsoDate("2026-02-30"), null);
  assert.equal(parseIsoDate("03/11/2026"), null);
  assert.equal(parseIsoDate(20261103), null);
  assert.equal(parseIndianDate("03/11/2026"), "2026-11-03");
  assert.equal(parseIndianDate("3/1/2026"), "2026-01-03");
  assert.equal(parseIndianDate("31/02/2026"), null);
  assert.equal(parseIndianDate("2026-11-03"), null);
});

test("the /latest gold answer", () => {
  const day = parseLatestGold(LATEST_GOLD);
  assert.equal(day?.date, "2026-11-03");
  assert.deepEqual(day?.rates["916"], { am: 126516, pm: 126020 });
  assert.deepEqual(day?.rates["999"], { am: 138118, pm: 137576 });
});

test("the PM rate can be empty or missing early in the day", () => {
  const early = parseLatestGold({ date: "2026-11-03", lblGold999_AM: "138118", lblGold995_AM: "137565", lblGold916_AM: "126516", lblGold999_PM: "" });
  assert.deepEqual(early?.rates["999"], { am: 138118, pm: null });
  assert.deepEqual(early?.rates["916"], { am: 126516, pm: null });
  assert.deepEqual(currentRate(early!.rates["999"]), { value: 138118, session: "AM" });
});

test("a /latest answer without a date or without any usable rate is nothing", () => {
  assert.equal(parseLatestGold(null), null);
  assert.equal(parseLatestGold("oops"), null);
  assert.equal(parseLatestGold({ error: "Live gold rates not available currently." }), null);
  assert.equal(parseLatestGold({ ...LATEST_GOLD, date: "yesterday" }), null);
  assert.equal(parseLatestGold({ date: "2026-11-03", lblGold999_AM: "", lblGold916_AM: "n/a" }), null);
  assert.equal(parseLatestSilver({ date: "2026-11-03" }), null);
});

test("the /silver/latest answer", () => {
  assert.deepEqual(parseLatestSilver(LATEST_SILVER), { date: "2026-11-03", rate: { am: 177300, pm: 176425 } });
  assert.deepEqual(parseLatestSilver({ date: "2026-10-30", lblSilver999_AM: "183800" })?.rate, { am: 183800, pm: null });
});

test("history joins the AM and PM lists by date, newest first", () => {
  const days = parseHistory(HISTORY);
  assert.deepEqual(days.map((d) => d.date), ["2026-11-03", "2026-11-02", "2026-10-30"]);
  assert.deepEqual(days[0].gold["999"], { am: 138118, pm: 137576 });
  assert.deepEqual(days[0].silver, { am: 177300, pm: 176425 });
  assert.deepEqual(days[2].gold["916"], { am: 129056, pm: 128289 });
});

test("history copes with a missing list, a bad row, and a day with only one session", () => {
  assert.deepEqual(parseHistory(null), []);
  assert.deepEqual(parseHistory({}), []);
  const days = parseHistory({
    am: [{ date: "bad", gold_999: "1" }, "junk", { date: "03/11/2026", gold_999: "138118", silver_999: "" }],
    pm: [{ date: "04/11/2026", gold_999: "" , silver_999: "" }],
  });
  assert.equal(days.length, 1);
  assert.equal(days[0].date, "2026-11-03");
  assert.deepEqual(days[0].gold["999"], { am: 138118, pm: null });
  assert.deepEqual(days[0].silver, { am: null, pm: null });
});

test("PM is the current rate when it is there, otherwise AM, otherwise none", () => {
  assert.deepEqual(currentRate({ am: 1, pm: 2 }), { value: 2, session: "PM" });
  assert.deepEqual(currentRate({ am: 1, pm: null }), { value: 1, session: "AM" });
  assert.equal(currentRate({ am: null, pm: null }), null);
});

test("per gram, per 8 grams and silver per gram", () => {
  assert.equal(goldPerGram(126020), 12602);
  assert.equal(goldPerGram(137576), 13757.6);
  assert.equal(goldPer8g(126020), 100816);
  assert.equal(goldPer8g(137576), 110060.8);
  assert.equal(silverPerGram(177300), 177.3);
});

test("a rate is from today only when its date is today's", () => {
  assert.equal(isToday("2026-11-03", new Date(2026, 10, 3, 9, 30)), true);
  assert.equal(isToday("2026-11-03", new Date(2026, 10, 4, 9, 30)), false);
});

test("change from one day to the next", () => {
  const up = rateChange(13000, 13130);
  assert.equal(up?.direction, "up");
  assert.equal(up?.amount, 130);
  assert.equal(up?.percent, 1);
  assert.equal(rateChange(200, 150)?.direction, "down");
  assert.equal(rateChange(100, 100)?.direction, "flat");
  assert.equal(rateChange(null, 100), null);
  assert.equal(rateChange(100, null), null);
  assert.equal(rateChange(0, 100), null);
});

test("change is written with an arrow, rupees and percent", () => {
  assert.equal(formatChange(rateChange(13757.6, 13811.8)!, 1), "▲ ₹54.2 (0.39%)");
  assert.equal(formatChange(rateChange(180080, 177300)!, 0), "▼ ₹2,780 (1.54%)");
  assert.equal(formatChange(rateChange(5, 5)!, 0), "No change");
});

test("the table shows one session, each change against the older day", () => {
  const days = parseHistory(HISTORY);
  const pm = historyRows(days, "PM");
  assert.deepEqual(pm.map((r) => r.date), ["2026-11-03", "2026-11-02", "2026-10-30"]);
  assert.equal(pm[0].gold999.value, 13757.6);
  assert.equal(pm[0].gold999.change?.direction, "up");
  assert.ok(Math.abs(pm[0].gold999.change!.amount - (13757.6 - 13752.4)) < 1e-9);
  assert.equal(pm[1].gold999.change?.direction, "down");
  assert.equal(pm[2].gold999.change, null, "the oldest row has nothing to compare with");
  assert.equal(pm[0].silver.value, 176425);
  assert.equal(pm[0].silver.change?.direction, "down");
  const am = historyRows(days, "AM");
  assert.equal(am[0].gold916.value, 12651.6);
});

test("a missing value in the table is empty, with no change either side of it", () => {
  const days: HistoryDay[] = [
    { date: "2026-11-03", gold: noGold(), silver: { am: null, pm: null } },
    { date: "2026-11-02", gold: noGold(), silver: { am: 100, pm: 100 } },
  ];
  const rows = historyRows(days, "AM");
  assert.deepEqual(rows[0].silver, { value: null, change: null });
  assert.deepEqual(rows[0].gold999, { value: null, change: null });
});

function noGold(): GoldRates {
  const none = () => ({ am: null, pm: null });
  return { "999": none(), "995": none(), "916": none() };
}

test("the screen's snapshot uses the latest answers and falls back to the newest history day", () => {
  const history = parseHistory(HISTORY);
  const latest = buildSnapshot(parseLatestGold(LATEST_GOLD), parseLatestSilver(LATEST_SILVER), history);
  assert.equal(latest.gold?.date, "2026-11-03");
  assert.equal(latest.silver?.date, "2026-11-03");
  assert.equal(latest.history.length, 3);

  const fallback = buildSnapshot(null, null, history);
  assert.equal(fallback.gold?.date, "2026-11-03");
  assert.deepEqual(fallback.gold?.rates["916"], { am: 126516, pm: 126020 });
  assert.deepEqual(fallback.silver, { date: "2026-11-03", rate: { am: 177300, pm: 176425 } });
});

test("silver can be a day behind gold, and a newer latest day joins the table", () => {
  const history = parseHistory(HISTORY);
  const gold = parseLatestGold({ ...LATEST_GOLD, date: "2026-11-04", lblGold999_AM: "139000", lblGold999_PM: "" });
  const silver = parseLatestSilver({ ...LATEST_SILVER, date: "2026-11-03" });
  const snapshot = buildSnapshot(gold, silver, history);
  assert.equal(snapshot.gold?.date, "2026-11-04");
  assert.equal(snapshot.silver?.date, "2026-11-03");
  assert.deepEqual(snapshot.history.map((d) => d.date), ["2026-11-04", "2026-11-03", "2026-11-02", "2026-10-30"]);
  assert.deepEqual(snapshot.history[0].gold["999"], { am: 139000, pm: null });
  assert.deepEqual(snapshot.history[0].silver, { am: null, pm: null });
});

test("the table never holds more than five days", () => {
  const days: HistoryDay[] = [];
  for (let d = 1; d <= 8; d++) days.push({ date: `2026-10-${String(d).padStart(2, "0")}`, gold: noGold(), silver: { am: 100, pm: 100 } });
  assert.equal(buildSnapshot(null, null, days).history.length, 5);
  assert.equal(buildSnapshot(null, null, days).history[0].date, "2026-10-08");
});

const PREVIOUS: CachedRates = {
  fetchedAt: Date.UTC(2026, 10, 3, 10, 0),
  snapshot: buildSnapshot(parseLatestGold(LATEST_GOLD), parseLatestSilver(LATEST_SILVER), parseHistory(HISTORY)),
};
const NOW = Date.UTC(2026, 10, 4, 6, 0);

test("a refresh where /latest is not out yet shows the history's newest day", () => {
  const parts: FetchedParts = { gold: UNAVAILABLE, silver: UNAVAILABLE, history: ok(parseHistory(HISTORY)) };
  const result = applyFetch(null, parts, NOW);
  assert.equal(result.error, null);
  assert.equal(result.cache?.fetchedAt, NOW);
  assert.equal(result.cache?.snapshot.gold?.date, "2026-11-03");
  assert.equal(result.cache?.snapshot.silver?.date, "2026-11-03");
});

test("a refresh with the network down keeps the cache and says it failed", () => {
  const result = applyFetch(PREVIOUS, { gold: FAILED, silver: FAILED, history: FAILED }, NOW);
  assert.equal(result.cache, PREVIOUS);
  assert.equal(result.error, "network");
});

test("a refresh with nothing published and nothing cached is 'unavailable', not a network fault", () => {
  const result = applyFetch(null, { gold: UNAVAILABLE, silver: UNAVAILABLE, history: UNAVAILABLE }, NOW);
  assert.equal(result.cache, null);
  assert.equal(result.error, "unavailable");
});

test("only /history failing keeps the old table and takes the new latest rates", () => {
  const gold = parseLatestGold({ ...LATEST_GOLD, date: "2026-11-04", lblGold999_AM: "139000" });
  const silver = parseLatestSilver({ ...LATEST_SILVER, date: "2026-11-04", lblSilver999_AM: "178000" });
  const result = applyFetch(PREVIOUS, { gold: ok(gold!), silver: ok(silver!), history: FAILED }, NOW);
  assert.equal(result.error, null);
  assert.equal(result.cache?.snapshot.gold?.date, "2026-11-04");
  assert.deepEqual(result.cache?.snapshot.history.map((d) => d.date), ["2026-11-04", "2026-11-03", "2026-11-02", "2026-10-30"]);
});

test("a half answer (history failed and one latest failed) never replaces the cache", () => {
  const gold = parseLatestGold(LATEST_GOLD)!;
  const result = applyFetch(PREVIOUS, { gold: ok(gold), silver: FAILED, history: FAILED }, NOW);
  assert.equal(result.cache, PREVIOUS);
  assert.equal(result.error, "network");
});

test("the cache is fresh for an hour", () => {
  const cache: CachedRates = { ...PREVIOUS, fetchedAt: 1_000_000 };
  assert.equal(isCacheFresh(cache, 1_000_000), true);
  assert.equal(isCacheFresh(cache, 1_000_000 + 59 * 60_000), true);
  assert.equal(isCacheFresh(cache, 1_000_000 + 60 * 60_000), false);
  assert.equal(isCacheFresh(cache, 999_999), false, "a clock set back counts as stale");
});

test("the cache survives being saved and read back, and a damaged one is ignored", () => {
  const back = parseCachedRates(JSON.stringify(PREVIOUS));
  assert.deepEqual(back, PREVIOUS);
  assert.ok(JSON.stringify(PREVIOUS).length < 2048, "small enough for the Keychain");

  assert.equal(parseCachedRates(null), null);
  assert.equal(parseCachedRates(""), null);
  assert.equal(parseCachedRates("{not json"), null);
  assert.equal(parseCachedRates("[]"), null);
  assert.equal(parseCachedRates(JSON.stringify({ fetchedAt: "yesterday", snapshot: PREVIOUS.snapshot })), null);
  assert.equal(parseCachedRates(JSON.stringify({ fetchedAt: 1, snapshot: { gold: { date: "x" }, silver: null, history: [] } })), null);

  const noMetals = parseCachedRates(JSON.stringify({ fetchedAt: 1, snapshot: { gold: null, silver: null, history: [{ bad: true }] } }));
  assert.deepEqual(noMetals, { fetchedAt: 1, snapshot: { gold: null, silver: null, history: [] } });
});
