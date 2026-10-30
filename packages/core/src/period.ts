/**
 * @module period
 * Date-range utilities for financial reporting periods.
 * All functions are pure and take explicit date parameters.
 */

import type { CalendarDate } from "./types.ts";

/** A date range with inclusive start and end boundaries. */
export interface Period {
  readonly start: CalendarDate;
  readonly end: CalendarDate;
}

/**
 * Create a CalendarDate from a Date object by extracting its YYYY-MM-DD representation.
 * The date is interpreted in UTC to avoid timezone issues.
 */
function dateToCalendarDate(d: Date): CalendarDate {
  return d.toISOString().slice(0, 10) as CalendarDate;
}

/**
 * Parse a CalendarDate string into a Date object (at midnight UTC).
 */
function parseCalendarDate(cd: CalendarDate): Date {
  return new Date(cd + "T00:00:00Z");
}

/**
 * Return a period covering the last N days ending on `asOf` (inclusive).
 * For example, lastNDays(30, "2025-06-15") returns the period from
 * 2025-05-17 to 2025-06-15 (both inclusive, spanning 30 days).
 *
 * @param n - Number of days. Must be >= 1.
 * @param asOf - The end date of the period.
 * @returns A Period spanning n days ending at asOf.
 * @throws If n < 1.
 */
export function lastNDays(n: number, asOf: CalendarDate): Period {
  if (n < 1) {
    throw new RangeError("n must be at least 1");
  }
  const endDate = parseCalendarDate(asOf);
  const startDate = new Date(endDate);
  startDate.setUTCDate(startDate.getUTCDate() - (n - 1));
  return {
    start: dateToCalendarDate(startDate),
    end: asOf,
  };
}

/**
 * Return a period covering a full calendar month.
 *
 * @param year - The year (e.g. 2025).
 * @param month - The month (1-12).
 * @returns A Period from the first to the last day of the month.
 * @throws If month is not 1-12.
 */
export function calendarMonth(year: number, month: number): Period {
  if (month < 1 || month > 12) {
    throw new RangeError("month must be between 1 and 12");
  }
  const start = new Date(Date.UTC(year, month - 1, 1));
  // Last day of month: day 0 of the next month
  const end = new Date(Date.UTC(year, month, 0));
  return {
    start: dateToCalendarDate(start),
    end: dateToCalendarDate(end),
  };
}

/**
 * Return the Indian financial year period for a given start year.
 * Indian FY runs from April 1 of startYear to March 31 of startYear+1.
 * For example, financialYear(2025) returns Apr 1 2025 - Mar 31 2026.
 *
 * @param startYear - The year in which the FY begins.
 * @returns A Period spanning the full Indian financial year.
 */
export function financialYear(startYear: number): Period {
  const start = new Date(Date.UTC(startYear, 3, 1)); // April 1
  const end = new Date(Date.UTC(startYear + 1, 2, 31)); // March 31
  return {
    start: dateToCalendarDate(start),
    end: dateToCalendarDate(end),
  };
}

/**
 * Check if a date falls within a period (inclusive on both ends).
 *
 * @param date - The date to check.
 * @param period - The period to check against.
 * @returns True if date >= period.start and date <= period.end.
 */
export function isWithinPeriod(date: CalendarDate, period: Period): boolean {
  return date >= period.start && date <= period.end;
}

/**
 * Calculate the number of days in a period (inclusive of both start and end).
 *
 * @param period - The period to measure.
 * @returns Number of days in the period.
 */
export function periodDays(period: Period): number {
  const startMs = parseCalendarDate(period.start).getTime();
  const endMs = parseCalendarDate(period.end).getTime();
  const diffMs = endMs - startMs;
  return Math.floor(diffMs / (24 * 60 * 60 * 1000)) + 1;
}
