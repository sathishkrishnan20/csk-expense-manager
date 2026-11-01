import { test } from "node:test";
import assert from "node:assert/strict";
import {
  NO_ASSET_FILTERS,
  canAddToAssets,
  describeQuantity,
  draftFromGift,
  dueText,
  filterAssets,
  formatQuantity,
  hasAssetFilters,
  investedText,
  isPledged,
  normaliseAsset,
  pledgeDetails,
  pledgeTitle,
  readAssetForm,
  unitsFor,
  type AssetFields,
  type AssetFormInput,
} from "../../src/domain/assets";

const asset = (over: Partial<AssetFields> = {}): AssetFields => ({
  type: "gold",
  name: "Chain",
  status: "ACTIVE",
  quantity: 12500,
  unit: "g",
  purityK: 22,
  investedPaise: null,
  acquiredDate: null,
  description: null,
  lender: null,
  ticketNo: null,
  pledgedDate: null,
  dueDate: null,
  loanPaise: null,
  pledgeNote: null,
  ...over,
});

const form = (over: Partial<AssetFormInput> = {}): AssetFormInput => ({
  type: "gold",
  name: "Chain",
  status: "ACTIVE",
  quantityText: "",
  unit: "g",
  purityK: null,
  investedText: "",
  acquiredDate: null,
  description: "",
  pledged: false,
  lender: "",
  ticketNo: "",
  pledgedDate: null,
  dueDate: null,
  loanText: "",
  pledgeNote: "",
  ...over,
});

test("quantities read the way they are kept: grams, units, cent", () => {
  assert.equal(formatQuantity(12500, "g"), "12.5 g");
  assert.equal(formatQuantity(2250, "g"), "2.25 g");
  assert.equal(formatQuantity(482351, "units"), "482.351 units");
  assert.equal(formatQuantity(5000, "cent"), "5 cent");
  assert.equal(formatQuantity(1200000, "sqft"), "1200 sq ft");
  assert.equal(describeQuantity(asset()), "12.5 g · 22K");
  assert.equal(describeQuantity(asset({ purityK: null })), "12.5 g");
  assert.equal(describeQuantity(asset({ type: "land", unit: "cent", quantity: 5000, purityK: null })), "5 cent");
  assert.equal(describeQuantity(asset({ quantity: null, unit: null, purityK: null })), "");
});

test("each kind of asset is counted in its own units", () => {
  assert.deepEqual(unitsFor("gold"), ["g"]);
  assert.deepEqual(unitsFor("mutual_fund"), ["units"]);
  assert.deepEqual(unitsFor("land"), ["cent", "acre", "sqft", "ground"]);
  assert.deepEqual(unitsFor("other"), []);
});

test("what was paid reads as Paid for gold and land, Invested for the rest", () => {
  assert.equal(investedText("gold", 7000000), "Paid ₹70,000");
  assert.equal(investedText("land", 50000000), "Paid ₹5,00,000");
  assert.equal(investedText("mutual_fund", 10000000), "Invested ₹1,00,000");
});

test("a gold row is pledged when it has a lender, and clearing the lender clears the whole pledge", () => {
  const pledged = asset({ lender: "Muthoot", ticketNo: "4521", pledgedDate: "2026-03-10", dueDate: "2027-03-10", loanPaise: 5000000, pledgeNote: "Land advance" });
  assert.equal(isPledged(pledged), true);
  assert.equal(isPledged(asset()), false);
  assert.equal(isPledged(asset({ lender: "  " })), false);

  const taken = normaliseAsset({ ...pledged, lender: "" });
  assert.deepEqual([taken.lender, taken.ticketNo, taken.pledgedDate, taken.dueDate, taken.loanPaise, taken.pledgeNote], [null, null, null, null, null, null]);
});

test("only gold has purity or a pledge, and a thing with no units has no quantity", () => {
  const land = normaliseAsset(asset({ type: "land", unit: "g", purityK: 22, lender: "Bank", loanPaise: 100 }));
  assert.equal(land.unit, "cent", "a unit that does not fit the type is replaced");
  assert.equal(land.purityK, null);
  assert.equal(land.lender, null);
  assert.equal(land.loanPaise, null);

  const other = normaliseAsset(asset({ type: "other", quantity: 1000, unit: "g" }));
  assert.deepEqual([other.quantity, other.unit], [null, null]);
});

test("the due date reads as days left, due today, or overdue", () => {
  assert.equal(dueText("2026-11-13", "2026-11-01"), "Due in 12 days");
  assert.equal(dueText("2026-11-02", "2026-11-01"), "Due in 1 day");
  assert.equal(dueText("2026-11-01", "2026-11-01"), "Due today");
  assert.equal(dueText("2026-10-29", "2026-11-01"), "Overdue by 3 days");
  assert.equal(dueText("2027-03-10", "2026-11-01"), "Due in 4 months");
});

test("the pledge on a card: lender, then ticket, date and due", () => {
  const a = asset({ lender: "Muthoot", ticketNo: "4521", pledgedDate: "2026-03-10", dueDate: "2026-11-13" });
  assert.equal(pledgeTitle(a), "Pledged · Muthoot");
  assert.deepEqual(pledgeDetails(a, "2026-11-01"), ["Ticket 4521", "Pledged March 10, 2026", "Due in 12 days"]);
  assert.deepEqual(pledgeDetails(asset({ lender: "Ramesh" }), "2026-11-01"), []);
});

test("the form needs only a name, and the lender when the gold is pledged", () => {
  assert.equal(readAssetForm(form({ name: "  " })).ok, false);
  const plain = readAssetForm(form());
  assert.ok(plain.ok);
  assert.deepEqual([plain.fields.quantity, plain.fields.investedPaise, plain.fields.lender], [null, null, null]);

  const noLender = readAssetForm(form({ pledged: true }));
  assert.deepEqual(noLender, { ok: false, error: "Enter who it is pledged to" });

  const lenderOnly = readAssetForm(form({ pledged: true, lender: " Muthoot " }));
  assert.ok(lenderOnly.ok);
  assert.equal(lenderOnly.fields.lender, "Muthoot");
  assert.equal(lenderOnly.fields.loanPaise, null);
});

test("the form reads grams, rupees and the pledge", () => {
  const r = readAssetForm(
    form({
      quantityText: "12.5",
      purityK: 22,
      investedText: "70,000",
      description: " Nisha's gift ",
      pledged: true,
      lender: "Muthoot",
      ticketNo: "4521",
      pledgedDate: "2026-03-10",
      dueDate: "2027-03-10",
      loanText: "50000",
      pledgeNote: "Land advance",
    }),
  );
  assert.ok(r.ok);
  assert.deepEqual(
    [r.fields.quantity, r.fields.unit, r.fields.purityK, r.fields.investedPaise, r.fields.description, r.fields.loanPaise, r.fields.pledgeNote],
    [12500, "g", 22, 7000000, "Nisha's gift", 5000000, "Land advance"],
  );
});

test("the form says what is wrong with an amount or a date", () => {
  assert.deepEqual(readAssetForm(form({ quantityText: "abc" })), { ok: false, error: "Weight should be a number, such as 12.5" });
  assert.deepEqual(readAssetForm(form({ type: "land", unit: "cent", quantityText: "x" })), { ok: false, error: "Quantity should be a number, such as 12.5" });
  assert.equal(readAssetForm(form({ investedText: "lots" })).ok, false);
  assert.equal(readAssetForm(form({ pledged: true, lender: "SBI", loanText: "lots" })).ok, false);
  assert.deepEqual(readAssetForm(form({ pledged: true, lender: "SBI", pledgedDate: "2026-03-10", dueDate: "2026-03-01" })), {
    ok: false,
    error: "The due date is before the pledged date",
  });
});

test("Pledged set to No on a gold row, or any other kind, leaves no pledge", () => {
  const r = readAssetForm(form({ pledged: false, lender: "Muthoot", loanText: "50000" }));
  assert.ok(r.ok);
  assert.deepEqual([r.fields.lender, r.fields.loanPaise], [null, null]);

  const land = readAssetForm(form({ type: "land", unit: "cent", pledged: true, lender: "Muthoot" }));
  assert.ok(land.ok);
  assert.equal(land.fields.lender, null);
});

test("only gold received in grams can be added to assets from a gift", () => {
  const gift = { direction: "received" as const, type: "gold", unit: "g", value: 12500 };
  assert.equal(canAddToAssets(gift), true);
  assert.equal(canAddToAssets({ ...gift, direction: "given" }), false);
  assert.equal(canAddToAssets({ ...gift, type: "silver" }), false);
  assert.equal(canAddToAssets({ ...gift, unit: "INR" }), false);
  assert.equal(canAddToAssets({ ...gift, value: null }), false);
});

test("an asset started from a gift takes the piece, grams, giver and function", () => {
  const draft = draftFromGift({ name: "Kannaki", note: "Chain", value: 3000, occasionTitle: "Karthika Marriage", occasionDate: "2025-06-12" });
  assert.deepEqual(draft, { name: "Chain", quantity: 3000, description: "Gift from Kannaki · Karthika Marriage", acquiredDate: "2025-06-12" });
  assert.equal(draftFromGift({ name: "Kannaki", note: null, value: 3000, occasionTitle: "X", occasionDate: "2025-06-12" }).name, "Gold");
});

const list = [
  { ...asset({ name: "Chain", description: "Nisha's gift" }), id: "1" },
  { ...asset({ name: "Bangle", lender: "Muthoot", ticketNo: "4521", loanPaise: 5000000 }), id: "2" },
  { ...asset({ name: "Old ring", status: "SOLD" }), id: "3" },
  { ...asset({ type: "land", name: "Sivakasi plot", unit: "cent", purityK: null }), id: "4" },
  { ...asset({ type: "mutual_fund", name: "Axis Bluechip", unit: "units", purityK: null }), id: "5" },
];

test("the list shows what you hold by default, and can show pledged, sold or everything", () => {
  const ids = (f: Partial<typeof NO_ASSET_FILTERS>) => filterAssets(list, { ...NO_ASSET_FILTERS, ...f }).map((a) => a.id);
  assert.deepEqual(ids({}), ["1", "2", "4", "5"]);
  assert.deepEqual(ids({ show: "pledged" }), ["2"]);
  assert.deepEqual(ids({ show: "sold" }), ["3"]);
  assert.deepEqual(ids({ show: "all" }), ["1", "2", "3", "4", "5"]);
  assert.deepEqual(ids({ type: "gold" }), ["1", "2"]);
  assert.deepEqual(ids({ type: "gold", show: "all" }), ["1", "2", "3"]);
});

test("search finds a name, lender, ticket, description or the kind", () => {
  const ids = (search: string) => filterAssets(list, { ...NO_ASSET_FILTERS, show: "all", search }).map((a) => a.id);
  assert.deepEqual(ids("muthoot"), ["2"]);
  assert.deepEqual(ids("4521"), ["2"]);
  assert.deepEqual(ids("nisha"), ["1"]);
  assert.deepEqual(ids("mutual fund"), ["5"]);
  assert.deepEqual(ids("plot sivakasi"), ["4"]);
  assert.equal(hasAssetFilters(NO_ASSET_FILTERS), false);
  assert.equal(hasAssetFilters({ ...NO_ASSET_FILTERS, show: "all" }), true);
});
