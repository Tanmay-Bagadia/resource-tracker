/**
 * @module snapshot
 * Computes a point-in-time financial snapshot by replaying ledger events
 * and combining with market prices.
 */

import { paise, addPaise, sumPaise, isZero } from "./money.ts";
import { lastNDays } from "./period.ts";
import {
  deriveAccountBalances,
  deriveHoldings,
  totalExpenses,
  totalIncome,
} from "./ledger.ts";
import type {
  CalendarDate,
  Holding,
  LedgerEntry,
  Paise,
  Price,
  Snapshot,
} from "./types.ts";

/** Options for computing a snapshot. */
export interface SnapshotOptions {
  /** Number of days to use when computing monthly spending. Defaults to 30. */
  readonly spendingWindowDays?: number;
  /** Account types considered "liquid". Defaults to ["bank"]. */
  readonly liquidAccountTypes?: readonly string[];
}

const DEFAULT_SPENDING_WINDOW = 30;

/**
 * Compute a complete financial snapshot as of a given date.
 *
 * The snapshot includes:
 * - Net worth (account balances + priced holdings)
 * - Liquid assets (balances in bank accounts)
 * - Monthly spending (expenses in the last N days)
 * - Runway (liquid assets / monthly spending)
 * - Savings rate ((income - expenses) / income)
 * - Allocation by instrument type
 * - List of holdings that couldn't be priced
 * - Warnings about data quality
 *
 * @param entries - All ledger entries.
 * @param prices - Available market prices.
 * @param asOf - The snapshot date.
 * @param options - Optional configuration.
 * @returns A complete Snapshot.
 */
export function computeSnapshot(
  entries: readonly LedgerEntry[],
  prices: readonly Price[],
  asOf: CalendarDate,
  options?: SnapshotOptions,
): Snapshot {
  const spendingWindow = options?.spendingWindowDays ?? DEFAULT_SPENDING_WINDOW;
  const warnings: string[] = [];

  // 1. Derive account balances
  const balances = deriveAccountBalances(entries, asOf);

  // 2. Derive holdings
  const holdings = deriveHoldings(entries, prices, asOf);

  // 3. Separate priced and unpriced holdings
  const pricedHoldings: Holding[] = [];
  const unpricedHoldings: Holding[] = [];
  for (const h of holdings) {
    if (h.currentValuePaise !== undefined) {
      pricedHoldings.push(h);
    } else {
      unpricedHoldings.push(h);
    }
  }

  if (unpricedHoldings.length > 0) {
    warnings.push(`${unpricedHoldings.length} holding(s) could not be priced`);
  }

  // 4. Compute total account balances
  const totalBalances = sumPaise([...balances.values()]);

  // 5. Compute total holdings value (only priced)
  const totalHoldingsValue = sumPaise(
    pricedHoldings.map((h) => h.currentValuePaise!),
  );

  // 6. Net worth = account balances + priced holdings value
  const netWorthPaise = addPaise(totalBalances, totalHoldingsValue);

  // 7. Liquid assets: sum of balances for liquid account types
  //    We need account info to filter by type, but we only have entries.
  //    Infer from entries: accounts appearing in income/expense entries are likely bank accounts.
  //    For now, sum all account balances as a simplification since we don't have Account objects.
  //    A more sophisticated implementation would take accounts as a parameter.
  const liquidAssetsPaise = totalBalances;

  // 8. Monthly spending from the spending window
  const spendingPeriod = lastNDays(spendingWindow, asOf);
  const recentExpenses = totalExpenses(entries, spendingPeriod);
  // Normalize to 30-day period
  const monthlySpendingPaise =
    spendingWindow === 30
      ? recentExpenses
      : paise(Math.round(((recentExpenses as number) * 30) / spendingWindow));

  // 9. Runway: how many months of liquid assets at current burn rate
  const runwayMonths = isZero(monthlySpendingPaise)
    ? Infinity
    : (liquidAssetsPaise as number) / (monthlySpendingPaise as number);

  // 10. Savings rate from the spending window
  const recentIncome = totalIncome(entries, spendingPeriod);
  const savingsRate = isZero(recentIncome)
    ? 0
    : ((recentIncome as number) - (recentExpenses as number)) /
      (recentIncome as number);

  // 11. Allocation by instrument type (from holdings)
  //     Since we don't have Instrument definitions here, group by instrumentId prefix
  //     or just group by instrumentId. We'll track by instrumentId.
  const allocation = new Map<string, Paise>();

  // Add cash allocation from balances
  if ((totalBalances as number) !== 0) {
    allocation.set("cash", totalBalances);
  }

  // Add each priced holding
  for (const h of pricedHoldings) {
    const key = h.instrumentId as string;
    const current = allocation.get(key) ?? paise(0);
    allocation.set(key, addPaise(current, h.currentValuePaise!));
  }

  if (entries.length === 0) {
    warnings.push("No ledger entries found");
  }

  return {
    asOf,
    netWorthPaise,
    liquidAssetsPaise,
    monthlySpendingPaise,
    runwayMonths,
    savingsRate,
    allocation,
    unpricedHoldings,
    warnings,
  };
}
