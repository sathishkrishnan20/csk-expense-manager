// Which groups a list or chart covers: one or more groups, or null for every group. The Transactions and Charts pages start on the
// group they belong to (the home group, or the group opened) and the Group filter widens or changes that.

export type GroupScope = string[] | null;

// What the filter button says.
export function scopeLabel(scope: GroupScope, nameOf: ReadonlyMap<string, string>): string {
  if (scope === null) return "All groups";
  if (scope.length === 0) return "No group";
  if (scope.length === 1) return nameOf.get(scope[0]) ?? "1 group";
  return `${scope.length} groups`;
}

// Ticking a group in the filter. From "all" a tick narrows to that group; at least one group always stays selected.
export function toggleInScope(scope: GroupScope, id: string): string[] {
  if (scope === null) return [id];
  if (!scope.includes(id)) return [...scope, id];
  return scope.length > 1 ? scope.filter((g) => g !== id) : scope;
}

// Rows from several groups should say which group each belongs to.
export const spansSeveralGroups = (scope: GroupScope): boolean => scope === null || scope.length > 1;

// A string that changes whenever the selection does, for effect dependencies and resetting a selection of rows.
export const scopeKey = (scope: GroupScope): string => (scope === null ? "*" : [...scope].sort().join(","));
