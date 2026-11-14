import { endOfMonth } from "./entryGroup";
import type { Direction } from "./taxonomy";

// The monthly template: entries (and the groups some of them create) that the owner describes once and the app creates at the start of each month ("Set up December?").
// Nothing is built in: the owner makes every entry (their own category, payee, amount and day of the month) in Main or in a group, and, exactly as when adding a transaction,
// an entry can "create a group for this entry" (a name, whether the group starts with the entry's amount as income, and two switches). So a group exists only through the
// entry that creates it, and sits in the group (or Main) that entry is in. The switches are each on for at most one group: mutual fund purchases go into it, and the app
// opens on it (Home). Pure: the SQL is in db/monthTemplateSql.ts, the set-up screen in app/month-setup.tsx.

// The id used for "Main" where an entry says which group it is in.
export const TEMPLATE_MAIN = "main";

export interface TemplateGroup {
  id: string;
  parentId: string | null; // the template group the creating entry is in; null = the entry is in Main
  name: string; // may hold {Month} and {Year}; without either, the month is added at the end (group names are unique)
  sort: number;
  openingIncome: boolean; // the group starts with the creating entry's amount as income
  fundsHere: boolean; // mutual fund purchases are added to this group
  home: boolean; // the app opens on this group
}

export interface TemplateLine {
  id: string;
  groupId: string; // the template group this entry is made in, or TEMPLATE_MAIN
  sort: number;
  direction: Direction;
  category: string;
  subcategory: string;
  payee: string;
  paymentMethod: string | null;
  description: string | null;
  amountPaise: number | null; // empty: asked at set-up (a salary)
  day: number; // 1 to 31; a short month uses its last day
  createsGroupId: string | null; // the template group this entry creates
}

export interface MonthTemplate {
  groups: TemplateGroup[];
  lines: TemplateLine[];
}

// Which real group a template group made for a month (db: month_setups); `fundsHere` is whether it was the one mutual fund purchases go into that month.
export interface MonthSetup {
  month: string;
  templateGroupId: string;
  groupId: string;
  fundsHere: boolean;
}

export const emptyTemplate = (): MonthTemplate => ({ groups: [], lines: [] });

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const pad = (n: number): string => String(n).padStart(2, "0");

// "2026-12" -> "December 2026"
export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

// The group's name for a month: "{Month}" is the month's name, "{Year}" the year; a name with neither gets "Dec 2026" added.
export function groupNameFor(pattern: string, month: string): string {
  const [y, m] = month.split("-").map(Number);
  const text = pattern.trim();
  if (/\{month\}|\{year\}/i.test(text)) return text.replace(/\{month\}/gi, MONTHS[m - 1]).replace(/\{year\}/gi, String(y)).replace(/\s+/g, " ").trim();
  return `${text} ${MONTHS[m - 1].slice(0, 3)} ${y}`;
}

// A day of the month in that month; a day past its end (the 31st in April) is the last day.
export function dateInMonth(month: string, day: number): string {
  const last = Number(endOfMonth(`${month}-01`).slice(8, 10));
  return `${month}-${pad(Math.min(Math.max(1, Math.floor(day)), last))}`;
}

export const isDay = (n: number): boolean => Number.isInteger(n) && n >= 1 && n <= 31;

export type EntryFields = Omit<TemplateLine, "id" | "sort" | "groupId" | "createsGroupId">;
export type GroupFields = Pick<TemplateGroup, "name" | "openingIncome" | "fundsHere" | "home">;

// Error text for a template entry (and the group it creates, when it does), or null when it can be saved. `otherGroupNames` are the names of the other template groups.
export function validateTemplateEntry(e: EntryFields, group: GroupFields | null, otherGroupNames: readonly string[]): string | null {
  if (e.category === "" || e.subcategory === "") return "Choose a category";
  if (e.payee.trim() === "") return e.direction === "credit" ? "Enter a payer" : "Enter a payee";
  if (e.amountPaise !== null && !(e.amountPaise > 0)) return "Enter an amount, or leave it empty to be asked each month";
  if (!isDay(e.day)) return "The day must be from 1 to 31";
  if (group) {
    if (group.name.trim() === "") return "Enter a name for the group";
    if (otherGroupNames.some((n) => n.trim().toLowerCase() === group.name.trim().toLowerCase())) return "Another template group has this name";
  }
  return null;
}

export interface ContainerNode {
  id: string; // TEMPLATE_MAIN or a template group id
  group: TemplateGroup | null; // null for Main
  depth: number;
  lines: TemplateLine[]; // the entries made in it, in order
}

// Main first, then each group straight after the entry that creates it, at any depth; each container's entries in their order. Safe if the data had a loop.
export function containersOf(template: MonthTemplate): ContainerNode[] {
  const out: ContainerNode[] = [];
  const seen = new Set<string>();
  const visit = (id: string, group: TemplateGroup | null, depth: number): void => {
    if (seen.has(id)) return;
    seen.add(id);
    const lines = template.lines.filter((l) => l.groupId === id).sort((a, b) => a.sort - b.sort);
    out.push({ id, group, depth, lines });
    for (const l of lines) {
      const child = l.createsGroupId ? template.groups.find((g) => g.id === l.createsGroupId) : undefined;
      if (child) visit(child.id, child, depth + 1);
    }
  };
  visit(TEMPLATE_MAIN, null, 0);
  return out;
}

// Turning one switch on turns the other groups' off (each switch is on for one group at most).
export function withSwitch(groups: readonly TemplateGroup[], id: string, which: "fundsHere" | "home", on: boolean): TemplateGroup[] {
  return groups.map((g) => (g.id === id ? { ...g, [which]: on } : on ? { ...g, [which]: false } : g));
}

// ---- setting a month up -------------------------------------------------------------------------------------------------------------------------

export interface PlannedEntry {
  lineId: string; // the template entry it comes from (the preview edits its amount and day by this)
  date: string;
  direction: Direction;
  amountPaise: number;
  category: string;
  subcategory: string;
  payee: string;
  paymentMethod: string | null;
  description: string | null;
}

export interface PlannedGroup {
  templateId: string;
  parentTemplateId: string | null; // null = under Main
  name: string;
  startDate: string;
  endDate: string;
  funding: PlannedEntry; // the entry that creates it, made in its parent
  openingIncome: boolean;
  lines: PlannedEntry[]; // the other entries made in it
  fundsHere: boolean;
  home: boolean;
}

export interface SetupPlan {
  month: string;
  mainLines: PlannedEntry[]; // entries made in Main that create no group
  groups: PlannedGroup[]; // parents before the groups inside them
  problems: string[]; // empty when the month can be set up
}

// What the owner changed in the set-up preview, for this month only (the template itself stays as it was). An amount of null is "not filled in".
export interface SetupChanges {
  line?: Record<string, { amountPaise?: number | null; day?: number }>;
}

// The groups and entries a month's set-up would make, with what stops it. `existingNames` are the names of the groups the app already has.
export function planSetup(template: MonthTemplate, month: string, changes: SetupChanges, existingNames: readonly string[]): SetupPlan {
  const problems: string[] = [];
  const taken = new Set(existingNames.map((n) => n.trim().toLowerCase()));
  const plan: SetupPlan = { month, mainLines: [], groups: [], problems };
  const byTemplateId = new Map<string, PlannedGroup>();
  if (template.lines.length === 0) problems.push("The template has no entries yet.");

  const entryOf = (l: TemplateLine): PlannedEntry => {
    const c = changes.line?.[l.id];
    const amount = c && "amountPaise" in c ? c.amountPaise ?? null : l.amountPaise;
    const day = c?.day ?? l.day;
    if (amount === null || !(amount > 0)) problems.push(`Enter the amount for ${l.payee}.`);
    if (!isDay(day)) problems.push(`The day for ${l.payee} must be from 1 to 31.`);
    return { lineId: l.id, date: dateInMonth(month, day), direction: l.direction, amountPaise: amount ?? 0, category: l.category, subcategory: l.subcategory, payee: l.payee, paymentMethod: l.paymentMethod, description: l.description };
  };

  for (const container of containersOf(template)) {
    for (const l of container.lines) {
      const created = l.createsGroupId ? template.groups.find((g) => g.id === l.createsGroupId) : undefined;
      const entry = entryOf(l);
      if (created) {
        const name = groupNameFor(created.name, month);
        if (taken.has(name.toLowerCase())) problems.push(`A group named "${name}" already exists.`);
        taken.add(name.toLowerCase());
        const planned: PlannedGroup = {
          templateId: created.id,
          parentTemplateId: container.group === null ? null : container.group.id,
          name,
          startDate: `${month}-01`,
          endDate: endOfMonth(`${month}-01`),
          funding: { ...entry, description: name },
          openingIncome: created.openingIncome,
          lines: [],
          fundsHere: created.fundsHere,
          home: created.home,
        };
        plan.groups.push(planned);
        byTemplateId.set(created.id, planned);
      } else if (container.group === null) plan.mainLines.push(entry);
      else byTemplateId.get(container.group.id)?.lines.push(entry);
    }
  }
  return plan;
}

export interface OfferInput {
  month: string; // the current month
  hasTemplate: boolean;
  setUpMonths: ReadonlySet<string>; // months the template has already set up
  monthGroupExists: boolean; // a group directly under Main already covers the month (one the owner made by hand)
  dismissedMonth: string | null; // the month the owner said "Not now" to
}

// Whether to offer "Set up <month>?": there is a template, the month has not been set up, no group made by hand already covers it, and it was not dismissed.
export const offerSetup = (i: OfferInput): boolean => i.hasTemplate && !i.setUpMonths.has(i.month) && !i.monthGroupExists && i.dismissedMonth !== i.month;
