import type { CalendarDate, InstrumentId } from "@resource-tracker/core";
import type { MarketPrice, PriceSnapshot } from "./types.ts";
import { getStalenessReport } from "./staleness.ts";

/**
 * In-memory price store for financial instruments.
 *
 * Stores multiple price observations per instrument (keyed by date),
 * supports temporal lookup ("latest price on or before date"),
 * and provides staleness detection via snapshots.
 */
export class PriceRegistry {
  /**
   * instrumentId → (date → MarketPrice)
   * Inner map is keyed by CalendarDate strings for O(1) date lookup.
   */
  private store: Map<InstrumentId, Map<CalendarDate, MarketPrice>> = new Map();

  /**
   * Register a price for an instrument on a specific date.
   * If a price already exists for that instrument+date, it is overwritten.
   *
   * @param price - The MarketPrice to store
   */
  setPrice(price: MarketPrice): void {
    let dateMap = this.store.get(price.instrumentId);
    if (!dateMap) {
      dateMap = new Map();
      this.store.set(price.instrumentId, dateMap);
    }
    dateMap.set(price.date, price);
  }

  /**
   * Set multiple prices at once.
   *
   * @param prices - Array of MarketPrice records to store
   */
  setBatchPrices(prices: readonly MarketPrice[]): void {
    for (const price of prices) {
      this.setPrice(price);
    }
  }

  /**
   * Get the latest price for an instrument on or before the given date.
   *
   * Iterates through the instrument's price history to find the most recent
   * entry whose date is ≤ `asOf`.
   *
   * @param instrumentId - The instrument to look up
   * @param asOf - The reference date (inclusive upper bound)
   * @returns The latest MarketPrice on or before `asOf`, or `undefined` if none exists
   */
  getPrice(
    instrumentId: InstrumentId,
    asOf: CalendarDate,
  ): MarketPrice | undefined {
    const dateMap = this.store.get(instrumentId);
    if (!dateMap) return undefined;

    let best: MarketPrice | undefined;
    for (const [date, price] of dateMap) {
      if (date <= asOf) {
        if (!best || date > best.date) {
          best = price;
        }
      }
    }
    return best;
  }

  /**
   * Get the complete price history for an instrument, sorted by date ascending.
   *
   * @param instrumentId - The instrument to look up
   * @returns Sorted array of MarketPrice records (empty array if no history)
   */
  getPriceHistory(instrumentId: InstrumentId): readonly MarketPrice[] {
    const dateMap = this.store.get(instrumentId);
    if (!dateMap) return [];

    const prices = Array.from(dateMap.values());
    prices.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    return prices;
  }

  /**
   * Get the latest price for every instrument on or before the given date.
   *
   * @param asOf - The reference date
   * @returns Map of instrument ID → latest MarketPrice on or before `asOf`
   */
  getAllLatestPrices(asOf: CalendarDate): Map<InstrumentId, MarketPrice> {
    const result = new Map<InstrumentId, MarketPrice>();
    for (const instrumentId of this.store.keys()) {
      const price = this.getPrice(instrumentId, asOf);
      if (price) {
        result.set(instrumentId, price);
      }
    }
    return result;
  }

  /**
   * Get a full snapshot of all prices with staleness information.
   *
   * @param asOf - The reference date for price lookup and staleness calculation
   * @param staleDays - Number of days after which a price is stale (default: 3)
   * @returns A PriceSnapshot containing prices, stale instruments, and timestamp
   */
  getSnapshot(asOf: CalendarDate, staleDays: number = 3): PriceSnapshot {
    const prices = this.getAllLatestPrices(asOf);
    const report = getStalenessReport(prices, asOf, staleDays);
    const staleInstruments = report.filter((r) => r.isStale);

    return {
      prices,
      staleInstruments,
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * Remove all price records for a given instrument.
   *
   * @param instrumentId - The instrument whose prices should be cleared
   */
  clearPrices(instrumentId: InstrumentId): void {
    this.store.delete(instrumentId);
  }

  /**
   * Get the total number of individual price records across all instruments.
   *
   * @returns Total count of stored price entries
   */
  size(): number {
    let count = 0;
    for (const dateMap of this.store.values()) {
      count += dateMap.size;
    }
    return count;
  }
}
