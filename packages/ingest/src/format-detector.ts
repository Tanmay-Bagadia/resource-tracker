/**
 * @module format-detector
 * Detects the input format (CSV/JSON) and bank/source format from content.
 */

import { parseCSV } from "./csv-parser.ts";
import type {
  FormatDetectionResult,
  SourceFormat,
  Confidence,
} from "./types.ts";

/** Header fingerprints for known bank statement formats */
const BANK_HEADER_PATTERNS: ReadonlyArray<{
  source: SourceFormat;
  requiredHeaders: ReadonlyArray<string>;
  confidence: Confidence;
}> = [
  {
    source: "hdfc_bank",
    requiredHeaders: [
      "Date",
      "Narration",
      "Chq./Ref.No.",
      "Value Dt",
      "Withdrawal Amt.",
      "Deposit Amt.",
      "Closing Balance",
    ],
    confidence: "high",
  },
  {
    source: "icici_bank",
    requiredHeaders: [
      "Transaction Date",
      "Value Date",
      "Description",
      "Debit",
      "Credit",
      "Balance",
    ],
    confidence: "high",
  },
  {
    source: "sbi_bank",
    requiredHeaders: ["Txn Date", "Description", "Debit", "Credit", "Balance"],
    confidence: "high",
  },
  {
    source: "axis_bank",
    requiredHeaders: ["Tran Date", "CHQNO", "PARTICULARS", "DR", "CR", "BAL"],
    confidence: "high",
  },
];

/**
 * Detect the input format and bank/source type from raw content.
 *
 * Detection strategy:
 * 1. Check if content is JSON (starts with `[` or `{`)
 * 2. Otherwise, parse as CSV and match headers against known bank patterns
 * 3. If no known bank matches, check for generic date/amount-like columns
 * 4. Fall back to "unknown"
 *
 * @param content - Raw file content (CSV or JSON string)
 * @returns Detection result with format, source, confidence, and headers
 */
export function detectFormat(content: string): FormatDetectionResult {
  const trimmed = content.trim();

  if (trimmed.length === 0) {
    return {
      format: "csv",
      source: "unknown",
      confidence: "low",
      headers: [],
    };
  }

  // Detect JSON
  const firstChar = trimmed[0];
  if (firstChar === "[" || firstChar === "{") {
    return detectJSONFormat(trimmed);
  }

  // Assume CSV
  return detectCSVFormat(content);
}

/**
 * Detect the source format of JSON content.
 */
function detectJSONFormat(content: string): FormatDetectionResult {
  try {
    const parsed: unknown = JSON.parse(content);
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    if (arr.length > 0 && typeof arr[0] === "object" && arr[0] !== null) {
      const headers = Object.keys(arr[0] as Record<string, unknown>);
      const source = matchSource(headers);
      return {
        format: "json",
        source: source.source,
        confidence: source.confidence,
        headers,
      };
    }
    return {
      format: "json",
      source: "unknown",
      confidence: "low",
      headers: [],
    };
  } catch {
    // If JSON parsing fails, treat as CSV
    return detectCSVFormat(content);
  }
}

/**
 * Detect the source format of CSV content by parsing headers.
 */
function detectCSVFormat(content: string): FormatDetectionResult {
  const rows = parseCSV(content);
  if (rows.length === 0) {
    return { format: "csv", source: "unknown", confidence: "low", headers: [] };
  }

  const headers = Object.keys(rows[0]!);
  const source = matchSource(headers);

  return {
    format: "csv",
    source: source.source,
    confidence: source.confidence,
    headers,
  };
}

/**
 * Match headers against known bank patterns.
 */
function matchSource(headers: string[]): {
  source: SourceFormat;
  confidence: Confidence;
} {
  const normalizedHeaders = new Set(headers.map((h) => h.trim().toLowerCase()));

  // Try exact matches against known bank patterns
  for (const pattern of BANK_HEADER_PATTERNS) {
    const matchCount = pattern.requiredHeaders.filter((required) =>
      normalizedHeaders.has(required.toLowerCase()),
    ).length;

    if (matchCount === pattern.requiredHeaders.length) {
      return { source: pattern.source, confidence: pattern.confidence };
    }
  }

  // Check for generic bank statement patterns
  if (hasDateLikeColumn(headers) && hasAmountLikeColumn(headers)) {
    return { source: "generic_bank", confidence: "medium" };
  }

  return { source: "unknown", confidence: "low" };
}

/** Check if any header looks like a date column */
function hasDateLikeColumn(headers: string[]): boolean {
  const datePatterns = /\b(date|dt|txn\s*date|trans.*date|value\s*date)\b/i;
  return headers.some((h) => datePatterns.test(h));
}

/** Check if any header looks like an amount column */
function hasAmountLikeColumn(headers: string[]): boolean {
  const amountPatterns =
    /\b(amount|amt|debit|credit|withdrawal|deposit|dr|cr|balance|bal)\b/i;
  return headers.some((h) => amountPatterns.test(h));
}
