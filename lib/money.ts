/**
 * Prices are stored as integer cents everywhere. These are the only two
 * places that convert, so rounding can't drift around the codebase.
 */

/** 14500 -> "$145" ; 6850 -> "$68.50" */
export function formatUSD(cents: number): string {
  const dollars = cents / 100;
  const whole = cents % 100 === 0;
  return dollars.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

/**
 * "145" / "145.00" / "$1,450.50" -> cents. Returns null for anything that
 * isn't a usable price, so callers can reject rather than store NaN.
 */
export function parsePriceToCents(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const cents = Math.round(parseFloat(cleaned) * 100);
  return Number.isFinite(cents) && cents >= 0 ? cents : null;
}
