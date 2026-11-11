const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

// Indian digit grouping (12,34,567), computed by hand so it does not depend on
// the device's Intl support.
function groupIndian(digits: string): string {
  if (digits.length <= 3) return digits;
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${rest},${last3}`;
}

// A rupee amount in rupees (not paise), such as a metal rate: "₹1,26,020". It shows at least `min` and at most `max` decimals, dropping
// trailing zeros beyond `min`: {} gives whole rupees, {max: 1} gives "₹13,757.6" or "₹13,757", {min: 2} gives "₹177.30".
export function formatRupeeAmount(value: number, { min = 0, max = min }: { min?: number; max?: number } = {}): string {
  const fixed = Math.abs(value).toFixed(max);
  const [whole, fraction = ""] = fixed.split(".");
  let decimals = fraction;
  while (decimals.length > min && decimals.endsWith("0")) decimals = decimals.slice(0, -1);
  const negative = value < 0 && Number(fixed) !== 0;
  return `${negative ? "-" : ""}₹${groupIndian(whole)}${decimals ? `.${decimals}` : ""}`;
}

export function formatRupees(paise: number): string {
  const negative = paise < 0;
  const abs = Math.abs(Math.round(paise));
  const whole = Math.floor(abs / 100);
  const fraction = String(abs % 100).padStart(2, "0");
  return `${negative ? "-" : ""}₹${groupIndian(String(whole))}.${fraction}`;
}

// "March 19, 2026" from an ISO yyyy-mm-dd date.
export function formatLongDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${String(d).padStart(2, "0")}, ${y}`;
}

// "03 Nov" from an ISO yyyy-mm-dd date.
export function formatShortDate(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${String(d).padStart(2, "0")} ${MONTHS[m - 1].slice(0, 3)}`;
}

// "3:42 PM", in the phone's own time zone.
export function formatClockTime(date: Date): string {
  const hours = date.getHours();
  return `${hours % 12 || 12}:${String(date.getMinutes()).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`;
}

// "just now", "12 min ago", "3 hr ago", "2 days ago". A time in the future (the clock was changed) reads as just now.
export function formatRelativeTime(then: number, now: number): string {
  const minutes = Math.floor((now - then) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}

// "10/25/2026", the format the web app's date fields use.
export function formatFieldDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
}

export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function fromISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function monthRange(today: Date): { start: string; end: string } {
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  return { start: toISODate(start), end: toISODate(end) };
}

// "123.45" -> 12345 paise; null when it is not a positive amount.
export function parseAmountInput(text: string): number | null {
  const cleaned = text.replace(/,/g, "").trim();
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  const paise = Math.round(Number(cleaned) * 100);
  return paise > 0 ? paise : null;
}
