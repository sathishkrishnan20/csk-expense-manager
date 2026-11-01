import { test } from "node:test";
import assert from "node:assert/strict";
import {
  NO_GIFT_FILTERS,
  describeGift,
  directionForTitle,
  estimatedPaise,
  filterGifts,
  formatGrams,
  giftTotals,
  normaliseTitle,
  occasionKey,
  parseGiftList,
  parseGiftText,
  parseGramsInput,
  readGiftAmounts,
  showsNoteLine,
  totalsLines,
  type GiftType,
} from "../../src/domain/gifts";

test("grams are read with up to three decimals and kept as integer milligrams", () => {
  assert.equal(parseGramsInput("3"), 3000);
  assert.equal(parseGramsInput("1.5"), 1500);
  assert.equal(parseGramsInput("2.25"), 2250);
  assert.equal(parseGramsInput("0.001"), 1);
  assert.equal(parseGramsInput("0"), null);
  assert.equal(parseGramsInput("1.2345"), null);
  assert.equal(parseGramsInput("abc"), null);
  assert.equal(formatGrams(2250), "2.25 g");
  assert.equal(formatGrams(3000), "3 g");
  assert.equal(formatGrams(57750), "57.75 g");
});

test("what you typed is read into a type, an amount and a unit", () => {
  const read = (text: string) => {
    const g = parseGiftText(text);
    return [g.type, g.value, g.unit, g.note, g.warning];
  };
  assert.deepEqual(read("3Gram gold"), ["gold", 3000, "g", null, null]);
  assert.deepEqual(read("4 gram gold"), ["gold", 4000, "g", null, null]);
  assert.deepEqual(read("1.5G Gold"), ["gold", 1500, "g", null, null]);
  assert.deepEqual(read("2.25G gold"), ["gold", 2250, "g", null, null]);
  assert.deepEqual(read("1G"), ["gold", 1000, "g", null, null]); // a bare weight is gold
  assert.deepEqual(read("100000Rs"), ["cash", 10000000, "INR", null, null]);
  assert.deepEqual(read("10000"), ["cash", 1000000, "INR", null, null]);
  assert.deepEqual(read("₹5,000/-"), ["cash", 500000, "INR", null, null]);
  assert.deepEqual(read("2000 worth of silver"), ["silver", 200000, "INR", null, null]);
  assert.deepEqual(read("1G chain"), ["gold", 1000, "g", "chain", null]);
  assert.deepEqual(read("5g silver"), ["silver", 5000, "g", null, null]);
  assert.deepEqual(read("Bangle"), ["other", null, "INR", "Bangle", null]);
  assert.deepEqual(read(""), ["other", null, "INR", null, null]);
});

test("text with numbers that cannot be read is kept as a note with a warning", () => {
  assert.deepEqual(
    (({ type, value, note, warning }) => ({ type, value, note, warning }))(parseGiftText("1000 or 500")),
    { type: "other", value: null, note: "1000 or 500", warning: "Could not read an amount, kept as a note" },
  );
});

test("the form's amount fields: cash needs an amount, a bangle does not, the price is only for metal in grams", () => {
  assert.deepEqual(readGiftAmounts("cash", "INR", "1000", ""), { ok: true, value: 100000, unit: "INR", ratePaise: null });
  assert.deepEqual(readGiftAmounts("gold", "g", "2.5", "7500"), { ok: true, value: 2500, unit: "g", ratePaise: 750000 });
  assert.deepEqual(readGiftAmounts("gold", "INR", "5000", "7500"), { ok: true, value: 500000, unit: "INR", ratePaise: null });
  assert.deepEqual(readGiftAmounts("other", "g", "", ""), { ok: true, value: null, unit: "INR", ratePaise: null });
  assert.deepEqual(readGiftAmounts("cash", "g", "500", ""), { ok: true, value: 50000, unit: "INR", ratePaise: null }); // cash is always rupees
  assert.equal(readGiftAmounts("cash", "INR", "", "").ok, false);
  assert.equal(readGiftAmounts("gold", "g", "", "").ok, false);
  assert.equal(readGiftAmounts("gold", "g", "two", "").ok, false);
  assert.equal(readGiftAmounts("gold", "g", "2", "abc").ok, false);
});

test("a gift is described in a few words", () => {
  const d = (type: GiftType, value: number | null, unit: "INR" | "g", note: string | null = null) => describeGift({ type, value, unit, note });
  assert.equal(d("gold", 3000, "g"), "3 g gold");
  assert.equal(d("cash", 100000000, "INR"), "₹10,00,000");
  assert.equal(d("cash", 100000, "INR"), "₹1,000");
  assert.equal(d("silver", 200000, "INR"), "₹2,000 worth of silver");
  assert.equal(d("other", null, "INR", "Bangle"), "Bangle");
  assert.equal(d("other", 500000, "INR", "Saree"), "Saree · ₹5,000");
  assert.equal(d("gold", null, "g"), "Gold");
  assert.ok(showsNoteLine({ type: "gold", note: "chain" }));
  assert.ok(!showsNoteLine({ type: "other", note: "Bangle" }));
});

test("what a gift was worth the day it came, when the price is known", () => {
  assert.equal(estimatedPaise({ type: "gold", value: 2500, unit: "g", ratePaise: 750000 }), 1875000); // 2.5 g at 7,500 a gram
  assert.equal(estimatedPaise({ type: "gold", value: 2500, unit: "g", ratePaise: null }), null);
  assert.equal(estimatedPaise({ type: "cash", value: 100000, unit: "INR", ratePaise: null }), null);
  assert.equal(estimatedPaise({ type: "silver", value: 200000, unit: "INR", ratePaise: 10000 }), null);
});

test("totals keep cash, gold and silver apart", () => {
  const t = giftTotals([
    { type: "gold", value: 3000, unit: "g", ratePaise: null },
    { type: "gold", value: 1500, unit: "g", ratePaise: 700000 },
    { type: "cash", value: 100000, unit: "INR", ratePaise: null },
    { type: "silver", value: 200000, unit: "INR", ratePaise: null },
    { type: "other", value: null, unit: "INR", ratePaise: null },
    { type: "other", value: 50000, unit: "INR", ratePaise: null },
  ]);
  assert.equal(t.count, 6);
  assert.equal(t.goldMg, 4500);
  assert.equal(t.cashPaise, 100000);
  assert.equal(t.silverWorthPaise, 200000);
  assert.equal(t.otherCount, 2);
  assert.equal(t.otherValuePaise, 50000);
  assert.equal(t.estimatedPaise, 1050000);
  assert.deepEqual(totalsLines(t), ["Cash ₹1,000", "Gold 4.5 g", "Silver ₹2,000", "2 other · ₹500"]);
  assert.deepEqual(totalsLines(giftTotals([])), []);
});

test("the same occasion name, whatever the case or spacing, is the same occasion", () => {
  assert.equal(occasionKey("  Thishika   Hair Offering "), occasionKey("thishika hair offering"));
  assert.equal(normaliseTitle("  A   B "), "A B");
});

test("search finds a person across occasions, by what they gave, or by the occasion", () => {
  const g = (name: string, occasionTitle: string, direction: "received" | "given", type: GiftType, value: number | null, unit: "INR" | "g" = "g") => ({
    name,
    occasionId: occasionTitle,
    occasionTitle,
    direction,
    type,
    value,
    unit,
    note: null,
  });
  const all = [
    g("Kartheesan", "Marriage", "received", "gold", 4000),
    g("Kartheesan", "Welcoming", "received", "gold", 1000),
    g("Kannan", "Marriage", "received", "gold", 4000),
    g("Trikshan", "Repaid", "given", "gold", 6000),
  ];
  assert.equal(filterGifts(all, { ...NO_GIFT_FILTERS, search: "kartheesan" }).length, 2);
  assert.equal(filterGifts(all, { ...NO_GIFT_FILTERS, search: "repaid" }).length, 1);
  assert.equal(filterGifts(all, { ...NO_GIFT_FILTERS, search: "4 g" }).length, 2);
  assert.equal(filterGifts(all, { ...NO_GIFT_FILTERS, direction: "given" }).length, 1);
  assert.equal(filterGifts(all, { ...NO_GIFT_FILTERS, occasionId: "Marriage" }).length, 2);
  assert.equal(filterGifts(all, { ...NO_GIFT_FILTERS, occasionId: "Marriage", search: "kartheesan" }).length, 1);
});

test("headings that start with Repaid or Returned are things given back", () => {
  assert.equal(directionForTitle("Repaid"), "given");
  assert.equal(directionForTitle("Returned to Trikshan"), "given");
  assert.equal(directionForTitle("Thishika Hair Offering"), "received");
});

// The owner's own notebook, tab separated, pasted as it is kept.
const NOTEBOOK = [
  "Karthika Sathish Marraige\t",
  "Kannaki\t3Gram gold",
  "Gomathi\t3Gram gold",
  "Chandra\t4 Gram gold",
  "Kannan\t4 Gram gold",
  "Gopal\t4 Gram gold",
  "Kartheesan\t4 gram gold",
  "Muthuraja\t3 Gram gold",
  "Senthil\t3Gram gold",
  "Ramesh+Rajan mama\t100000Rs",
  "\t",
  "\t",
  "Thishika welcoming \t",
  "Shahila\t1.5G Gold",
  "Madurai\t1G Gold",
  "Nisha\t12G Gold",
  "Kartheesan \t1G Gold",
  "Ananthi\t4G Gold",
  "Muthuraja\t2000 worth of silver ",
  "\t",
  "Thishika Hair Offering \t",
  "Our home\t",
  "Nisha\tBangle",
  "Kannan\t1000",
  "Kartheesan\t1G ",
  "Gopal\t1500",
  "Muthuraja\t2000",
  "Kannaki\t1000 or 500",
  "Chandra\t1G",
  "Thirumani\t2.25G gold",
  "Jeyanthi\t2G gold",
  "Ananthi\t2.5G gold",
  "Madhaganeri \t10000",
  "Koodankulam \t10000",
  "Madurai \t1.5G",
  "\t",
  "Thishika Birthday \t",
  "Kannaki\t",
  "\t",
  "\t",
  "\t",
  "Repaid\t",
  "Trikshan \t6G ",
  "Trikshan\t12G",
].join("\n");

test("the owner's notebook is read into occasions and gifts", () => {
  const list = parseGiftList(NOTEBOOK);
  assert.deepEqual(
    list.map((o) => [o.title, o.direction, o.gifts.length]),
    [
      ["Karthika Sathish Marraige", "received", 9],
      ["Thishika welcoming", "received", 6],
      ["Thishika Hair Offering - Our home", "received", 13],
      ["Thishika Birthday", "received", 1],
      ["Repaid", "given", 2],
    ],
  );

  const totals = (i: number) => giftTotals(list[i].gifts);
  assert.equal(totals(0).goldMg, 28000);
  assert.equal(totals(0).cashPaise, 10000000);
  assert.equal(totals(1).goldMg, 19500);
  assert.equal(totals(1).silverWorthPaise, 200000);
  assert.equal(totals(2).goldMg, 10250);
  assert.equal(totals(2).cashPaise, 2450000); // 1000 + 1500 + 2000 + 10000 + 10000
  assert.equal(totals(4).goldMg, 18000);

  // names are tidied; a name with no gift is kept as a gift with nothing written
  assert.equal(list[1].gifts[3].name, "Kartheesan");
  assert.deepEqual(
    [list[3].gifts[0].name, list[3].gifts[0].type, list[3].gifts[0].value],
    ["Kannaki", "other", null],
  );

  // the one it could not read is flagged and kept as written
  const unclear = list[2].gifts.filter((g) => g.warning);
  assert.deepEqual(unclear.map((g) => [g.name, g.note]), [["Kannaki", "1000 or 500"]]);
  assert.ok(list.every((o) => o.gifts.every((g) => g.issue === null)));
});

test("a list can be pasted without tabs, with a header row, or with gifts before any heading", () => {
  const commas = parseGiftList("Name,Gift\nRavi,2g gold\nSuresh,5000");
  assert.equal(commas.length, 1);
  assert.equal(commas[0].title, "");
  assert.deepEqual(commas[0].gifts.map((g) => [g.name, g.type, g.value]), [["Ravi", "gold", 2000], ["Suresh", "cash", 500000]]);

  const lone = parseGiftList("House warming\nRavi\t1000");
  assert.deepEqual(lone.map((o) => [o.title, o.gifts.length]), [["House warming", 1]]);

  assert.deepEqual(parseGiftList(""), []);
  assert.deepEqual(parseGiftList("\t\n\t"), []);
  assert.equal(parseGiftList("\t3g gold")[0].gifts[0].issue, "No name");
});
