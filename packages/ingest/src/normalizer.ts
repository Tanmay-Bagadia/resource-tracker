/**
 * @module normalizer
 * Converts raw parsed rows into NormalizedRow based on detected source format.
 */

import type {
  NormalizedRow,
  IngestOptions,
  IngestError,
  SourceFormat,
  CalendarDate,
  Paise,
  EntryKind,
} from "./types.ts";

/**
 * Normalize raw parsed rows into NormalizedRow format.
 *
 * Maps bank-specific column names to canonical fields, parses dates and amounts,
 * classifies entry kind, and flags rows requiring review.
 *
 * @param rows - Raw parsed rows (e.g. from CSV parser)
 * @param source - Detected or overridden source format
 * @param options - Ingestion options (account ID, date format override, etc.)
 * @returns Normalized rows and any errors encountered
 */
export function normalizeRows(
  rows: Record<string, string>[],
  source: SourceFormat,
  options: IngestOptions,
): { normalized: NormalizedRow[]; errors: IngestError[] } {
  const normalized: NormalizedRow[] = [];
  const errors: IngestError[] = [];
  const startIdx = options.skipRows ?? 0;

  for (let i = startIdx; i < rows.length; i++) {
    const raw = rows[i]!;
    const rowNum = i + 1; // 1-based for error reporting

    const result = normalizeRow(raw, source, options, rowNum);
    if (result.row) {
      normalized.push(result.row);
    }
    if (result.errors.length > 0) {
      errors.push(...result.errors);
    }
  }

  return { normalized, errors };
}

/** Column mapping specification for a bank format */
interface ColumnMapping {
  dateCol: string;
  descriptionCol: string;
  debitCol?: string;
  creditCol?: string;
  amountCol?: string;
  balanceCol?: string;
  referenceCol?: string;
}

/** Get column mapping for a source format */
function getColumnMapping(source: SourceFormat): ColumnMapping {
  switch (source) {
    case "hdfc_bank":
      return {
        dateCol: "Date",
        descriptionCol: "Narration",
        debitCol: "Withdrawal Amt.",
        creditCol: "Deposit Amt.",
        balanceCol: "Closing Balance",
        referenceCol: "Chq./Ref.No.",
      };
    case "icici_bank":
      return {
        dateCol: "Transaction Date",
        descriptionCol: "Description",
        debitCol: "Debit",
        creditCol: "Credit",
        balanceCol: "Balance",
      };
    case "sbi_bank":
      return {
        dateCol: "Txn Date",
        descriptionCol: "Description",
        debitCol: "Debit",
        creditCol: "Credit",
        balanceCol: "Balance",
      };
    case "axis_bank":
      return {
        dateCol: "Tran Date",
        descriptionCol: "PARTICULARS",
        debitCol: "DR",
        creditCol: "CR",
        balanceCol: "BAL",
        referenceCol: "CHQNO",
      };
    case "generic_bank":
    case "mutual_fund_cas":
    case "unknown":
      return guessColumnMapping;
  }
}

/** Fallback mapping that guesses column names */
const guessColumnMapping: ColumnMapping = {
  dateCol: "Date",
  descriptionCol: "Description",
  debitCol: "Debit",
  creditCol: "Credit",
  balanceCol: "Balance",
  referenceCol: "Reference",
};

/**
 * Try to find a value from a row by trying multiple possible column names
 * (case-insensitive match).
 */
function findValue(
  row: Record<string, string>,
  primaryKey: string,
): string | undefined {
  // Exact match first
  if (primaryKey in row) {
    return row[primaryKey];
  }
  // Case-insensitive match
  const lowerKey = primaryKey.toLowerCase();
  for (const [key, value] of Object.entries(row)) {
    if (key.toLowerCase() === lowerKey) {
      return value;
    }
  }
  return undefined;
}

/** Normalize a single row */
function normalizeRow(
  raw: Record<string, string>,
  source: SourceFormat,
  options: IngestOptions,
  rowNum: number,
): { row: NormalizedRow | null; errors: IngestError[] } {
  const errors: IngestError[] = [];
  const mapping = getColumnMapping(source);

  // ── Date ───────────────────────────────────────────────────────────────
  const rawDate = findValue(raw, mapping.dateCol) ?? "";
  const parsedDate = parseDate(rawDate, options.dateFormat);
  let needsReview = false;
  let reviewReason: string | undefined;

  if (!parsedDate.date) {
    errors.push({
      row: rowNum,
      field: "date",
      message: parsedDate.error ?? "Unable to parse date",
      rawValue: rawDate,
    });
    return { row: null, errors };
  }

  if (parsedDate.ambiguous) {
    needsReview = true;
    reviewReason = "Ambiguous date: day and month are both ≤ 12";
  }

  // ── Description ────────────────────────────────────────────────────────
  const description = (findValue(raw, mapping.descriptionCol) ?? "").trim();

  // ── Amount ─────────────────────────────────────────────────────────────
  let amountPaise: number;
  let kind: EntryKind;

  if (mapping.debitCol && mapping.creditCol) {
    const debitStr = findValue(raw, mapping.debitCol) ?? "";
    const creditStr = findValue(raw, mapping.creditCol) ?? "";
    const debit = parseAmount(debitStr);
    const credit = parseAmount(creditStr);

    if (credit > 0) {
      amountPaise = credit;
      kind = "income";
    } else if (debit > 0) {
      amountPaise = debit;
      kind = "expense";
    } else if (mapping.amountCol) {
      // Fall back to single amount column
      const amt = parseAmount(findValue(raw, mapping.amountCol) ?? "");
      if (amt === 0) {
        needsReview = true;
        reviewReason = appendReason(reviewReason, "Zero amount");
      }
      amountPaise = Math.abs(amt);
      kind = amt < 0 ? "expense" : "income";
    } else {
      // Both debit and credit are zero/empty
      amountPaise = 0;
      kind = "expense";
      needsReview = true;
      reviewReason = appendReason(reviewReason, "Zero amount");
    }
  } else if (mapping.amountCol) {
    const amt = parseAmount(findValue(raw, mapping.amountCol) ?? "");
    amountPaise = Math.abs(amt);
    kind = amt < 0 ? "expense" : "income";
    if (amt === 0) {
      needsReview = true;
      reviewReason = appendReason(reviewReason, "Zero amount");
    }
  } else {
    // No amount columns found — try to guess
    const guessed = guessAmountFromRow(raw);
    amountPaise = Math.abs(guessed.amount);
    kind = guessed.amount < 0 ? "expense" : "income";
    if (guessed.amount === 0) {
      needsReview = true;
      reviewReason = appendReason(reviewReason, "Zero or unparseable amount");
    }
  }

  // ── Balance ────────────────────────────────────────────────────────────
  let balance: Paise | undefined;
  if (mapping.balanceCol) {
    const balStr = findValue(raw, mapping.balanceCol) ?? "";
    const balAmount = parseAmount(balStr);
    if (balStr.trim() !== "" && balAmount !== 0) {
      balance = balAmount as Paise;
    }
  }

  // ── Reference ──────────────────────────────────────────────────────────
  let reference: string | undefined;
  if (mapping.referenceCol) {
    const ref = findValue(raw, mapping.referenceCol) ?? "";
    if (ref.trim() !== "") {
      reference = ref.trim();
    }
  }

  return {
    row: {
      date: parsedDate.date,
      description,
      amountPaise: amountPaise as Paise,
      kind,
      balance,
      reference,
      needsReview,
      reviewReason,
      rawRow: raw,
    },
    errors,
  };
}

// ─── Date Parsing ─────────────────────────────────────────────────────────────

interface DateParseResult {
  date: CalendarDate | null;
  ambiguous: boolean;
  error?: string;
}

/**
 * Parse a date string into CalendarDate (YYYY-MM-DD) format.
 *
 * Supported formats:
 * - DD/MM/YYYY, DD-MM-YYYY
 * - DD/MM/YY, DD-MM-YY
 * - YYYY-MM-DD, YYYY/MM/DD
 *
 * @param raw - Raw date string
 * @param formatHint - Optional format hint (e.g. "DD/MM/YYYY")
 * @returns Parsed date result with ambiguity flag
 */
export function parseDate(raw: string, formatHint?: string): DateParseResult {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return { date: null, ambiguous: false, error: "Empty date value" };
  }

  // Try ISO format first: YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = trimmed.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (isoMatch) {
    const [, yearStr, monthStr, dayStr] = isoMatch;
    const year = parseInt(yearStr!, 10);
    const month = parseInt(monthStr!, 10);
    const day = parseInt(dayStr!, 10);
    if (isValidDate(year, month, day)) {
      return {
        date: formatCalendarDate(year, month, day),
        ambiguous: false,
      };
    }
    return {
      date: null,
      ambiguous: false,
      error: `Invalid ISO date: ${trimmed}`,
    };
  }

  // Try DD/MM/YYYY, DD-MM-YYYY, DD/MM/YY, DD-MM-YY
  const dmyMatch = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (dmyMatch) {
    const [, part1Str, part2Str, yearStr] = dmyMatch;
    const part1 = parseInt(part1Str!, 10);
    const part2 = parseInt(part2Str!, 10);
    let year = parseInt(yearStr!, 10);

    // Handle 2-digit year
    if (year < 100) {
      year = year < 50 ? 2000 + year : 1900 + year;
    }

    // Determine day/month based on hint or value analysis
    let day: number;
    let month: number;

    if (formatHint) {
      const upperHint = formatHint.toUpperCase();
      if (upperHint.startsWith("MM")) {
        // MM/DD/YYYY
        month = part1;
        day = part2;
      } else {
        // DD/MM/YYYY (default for India)
        day = part1;
        month = part2;
      }
    } else {
      // Default: DD/MM/YYYY (Indian convention)
      day = part1;
      month = part2;
    }

    if (isValidDate(year, month, day)) {
      // Flag as ambiguous if both parts could be day or month
      const ambiguous = part1 <= 12 && part2 <= 12 && part1 !== part2;
      return {
        date: formatCalendarDate(year, month, day),
        ambiguous,
      };
    }

    // If DD/MM didn't work, try MM/DD
    if (isValidDate(year, part1, part2)) {
      return {
        date: formatCalendarDate(year, part1, part2),
        ambiguous: false,
      };
    }

    return {
      date: null,
      ambiguous: false,
      error: `Invalid date components: day=${part1}, month=${part2}, year=${year}`,
    };
  }

  return {
    date: null,
    ambiguous: false,
    error: `Unrecognized date format: ${trimmed}`,
  };
}

/** Check if a year/month/day combination is valid */
function isValidDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || year < 1900 || year > 2100) {
    return false;
  }
  const daysInMonth = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  // Leap year check
  if (month === 2 && isLeapYear(year)) {
    return day <= 29;
  }
  return day <= daysInMonth[month]!;
}

/** Check if a year is a leap year */
function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Format a year/month/day into a CalendarDate string */
function formatCalendarDate(
  year: number,
  month: number,
  day: number,
): CalendarDate {
  const y = String(year).padStart(4, "0");
  const m = String(month).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${y}-${m}-${d}` as CalendarDate;
}

// ─── Amount Parsing ───────────────────────────────────────────────────────────

/**
 * Parse an amount string into paise (integer).
 *
 * Handles:
 * - Comma-separated numbers (1,00,000.50 or 1,000.50)
 * - Negative amounts (prefixed with -)
 * - Leading/trailing whitespace
 * - Empty strings (returns 0)
 *
 * @param raw - Raw amount string
 * @returns Amount in paise (integer)
 */
export function parseAmount(raw: string): number {
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed === "-") {
    return 0;
  }

  // Remove commas and whitespace within number
  const cleaned = trimmed.replace(/,/g, "").replace(/\s/g, "");

  const num = parseFloat(cleaned);
  if (isNaN(num)) {
    return 0;
  }

  // Convert to paise: multiply by 100 and round to avoid floating-point issues
  return Math.round(num * 100);
}

/** Try to guess the amount from any numeric-looking column in the row */
function guessAmountFromRow(row: Record<string, string>): { amount: number } {
  for (const value of Object.values(row)) {
    const cleaned = value.replace(/,/g, "").trim();
    const num = parseFloat(cleaned);
    if (!isNaN(num) && num !== 0) {
      return { amount: Math.round(num * 100) };
    }
  }
  return { amount: 0 };
}

/** Append a reason to an existing reviewReason string */
function appendReason(existing: string | undefined, newReason: string): string {
  if (existing) {
    return `${existing}; ${newReason}`;
  }
  return newReason;
}
