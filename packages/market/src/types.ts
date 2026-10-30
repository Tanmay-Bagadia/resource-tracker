import type { InstrumentId, CalendarDate, Paise } from "@resource-tracker/core";

// ── Price Source ──────────────────────────────────────────────────────

/** The source from which a market price was obtained. */
export type PriceSource =
  "manual" | "amfi_nav" | "broker_export" | "csv_import";

// ── Market Price ──────────────────────────────────────────────────────

/** A single market price observation for an instrument on a specific date. */
export interface MarketPrice {
  readonly instrumentId: InstrumentId;
  readonly date: CalendarDate;
  readonly valuePaise: Paise;
  readonly source: PriceSource;
  /** ISO-8601 timestamp when this price was fetched / entered. */
  readonly fetchedAt: string;
}

// ── Price Staleness ───────────────────────────────────────────────────

/** Staleness information for a single instrument's price. */
export interface PriceStaleness {
  readonly instrumentId: InstrumentId;
  readonly lastPriceDate: CalendarDate;
  readonly daysSinceLastPrice: number;
  readonly isStale: boolean;
}

// ── NAV Entry ─────────────────────────────────────────────────────────

/** A parsed row from the AMFI NAV text file. */
export interface NAVEntry {
  readonly schemeCode: string;
  readonly schemeName: string;
  /** NAV as a decimal number (will be converted to Paise at the usage boundary). */
  readonly navValue: number;
  readonly date: CalendarDate;
  readonly isin?: string;
}

// ── Asset Search Result ───────────────────────────────────────────────

/** Result of an instrument search, with relevance scoring. */
export interface AssetSearchResult {
  readonly instrumentId: InstrumentId;
  readonly name: string;
  readonly type: string;
  readonly isin?: string;
  /** Match quality: 0–1, higher is better. */
  readonly matchScore: number;
}

// ── Price Snapshot ────────────────────────────────────────────────────

/** A point-in-time snapshot of all known prices and their staleness. */
export interface PriceSnapshot {
  readonly prices: Map<InstrumentId, MarketPrice>;
  readonly staleInstruments: readonly PriceStaleness[];
  readonly lastUpdated: string;
}
