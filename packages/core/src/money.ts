/**
 * @module money
 * Fixed-point integer money representation using Indian Paise.
 * All monetary values are stored as integers in minor units (paise).
 * 1 INR = 100 paise. Never uses floating-point for money storage.
 */

import type { Paise } from "./types.ts";

/**
 * Create a Paise value from an integer.
 * @param n - Integer number of paise. Must be a safe integer.
 * @returns The branded Paise value.
 * @throws If n is not a safe integer.
 */
export function paise(n: number): Paise {
  if (!Number.isSafeInteger(n)) {
    throw new RangeError(`Paise must be a safe integer, got ${n}`);
  }
  return n as Paise;
}

/**
 * Convert a rupee amount (possibly fractional) to paise, rounding to nearest integer.
 * @param rupees - Amount in rupees (e.g. 100.50).
 * @returns The equivalent Paise value.
 */
export function fromRupees(rupees: number): Paise {
  return paise(Math.round(rupees * 100));
}

/**
 * Convert paise to rupees as a floating-point number. For display purposes only.
 * @param p - Paise value to convert.
 * @returns The rupee amount as a float.
 */
export function toRupees(p: Paise): number {
  return (p as number) / 100;
}

/**
 * Add two Paise values.
 * @param a - First operand.
 * @param b - Second operand.
 * @returns Sum as Paise.
 */
export function addPaise(a: Paise, b: Paise): Paise {
  return paise((a as number) + (b as number));
}

/**
 * Subtract b from a in Paise. Result may be negative.
 * @param a - Minuend.
 * @param b - Subtrahend.
 * @returns Difference as Paise.
 */
export function subtractPaise(a: Paise, b: Paise): Paise {
  return paise((a as number) - (b as number));
}

/**
 * Multiply a Paise value by a factor, rounding to integer paise.
 * @param p - The Paise value.
 * @param factor - Multiplication factor (may be fractional).
 * @param rounding - Rounding strategy: 'round' (default), 'floor', or 'ceil'.
 * @returns The product as Paise.
 */
export function multiplyPaise(
  p: Paise,
  factor: number,
  rounding: "round" | "floor" | "ceil" = "round",
): Paise {
  const raw = (p as number) * factor;
  switch (rounding) {
    case "floor":
      return paise(Math.floor(raw));
    case "ceil":
      return paise(Math.ceil(raw));
    case "round":
    default:
      return paise(Math.round(raw));
  }
}

/**
 * Check if a Paise value is zero.
 * @param p - The Paise value.
 * @returns True if zero.
 */
export function isZero(p: Paise): boolean {
  return (p as number) === 0;
}

/**
 * Check if a Paise value is negative.
 * @param p - The Paise value.
 * @returns True if negative.
 */
export function isNegative(p: Paise): boolean {
  return (p as number) < 0;
}

/**
 * Compare two Paise values.
 * @param a - First value.
 * @param b - Second value.
 * @returns -1 if a < b, 0 if equal, 1 if a > b.
 */
export function comparePaise(a: Paise, b: Paise): -1 | 0 | 1 {
  const diff = (a as number) - (b as number);
  if (diff < 0) return -1;
  if (diff > 0) return 1;
  return 0;
}

/**
 * Format a Paise value as an Indian Rupee string with lakh/crore grouping.
 * Uses the pattern: ₹X,XX,XXX.XX
 * Negative values are prefixed with a minus sign: -₹1,000.00
 *
 * @param p - The Paise value to format.
 * @returns Formatted string like "₹1,00,000.50".
 */
export function formatINR(p: Paise): string {
  const raw = p as number;
  const negative = raw < 0;
  const abs = Math.abs(raw);
  const rupees = Math.floor(abs / 100);
  const paisePart = abs % 100;
  const paiseStr = paisePart.toString().padStart(2, "0");

  const rupeesStr = rupees.toString();

  let grouped: string;
  if (rupeesStr.length <= 3) {
    grouped = rupeesStr;
  } else {
    // First group is last 3 digits, then groups of 2 from right
    const lastThree = rupeesStr.slice(-3);
    const remaining = rupeesStr.slice(0, -3);
    const chunks: string[] = [];
    for (let i = remaining.length; i > 0; i -= 2) {
      const start = Math.max(0, i - 2);
      chunks.unshift(remaining.slice(start, i));
    }
    grouped = chunks.join(",") + "," + lastThree;
  }

  return `${negative ? "-" : ""}₹${grouped}.${paiseStr}`;
}

/**
 * Sum an array of Paise values. Returns zero for an empty array.
 * @param amounts - Array of Paise values.
 * @returns The sum as Paise.
 */
export function sumPaise(amounts: readonly Paise[]): Paise {
  let total = 0;
  for (const a of amounts) {
    total += a as number;
  }
  return paise(total);
}
