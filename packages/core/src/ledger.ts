/**
 * @module ledger
 * Append-only event ledger operations. All state is derived by replaying
 * immutable LedgerEntry events from scratch.
 */

import {
  paise,
  addPaise,
  subtractPaise,
  sumPaise,
  multiplyPaise,
} from "./money.ts";
import { isWithinPeriod } from "./period.ts";
import type { Period } from "./period.ts";
import type {
  AccountId,
  CalendarDate,
  Holding,
  InstrumentId,
  LedgerEntry,
  Paise,
  Price,
} from "./types.ts";

/**
 * Replay the full ledger to derive the balance of every account as of a given date.
 *
 * Balance semantics per entry kind:
 * - income/dividend/interest: +amountPaise to accountId
 * - expense/fee: -amountPaise from accountId
 * - transfer: -amountPaise from accountId, +amountPaise to toAccountId
 * - buy/sip: -amountPaise from accountId (cash goes out to buy instrument)
 * - sell: +amountPaise to accountId (cash comes back from selling instrument)
 *
 * @param entries - All ledger entries (order does not matter for sums).
 * @param asOf - Only entries on or before this date are included.
 * @returns A Map from AccountId to net balance in Paise.
 */
export function deriveAccountBalances(
  entries: readonly LedgerEntry[],
  asOf: CalendarDate,
): Map<AccountId, Paise> {
  const balances = new Map<AccountId, Paise>();

  const addToAccount = (accountId: AccountId, amount: Paise): void => {
    const current = balances.get(accountId) ?? paise(0);
    balances.set(accountId, addPaise(current, amount));
  };

  const subFromAccount = (accountId: AccountId, amount: Paise): void => {
    const current = balances.get(accountId) ?? paise(0);
    balances.set(accountId, subtractPaise(current, amount));
  };

  for (const entry of entries) {
    if (entry.date > asOf) continue;

    switch (entry.kind) {
      case "income":
      case "dividend":
      case "interest":
        addToAccount(entry.accountId, entry.amountPaise);
        break;

      case "expense":
      case "fee":
        subFromAccount(entry.accountId, entry.amountPaise);
        break;

      case "transfer":
        subFromAccount(entry.accountId, entry.amountPaise);
        addToAccount(entry.toAccountId, entry.amountPaise);
        break;

      case "buy":
      case "sip":
        subFromAccount(entry.accountId, entry.amountPaise);
        break;

      case "sell":
        addToAccount(entry.accountId, entry.amountPaise);
        break;
    }
  }

  return balances;
}

/**
 * Replay the ledger from scratch to derive account balances. Same as
 * deriveAccountBalances but without an asOf filter — processes all entries.
 * Must be deterministic: same events always produce same output regardless of order.
 *
 * @param entries - All ledger entries.
 * @returns A Map from AccountId to net balance in Paise.
 */
export function replayLedger(
  entries: readonly LedgerEntry[],
): Map<AccountId, Paise> {
  // Sort by date then by id for deterministic processing
  const sorted = [...entries].sort((a, b) => {
    const dateCmp = a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
    if (dateCmp !== 0) return dateCmp;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  const balances = new Map<AccountId, Paise>();

  const addToAccount = (accountId: AccountId, amount: Paise): void => {
    const current = balances.get(accountId) ?? paise(0);
    balances.set(accountId, addPaise(current, amount));
  };

  const subFromAccount = (accountId: AccountId, amount: Paise): void => {
    const current = balances.get(accountId) ?? paise(0);
    balances.set(accountId, subtractPaise(current, amount));
  };

  for (const entry of sorted) {
    switch (entry.kind) {
      case "income":
      case "dividend":
      case "interest":
        addToAccount(entry.accountId, entry.amountPaise);
        break;

      case "expense":
      case "fee":
        subFromAccount(entry.accountId, entry.amountPaise);
        break;

      case "transfer":
        subFromAccount(entry.accountId, entry.amountPaise);
        addToAccount(entry.toAccountId, entry.amountPaise);
        break;

      case "buy":
      case "sip":
        subFromAccount(entry.accountId, entry.amountPaise);
        break;

      case "sell":
        addToAccount(entry.accountId, entry.amountPaise);
        break;
    }
  }

  return balances;
}

/** Composite key for tracking holdings per account+instrument pair. */
function holdingKey(accountId: AccountId, instrumentId: InstrumentId): string {
  return `${accountId}::${instrumentId}`;
}

/** Mutable accumulator for building a Holding. */
interface HoldingAccumulator {
  instrumentId: InstrumentId;
  accountId: AccountId;
  units: number;
  totalCostPaise: number; // raw number for accumulation
}

/**
 * Derive current holdings from buy/sell/sip events up to asOf.
 * Computes average cost using the running weighted average method.
 * Attaches current market value from prices when available.
 *
 * @param entries - All ledger entries.
 * @param prices - Available market prices.
 * @param asOf - Only entries on or before this date are considered.
 * @returns Array of Holding objects with non-zero units.
 */
export function deriveHoldings(
  entries: readonly LedgerEntry[],
  prices: readonly Price[],
  asOf: CalendarDate,
): Holding[] {
  const accumulators = new Map<string, HoldingAccumulator>();

  // Sort for deterministic processing
  const sorted = [...entries].sort((a, b) => {
    const dateCmp = a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
    if (dateCmp !== 0) return dateCmp;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  for (const entry of sorted) {
    if (entry.date > asOf) continue;

    if (entry.kind === "buy" || entry.kind === "sip") {
      const key = holdingKey(entry.accountId, entry.instrumentId);
      const acc = accumulators.get(key) ?? {
        instrumentId: entry.instrumentId,
        accountId: entry.accountId,
        units: 0,
        totalCostPaise: 0,
      };
      acc.units += entry.units;
      acc.totalCostPaise += entry.amountPaise as number;
      accumulators.set(key, acc);
    } else if (entry.kind === "sell") {
      const key = holdingKey(entry.accountId, entry.instrumentId);
      const acc = accumulators.get(key);
      if (acc) {
        // Reduce cost proportionally on sell
        if (acc.units > 0) {
          const costPerUnit = acc.totalCostPaise / acc.units;
          acc.units -= entry.units;
          acc.totalCostPaise = Math.round(costPerUnit * Math.max(0, acc.units));
        } else {
          acc.units -= entry.units;
        }
      }
    }
  }

  // Build a price lookup: instrumentId -> latest price on or before asOf
  const latestPrices = new Map<string, Paise>();
  for (const p of prices) {
    if (p.date > asOf) continue;
    const existing = latestPrices.get(p.instrumentId as string);
    // We want the most recent price; if two on same date, take latest fetchedAt
    if (existing === undefined) {
      latestPrices.set(p.instrumentId as string, p.valuePaise);
    } else {
      // Keep the price - we'd need to compare dates, but simple approach:
      // just overwrite if this price date is later
      const existingEntry = prices.find(
        (pp) =>
          pp.instrumentId === p.instrumentId && pp.valuePaise === existing,
      );
      if (existingEntry && p.date >= existingEntry.date) {
        latestPrices.set(p.instrumentId as string, p.valuePaise);
      }
    }
  }

  // Optimized price lookup: build properly
  const bestPrices = new Map<
    string,
    { date: CalendarDate; valuePaise: Paise }
  >();
  for (const p of prices) {
    if (p.date > asOf) continue;
    const key = p.instrumentId as string;
    const existing = bestPrices.get(key);
    if (!existing || p.date > existing.date) {
      bestPrices.set(key, { date: p.date, valuePaise: p.valuePaise });
    }
  }

  const holdings: Holding[] = [];
  for (const acc of accumulators.values()) {
    // Skip zero-unit holdings (fully sold)
    if (Math.abs(acc.units) < 1e-10) continue;

    const avgCost =
      acc.units > 0
        ? paise(Math.round(acc.totalCostPaise / acc.units))
        : paise(0);

    const priceInfo = bestPrices.get(acc.instrumentId as string);
    const currentValuePaise = priceInfo
      ? multiplyPaise(priceInfo.valuePaise, acc.units)
      : undefined;

    holdings.push({
      instrumentId: acc.instrumentId,
      accountId: acc.accountId,
      units: acc.units,
      avgCostPaise: avgCost,
      currentValuePaise,
    });
  }

  return holdings;
}

/**
 * Filter ledger entries to only those within a given period.
 *
 * @param entries - All ledger entries.
 * @param period - The date range to filter by.
 * @returns Entries with dates within the period.
 */
export function filterEntriesByPeriod(
  entries: readonly LedgerEntry[],
  period: Period,
): LedgerEntry[] {
  return entries.filter((e) => isWithinPeriod(e.date, period));
}

/**
 * Sum of all expense entries within a period.
 *
 * @param entries - All ledger entries.
 * @param period - The date range to sum over.
 * @returns Total expenses as Paise.
 */
export function totalExpenses(
  entries: readonly LedgerEntry[],
  period: Period,
): Paise {
  const filtered = filterEntriesByPeriod(entries, period);
  const expenseAmounts = filtered
    .filter((e) => e.kind === "expense")
    .map((e) => e.amountPaise);
  return sumPaise(expenseAmounts);
}

/**
 * Sum of all income entries within a period.
 *
 * @param entries - All ledger entries.
 * @param period - The date range to sum over.
 * @returns Total income as Paise.
 */
export function totalIncome(
  entries: readonly LedgerEntry[],
  period: Period,
): Paise {
  const filtered = filterEntriesByPeriod(entries, period);
  const incomeAmounts = filtered
    .filter((e) => e.kind === "income")
    .map((e) => e.amountPaise);
  return sumPaise(incomeAmounts);
}
