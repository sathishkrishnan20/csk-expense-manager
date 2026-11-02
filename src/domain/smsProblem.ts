// The one line the Home screen shows when the automatic bank SMS check could not finish its job, after it has already retried. Only
// real failures are listed: new payments, nothing new, and entries saved without a category (Re-classify handles those) say nothing.
export interface SmsProblemInput {
  waiting: number; // messages that could not be saved, after the retries
  unreadCount: number; // messages this app does not know how to read
}

const messages = (n: number) => `${n} bank message${n === 1 ? "" : "s"}`;

export function describeSmsProblem({ waiting, unreadCount }: SmsProblemInput): string | null {
  const parts: string[] = [];
  if (waiting > 0) parts.push(`${messages(waiting)} couldn't be saved.`);
  if (unreadCount > 0) parts.push(`${messages(unreadCount)} couldn't be read.`);
  if (parts.length === 0) return null;
  parts.push("You can also import your bank statement to fill in what is missing.");
  return parts.join(" ");
}
