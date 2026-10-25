import { test } from "node:test";
import assert from "node:assert/strict";
import { helpTopics, type HelpBlock } from "./helpContent";

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
