import type { CalendarDate, InstrumentId } from "@resource-tracker/core";
import type { MarketPrice, PriceStaleness } from "./types.ts";

/** Default threshold in days beyond which a price is considered stale. */
const DEFAULT_STALE_DAYS = 3;

/**
 * Calculate the number of calendar days between two dates.
 * Returns a non-negative integer representing the absolute difference.
 *
 * @param a - First CalendarDate (YYYY-MM-DD)
 * @param b - Second CalendarDate (YYYY-MM-DD)
 * @returns Absolute number of days between the two dates
 */
export function daysBetween(a: CalendarDate, b: CalendarDate): number {
  const msA = new Date(a + "T00:00:00Z").getTime();
  const msB = new Date(b + "T00:00:00Z").getTime();
  const diffMs = Math.abs(msA - msB);
  return Math.round(diffMs / (24 * 60 * 60 * 1000));
}

/**
 * Check whether a price date is stale relative to a reference date.
 *
 * @param priceDate - The date the price was recorded
 * @param asOf - The reference date to measure staleness against
 * @param thresholdDays - Number of days after which a price is considered stale (default: 3)
 * @returns `true` if `priceDate` is more than `thresholdDays` before `asOf`
 */
export function isPriceStale(
  priceDate: CalendarDate,
  asOf: CalendarDate,
  thresholdDays: number = DEFAULT_STALE_DAYS,
): boolean {
  return daysBetween(priceDate, asOf) > thresholdDays;
}

/**
 * Produce a staleness report for every instrument in the given price map.
 *
 * @param prices - Map of instrument ID → latest MarketPrice
 * @param asOf - The reference date
 * @param thresholdDays - Days threshold (default: 3)
 * @returns An array of PriceStaleness entries, one per instrument
 */
export function getStalenessReport(
  prices: Map<InstrumentId, MarketPrice>,
  asOf: CalendarDate,
  thresholdDays: number = DEFAULT_STALE_DAYS,
): PriceStaleness[] {
  const results: PriceStaleness[] = [];
  for (const [id, price] of prices) {
    const days = daysBetween(price.date, asOf);
    results.push({
      instrumentId: id,
      lastPriceDate: price.date,
      daysSinceLastPrice: days,
      isStale: days > thresholdDays,
    });
  }
  return results;
}
