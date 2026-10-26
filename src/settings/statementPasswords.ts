import { secureStorage } from "../platform/secureStorage";

// Passwords of the PDF statements the bank emails (one per bank or account). They are kept the
// same way as the AI key: in the iOS Keychain, or encrypted with a passkey on web. When a PDF is
// imported every saved password is tried until one opens it.
const KEY = "statement_passwords";

export interface StatementPassword {
  id: string;
  label: string;
  password: string;
}

export async function loadStatementPasswords(): Promise<StatementPassword[]> {
  const raw = await secureStorage.get(KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter(
          (p): p is StatementPassword =>
            typeof p?.id === "string" && typeof p?.label === "string" && typeof p?.password === "string",
        )
      : [];
  } catch {
    return [];
  }
}

async function save(list: StatementPassword[]): Promise<void> {
  if (list.length === 0) await secureStorage.remove(KEY);
  else await secureStorage.set(KEY, JSON.stringify(list));
}

export async function addStatementPassword(label: string, password: string): Promise<void> {
  if (password.trim() === "") throw new Error("Enter the password.");
  const list = await loadStatementPasswords();
  if (list.some((p) => p.password === password)) throw new Error("That password is already saved.");
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  await save([...list, { id, label: label.trim() || "Statement", password }]);
}

export async function removeStatementPassword(id: string): Promise<void> {
  await save((await loadStatementPasswords()).filter((p) => p.id !== id));
}

// Just the passwords, in the order they were saved.
export async function statementPasswordValues(): Promise<string[]> {
  return (await loadStatementPasswords()).map((p) => p.password);
}
