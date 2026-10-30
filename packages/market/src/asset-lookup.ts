import type { Instrument, InstrumentId } from "@resource-tracker/core";
import type { AssetSearchResult } from "./types.ts";

/**
 * In-memory instrument registry with search and lookup capabilities.
 *
 * Provides case-insensitive name search with relevance scoring
 * (exact match > starts-with > contains), ISIN lookup, and AMFI code lookup.
 */
export class AssetLookup {
  private instruments: Map<InstrumentId, Instrument>;

  /**
   * Create an AssetLookup from an initial set of instruments.
   *
   * @param instruments - Instruments to index. Later entries with duplicate IDs overwrite earlier ones.
   */
  constructor(instruments: readonly Instrument[]) {
    this.instruments = new Map();
    for (const inst of instruments) {
      this.instruments.set(inst.id, inst);
    }
  }

  /**
   * Search instruments by name using case-insensitive matching.
   *
   * Results are scored:
   * - **1.0** — exact match (entire name matches the query)
   * - **0.75** — name starts with the query
   * - **0.5** — name contains the query
   *
   * Results are returned sorted by descending matchScore,
   * then alphabetically by name for equal scores.
   *
   * @param query - Search string. Returns empty array if blank.
   * @returns Sorted array of matching AssetSearchResult entries
   */
  searchByName(query: string): AssetSearchResult[] {
    const q = query.trim().toLowerCase();
    if (q.length === 0) return [];

    const results: AssetSearchResult[] = [];

    for (const inst of this.instruments.values()) {
      const nameLower = inst.name.toLowerCase();
      let matchScore: number;

      if (nameLower === q) {
        matchScore = 1.0;
      } else if (nameLower.startsWith(q)) {
        matchScore = 0.75;
      } else if (nameLower.includes(q)) {
        matchScore = 0.5;
      } else {
        continue;
      }

      results.push({
        instrumentId: inst.id,
        name: inst.name,
        type: inst.type,
        isin: inst.isin,
        matchScore,
      });
    }

    results.sort((a, b) => {
      if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
      return a.name.localeCompare(b.name);
    });

    return results;
  }

  /**
   * Find an instrument by its ISIN code.
   *
   * @param isin - The ISIN to search for (case-insensitive)
   * @returns The matching Instrument, or `undefined` if not found
   */
  findByIsin(isin: string): Instrument | undefined {
    const target = isin.toUpperCase();
    for (const inst of this.instruments.values()) {
      if (inst.isin?.toUpperCase() === target) return inst;
    }
    return undefined;
  }

  /**
   * Find an instrument by its AMFI scheme code.
   *
   * @param code - The AMFI scheme code string
   * @returns The matching Instrument, or `undefined` if not found
   */
  findByAmfiCode(code: string): Instrument | undefined {
    for (const inst of this.instruments.values()) {
      if (inst.amfiCode === code) return inst;
    }
    return undefined;
  }

  /**
   * Add a new instrument or update an existing one by ID.
   *
   * @param instrument - The instrument to upsert
   */
  upsert(instrument: Instrument): void {
    this.instruments.set(instrument.id, instrument);
  }

  /**
   * Get all instruments in the registry.
   *
   * @returns An array of all instruments (order not guaranteed)
   */
  getAll(): readonly Instrument[] {
    return Array.from(this.instruments.values());
  }
}
