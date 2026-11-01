// Groups: ledgers with their own incomes and expenses. "Main" is the built-in one that holds everything entered before
// groups existed. A group can sit under another group (or under Main), and a group's balance includes the balances of the
// groups under it: its own income minus its own expenses, plus each subgroup's balance (which includes theirs). A group with
// no parent stays on its own and is not part of Main's balance.

export const MAIN_GROUP_ID = "main";

export type GroupStatus = "ACTIVE" | "CLOSED" | "DELETED";

export interface Group {
  id: string;
  name: string;
  startDate: string | null; // ISO yyyy-mm-dd; informational, never limits which transactions a group can hold
  endDate: string | null;
  status: GroupStatus;
  parentId: string | null; // the group it sits under; null for Main and for a group kept separate
  pinned: boolean; // shown first in Home's strip
  // Income the group was started with out of money its parent already has (a group made from an income entry). It is part of the
  // group's own figures, so the group shows it to spend, but it is left out of what the group adds to the parent, which already
  // counts that money once. A group made from an expense needs none: the parent's expense cancels the group's opening income.
  heldPaise: number;
}

export interface GroupWithBalance extends Group {
  inPaise: number; // this group's own incomes and expenses only
  outPaise: number;
  subgroupsInPaise: number; // the incomes and expenses of every group below it, however deep
  subgroupsOutPaise: number;
  subgroupsPaise: number; // the balance of the groups below it (their incomes minus their expenses)
}

// What the group's cards show: its own entries plus everything below it. Income minus expenses is its balance.
export const totalInPaise = (g: { inPaise: number; subgroupsInPaise?: number }): number => g.inPaise + (g.subgroupsInPaise ?? 0);
export const totalOutPaise = (g: { outPaise: number; subgroupsOutPaise?: number }): number => g.outPaise + (g.subgroupsOutPaise ?? 0);

export const isMainGroup = (id: string): boolean => id === MAIN_GROUP_ID;

// Own income minus own expenses, plus what the subgroups hold (the same as totalInPaise - totalOutPaise).
export const balanceOf = (g: { inPaise: number; outPaise: number; subgroupsPaise?: number }): number =>
  g.inPaise - g.outPaise + (g.subgroupsPaise ?? 0);

type Linked = { id: string; parentId: string | null };

export const childrenOf = <G extends Linked>(groups: readonly G[], parentId: string): G[] =>
  groups.filter((g) => g.parentId === parentId && g.id !== parentId);

// Every group below `id`, however deep. Safe even if the data had a loop.
export function descendantIds(groups: readonly Linked[], id: string): Set<string> {
  const found = new Set<string>();
  const queue = [id];
  while (queue.length > 0) {
    const current = queue.pop()!;
    for (const child of childrenOf(groups, current)) {
      if (child.id !== id && !found.has(child.id)) {
        found.add(child.id);
        queue.push(child.id);
      }
    }
  }
  return found;
}

// Fills in what is below each group: the incomes and expenses of all the groups under it, and their balance. A group adds to its
// parent everything it holds except its heldPaise (see Group). Pass only the groups that count (not deleted ones); a parent that is
// not in the list is treated as no parent.
export function withRolledUp<G extends Group & { inPaise: number; outPaise: number }>(
  groups: readonly G[],
): (G & { subgroupsInPaise: number; subgroupsOutPaise: number; subgroupsPaise: number })[] {
  type Money = { inPaise: number; outPaise: number };
  const below = new Map<string, Money>(); // what is under a group
  const toParent = new Map<string, Money>(); // what a group adds to its parent
  const visit = (g: G, path: Set<string>): Money => {
    const known = toParent.get(g.id);
    if (known) return known;
    if (path.has(g.id)) return { inPaise: 0, outPaise: 0 }; // a loop that should never exist: stop instead of running forever
    path.add(g.id);
    const under = { inPaise: 0, outPaise: 0 };
    for (const child of childrenOf(groups, g.id)) {
      const t = visit(child, path);
      under.inPaise += t.inPaise;
      under.outPaise += t.outPaise;
    }
    path.delete(g.id);
    below.set(g.id, under);
    const held = Math.min(Math.max(g.heldPaise, 0), g.inPaise); // never more than the group's own income
    const result = { inPaise: g.inPaise - held + under.inPaise, outPaise: g.outPaise + under.outPaise };
    toParent.set(g.id, result);
    return result;
  };
  for (const g of groups) visit(g, new Set());
  return groups.map((g) => {
    const under = below.get(g.id) ?? { inPaise: 0, outPaise: 0 };
    return { ...g, subgroupsInPaise: under.inPaise, subgroupsOutPaise: under.outPaise, subgroupsPaise: under.inPaise - under.outPaise };
  });
}

// The groups in tree order with how deep each is: a group, then the groups under it, and so on. A group whose parent is not
// in the list is shown at the top.
export function flattenTree<G extends Linked>(groups: readonly G[]): { group: G; depth: number }[] {
  const ids = new Set(groups.map((g) => g.id));
  const out: { group: G; depth: number }[] = [];
  const seen = new Set<string>();
  const walk = (g: G, depth: number) => {
    if (seen.has(g.id)) return;
    seen.add(g.id);
    out.push({ group: g, depth });
    for (const child of childrenOf(groups, g.id)) walk(child, depth + 1);
  };
  for (const g of groups) if (g.parentId === null || !ids.has(g.parentId)) walk(g, 0);
  for (const g of groups) walk(g, 0); // anything left over (a loop that should never exist)
  return out;
}

// The groups Home's strip shows. On Main: the pinned groups at any depth, then the other groups right under Main or kept
// separate. On a group: the groups directly under it, pinned first. Only open groups.
export function stripGroups<G extends Group>(groups: readonly G[], currentId: string): G[] {
  const open = groups.filter((g) => g.status === "ACTIVE" && g.id !== MAIN_GROUP_ID && g.id !== currentId);
  const pool = isMainGroup(currentId) ? open : open.filter((g) => g.parentId === currentId);
  const pinned = pool.filter((g) => g.pinned);
  const rest = pool.filter((g) => !g.pinned && (!isMainGroup(currentId) || g.parentId === null || g.parentId === MAIN_GROUP_ID));
  return [...pinned, ...rest];
}

// The key a statement row is stored under. Rows imported into Main keep the bank's own key, so data from
// before groups is unchanged; rows imported into a group get the group id in front, which lets the same
// bank row be imported into a group without colliding with Main. The key is fixed at import time.
export function scopedKey(groupId: string, bankKey: string): string {
  return isMainGroup(groupId) ? bankKey : `${groupId}|${bankKey}`;
}

export function groupDatesLabel(g: Pick<Group, "startDate" | "endDate">, format: (iso: string) => string): string | null {
  if (g.startDate && g.endDate) return `${format(g.startDate)} - ${format(g.endDate)}`;
  if (g.startDate) return `From ${format(g.startDate)}`;
  if (g.endDate) return `Until ${format(g.endDate)}`;
  return null;
}

// Error text when `parentId` cannot be the parent of group `id` (`id` is null for a group not created yet), or null.
export function validateParent(groups: readonly Linked[], id: string | null, parentId: string | null): string | null {
  if (parentId === null) return null;
  if (id !== null && isMainGroup(id)) return "Main cannot be inside another group";
  if (!groups.some((g) => g.id === parentId)) return "Choose a group that exists";
  if (id === null) return null;
  if (parentId === id) return "A group cannot be inside itself";
  if (descendantIds(groups, id).has(parentId)) return "A group cannot be inside one of its own subgroups";
  return null;
}

// Error text for the group form, or null when it can be saved. existingNames are the other groups' names.
export function validateGroup(
  input: { name: string; startDate: string | null; endDate: string | null },
  existingNames: string[],
): string | null {
  const name = input.name.trim();
  if (!name) return "Enter a name for the group";
  if (existingNames.some((n) => n.trim().toLowerCase() === name.toLowerCase())) {
    return "A group with this name already exists";
  }
  if (input.startDate && input.endDate && input.endDate < input.startDate) {
    return "The end date must be on or after the start date";
  }
  return null;
}

// For a transaction that created a group: that group's name and what is left in it (its balance, which includes the groups under
// it), shown on the transaction's row. Null when the entry created no group or the group was deleted.
export function createdGroupInfo(
  groups: readonly (Pick<Group, "id" | "name"> & { inPaise: number; outPaise: number; subgroupsPaise?: number })[],
  createdGroupId: string | null,
): { name: string; balancePaise: number } | null {
  const g = createdGroupId ? groups.find((x) => x.id === createdGroupId) : undefined;
  return g ? { name: g.name, balancePaise: balanceOf(g) } : null;
}

// The Groups strip on the Home screen, which shows one group (the home group): the pinned groups first, then Main, then the home
// group's own subgroups, then the other groups right under Main or kept separate. Only open groups, and not the one being shown.
export function homeStripGroups<G extends Group>(groups: readonly G[], currentId: string): G[] {
  const open = groups.filter((g) => g.status === "ACTIVE" && g.id !== currentId);
  const pinned = open.filter((g) => g.pinned && !isMainGroup(g.id));
  const main = open.filter((g) => isMainGroup(g.id));
  const below = open.filter((g) => !g.pinned && g.parentId === currentId);
  const rest = open.filter(
    (g) => !g.pinned && !isMainGroup(g.id) && g.parentId !== currentId && (g.parentId === null || g.parentId === MAIN_GROUP_ID),
  );
  return [...pinned, ...main, ...below, ...rest];
}
