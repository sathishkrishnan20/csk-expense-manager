import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_CALLS_PER_ROUND,
  ProtocolError,
  clipText,
  describeTools,
  offeredTools,
  parseAgentStep,
  registryProblems,
  validateArgs,
  type ArgSpecs,
  type Capability,
} from "../../src/domain/chatTools";

const SPECS: ArgSpecs = {
  type: { kind: "string", options: ["spent", "received"], description: "which" },
  from: { kind: "date", description: "first day" },
  limit: { kind: "integer", min: 1, max: 40, description: "rows" },
  words: { kind: "string_list", description: "words" },
  name: { kind: "string", description: "free text" },
  must: { kind: "string", description: "needed", required: true },
};

test("good arguments pass, with the options' own spelling and numbers kept inside their range", () => {
  const r = validateArgs(SPECS, { must: "x", type: "SPENT", from: "2026-10-01", limit: "500", words: ["milk", " paal "], name: "  Ravi  ", unknown: 1 });
  assert.deepEqual(r, { ok: true, args: { must: "x", type: "spent", from: "2026-10-01", limit: 40, words: ["milk", "paal"], name: "Ravi" } });
  assert.deepEqual(validateArgs(SPECS, { must: "x", limit: -5 }), { ok: true, args: { must: "x", limit: 1 } });
});

test("empty values count as not given, and a required one must be there", () => {
  assert.deepEqual(validateArgs(SPECS, { must: "x", type: "", from: null, words: [] }), { ok: true, args: { must: "x" } });
  assert.deepEqual(validateArgs(SPECS, {}), { ok: false, error: '"must" is required.' });
  assert.deepEqual(validateArgs({}, undefined), { ok: true, args: {} });
  assert.deepEqual(validateArgs({}, null), { ok: true, args: {} });
});

test("wrong arguments give a message the AI can act on", () => {
  const bad = (raw: unknown) => (validateArgs(SPECS, { must: "x", ...(raw as object) }) as { error: string }).error;
  assert.match(bad({ type: "both" }), /"type" must be one of: spent, received/);
  assert.match(bad({ from: "2026-02-30" }), /"from" must be a date written yyyy-mm-dd/);
  assert.match(bad({ from: "last week" }), /yyyy-mm-dd/);
  assert.match(bad({ limit: 2.5 }), /whole number/);
  assert.match(bad({ words: [1] }), /list of words/);
  assert.match(bad({ name: 5 }), /must be text/);
  assert.match((validateArgs(SPECS, [1]) as { error: string }).error, /JSON object/);
  assert.match((validateArgs(SPECS, "text") as { error: string }).error, /JSON object/);
});

test("lists and text are kept to a length", () => {
  const r = validateArgs(SPECS, { must: "x".repeat(500), words: Array.from({ length: 9 }, (_, i) => `w${i}`.padEnd(80, "z")) });
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal((r.args.must as string).length, 100);
    assert.equal((r.args.words as string[]).length, 5);
    assert.ok((r.args.words as string[]).every((w) => w.length <= 40));
  }
});

const cap = (id: string, tools: { name: string }[]): Capability<null> => ({
  id,
  title: id.toUpperCase(),
  description: `The ${id} things`,
  tools: tools.map((t) => ({ ...t, description: `Description of ${t.name} for the AI`, args: SPECS, run: async () => ({}) })),
});

test("every tool of every capability is offered to the AI: there are no switches", () => {
  const caps = [cap("expenses", [{ name: "totals" }, { name: "entries" }]), cap("gifts", [{ name: "gifts_list" }])];
  assert.deepEqual(offeredTools(caps).map((o) => o.tool.name), ["totals", "entries", "gifts_list"]);
  assert.deepEqual(offeredTools(caps).map((o) => o.capability.id), ["expenses", "expenses", "gifts"]);
  assert.deepEqual(offeredTools([]), []);
});

test("the tools are described to the AI with their arguments", () => {
  const text = describeTools(offeredTools([cap("expenses", [{ name: "totals" }])]));
  assert.match(text, /^totals  \(EXPENSES\): Description of totals for the AI/);
  assert.match(text, /- type \[text, one of: spent \| received\]: which/);
  assert.match(text, /- from \[date yyyy-mm-dd\]: first day/);
  assert.match(text, /- must \(required\) \[text\]: needed/);
  assert.match(text, /- words \[list of words\]: words/);
});

test("the list of capabilities is checked for what every feature must give", () => {
  assert.deepEqual(registryProblems([cap("expenses", [{ name: "totals" }])]), []);
  const problems = registryProblems([
    cap("Bad Id", [{ name: "totals" }]),
    cap("other", [{ name: "totals" }, { name: "NoGood" }]),
    { id: "empty", title: "", description: "", tools: [] },
    { id: "short", title: "S", description: "S", tools: [{ name: "short_tool", description: "too short", args: { a: { kind: "string", description: "" } }, run: async () => ({}) }] },
  ]);
  const text = problems.join("\n");
  assert.match(text, /capability id "Bad Id" must be snake_case/);
  assert.match(text, /tool name "totals" is used twice/);
  assert.match(text, /tool name "NoGood" must be snake_case/);
  assert.match(text, /capability "empty" needs a title and a description/);
  assert.match(text, /capability "empty" has no tools/);
  assert.match(text, /tool "short_tool" needs a description/);
  assert.match(text, /argument "a" of "short_tool" needs a description/);
});

test("the AI's answer for a round is read as tool calls or as an answer", () => {
  const call = parseAgentStep({ action: "call_tools", calls: [{ tool: "totals", argsJson: '{"from":"2026-10-01"}' }, { tool: "gifts_list", argsJson: "" }], answer: "" });
  assert.deepEqual(call, {
    kind: "call",
    calls: [
      { tool: "totals", args: { from: "2026-10-01" }, argsError: null },
      { tool: "gifts_list", args: {}, argsError: null },
    ],
  });
  const answer = parseAgentStep({ action: "answer", calls: [], answer: "  It was ₹2,440.  ", proposedCategory: "", proposedSubcategory: "", proposedDescription: "" });
  assert.deepEqual(answer, { kind: "answer", answer: "It was ₹2,440.", proposedCategory: "", proposedSubcategory: "", proposedDescription: "" });
});

test("at most a few calls are taken from one round, and unreadable arguments are reported, not thrown", () => {
  const many = parseAgentStep({ action: "call_tools", calls: Array.from({ length: 7 }, () => ({ tool: "t", argsJson: "{}" })) });
  assert.equal(many.kind === "call" && many.calls.length, MAX_CALLS_PER_ROUND);
  const broken = parseAgentStep({ action: "call_tools", calls: [{ tool: "t", argsJson: "{not json" }] });
  assert.ok(broken.kind === "call" && broken.calls[0].argsError?.includes("not valid JSON"));
});

test("an answer that is not in the format is a protocol error", () => {
  for (const raw of [null, "text", {}, { action: "think" }, { action: "answer", answer: "  " }, { action: "answer" }, { action: "call_tools", calls: [] }, { action: "call_tools" }]) {
    assert.throws(() => parseAgentStep(raw), ProtocolError);
  }
});

test("a long result is cut with a note", () => {
  assert.equal(clipText("short", 100), "short");
  const cut = clipText("x".repeat(200), 50);
  assert.ok(cut.startsWith("x".repeat(50)) && cut.includes("use narrower filters"));
});
