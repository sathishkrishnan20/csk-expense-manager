// What a feature gives the Ask AI chat, and the rules the chat keeps with it. No database and no AI in here, so all of it is tested in Node.
//
// A *capability* is one feature's part of Ask AI (Expenses, Assets, Gifts, ...): a title, a line telling the AI what it covers, and one or more
// *tools*. A tool has a name, a description, the arguments it accepts, and a `run` that reads the phone's own database and returns the result.
// The AI sees only the descriptions. It asks for a tool by name with arguments, the app checks them against the tool's own specification, runs
// the tool, and gives the AI what it returned. To put a new feature into Ask AI: add one capability file in src/chat/capabilities/ and list it
// in index.ts. Nothing else in the chat changes.

export type ArgKind = "string" | "date" | "integer" | "string_list";

export interface ArgSpec {
  kind: ArgKind;
  description: string;
  required?: boolean;
  options?: readonly string[]; // for a string: the only accepted values
  min?: number; // for an integer; a value outside is brought inside
  max?: number;
}

export type ArgSpecs = Record<string, ArgSpec>;
export type ToolArgs = Record<string, string | number | string[]>;

export interface ChatTool<Ctx> {
  name: string; // snake_case, unique across every capability
  description: string;
  args: ArgSpecs;
  run(args: ToolArgs, ctx: Ctx): Promise<unknown>; // returns plain data; the chat turns it into text
}

export interface Capability<Ctx> {
  id: string; // stable: the owner's on/off choice is stored under it
  title: string; // "Expenses"
  description: string; // one line for the page and for the AI: what is in here
  tools: ChatTool<Ctx>[];
}

export interface OfferedTool<Ctx> {
  capability: Capability<Ctx>;
  tool: ChatTool<Ctx>;
}

// Every tool of every capability is offered to the AI: the owner asked the question, so the AI may look in whatever part of the app's data the
// question needs. There are no switches; the page says plainly that the data comes from the phone's database.
export function offeredTools<Ctx>(capabilities: readonly Capability<Ctx>[]): OfferedTool<Ctx>[] {
  return capabilities.flatMap((capability) => capability.tools.map((tool) => ({ capability, tool })));
}

// Problems in the list of capabilities (a tool without a description, a name used twice), for the test that every feature keeps the rules.
export function registryProblems<Ctx>(capabilities: readonly Capability<Ctx>[]): string[] {
  const problems: string[] = [];
  const names = new Set<string>();
  const ids = new Set<string>();
  for (const c of capabilities) {
    if (!/^[a-z][a-z0-9_]*$/.test(c.id)) problems.push(`capability id "${c.id}" must be snake_case`);
    if (ids.has(c.id)) problems.push(`capability id "${c.id}" is used twice`);
    ids.add(c.id);
    if (!c.title.trim() || !c.description.trim()) problems.push(`capability "${c.id}" needs a title and a description`);
    if (c.tools.length === 0) problems.push(`capability "${c.id}" has no tools`);
    for (const t of c.tools) {
      if (!/^[a-z][a-z0-9_]*$/.test(t.name)) problems.push(`tool name "${t.name}" must be snake_case`);
      if (names.has(t.name)) problems.push(`tool name "${t.name}" is used twice`);
      names.add(t.name);
      if (t.description.trim().length < 20) problems.push(`tool "${t.name}" needs a description of what it returns and when to use it`);
      for (const [arg, spec] of Object.entries(t.args)) {
        if (!spec.description.trim()) problems.push(`argument "${arg}" of "${t.name}" needs a description`);
      }
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// Arguments

const MAX_STRING_CHARS = 100;
const MAX_LIST_ITEMS = 5;
const MAX_LIST_ITEM_CHARS = 40;

const isEmpty = (v: unknown): boolean => v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);

function isRealDate(text: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

// Checks what the AI sent against the tool's own specification. Arguments the tool does not know are ignored; one that is wrong gives a
// message the AI can read and correct. Empty values count as not given.
export function validateArgs(specs: ArgSpecs, raw: unknown): { ok: true; args: ToolArgs } | { ok: false; error: string } {
  if (raw !== undefined && raw !== null && (typeof raw !== "object" || Array.isArray(raw))) return { ok: false, error: "The arguments must be a JSON object." };
  const given = (raw ?? {}) as Record<string, unknown>;
  const args: ToolArgs = {};

  for (const [name, spec] of Object.entries(specs)) {
    const value = given[name];
    if (isEmpty(value)) {
      if (spec.required) return { ok: false, error: `"${name}" is required.` };
      continue;
    }
    switch (spec.kind) {
      case "string": {
        if (typeof value !== "string") return { ok: false, error: `"${name}" must be text.` };
        const text = value.trim().slice(0, MAX_STRING_CHARS);
        if (spec.options) {
          const option = spec.options.find((o) => o.toLowerCase() === text.toLowerCase());
          if (!option) return { ok: false, error: `"${name}" must be one of: ${spec.options.join(", ")}.` };
          args[name] = option;
        } else args[name] = text;
        break;
      }
      case "date": {
        if (typeof value !== "string" || !isRealDate(value.trim())) return { ok: false, error: `"${name}" must be a date written yyyy-mm-dd.` };
        args[name] = value.trim();
        break;
      }
      case "integer": {
        const n = typeof value === "string" ? Number(value) : value;
        if (typeof n !== "number" || !Number.isInteger(n)) return { ok: false, error: `"${name}" must be a whole number.` };
        args[name] = Math.min(spec.max ?? Infinity, Math.max(spec.min ?? -Infinity, n));
        break;
      }
      case "string_list": {
        const items = Array.isArray(value) ? value : [value];
        if (!items.every((i) => typeof i === "string")) return { ok: false, error: `"${name}" must be a list of words.` };
        const words = (items as string[]).map((i) => i.trim().slice(0, MAX_LIST_ITEM_CHARS)).filter(Boolean).slice(0, MAX_LIST_ITEMS);
        if (words.length > 0) args[name] = words;
        break;
      }
    }
  }
  return { ok: true, args };
}

// The tools as the AI reads them in its instructions.
export function describeTools<Ctx>(offered: readonly OfferedTool<Ctx>[]): string {
  return offered
    .map(({ capability, tool }) => {
      const args = Object.entries(tool.args).map(([name, spec]) => {
        const kind = spec.kind === "date" ? "date yyyy-mm-dd" : spec.kind === "string_list" ? "list of words" : spec.kind === "integer" ? "whole number" : "text";
        const options = spec.options ? `, one of: ${spec.options.join(" | ")}` : "";
        return `    - ${name}${spec.required ? " (required)" : ""} [${kind}${options}]: ${spec.description}`;
      });
      return [`${tool.name}  (${capability.title}): ${tool.description}`, args.length > 0 ? "  arguments, all optional unless marked:" : "  no arguments.", ...args].join("\n");
    })
    .join("\n\n");
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// What the AI says each round

// The AI answers every round with one JSON object (the same kind of answer the app asks of it everywhere, so every provider works): either
// the tools it wants, with each tool's arguments written as a JSON text, or its final answer.
export const MAX_CALLS_PER_ROUND = 3;

export class ProtocolError extends Error {}

export interface ToolCall {
  tool: string;
  args: unknown;
  argsError: string | null; // the arguments were not valid JSON
}

export type AgentStep =
  | { kind: "call"; calls: ToolCall[] }
  | { kind: "answer"; answer: string; proposedCategory: unknown; proposedSubcategory: unknown; proposedDescription: unknown };

export function parseAgentStep(raw: unknown): AgentStep {
  if (!raw || typeof raw !== "object") throw new ProtocolError("The AI's answer was not an object.");
  const r = raw as Record<string, unknown>;

  if (r.action === "answer") {
    if (typeof r.answer !== "string" || r.answer.trim() === "") throw new ProtocolError("The AI's answer was empty.");
    return {
      kind: "answer",
      answer: r.answer.trim(),
      proposedCategory: r.proposedCategory,
      proposedSubcategory: r.proposedSubcategory,
      proposedDescription: r.proposedDescription,
    };
  }

  if (r.action === "call_tools") {
    if (!Array.isArray(r.calls) || r.calls.length === 0) throw new ProtocolError("The AI asked for tools but named none.");
    const calls = r.calls.slice(0, MAX_CALLS_PER_ROUND).map((c): ToolCall => {
      const call = (c ?? {}) as Record<string, unknown>;
      const tool = typeof call.tool === "string" ? call.tool.trim() : "";
      const text = typeof call.argsJson === "string" ? call.argsJson.trim() : "";
      if (text === "") return { tool, args: {}, argsError: null };
      try {
        return { tool, args: JSON.parse(text), argsError: null };
      } catch {
        return { tool, args: {}, argsError: "argsJson was not valid JSON. Write the arguments as one JSON object, for example {\"from\":\"2026-10-01\"}." };
      }
    });
    return { kind: "call", calls };
  }

  throw new ProtocolError(`The AI's action was "${String(r.action)}", not call_tools or answer.`);
}

// A result as text for the AI, cut when it is too long (the tools keep their results short; this is the last guard).
export function clipText(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}… (cut: the result was too long, use narrower filters)`;
}
