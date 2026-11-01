import { test } from "node:test";
import assert from "node:assert/strict";
import { helpTopics, type HelpBlock } from "../../src/domain/helpContent";

const textOf = (blocks: HelpBlock[]): string =>
  blocks
    .flatMap((b) => ("text" in b ? [b.text] : "steps" in b ? b.steps : b.bullets))
    .join(" ");
const allText = (platform: "ios" | "web") =>
  helpTopics(platform)
    .map((t) => textOf(t.blocks))
    .join("\n");

test("every topic has a unique id, a title and some text, on both platforms", () => {
  for (const platform of ["ios", "web"] as const) {
    const topics = helpTopics(platform);
    assert.equal(new Set(topics.map((t) => t.id)).size, topics.length);
    for (const t of topics) {
      assert.ok(t.title.trim() && t.blocks.length > 0 && textOf(t.blocks).trim().length > 0, t.id);
    }
  }
});

test("storage and key wording follows the device", () => {
  assert.match(allText("ios"), /iPhone Keychain/);
  assert.match(allText("ios"), /Deleting the app deletes them/);
  assert.doesNotMatch(allText("ios"), /passkey|this browser/i);

  assert.match(allText("web"), /encrypted with a passkey/);
  assert.match(allText("web"), /stored in this browser/);
  assert.doesNotMatch(allText("web"), /Keychain|Save to Files|tap \+/i);
});

test("the guide explains Gifts, and that they are information only", () => {
  for (const platform of ["ios", "web"] as const) {
    const gifts = helpTopics(platform).find((t) => t.id === "gifts");
    assert.ok(gifts, platform);
    assert.match(textOf(gifts.blocks), /never part of any balance/);
    assert.match(textOf(gifts.blocks), /Import list/);
  }
});

test("the guide explains Assets, pledging, and that they are information only", () => {
  for (const platform of ["ios", "web"] as const) {
    const assets = helpTopics(platform).find((t) => t.id === "assets");
    assert.ok(assets, platform);
    assert.match(textOf(assets.blocks), /never part of any balance/);
    assert.match(textOf(assets.blocks), /Pledged \(adagu\)/);
  }
});
