import { describe, it, expect } from "vitest";
import {
  createMemoryUnitOfWork,
  MemoryEventStore,
  MemorySnapshotCache,
} from "./index.ts";
import {
  accountId,
  instrumentId,
  entryId,
  calendarDate,
  paise,
} from "@resource-tracker/core";
import type {
  Account,
  Instrument,
  LedgerEntry,
  Price,
  Snapshot,
} from "@resource-tracker/core";

describe("@resource-tracker/storage", () => {
  describe("AccountRepository", () => {
    it("saves, finds, lists, and deletes accounts", () => {
      const uow = createMemoryUnitOfWork();
      const acc1: Account = {
        id: accountId("acc-1"),
        name: "HDFC Primary",
        type: "bank",
        currency: "INR",
      };
      const acc2: Account = {
        id: accountId("acc-2"),
        name: "Zerodha Demat",
        type: "broker",
        currency: "INR",
      };

      uow.accounts.save(acc1);
      uow.accounts.save(acc2);

      expect(uow.accounts.findById(acc1.id)).toEqual(acc1);
      expect(uow.accounts.findAll()).toHaveLength(2);

      const deleted = uow.accounts.delete(acc1.id);
      expect(deleted).toBe(true);
      expect(uow.accounts.findById(acc1.id)).toBeUndefined();
      expect(uow.accounts.findAll()).toHaveLength(1);
    });

    it("ensures immutability: modifying returned account does not affect store", () => {
      const uow = createMemoryUnitOfWork();
      const acc: Account = {
        id: accountId("acc-1"),
        name: "Original Name",
        type: "bank",
        currency: "INR",
      };
      uow.accounts.save(acc);

      const retrieved = uow.accounts.findById(acc.id)!;
      (retrieved as { name: string }).name = "Modified Name";

      expect(uow.accounts.findById(acc.id)!.name).toBe("Original Name");
    });
  });

  describe("InstrumentRepository", () => {
    it("persists instruments and indexes by ISIN", () => {
      const uow = createMemoryUnitOfWork();
      const inst: Instrument = {
        id: instrumentId("inst-tcs"),
        name: "Tata Consultancy Services",
        type: "equity",
        isin: "INE467B01029",
      };

      uow.instruments.save(inst);
      expect(uow.instruments.findById(inst.id)).toEqual(inst);
      expect(uow.instruments.findByIsin("INE467B01029")).toEqual(inst);
      expect(uow.instruments.findByIsin("ine467b01029")).toBeUndefined();
      expect(uow.instruments.findAll()).toHaveLength(1);
    });
  });

  describe("LedgerRepository", () => {
    const acc = accountId("acc-bank");
    const createEntry = (
      idStr: string,
      dedupeKey: string,
      dateStr: string,
    ): LedgerEntry => ({
      id: entryId(idStr),
      accountId: acc,
      date: calendarDate(dateStr),
      amountPaise: paise(500000),
      description: "Test Entry",
      kind: "expense",
      dedupeKey,
      createdAt: "2025-01-01T00:00:00Z",
    });

    it("appends entries and queries by account, id, and date range", () => {
      const uow = createMemoryUnitOfWork();
      const e1 = createEntry("e1", "k1", "2025-01-05");
      const e2 = createEntry("e2", "k2", "2025-01-15");
      const e3 = createEntry("e3", "k3", "2025-01-25");

      uow.ledger.append(e1);
      uow.ledger.appendBatch([e2, e3]);

      expect(uow.ledger.count()).toBe(3);
      expect(uow.ledger.findById(e1.id)).toEqual(e1);
      expect(uow.ledger.findByDedupeKey("k2")).toEqual(e2);
      expect(uow.ledger.findByAccount(acc)).toHaveLength(3);

      const inRange = uow.ledger.findByDateRange(
        calendarDate("2025-01-10"),
        calendarDate("2025-01-20"),
      );
      expect(inRange).toHaveLength(1);
      expect(inRange[0]?.id).toBe(e2.id);
    });

    it("enforces dedupeKey uniqueness on single append", () => {
      const uow = createMemoryUnitOfWork();
      const e1 = createEntry("e1", "duplicate-key", "2025-01-05");
      const e2 = createEntry("e2", "duplicate-key", "2025-01-06");

      uow.ledger.append(e1);
      expect(() => uow.ledger.append(e2)).toThrow(/Duplicate dedupeKey/);
      expect(uow.ledger.count()).toBe(1);
    });

    it("enforces atomic batch append (all or nothing on duplicate)", () => {
      const uow = createMemoryUnitOfWork();
      const e1 = createEntry("e1", "key-1", "2025-01-01");
      uow.ledger.append(e1);

      const batch = [
        createEntry("e2", "key-2", "2025-01-02"),
        createEntry("e3", "key-1", "2025-01-03"), // Duplicate!
        createEntry("e4", "key-4", "2025-01-04"),
      ];

      expect(() => uow.ledger.appendBatch(batch)).toThrow(
        /Duplicate dedupeKey/,
      );
      // Verify NONE of the batch was committed
      expect(uow.ledger.count()).toBe(1);
      expect(uow.ledger.findById(entryId("e2"))).toBeUndefined();
    });
  });

  describe("PriceRepository", () => {
    it("saves prices and finds latest price on or before date", () => {
      const uow = createMemoryUnitOfWork();
      const inst = instrumentId("inst-nifty");

      const p1: Price = {
        instrumentId: inst,
        date: calendarDate("2025-01-10"),
        valuePaise: paise(2200000),
        source: "market",
        fetchedAt: "2025-01-10T00:00:00Z",
      };
      const p2: Price = {
        instrumentId: inst,
        date: calendarDate("2025-01-20"),
        valuePaise: paise(2250000),
        source: "market",
        fetchedAt: "2025-01-20T00:00:00Z",
      };

      uow.prices.saveBatch([p1, p2]);

      const latestBefore15 = uow.prices.getLatestPrice(
        inst,
        calendarDate("2025-01-15"),
      );
      expect(latestBefore15?.valuePaise).toBe(2200000);

      const latestBefore25 = uow.prices.getLatestPrice(
        inst,
        calendarDate("2025-01-25"),
      );
      expect(latestBefore25?.valuePaise).toBe(2250000);

      const noneBefore05 = uow.prices.getLatestPrice(
        inst,
        calendarDate("2025-01-05"),
      );
      expect(noneBefore05).toBeUndefined();

      expect(uow.prices.getPriceHistory(inst)).toHaveLength(2);
    });
  });

  describe("UnitOfWork transaction rollback", () => {
    it("rolls back all changes across repositories when transaction throws", () => {
      const uow = createMemoryUnitOfWork();
      const acc = accountId("acc-tx");
      uow.accounts.save({
        id: acc,
        name: "Initial Account",
        type: "bank",
        currency: "INR",
      });

      expect(() => {
        uow.transaction(() => {
          uow.accounts.save({
            id: accountId("acc-tx-2"),
            name: "Should Rollback",
            type: "bank",
            currency: "INR",
          });
          uow.ledger.append({
            id: entryId("e-rollback"),
            accountId: acc,
            date: calendarDate("2025-01-01"),
            amountPaise: paise(100),
            description: "Rollback entry",
            kind: "expense",
            dedupeKey: "rb-key",
            createdAt: "2025-01-01T00:00:00Z",
          });
          throw new Error("Deliberate failure inside transaction");
        });
      }).toThrow(/Deliberate failure/);

      // Verify complete rollback
      expect(uow.accounts.findAll()).toHaveLength(1);
      expect(uow.accounts.findById(accountId("acc-tx-2"))).toBeUndefined();
      expect(uow.ledger.count()).toBe(0);
    });

    it("commits all changes when transaction succeeds", () => {
      const uow = createMemoryUnitOfWork();
      uow.transaction(() => {
        uow.accounts.save({
          id: accountId("acc-committed"),
          name: "Committed Account",
          type: "bank",
          currency: "INR",
        });
      });
      expect(uow.accounts.findById(accountId("acc-committed"))).toBeDefined();
    });
  });

  describe("MemoryEventStore", () => {
    it("acts as an append-only event store with replay and versioning", () => {
      const uow = createMemoryUnitOfWork();
      const store = new MemoryEventStore(uow.ledger);

      expect(store.getVersion()).toBe(0);

      const e1: LedgerEntry = {
        id: entryId("ev1"),
        accountId: accountId("acc1"),
        date: calendarDate("2025-01-01"),
        amountPaise: paise(1000),
        description: "Event 1",
        kind: "income",
        dedupeKey: "dk1",
        createdAt: "2025-01-01T00:00:00Z",
      };
      const e2: LedgerEntry = {
        id: entryId("ev2"),
        accountId: accountId("acc1"),
        date: calendarDate("2025-01-15"),
        amountPaise: paise(2000),
        description: "Event 2",
        kind: "income",
        dedupeKey: "dk2",
        createdAt: "2025-01-15T00:00:00Z",
      };

      store.append(e1);
      store.append(e2);

      expect(store.getVersion()).toBe(2);
      expect(store.isDuplicate("dk1")).toBe(true);
      expect(store.isDuplicate("dk3")).toBe(false);

      const replayedAll = store.replay();
      expect(replayedAll).toHaveLength(2);
      expect(replayedAll[0]?.id).toBe(e1.id);

      const replayedSince = store.replaySince(calendarDate("2025-01-10"));
      expect(replayedSince).toHaveLength(1);
      expect(replayedSince[0]?.id).toBe(e2.id);
    });
  });

  describe("MemorySnapshotCache", () => {
    it("caches snapshots and invalidates correctly", () => {
      const cache = new MemorySnapshotCache();
      const d1 = calendarDate("2025-01-10");
      const d2 = calendarDate("2025-01-20");

      const snap1: Snapshot = {
        asOf: d1,
        netWorthPaise: paise(100000),
        liquidAssetsPaise: paise(100000),
        monthlySpendingPaise: paise(20000),
        runwayMonths: 5,
        savingsRate: 0.5,
        allocation: new Map(),
        unpricedHoldings: [],
        warnings: [],
      };

      const snap2: Snapshot = {
        ...snap1,
        asOf: d2,
        netWorthPaise: paise(150000),
      };

      cache.set(d1, snap1);
      cache.set(d2, snap2);

      expect(cache.get(d1)?.netWorthPaise).toBe(100000);
      expect(cache.get(d2)?.netWorthPaise).toBe(150000);

      // Invalidate on or after d2
      cache.invalidateSince(d2);
      expect(cache.get(d1)).toBeDefined();
      expect(cache.get(d2)).toBeUndefined();

      // Invalidate all
      cache.invalidate();
      expect(cache.get(d1)).toBeUndefined();
    });
  });
});
