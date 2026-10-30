import { calendarDate, paise } from "@resource-tracker/core";
import type { InstrumentId, CalendarDate } from "@resource-tracker/core";
import type { MarketPrice, NAVEntry } from "./types.ts";

/**
 * Month name abbreviations used in the AMFI date format (dd-Mon-yyyy).
 */
const MONTH_MAP: Record<string, string> = {
  Jan: "01",
  Feb: "02",
  Mar: "03",
  Apr: "04",
  May: "05",
  Jun: "06",
  Jul: "07",
  Aug: "08",
  Sep: "09",
  Oct: "10",
  Nov: "11",
  Dec: "12",
};

/**
 * Parse a date string in `dd-Mon-yyyy` format (e.g. "31-Jan-2025") to CalendarDate.
 * Returns `null` if the format is invalid.
 */
function parseAmfiDate(raw: string): CalendarDate | null {
  const match = /^(\d{2})-([A-Za-z]{3})-(\d{4})$/.exec(raw.trim());
  if (!match) return null;

  const [, day, monthStr, year] = match;
  const month =
    MONTH_MAP[
      monthStr!.charAt(0).toUpperCase() + monthStr!.slice(1).toLowerCase()
    ];
  if (!month || !day || !year) return null;

  try {
    return calendarDate(`${year}-${month}-${day}`);
  } catch {
    return null;
  }
}

/**
 * Parse a single semicolon-delimited NAV line from the AMFI NAVAll.txt format.
 *
 * Expected format:
 * ```
 * schemeCode;isinGrowth;isinDivReinv;schemeName;navValue;dd-Mon-yyyy
 * ```
 *
 * Lines that are headers, blank, or AMC name lines are skipped (returns `null`).
 *
 * @param line - A single line from the AMFI NAV text file
 * @returns Parsed NAVEntry, or `null` if the line is not a valid data row
 */
export function parseNAVLine(line: string): NAVEntry | null {
  const trimmed = line.trim();
  if (trimmed.length === 0) return null;

  const parts = trimmed.split(";");
  if (parts.length < 6) return null;

  const schemeCode = parts[0]!.trim();
  const isinGrowth = parts[1]!.trim();
  const schemeName = parts[3]!.trim();
  const navRaw = parts[4]!.trim();
  const dateRaw = parts[5]!.trim();

  // Skip header line
  if (schemeCode.toLowerCase() === "scheme code") return null;

  // Scheme code should be numeric
  if (!/^\d+$/.test(schemeCode)) return null;

  const navValue = parseFloat(navRaw);
  if (!Number.isFinite(navValue) || navValue < 0) return null;

  const date = parseAmfiDate(dateRaw);
  if (!date) return null;

  const entry: NAVEntry = {
    schemeCode,
    schemeName,
    navValue,
    date,
  };

  // Attach ISIN if present
  if (isinGrowth.length > 0) {
    return { ...entry, isin: isinGrowth };
  }

  return entry;
}

/**
 * Parse an entire AMFI NAV text blob into structured NAVEntry records.
 *
 * The text format has:
 * - Header line(s) with column names
 * - Blank lines separating AMCs
 * - AMC name lines (no semicolons or fewer than 6 fields)
 * - Data lines with scheme details
 *
 * @param text - The full text content of an AMFI NAV file
 * @returns Array of successfully parsed NAVEntry records
 */
export function parseNAVData(text: string): NAVEntry[] {
  const lines = text.split("\n");
  const entries: NAVEntry[] = [];

  for (const line of lines) {
    const entry = parseNAVLine(line);
    if (entry !== null) {
      entries.push(entry);
    }
  }

  return entries;
}

/**
 * Convert parsed NAV entries into MarketPrice records using a scheme-to-instrument mapping.
 *
 * Only entries whose `schemeCode` appears in the mapping are converted.
 * NAV values (decimal) are multiplied by 100 and rounded to produce Paise values.
 *
 * @param entries - Parsed NAV entries
 * @param schemeToInstrument - Map from AMFI scheme code to InstrumentId
 * @returns Array of MarketPrice records
 */
export function navToMarketPrices(
  entries: readonly NAVEntry[],
  schemeToInstrument: Map<string, InstrumentId>,
): MarketPrice[] {
  const results: MarketPrice[] = [];
  const now = new Date().toISOString();

  for (const entry of entries) {
    const instrumentId = schemeToInstrument.get(entry.schemeCode);
    if (instrumentId === undefined) continue;

    results.push({
      instrumentId,
      date: entry.date,
      valuePaise: paise(Math.round(entry.navValue * 100)),
      source: "amfi_nav",
      fetchedAt: now,
    });
  }

  return results;
}
