import type { RestoreSummary } from "../db/backup";

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// One sentence on what a restore (from a file or from the cloud) added to this phone.
export function describeRestore(r: RestoreSummary): string {
  const parts = [
    `${count(r.transactionsAdded, "transaction")} added`,
    `${r.transactionsAlreadyPresent} already on this device`,
    `${count(r.categoriesAdded, "category", "categories")} and ${count(r.paymentMethodsAdded, "payment mode")} added`,
  ];
  if (r.groupsAdded > 0) parts.push(`${count(r.groupsAdded, "group")} added`);
  if (r.giftsAdded > 0) parts.push(`${count(r.giftsAdded, "gift")} added`);
  if (r.assetsAdded > 0) parts.push(`${count(r.assetsAdded, "asset")} added`);
  if (r.journeysAdded > 0) parts.push(`${count(r.journeysAdded, "train journey")} added`);
  if (r.skipped > 0) parts.push(`${count(r.skipped, "damaged entry", "damaged entries")} skipped`);
  return `${parts.join(", ")}.`;
}
