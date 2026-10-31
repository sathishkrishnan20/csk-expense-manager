// Which transactions are ticked in a list (select-then-duplicate). Plain sets so the screens stay simple.

export function toggle(selected: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(selected);
  if (!next.delete(id)) next.add(id);
  return next;
}

export const selectAll = (ids: readonly string[]): Set<string> => new Set(ids);

// Selected ids that are still in the list (a reload or a filter change may have dropped some).
export function keepPresent(selected: ReadonlySet<string>, presentIds: readonly string[]): Set<string> {
  const present = new Set(presentIds);
  return new Set([...selected].filter((id) => present.has(id)));
}
