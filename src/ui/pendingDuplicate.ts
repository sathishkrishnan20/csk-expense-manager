import type { TransactionRecord } from "../db/transactions";

// Hand-over between a transaction list and the Duplicate screen: the rows ticked in the list. Kept in memory
// rather than in the route, because ids can be long (bank keys include the narration). Nothing is stored on
// disk; if the app restarts on the Duplicate screen the hand-over is empty and the screen goes back.
let pending: { groupId: string; rows: TransactionRecord[] } | null = null;

export function setPendingDuplicate(groupId: string, rows: TransactionRecord[]): void {
  pending = { groupId, rows };
}

export function getPendingDuplicate(): { groupId: string; rows: TransactionRecord[] } | null {
  return pending;
}

export function clearPendingDuplicate(): void {
  pending = null;
}
