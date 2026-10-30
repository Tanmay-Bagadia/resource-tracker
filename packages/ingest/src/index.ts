/**
 * @module @resource-tracker/ingest
 * Statement parsing, format detection, normalization, validation, and deduplication.
 */

import { entryId } from "@resource-tracker/core";
import type { AccountId, LedgerEntry } from "@resource-tracker/core";
import { parseCSV } from "./csv-parser.ts";
import { detectFormat } from "./format-detector.ts";
import { normalizeRows } from "./normalizer.ts";
import { deduplicateRows } from "./dedup.ts";
import { validateBatch } from "./validator.ts";
import type { IngestOptions, IngestResult, DeduplicatedRow } from "./types.ts";

export * from "./types.ts";
export * from "./csv-parser.ts";
export * from "./format-detector.ts";
export * from "./normalizer.ts";
export * from "./validator.ts";
export * from "./dedup.ts";

/**
 * A fast, deterministic 32-bit FNV-1a string hash for source file identification.
 */
function simpleHash(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/**
 * Ingest statement content (CSV or JSON string).
 *
 * Runs full ETL pipeline:
 * 1. Format & source detection
 * 2. Parsing (CSV RFC-4180 or JSON)
 * 3. Normalization (column mapping, date/amount parsing, kind classification)
 * 4. Schema validation
 * 5. Deduplication against known keys and within-batch repeats
 *
 * @param content - File content as string
 * @param options - Ingest configuration (target accountId, optional overrides)
 * @returns IngestResult with rows, skipped duplicates, errors, and metadata
 */
export function ingest(content: string, options: IngestOptions): IngestResult {
  const detectedFormat = detectFormat(content);
  const source = options.format ?? detectedFormat.source;
  const sourceFileHash = simpleHash(content);

  let rawRows: Record<string, string>[] = [];

  if (detectedFormat.format === "json") {
    try {
      const parsed: unknown = JSON.parse(content);
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      rawRows = arr.map((item) => {
        const record: Record<string, string> = {};
        if (typeof item === "object" && item !== null) {
          for (const [k, v] of Object.entries(item)) {
            record[k] = String(v ?? "");
          }
        }
        return record;
      });
    } catch {
      rawRows = [];
    }
  } else {
    rawRows = parseCSV(content);
  }

  // Normalize
  const { normalized, errors: normErrors } = normalizeRows(
    rawRows,
    source,
    options,
  );

  // Validate
  const { valid, errors: valErrors } = validateBatch(normalized);

  // Deduplicate
  const { unique, duplicateCount } = deduplicateRows(
    valid,
    options.existingKeys,
    options.accountId,
  );

  const needsReviewCount = unique.filter((r) => r.needsReview).length;
  const allErrors = [...normErrors, ...valErrors];

  return {
    rows: unique,
    skippedDuplicates: duplicateCount,
    needsReview: needsReviewCount,
    errors: allErrors,
    sourceFileHash,
    detectedFormat,
  };
}

/**
 * Convert deduplicated normalized rows into immutable LedgerEntry domain events.
 *
 * @param rows - Deduplicated rows from `ingest`
 * @param accountId - Target account identifier
 * @returns Array of LedgerEntry domain events ready to be appended to storage
 */
export function toLedgerEntries(
  rows: readonly DeduplicatedRow[],
  accountId: AccountId,
): LedgerEntry[] {
  const now = new Date().toISOString();
  return rows.map((r, idx) => {
    const id = entryId(`ent_${r.date}_${simpleHash(r.dedupeKey)}_${idx}`);
    if (r.kind === "income") {
      return {
        id,
        accountId,
        date: r.date,
        amountPaise: r.amountPaise,
        description: r.description,
        sourceRef: r.reference,
        dedupeKey: r.dedupeKey,
        createdAt: now,
        kind: "income",
      };
    }
    return {
      id,
      accountId,
      date: r.date,
      amountPaise: r.amountPaise,
      description: r.description,
      sourceRef: r.reference,
      dedupeKey: r.dedupeKey,
      createdAt: now,
      kind: "expense",
    };
  });
}
