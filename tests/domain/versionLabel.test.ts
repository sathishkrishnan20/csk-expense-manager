import { test } from "node:test";
import assert from "node:assert/strict";
import { versionLabel } from "../../src/domain/versionLabel";

test("the version alone when the app runs the code it was installed with", () => {
  assert.equal(versionLabel({ version: "1.0.0", updatesEnabled: true, embedded: true, updateId: null }), "Version 1.0.0");
  assert.equal(versionLabel({ version: "1.0.0", updatesEnabled: false, embedded: true, updateId: null }), "Version 1.0.0");
});

test("a downloaded update adds the start of its id", () => {
  assert.equal(
    versionLabel({ version: "1.0.0", updatesEnabled: true, embedded: false, updateId: "5f3a9c21-77de-4b0a-9a1e-0c2d8e4b6f10" }),
    "Version 1.0.0 · update 5f3a9c21",
  );
});

test("an unknown version still reads sensibly", () => {
  assert.equal(versionLabel({ version: null, updatesEnabled: false, embedded: true, updateId: null }), "Version unknown");
});
