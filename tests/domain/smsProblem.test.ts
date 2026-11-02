import { test } from "node:test";
import assert from "node:assert/strict";
import { describeSmsProblem } from "../../src/domain/smsProblem";
import { currentSmsProblem, dismissSmsProblem, reportSmsProblem } from "../../src/import/smsProblemStore";

const none = { waiting: 0, unreadCount: 0 };

test("nothing is said when the check went well", () => {
  assert.equal(describeSmsProblem(none), null);
});

test("messages that could not be saved or read are counted, singular and plural", () => {
  assert.match(describeSmsProblem({ ...none, waiting: 1 })!, /^1 bank message couldn't be saved\./);
  assert.match(describeSmsProblem({ ...none, unreadCount: 3 })!, /^3 bank messages couldn't be read\./);
});

test("several problems still make one line with one pointer to the statement import", () => {
  const text = describeSmsProblem({ waiting: 2, unreadCount: 1 })!;
  assert.equal(text, "2 bank messages couldn't be saved. 1 bank message couldn't be read. You can also import your bank statement to fill in what is missing.");
  assert.equal(text.match(/import your bank statement/g)?.length, 1);
});

test("the bar shows a problem, stays hidden once dismissed, and comes back when the problem changes or clears and returns", () => {
  reportSmsProblem(null);
  assert.equal(currentSmsProblem(), null);
  reportSmsProblem("A");
  assert.equal(currentSmsProblem(), "A");
  dismissSmsProblem();
  assert.equal(currentSmsProblem(), null);
  reportSmsProblem("A"); // the next check finds the same thing: still hidden
  assert.equal(currentSmsProblem(), null);
  reportSmsProblem("B"); // a different problem
  assert.equal(currentSmsProblem(), "B");
  dismissSmsProblem();
  reportSmsProblem(null); // a good check clears it
  reportSmsProblem("B");
  assert.equal(currentSmsProblem(), "B");
  reportSmsProblem(null);
});
