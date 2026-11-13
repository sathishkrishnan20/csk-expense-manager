import { test } from "node:test";
import assert from "node:assert/strict";
import { MENU_PAGES, groupMenuPages } from "../../src/ui/menuPages";

test("the menu lists the pages in the agreed order, each once", () => {
  assert.deepEqual(
    MENU_PAGES.map((p) => p.label),
    ["Home", "Transactions", "Groups", "Charts", "Ask AI", "Assets", "Savings", "Gifts", "Gold & Silver Rates", "Train alarms", "Config", "How it works"],
  );
  assert.deepEqual(
    MENU_PAGES.map((p) => p.path),
    ["/", "/transactions", "/groups", "/charts", "/chat", "/assets", "/savings", "/gifts", "/rates", "/train", "/config", "/help"],
  );
  assert.equal(new Set(MENU_PAGES.map((p) => p.path)).size, MENU_PAGES.length);
});

test("inside a group the menu is that group's pages, then the way out", () => {
  const pages = groupMenuPages("g-1");
  assert.deepEqual(
    pages.map((p) => [p.label, p.path]),
    [
      ["Overview", "/groups/g-1"],
      ["Transactions", "/groups/g-1/transactions"],
      ["Charts", "/groups/g-1/charts"],
      ["Ask AI", "/groups/g-1/chat"],
      ["Groups", "/groups"],
      ["Main", "/"],
    ],
  );
});
