// The line shown at the bottom of the menu so the owner can tell which build is running: the app version (from app.json), and, when the
// app is running a JavaScript update downloaded over the air (EAS Update) instead of the code it was installed with, the start of that
// update's id, which changes with every `npm run update`.
export interface VersionInfo {
  version: string | null;
  updatesEnabled: boolean; // false in Expo Go, a development build and the browser
  embedded: boolean; // running the code that came with the installed app
  updateId: string | null;
}

export function versionLabel(info: VersionInfo): string {
  const base = `Version ${info.version ?? "unknown"}`;
  if (info.updatesEnabled && !info.embedded && info.updateId) return `${base} · update ${info.updateId.slice(0, 8)}`;
  return base;
}
