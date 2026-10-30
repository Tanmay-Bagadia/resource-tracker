/**
 * @module types
 * Ingest-specific types for the CSV/JSON ingestion pipeline.
 */

import type {
  CalendarDate,
  Paise,
  AccountId,
  EntryKind,
} from "@resource-tracker/core";

export type { CalendarDate, Paise, AccountId, EntryKind };

// ─── Ingest Types ─────────────────────────────────────────────────────────────

/** Confidence level of a parsed/detected result */
export type Confidence = "high" | "medium" | "low";

/** Supported input formats */
export type InputFormat = "csv" | "json";

/** Known bank/source statement formats */
export type SourceFormat =
  | "hdfc_bank"
  | "icici_bank"
  | "sbi_bank"
  | "axis_bank"
  | "generic_bank"
  | "mutual_fund_cas"
  | "unknown";

/** Result of format detection on raw input content */
export interface FormatDetectionResult {
  readonly format: InputFormat;
  readonly source: SourceFormat;
  readonly confidence: Confidence;
  readonly headers: readonly string[];
}

/** A single row after normalization — ready for validation and dedup */
export interface NormalizedRow {
  readonly date: CalendarDate;
  readonly description: string;
  readonly amountPaise: Paise;
  readonly kind: EntryKind;
  readonly balance?: Paise;
  readonly reference?: string;
  readonly category?: string;
  readonly needsReview: boolean;
  readonly reviewReason?: string;
  readonly rawRow: Record<string, string>;
}

/** A row with an attached deterministic deduplication key */
export interface DeduplicatedRow extends NormalizedRow {
  readonly dedupeKey: string;
}

/** Outcome of the full ingest pipeline */
export interface IngestResult {
  readonly rows: readonly DeduplicatedRow[];
  readonly skippedDuplicates: number;
  readonly needsReview: number;
  readonly errors: readonly IngestError[];
  readonly sourceFileHash: string;
  readonly detectedFormat: FormatDetectionResult;
}

/** A validation/parsing error tied to a specific row and field */
export interface IngestError {
  readonly row: number;
  readonly field: string;
  readonly message: string;
  readonly rawValue: string;
}

/** Options for the ingestion pipeline */
export interface IngestOptions {
  readonly accountId: AccountId;
  /** Override auto-detection of bank/source format */
  readonly format?: SourceFormat;
  /** Override date format detection (e.g. "DD/MM/YYYY") */
  readonly dateFormat?: string;
  /** Number of leading rows to skip (e.g. header/footer) */
  readonly skipRows?: number;
  /** Existing dedup keys used for deduplication across ingestions */
  readonly existingKeys?: ReadonlySet<string>;
}
