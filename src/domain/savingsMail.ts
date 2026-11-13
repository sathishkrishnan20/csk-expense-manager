// The savings inbox address (see server/src/mail.ts): "savings-<32 hex>@<the owner's domain>". The 32 hex characters are the owner's secret, made on the phone;
// the domain is the one Cloudflare Email Routing receives mail for. Pure, so it is tested in Node.
export const TOKEN_BYTES = 16;

export const isToken = (text: string): boolean => /^[0-9a-f]{32}$/.test(text);

// A plain domain name such as "example.store" (no address, no path).
export const isDomain = (text: string): boolean => /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i.test(text.trim());

export const tokenFromBytes = (bytes: Uint8Array): string => [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");

export const addressFor = (token: string, domain: string): string => `savings-${token}@${domain.trim().toLowerCase()}`;

export interface SavingsMailSettings {
  token: string;
  domain: string;
}

// Settings from an address the owner pasted, or null when it is not one of ours.
export function settingsFromAddress(address: string): SavingsMailSettings | null {
  const m = address.trim().toLowerCase().match(/^savings-([0-9a-f]{32})@(.+)$/);
  return m && isDomain(m[2]) ? { token: m[1], domain: m[2] } : null;
}

// The domain fixed for this build (EXPO_PUBLIC_SAVINGS_MAIL_DOMAIN in .env), lower case, or null when none is set or it is not a domain name. When it is set, the
// Savings by email screen shows it read-only instead of asking for one.
export const fixedDomain = (value: string | undefined): string | null => (value !== undefined && isDomain(value) ? value.trim().toLowerCase() : null);

export type ExistingAddress = { ok: true; settings: SavingsMailSettings } | { ok: false; problem: string };

// An address the owner pasted to carry on with after a reinstall (or on a second phone): it must be one of ours, and, when this build fixes the domain, on that domain.
export function existingAddress(text: string, fixed: string | null): ExistingAddress {
  const settings = settingsFromAddress(text);
  if (!settings) return { ok: false, problem: "That is not one of your savings addresses. It looks like savings-, then 32 letters and numbers, then @ and your domain." };
  if (fixed && settings.domain !== fixed) return { ok: false, problem: `This build uses ${fixed}, but that address is on ${settings.domain}.` };
  return { ok: true, settings };
}
