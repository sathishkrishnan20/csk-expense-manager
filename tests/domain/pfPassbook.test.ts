import { test } from "node:test";
import assert from "node:assert/strict";
import { PfPassbookError, isPfPassbook, parsePfPassbook } from "../../src/domain/pfPassbook";

// The layout of an EPFO member passbook (the lines the PDF reader gives), with invented figures: opening 10,000 each, two contributions of 6,000 each,
// closing 22,000 each. Nothing here is a real person's or account's.
const passbook = (over: Record<string, string> = {}): string[] => [
  "| lnL; iklcqd | | / | | Member Passbook",
  "| LFkkiuk vkbZMh@uke | | | Establishment ID/Name | | ABCDE1234567000 / N/A",
  "| lnL; vkbZMh@uke | | | Member ID/Name | | ABCDE12345670000012345 / TEST MEMBER",
  "| bZih,Q iklcqd | | [ | | foÙkh; o\"kZ | | - 2026-2027 ] / | | EPF Passbook [ Financial Year - 2026-2027 ]",
  over.opening ?? "OB Int. Updated upto 31/03/2026 | | 10,000 | | 10,000 | | 0",
  "Cont. for the Due-Month",
  "Mar-2026 01-04-2026 | | CR | | 50,000 | | 0 | | 6,000 | | 6,000 | | 0",
  "202604 |",
  "Cont. for the Due-Month",
  "Apr-2026 15-05-2026 | | CR | | 50,000 | | 0 | | 6,000 | | 6,000 | | 0",
  "202605 |",
  over.total ?? "Total Contributions for the year [ 2026 ] | | 12,000 | | 12,000 | | 0",
  "Total Transfer-Ins/VDRs for the year [ 2026 ] | | 0 | | 0 | | 0",
  "Total Withdrawals for the year [ 2026 ] | | 0 | | 0 | | 0",
  "Int. Updated upto 31/03/2027 | | 0 | | 0 | | 0",
  over.closing ?? "Closing Balance as on 31/03/2027 | | 22,000 | | 22,000 | | 0",
  "---------------------- | fooj.k dh lekfIr | /End Of Statement---------------------- | | eqfnzr | /Printed On : | | 13-11-2026 20:21:35",
];

test("a passbook is recognised and read: member, year, print date, balances and each wage month", () => {
  const lines = passbook();
  assert.ok(isPfPassbook(lines));
  const pb = parsePfPassbook(lines);
  assert.equal(pb.memberId, "ABCDE12345670000012345");
  assert.equal(pb.establishmentId, "ABCDE1234567000");
  assert.equal(pb.fyStart, 2026);
  assert.equal(pb.printedOn, "2026-11-13");
  assert.deepEqual(pb.opening, { ownPaise: 1000000, employerPaise: 1000000, pensionPaise: 0 });
  assert.deepEqual(pb.closing, { ownPaise: 2200000, employerPaise: 2200000, pensionPaise: 0 });
  assert.deepEqual(
    pb.contributions.map((c) => [c.month, c.creditedDate, c.ownPaise, c.employerPaise, c.pensionPaise]),
    [
      ["2026-03", "2026-04-01", 600000, 600000, 0],
      ["2026-04", "2026-05-15", 600000, 600000, 0],
    ],
  );
});

test("the same wage month credited twice is one month's contribution", () => {
  const lines = passbook({
    total: "Total Contributions for the year [ 2026 ] | | 15,000 | | 15,000 | | 0",
    closing: "Closing Balance as on 31/03/2027 | | 25,000 | | 25,000 | | 0",
  });
  lines.splice(9, 0, "Cont. for the Due-Month", "Apr-2026 20-05-2026 | | CR | | 25,000 | | 0 | | 3,000 | | 3,000 | | 0", "202605 |");
  const pb = parsePfPassbook(lines);
  const april = pb.contributions.find((c) => c.month === "2026-04");
  assert.equal(april?.ownPaise, 900000);
  assert.equal(april?.creditedDate, "2026-05-15");
});

test("a passbook whose months do not add up to its own total is refused", () => {
  assert.throws(() => parsePfPassbook(passbook({ total: "Total Contributions for the year [ 2026 ] | | 99,000 | | 12,000 | | 0" })), PfPassbookError);
});

test("a passbook whose balances do not follow from the opening balance is refused", () => {
  assert.throws(() => parsePfPassbook(passbook({ closing: "Closing Balance as on 31/03/2027 | | 99,000 | | 22,000 | | 0" })), /do not follow/);
});

test("something that is not a passbook is not read", () => {
  assert.ok(!isPfPassbook(["Account statement", "nothing here"]));
  assert.throws(() => parsePfPassbook(["Account statement"]), PfPassbookError);
});
