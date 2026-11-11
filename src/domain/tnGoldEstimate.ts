// An estimate of the Tamil Nadu retail price of 22K gold, worked out from the world spot price of gold in rupees per troy ounce (the
// gold-api.com price, rates/goldApi.ts). It is the owner's own rule of thumb, not a published rate: the IBJA benchmark on the same page is
// the figure to compare it with.
export const GRAMS_PER_TROY_OUNCE = 31.1035;
export const PURITY_22K = 0.916;
// A fixed regional multiplier for import duty, state taxes and the jeweller's margin.
export const TAMIL_NADU_PREMIUM = 1.1648;

// Rupees per gram of 22K gold from the rupee price of one troy ounce.
export function calculateTodayPrice(ouncePriceInr: number): number {
  return Math.round((ouncePriceInr / GRAMS_PER_TROY_OUNCE) * PURITY_22K * TAMIL_NADU_PREMIUM);
}

// The gold-api.com answer to GET /price/XAU/INR: { currency: "INR", price: 373230.69, ... }. Null unless it is a positive rupee price.
export function parseGoldApiInrPrice(json: unknown): number | null {
  if (typeof json !== "object" || json === null) return null;
  const { currency, price } = json as { currency?: unknown; price?: unknown };
  return currency === "INR" && typeof price === "number" && Number.isFinite(price) && price > 0 ? price : null;
}
