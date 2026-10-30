/**
 * @module validator
 * Zod schemas and validation helpers for the ingestion pipeline.
 */

import { z } from "zod";
import {
  CalendarDateSchema,
  PaiseSchema,
  AccountIdSchema,
  EntryKindEnum,
  ok,
  err,
} from "@resource-tracker/core";
import type { Result } from "@resource-tracker/core";
import type { NormalizedRow, IngestOptions, IngestError } from "./types.ts";

export const SourceFormatEnum = z.enum([
  "hdfc_bank",
  "icici_bank",
  "sbi_bank",
  "axis_bank",
  "generic_bank",
  "mutual_fund_cas",
  "unknown",
]);

export const NormalizedRowSchema: z.ZodType<
  NormalizedRow,
  z.ZodTypeDef,
  unknown
> = z.object({
  date: CalendarDateSchema,
  description: z.string(),
  amountPaise: PaiseSchema,
  kind: EntryKindEnum,
  balance: PaiseSchema.optional(),
  reference: z.string().optional(),
  category: z.string().optional(),
  needsReview: z.boolean(),
  reviewReason: z.string().optional(),
  rawRow: z.record(z.string()),
});

export const IngestOptionsSchema: z.ZodType<
  IngestOptions,
  z.ZodTypeDef,
  unknown
> = z.object({
  accountId: AccountIdSchema,
  format: SourceFormatEnum.optional(),
  dateFormat: z.string().optional(),
  skipRows: z.number().int().nonnegative().optional(),
  existingKeys: z
    .custom<ReadonlySet<string>>((val) => val instanceof Set)
    .optional(),
});

/**
 * Validate a single row against the NormalizedRow schema.
 *
 * @param row - Candidate row object
 * @param rowNum - Row index for error reporting
 * @returns Ok with typed NormalizedRow or Err with structured IngestErrors
 */
export function validateRow(
  row: unknown,
  rowNum: number = 1,
): Result<NormalizedRow, IngestError[]> {
  const result = NormalizedRowSchema.safeParse(row);
  if (result.success) {
    return ok(result.data as NormalizedRow);
  }

  const errors: IngestError[] = result.error.issues.map((issue) => ({
    row: rowNum,
    field: issue.path.join("."),
    message: issue.message,
    rawValue: String(
      (row as Record<string, unknown>)?.[issue.path[0] as string] ?? "",
    ),
  }));

  return err(errors);
}

/**
 * Validate an array of candidate rows.
 *
 * @param rows - Array of objects to validate
 * @returns Object separating valid rows from accumulated errors
 */
export function validateBatch(rows: readonly unknown[]): {
  readonly valid: readonly NormalizedRow[];
  readonly errors: readonly IngestError[];
} {
  const valid: NormalizedRow[] = [];
  const errors: IngestError[] = [];

  for (let i = 0; i < rows.length; i++) {
    const res = validateRow(rows[i], i + 1);
    if (res.ok) {
      valid.push(res.value);
    } else {
      errors.push(...res.error);
    }
  }

  return { valid, errors };
}
