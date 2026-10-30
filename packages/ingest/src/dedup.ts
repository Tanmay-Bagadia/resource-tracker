/**
 * @module dedup
 * Deterministic deduplication key generation and row deduplication.
 */

import type { AccountId } from "@resource-tracker/core";
import type { NormalizedRow, DeduplicatedRow } from "./types.ts";

/**
 * Generate a deterministic deduplication key for a normalized transaction row.
 *
 * Factors in:
 * - accountId
 * - date (YYYY-MM-DD)
 * - amountPaise (exact integer paise)
 * - normalized description (trimmed, lowercase)
 * - reference / check number (if present)
 * - occurrenceIndex (handles legitimate multiple same-day identical transactions)
 *
 * @param row - The normalized transaction row
 * @param accountId - The target account ID
 * @param occurrenceIndex - 0-based index for identical transactions on the same day
 * @returns Deterministic string deduplication key
 */
export function generateDedupeKey(
  row: NormalizedRow,
  accountId: AccountId,
  occurrenceIndex: number = 0,
): string {
  const normDesc = row.description.trim().toLowerCase().replace(/\s+/g, " ");
  const ref = (row.reference ?? "").trim().toLowerCase();
  return `${accountId}:${row.date}:${row.kind}:${row.amountPaise}:${ref}:${normDesc}:${occurrenceIndex}`;
}

/**
 * Deduplicate a batch of normalized rows against both an existing set of keys
 * and duplicates within the batch itself.
 *
 * @param rows - Array of normalized rows to deduplicate
 * @param existingKeys - Keys already persisted in the ledger/store
 * @param accountId - Target account identifier
 * @returns Deduplicated rows with attached `dedupeKey` and the count of skipped duplicates
 */
export function deduplicateRows(
  rows: readonly NormalizedRow[],
  existingKeys: ReadonlySet<string> = new Set(),
  accountId: AccountId,
): {
  readonly unique: readonly DeduplicatedRow[];
  readonly duplicateCount: number;
} {
  const unique: DeduplicatedRow[] = [];
  const seenInBatch = new Map<string, number>();
  let duplicateCount = 0;

  for (const row of rows) {
    // Base fingerprint without occurrence index
    const normDesc = row.description.trim().toLowerCase().replace(/\s+/g, " ");
    const ref = (row.reference ?? "").trim().toLowerCase();
    const baseFingerprint = `${accountId}:${row.date}:${row.kind}:${row.amountPaise}:${ref}:${normDesc}`;

    // Occurrence index tracks identical transactions within this batch
    const occurrenceIndex = seenInBatch.get(baseFingerprint) ?? 0;
    seenInBatch.set(baseFingerprint, occurrenceIndex + 1);

    const key = `${baseFingerprint}:${occurrenceIndex}`;

    if (existingKeys.has(key)) {
      duplicateCount++;
    } else {
      unique.push({
        ...row,
        dedupeKey: key,
      });
    }
  }

  return { unique, duplicateCount };
}

