import { test } from "node:test";
import assert from "node:assert/strict";
import { ProtocolError, offeredTools, type Capability } from "../../src/domain/chatTools";
import type { CategoryDef } from "../../src/domain/masterData";
import {
  AGENT_SCHEMA,
  MAX_RESULT_CHARS,
  MAX_TOOL_ROUNDS,
  buildAgentSystemPrompt,
  buildAgentUserPrompt,
  runAgent,
  type AgentContext,
} from "../../src/llm/chatAgent";

const CATEGORIES: CategoryDef[] = [
  { category: "Food & Groceries", subcategories: ["Snacks", "Chaats"], descriptions: { Chaats: "Dikky poori, Panipuri" } },
  { category: "Personal and Family Care", subcategories: ["Clothing", "Gift"] },
  { category: "Income", subcategories: ["Salary"] },
  { category: "Others", subcategories: ["Uncategorised"] },
];

const CTX: AgentContext = { scopeLabel: "Main", periodLabel: "Last 3 months", start: "2026-09-01", end: "2026-11-30", today: "2026-11-11" };

interface Calls {
  tool: string;
  args: Record<string, unknown>;
}

function capabilities(log: Calls[], behaviour: { fail?: boolean; huge?: boolean } = {}): Capability<{ tag: string }>[] {
  return [
    {
      id: "expenses",
      title: "Expenses",
      description: "Money spent",
      tools: [
        {
          name: "expense_totals",
          description: "Exact total of money spent for a period, optionally filtered",
          args: { from: { kind: "date", description: "first day" }, subcategory: { kind: "string", description: "subcategory" } },
          async run(args, ctx) {
            log.push({ tool: "expense_totals", args: { ...args } });
            if (behaviour.fail) throw new Error("database is locked");
            return behaviour.huge ? { rows: "x".repeat(MAX_RESULT_CHARS * 2) } : { total: "₹2,440.00", entries: 17, tag: ctx.tag };
          },
        },
      ],
    },
    {
      id: "gifts",
      title: "Gifts",
      description: "Gifts",
      tools: [
        {
          name: "gifts_list",
          description: "The gifts received and given at occasions",
          args: {},
          async run() {
            log.push({ tool: "gifts_list", args: {} });
            return { gifts: [] };
          },
        },
      ],
    },
  ];
}

// A fake AI that answers from a script, and keeps what it was sent.
function script(steps: unknown[]) {
  const sent: { system: string; user: string }[] = [];
  let i = 0;
  const call = async (system: string, user: string) => {
    sent.push({ system, user });
    const step = steps[Math.min(i++, steps.length - 1)];
    return typeof step === "function" ? (step as () => unknown)() : step;
  };
  return { call, sent };
}

const asks = (...calls: { tool: string; argsJson?: string }[]) => ({
  action: "call_tools",
  calls: calls.map((c) => ({ tool: c.tool, argsJson: c.argsJson ?? "{}" })),
  answer: "",
  proposedCategory: "",
  proposedSubcategory: "",
  proposedDescription: "",
});
const says = (answer: string, proposal: [string, string, string] = ["", "", ""]) => ({
  action: "answer",
  calls: [],
  answer,
  proposedCategory: proposal[0],
  proposedSubcategory: proposal[1],
  proposedDescription: proposal[2],
});

const question = (text: string) => [{ role: "user" as const, text }];

function deps(ai: ReturnType<typeof script>, caps: Capability<{ tag: string }>[]) {
  return {
    call: ai.call,
    categories: CATEGORIES,
    tools: offeredTools(caps),
    toolCtx: { tag: "ctx" },
    ctx: CTX,
  };
}

test("it asks for a tool, gets the result, and answers from it", async () => {
  const log: Calls[] = [];
  const ai = script([asks({ tool: "expense_totals", argsJson: '{"subcategory":"Snacks","from":"2026-10-01"}' }), says("You spent ₹2,440 on snacks.")]);
  const reply = await runAgent({ ...deps(ai, capabilities(log)), history: question("How much on snacks since October?") });

  assert.equal(reply.answer, "You spent ₹2,440 on snacks.");
  assert.deepEqual(reply.toolsUsed, ["Expenses"]);
  assert.equal(reply.proposal, null);
  assert.deepEqual(log, [{ tool: "expense_totals", args: { subcategory: "Snacks", from: "2026-10-01" } }]);
  assert.equal(ai.sent.length, 2);
  // the first request carries no data at all, only the question; the second carries the tool's result
  assert.doesNotMatch(ai.sent[0].user, /₹2,440/);
  assert.match(ai.sent[0].user, /Account holder: How much on snacks since October\?/);
  assert.match(ai.sent[1].user, /Call 1: expense_totals {"from":"2026-10-01","subcategory":"Snacks"}\nResult: {"total":"₹2,440\.00","entries":17,"tag":"ctx"}/);
});

test("a question that needs no data is answered at once, with no tools used", async () => {
  const log: Calls[] = [];
  const ai = script([says("Food & Groceries : Snacks. It is a snack.")]);
  const reply = await runAgent({ ...deps(ai, capabilities(log)), history: question("I bought chips, where does it go?") });
  assert.equal(ai.sent.length, 1);
  assert.deepEqual(reply.toolsUsed, []);
  assert.deepEqual(log, []);
});

test("several tools in one round are all run, and each kind of data used is named once", async () => {
  const log: Calls[] = [];
  const ai = script([asks({ tool: "expense_totals" }, { tool: "gifts_list" }, { tool: "expense_totals", argsJson: '{"subcategory":"Chaats"}' }), says("Done.")]);
  const reply = await runAgent({ ...deps(ai, capabilities(log)), history: question("everything") });
  assert.deepEqual(log.map((c) => c.tool), ["expense_totals", "gifts_list", "expense_totals"]);
  assert.deepEqual(reply.toolsUsed, ["Expenses", "Gifts"]);
});

test("a proposal for a new subcategory comes back for approval, and an unusable one is dropped", async () => {
  const log: Calls[] = [];
  const ok = await runAgent({
    ...deps(script([says("A photo album is not a Gift.", ["Personal and Family Care", "Photo Albums", "Albums, prints and frames"])]), capabilities(log)),
    history: question("I bought a photo album"),
  });
  assert.deepEqual(ok.proposal, { category: "Personal and Family Care", subcategory: "Photo Albums", description: "Albums, prints and frames", status: "new-subcategory" });
  const listed = await runAgent({
    ...deps(script([says("Try Gift.", ["Personal and Family Care", "Gift", ""])]), capabilities(log)),
    history: question("x"),
  });
  assert.equal(listed.proposal, null);
});

test("wrong arguments, an unknown tool and a failing tool are all given back to the AI to correct, not thrown", async () => {
  const log: Calls[] = [];
  const ai = script([
    asks({ tool: "expense_totals", argsJson: '{"from":"last week"}' }, { tool: "no_such_tool" }, { tool: "expense_totals", argsJson: "{broken" }),
    asks({ tool: "expense_totals", argsJson: "{}" }),
    says("Could not get it."),
  ]);
  const reply = await runAgent({ ...deps(ai, capabilities(log, { fail: true })), history: question("x") });
  const second = ai.sent[1].user;
  assert.match(second, /Failed: "from" must be a date written yyyy-mm-dd/);
  assert.match(second, /Failed: there is no tool called "no_such_tool"\. The tools are: expense_totals, gifts_list\./);
  assert.match(second, /Failed: argsJson was not valid JSON/);
  assert.match(ai.sent[2].user, /Failed: the tool failed: database is locked/);
  assert.deepEqual(reply.toolsUsed, []); // nothing succeeded, so nothing was looked at
  assert.deepEqual(log.length, 1); // only the valid call reached the tool
});

test("a result that is too long is cut before the AI gets it", async () => {
  const ai = script([asks({ tool: "expense_totals" }), says("ok")]);
  await runAgent({ ...deps(ai, capabilities([], { huge: true })), history: question("x") });
  const result = ai.sent[1].user.split("Result: ")[1];
  assert.ok(result.length < MAX_RESULT_CHARS + 300);
  assert.match(result, /use narrower filters/);
});

test("an AI that keeps asking for tools is stopped, after one last round in which it must answer", async () => {
  const log: Calls[] = [];
  const ai = script([asks({ tool: "expense_totals" })]); // asks again every time
  await assert.rejects(() => runAgent({ ...deps(ai, capabilities(log)), history: question("x") }), ProtocolError);
  assert.equal(ai.sent.length, MAX_TOOL_ROUNDS + 1);
  assert.equal(log.length, MAX_TOOL_ROUNDS);
  assert.match(ai.sent[ai.sent.length - 1].user, /You cannot ask for more tools/);
  assert.doesNotMatch(ai.sent[0].user, /You cannot ask for more tools/);
});

test("an answer that is not in the format is a protocol error, and the provider's own errors pass through untouched", async () => {
  await assert.rejects(() => runAgent({ ...deps(script([{ nonsense: true }]), capabilities([])), history: question("x") }), ProtocolError);
  await assert.rejects(() => runAgent({ ...deps(script([() => { throw new Error("quota exceeded"); }]), capabilities([])), history: question("x") }), /quota exceeded/);
});

test("the instructions list every tool, the categories apart from their descriptions, and the page's groups and period", () => {
  const caps = capabilities([]);
  const full = buildAgentSystemPrompt(CATEGORIES, offeredTools(caps), CTX);
  assert.match(full, /expense_totals {2}\(Expenses\)/);
  assert.match(full, /gifts_list {2}\(Gifts\)/);
  assert.match(full, /groups: Main; period: Last 3 months \(2026-09-01 to 2026-11-30\)/);
  assert.match(full, /- Food & Groceries: Snacks, Chaats\n/);
  assert.match(full, /- Food & Groceries > Chaats: Dikky poori, Panipuri/);
  assert.doesNotMatch(full, /Chaats \(/);
  assert.doesNotMatch(full, /- Income: Salary/);
  assert.match(full, /Today is 2026-11-11/);
  assert.match(full, /never add up many numbers yourself/);
  assert.match(full, /A loose or wrong fit is worse than none/);
  assert.match(full, /you never add anything yourself/);

  assert.match(buildAgentSystemPrompt(CATEGORIES, [], CTX), /\(none: you can only help with filing a purchase under a category\)/);
  assert.match(buildAgentSystemPrompt(CATEGORIES, [], { ...CTX, periodLabel: "All time" }), /period: All time\./);
});

test("the schema asks for every field, so each provider's strict mode accepts it", () => {
  const s = AGENT_SCHEMA as { required: string[]; properties: Record<string, unknown> };
  assert.deepEqual(s.required, ["action", "calls", "answer", "proposedCategory", "proposedSubcategory", "proposedDescription"]);
  assert.deepEqual(Object.keys(s.properties).sort(), [...s.required].sort());
});

test("the follow-up message shows earlier turns, then the tool results, then what to do next", () => {
  const text = buildAgentUserPrompt(
    [
      { role: "user", text: "q1" },
      { role: "assistant", text: "a1" },
      { role: "user", text: "q2" },
    ],
    [{ name: "t", argsText: "{}", ok: true, text: '{"a":1}' }],
    false,
  );
  assert.match(text, /Account holder: q1\nAssistant: a1\nAccount holder: q2/);
  assert.match(text, /Tool results so far for the last question:\nCall 1: t {}\nResult: {"a":1}/);
  assert.match(text, /Decide your next step/);
});
