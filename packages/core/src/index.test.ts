import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  CORE_VERSION,
  paise,
  fromRupees,
  toRupees,
  addPaise,
  subtractPaise,
  multiplyPaise,
  isZero,
  isNegative,
  comparePaise,
  formatINR,
  sumPaise,
  calendarDate,
  accountId,
  instrumentId,
  entryId,
  AccountSchema,
  InstrumentSchema,
  lastNDays,
  calendarMonth,
  financialYear,
  isWithinPeriod,
  periodDays,
  ok,
  err,
  isOk,
  isErr,
  mapResult,
  flatMapResult,
  deriveAccountBalances,
  replayLedger,
  deriveHoldings,
  totalExpenses,
  totalIncome,
  computeSnapshot,
} from "./index.ts";
import type { Account, Instrument, LedgerEntry, Price } from "./index.ts";

describe("@resource-tracker/core", () => {
  describe("smoke and versioning", () => {
    it("exports CORE_VERSION", () => {
      expect(CORE_VERSION).toBe("0.1.0");
    });
  });

  describe("money representation and arithmetic", () => {
    it("creates paise from integer", () => {
      const p = paise(10050);
      expect(p as number).toBe(10050);
    });

    it("throws when creating paise from non-integer or float", () => {
      expect(() => paise(10.5)).toThrow(/must be a safe integer/);
      expect(() => paise(NaN)).toThrow(/must be a safe integer/);
    });

    it("converts from rupees to integer paise rounding correctly", () => {
      expect(fromRupees(100.5)).toBe(10050);
      expect(fromRupees(100.555)).toBe(10056);
      expect(fromRupees(0)).toBe(0);
      expect(fromRupees(-50.25)).toBe(-5025);
    });

    it("converts paise to rupees float for display", () => {
      expect(toRupees(paise(10050))).toBe(100.5);
      expect(toRupees(paise(0))).toBe(0);
    });

    it("adds and subtracts paise correctly", () => {
      expect(addPaise(paise(100), paise(250))).toBe(350);
      expect(subtractPaise(paise(500), paise(200))).toBe(300);
      expect(subtractPaise(paise(200), paise(500))).toBe(-300);
    });

    it("multiplies paise with explicit rounding modes", () => {
      expect(multiplyPaise(paise(100), 1.5, "round")).toBe(150);
      expect(multiplyPaise(paise(105), 0.33, "round")).toBe(35);
      expect(multiplyPaise(paise(105), 0.33, "floor")).toBe(34);
      expect(multiplyPaise(paise(105), 0.33, "ceil")).toBe(35);
    });

    it("handles isZero, isNegative, and comparePaise", () => {
      expect(isZero(paise(0))).toBe(true);
      expect(isZero(paise(1))).toBe(false);
      expect(isNegative(paise(-10))).toBe(true);
      expect(isNegative(paise(0))).toBe(false);
      expect(comparePaise(paise(100), paise(200))).toBe(-1);
      expect(comparePaise(paise(200), paise(200))).toBe(0);
      expect(comparePaise(paise(300), paise(200))).toBe(1);
    });

    it("formats Indian Rupee currency with lakh and crore grouping", () => {
      expect(formatINR(paise(0))).toBe("₹0.00");
      expect(formatINR(paise(50))).toBe("₹0.50");
      expect(formatINR(paise(100000))).toBe("₹1,000.00");
      expect(formatINR(paise(10000050))).toBe("₹1,00,000.50");
      expect(formatINR(paise(1000000000))).toBe("₹1,00,00,000.00");
      expect(formatINR(paise(-150075))).toBe("-₹1,500.75");
    });

    it("sums an array of paise amounts", () => {
      expect(sumPaise([])).toBe(0);
      expect(sumPaise([paise(100), paise(200), paise(300)])).toBe(600);
    });
  });

  describe("property-based tests for money math (fast-check)", () => {
    it("addition is commutative: a + b === b + a", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: -100_000_000, max: 100_000_000 }),
          fc.integer({ min: -100_000_000, max: 100_000_000 }),
          (a, b) => {
            const pA = paise(a);
            const pB = paise(b);
            return addPaise(pA, pB) === addPaise(pB, pA);
          },
        ),
      );
    });

    it("addition identity: a + 0 === a", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: -100_000_000, max: 100_000_000 }),
          (a) => {
            const pA = paise(a);
            return addPaise(pA, paise(0)) === a;
          },
        ),
      );
    });

    it("conservation of money: sum of parts equals whole", () => {
      fc.assert(
        fc.property(
          fc.array(fc.integer({ min: 0, max: 10_000_000 }), {
            minLength: 1,
            maxLength: 50,
          }),
          (parts) => {
            const paiseParts = parts.map((x) => paise(x));
            const expectedSum = parts.reduce((acc, curr) => acc + curr, 0);
            return (sumPaise(paiseParts) as number) === expectedSum;
          },
        ),
      );
    });
  });

  describe("smart constructors and schemas", () => {
    it("constructs and validates calendar dates", () => {
      const cd = calendarDate("2025-04-01");
      expect(cd).toBe("2025-04-01");
      expect(() => calendarDate("invalid-date")).toThrow();
      expect(() => calendarDate("2025-02-31")).toThrow();
    });

    it("constructs branded IDs", () => {
      expect(accountId("acc_1")).toBe("acc_1");
      expect(() => accountId("")).toThrow();
      expect(instrumentId("inst_1")).toBe("inst_1");
      expect(() => instrumentId("")).toThrow();
      expect(entryId("ent_1")).toBe("ent_1");
      expect(() => entryId("")).toThrow();
    });

    it("validates Account entity via Zod", () => {
      const valid: Account = {
        id: accountId("acc-hdfc"),
        name: "HDFC Salary Account",
        type: "bank",
        currency: "INR",
      };
      expect(AccountSchema.parse(valid)).toEqual(valid);
      expect(() =>
        AccountSchema.parse({
          id: "",
          name: "test",
          type: "bank",
          currency: "USD",
        }),
      ).toThrow();
    });

    it("validates Instrument entity via Zod", () => {
      const valid: Instrument = {
        id: instrumentId("inst-infy"),
        name: "Infosys Ltd",
        type: "equity",
        isin: "INE009A01021",
      };
      expect(InstrumentSchema.parse(valid)).toEqual(valid);
    });
  });

  describe("period utilities", () => {
    it("computes lastNDays accurately", () => {
      const period = lastNDays(30, calendarDate("2025-06-15"));
      expect(period.start).toBe("2025-05-17");
      expect(period.end).toBe("2025-06-15");
      expect(periodDays(period)).toBe(30);
    });

    it("computes calendarMonth accurately", () => {
      const feb2024 = calendarMonth(2024, 2); // Leap year
      expect(feb2024.start).toBe("2024-02-01");
      expect(feb2024.end).toBe("2024-02-29");
      expect(periodDays(feb2024)).toBe(29);

      const feb2025 = calendarMonth(2025, 2); // Non-leap year
      expect(feb2025.start).toBe("2025-02-01");
      expect(feb2025.end).toBe("2025-02-28");
      expect(periodDays(feb2025)).toBe(28);
    });

    it("computes Indian financial year (April to March)", () => {
      const fy25 = financialYear(2025);
      expect(fy25.start).toBe("2025-04-01");
      expect(fy25.end).toBe("2026-03-31");
      expect(isWithinPeriod(calendarDate("2025-03-31"), fy25)).toBe(false);
      expect(isWithinPeriod(calendarDate("2025-04-01"), fy25)).toBe(true);
      expect(isWithinPeriod(calendarDate("2026-03-31"), fy25)).toBe(true);
      expect(isWithinPeriod(calendarDate("2026-04-01"), fy25)).toBe(false);
    });
  });

  describe("result type pattern", () => {
    it("handles ok and err variants", () => {
      const success = ok(42);
      const failure = err("error message");

      expect(isOk(success)).toBe(true);
      expect(isErr(success)).toBe(false);
      expect(isOk(failure)).toBe(false);
      expect(isErr(failure)).toBe(true);

      const mapped = mapResult(success, (x) => x * 2);
      expect(isOk(mapped) && mapped.value).toBe(84);

      const chained = flatMapResult(success, (x) => ok(`Val: ${x}`));
      expect(isOk(chained) && chained.value).toBe("Val: 42");

      const errorChained = flatMapResult(failure, (x) => ok(`Val: ${x}`));
      expect(isErr(errorChained) && errorChained.error).toBe("error message");
    });
  });

  describe("event ledger replay & balances", () => {
    const acc1 = accountId("bank-1");
    const acc2 = accountId("bank-2");
    const inst = instrumentId("infy");

    const sampleEntries: LedgerEntry[] = [
      {
        id: entryId("e1"),
        accountId: acc1,
        date: calendarDate("2025-01-01"),
        amountPaise: paise(100_000_00), // +100,000 salary
        description: "Salary",
        kind: "income",
        dedupeKey: "sal-jan",
        createdAt: "2025-01-01T00:00:00Z",
      },
      {
        id: entryId("e2"),
        accountId: acc1,
        date: calendarDate("2025-01-05"),
        amountPaise: paise(20_000_00), // -20,000 rent
        description: "Rent",
        kind: "expense",
        dedupeKey: "rent-jan",
        createdAt: "2025-01-05T00:00:00Z",
      },
      {
        id: entryId("e3"),
        accountId: acc1,
        toAccountId: acc2,
        date: calendarDate("2025-01-10"),
        amountPaise: paise(10_000_00), // transfer 10,000 to acc2
        description: "Transfer to emergency fund",
        kind: "transfer",
        dedupeKey: "trf-1",
        createdAt: "2025-01-10T00:00:00Z",
      },
      {
        id: entryId("e4"),
        accountId: acc1,
        instrumentId: inst,
        units: 10,
        pricePerUnitPaise: paise(1_500_00),
        date: calendarDate("2025-01-15"),
        amountPaise: paise(15_000_00), // buy 10 INFY for 15,000
        description: "Buy INFY",
        kind: "buy",
        dedupeKey: "buy-infy",
        createdAt: "2025-01-15T00:00:00Z",
      },
    ];

    it("derives account balances up to asOf date correctly", () => {
      const balances = deriveAccountBalances(
        sampleEntries,
        calendarDate("2025-01-31"),
      );
      // acc1: 100k - 20k - 10k - 15k = 55k
      expect(balances.get(acc1)).toBe(55_000_00);
      // acc2: +10k
      expect(balances.get(acc2)).toBe(10_000_00);
    });

    it("derives balances point-in-time", () => {
      const earlyBalances = deriveAccountBalances(
        sampleEntries,
        calendarDate("2025-01-04"),
      );
      expect(earlyBalances.get(acc1)).toBe(100_000_00);
      expect(earlyBalances.get(acc2)).toBeUndefined();
    });

    it("replayLedger is deterministic regardless of input ordering", () => {
      const forward = replayLedger(sampleEntries);
      const reversed = replayLedger([...sampleEntries].reverse());
      const shuffled = replayLedger([
        sampleEntries[2]!,
        sampleEntries[0]!,
        sampleEntries[3]!,
        sampleEntries[1]!,
      ]);

      expect(forward.get(acc1)).toBe(reversed.get(acc1));
      expect(forward.get(acc2)).toBe(reversed.get(acc2));
      expect(forward.get(acc1)).toBe(shuffled.get(acc1));
    });

    it("computes total income and total expenses within period", () => {
      const period = {
        start: calendarDate("2025-01-01"),
        end: calendarDate("2025-01-31"),
      };
      expect(totalIncome(sampleEntries, period)).toBe(100_000_00);
      expect(totalExpenses(sampleEntries, period)).toBe(20_000_00); // Transfers are not expenses!
    });

    it("derives holdings and updates on buy and sell", () => {
      const prices: Price[] = [
        {
          instrumentId: inst,
          date: calendarDate("2025-01-20"),
          valuePaise: paise(1_600_00), // NAV / market price: ₹1,600
          source: "market",
          fetchedAt: "2025-01-20T10:00:00Z",
        },
      ];

      const holdings = deriveHoldings(
        sampleEntries,
        prices,
        calendarDate("2025-01-31"),
      );
      expect(holdings).toHaveLength(1);
      expect(holdings[0]?.units).toBe(10);
      expect(holdings[0]?.avgCostPaise).toBe(1_500_00);
      expect(holdings[0]?.currentValuePaise).toBe(16_000_00); // 10 * 1600

      // Now add a partial sell of 4 units
      const withSell: LedgerEntry[] = [
        ...sampleEntries,
        {
          id: entryId("e5"),
          accountId: acc1,
          instrumentId: inst,
          units: 4,
          pricePerUnitPaise: paise(1_600_00),
          date: calendarDate("2025-01-22"),
          amountPaise: paise(6_400_00),
          description: "Sell 4 INFY",
          kind: "sell",
          dedupeKey: "sell-infy",
          createdAt: "2025-01-22T00:00:00Z",
        },
      ];

      const updatedHoldings = deriveHoldings(
        withSell,
        prices,
        calendarDate("2025-01-31"),
      );
      expect(updatedHoldings[0]?.units).toBe(6);
      expect(updatedHoldings[0]?.avgCostPaise).toBe(1_500_00); // avg cost remains 1500
      expect(updatedHoldings[0]?.currentValuePaise).toBe(9_600_00); // 6 * 1600
    });
  });

  describe("financial snapshot calculation", () => {
    it("handles empty ledger without failing or producing NaN", () => {
      const snap = computeSnapshot([], [], calendarDate("2025-01-01"));
      expect(snap.netWorthPaise).toBe(0);
      expect(snap.liquidAssetsPaise).toBe(0);
      expect(snap.monthlySpendingPaise).toBe(0);
      expect(snap.runwayMonths).toBe(Infinity);
      expect(snap.savingsRate).toBe(0);
      expect(snap.warnings).toContain("No ledger entries found");
    });

    it("computes net worth, runway, and detects unpriced holdings", () => {
      const acc = accountId("bank");
      const inst = instrumentId("infy");

      const entries: LedgerEntry[] = [
        {
          id: entryId("e1"),
          accountId: acc,
          date: calendarDate("2025-01-01"),
          amountPaise: paise(100_000_00),
          description: "Income",
          kind: "income",
          dedupeKey: "k1",
          createdAt: "2025-01-01T00:00:00Z",
        },
        {
          id: entryId("e2"),
          accountId: acc,
          date: calendarDate("2025-01-02"),
          amountPaise: paise(25_000_00),
          description: "Spending",
          kind: "expense",
          dedupeKey: "k2",
          createdAt: "2025-01-02T00:00:00Z",
        },
        {
          id: entryId("e3"),
          accountId: acc,
          instrumentId: inst,
          units: 10,
          pricePerUnitPaise: paise(1_000_00),
          date: calendarDate("2025-01-03"),
          amountPaise: paise(10_000_00),
          description: "Stock buy",
          kind: "buy",
          dedupeKey: "k3",
          createdAt: "2025-01-03T00:00:00Z",
        },
      ];

      // Snapshot WITHOUT market price
      const snapUnpriced = computeSnapshot(
        entries,
        [],
        calendarDate("2025-01-15"),
      );
      // Cash balance: 100k - 25k - 10k = 65k
      expect(snapUnpriced.netWorthPaise).toBe(65_000_00);
      expect(snapUnpriced.unpricedHoldings).toHaveLength(1);
      expect(
        snapUnpriced.warnings.some((w) => w.includes("could not be priced")),
      ).toBe(true);

      // Snapshot WITH market price (₹1,200 per share)
      const prices: Price[] = [
        {
          instrumentId: inst,
          date: calendarDate("2025-01-10"),
          valuePaise: paise(1_200_00),
          source: "market",
          fetchedAt: "2025-01-10T00:00:00Z",
        },
      ];

      const snapPriced = computeSnapshot(
        entries,
        prices,
        calendarDate("2025-01-15"),
      );
      // Net worth: 65,000 cash + (10 * 1200) = 65,000 + 12,000 = 77,000
      expect(snapPriced.netWorthPaise).toBe(77_000_00);
      expect(snapPriced.unpricedHoldings).toHaveLength(0);
      // Runway: 65,000 cash / 25,000 monthly spending = 2.6 months
      expect(snapPriced.runwayMonths).toBeCloseTo(2.6, 1);
    });
  });
});
