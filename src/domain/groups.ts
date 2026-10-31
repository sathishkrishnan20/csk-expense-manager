// Groups: separate ledgers with their own incomes and expenses. "Main" is the built-in one that
// holds everything entered before groups existed.

export const MAIN_GROUP_ID = "main";

export type GroupStatus = "ACTIVE" | "CLOSED" | "DELETED";

export interface Group {
  id: string;
  name: string;
  startDate: string | null; // ISO yyyy-mm-dd; informational, never limits which transactions a group can hold
  endDate: string | null;
  status: GroupStatus;
}

export interface GroupWithBalance extends Group {
  inPaise: number;
  outPaise: number;
}

export const isMainGroup = (id: string): boolean => id === MAIN_GROUP_ID;

export const balanceOf = (g: { inPaise: number; outPaise: number }): number => g.inPaise - g.outPaise;

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
