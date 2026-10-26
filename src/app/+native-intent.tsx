// Runs when the phone hands the app a link or a file (outside the app's own state). A statement shared
// from Mail or Files ("Open in Expense Manager") arrives as a file path; send it to the import screen,
// which reads it, unlocks it if it is a locked PDF, and imports it. Everything else is left alone.
const STATEMENT_FILE = /\.(pdf|xls|xlsx|csv)(\?|#|$)/i;

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    if (STATEMENT_FILE.test(path) && !path.startsWith("expensemanager:")) {
      const uri = path.startsWith("/") ? `file://${path}` : path;
      return `/import?file=${encodeURIComponent(uri)}`;
    }
    return path;
  } catch {
    return "/";
  }
}
