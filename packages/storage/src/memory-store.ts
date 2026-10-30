import type {
  Account,
  AccountId,
  Instrument,
  InstrumentId,
  LedgerEntry,
  EntryId,
  Price,
  CalendarDate,
} from "@resource-tracker/core";

import type {
  AccountRepository,
  InstrumentRepository,
  LedgerRepository,
  PriceRepository,
  ImportBatch,
  ImportBatchRepository,
  UnitOfWork,
} from "./repository.ts";

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

/** Shallow-clone an object to prevent external mutation of internal state. */
function clone<T>(obj: T): T {
  return structuredClone(obj);
}

/** Clone an array of objects. */
function cloneArray<T>(arr: readonly T[]): readonly T[] {
  return arr.map((item) => clone(item));
}

// ──────────────────────────────────────────────
// Internal snapshot type for transaction rollback
// ──────────────────────────────────────────────

interface StoreSnapshot {
  accounts: Map<string, Account>;
  instruments: Map<string, Instrument>;
  instrumentsByIsin: Map<string, InstrumentId>;
  entries: LedgerEntry[];
  entriesById: Map<string, LedgerEntry>;
  entriesByDedupeKey: Map<string, LedgerEntry>;
  prices: Price[];
  importBatches: Map<string, ImportBatch>;
  importBatchesByHash: Map<string, ImportBatch>;
}

// ──────────────────────────────────────────────
// MemoryAccountRepository
// ──────────────────────────────────────────────

class MemoryAccountRepository implements AccountRepository {
  private readonly data: Map<string, Account>;

  constructor(data: Map<string, Account>) {
    this.data = data;
  }

  save(account: Account): void {
    this.data.set(account.id, clone(account));
  }

  findById(id: AccountId): Account | undefined {
    const a = this.data.get(id);
    return a ? clone(a) : undefined;
  }

  findAll(): readonly Account[] {
    return cloneArray([...this.data.values()]);
  }

  delete(id: AccountId): boolean {
    return this.data.delete(id);
  }
}

// ──────────────────────────────────────────────
// MemoryInstrumentRepository
// ──────────────────────────────────────────────

class MemoryInstrumentRepository implements InstrumentRepository {
  private readonly data: Map<string, Instrument>;
  private readonly isinIndex: Map<string, InstrumentId>;

  constructor(
    data: Map<string, Instrument>,
    isinIndex: Map<string, InstrumentId>,
  ) {
    this.data = data;
    this.isinIndex = isinIndex;
  }

  save(instrument: Instrument): void {
    // Remove old ISIN index entry if overwriting
    const existing = this.data.get(instrument.id);
    if (existing && existing.isin !== instrument.isin && existing.isin) {
      this.isinIndex.delete(existing.isin);
    }
    this.data.set(instrument.id, clone(instrument));
    if (instrument.isin) {
      this.isinIndex.set(instrument.isin, instrument.id);
    }
  }

  findById(id: InstrumentId): Instrument | undefined {
    const i = this.data.get(id);
    return i ? clone(i) : undefined;
  }

  findByIsin(isin: string): Instrument | undefined {
    const id = this.isinIndex.get(isin);
    if (id === undefined) return undefined;
    return this.findById(id);
  }

  findAll(): readonly Instrument[] {
    return cloneArray([...this.data.values()]);
  }
}

// ──────────────────────────────────────────────
// MemoryLedgerRepository
// ──────────────────────────────────────────────

class MemoryLedgerRepository implements LedgerRepository {
  private readonly entries: LedgerEntry[];
  private readonly byId: Map<string, LedgerEntry>;
  private readonly byDedupeKey: Map<string, LedgerEntry>;

  constructor(
    entries: LedgerEntry[],
    byId: Map<string, LedgerEntry>,
    byDedupeKey: Map<string, LedgerEntry>,
  ) {
    this.entries = entries;
    this.byId = byId;
    this.byDedupeKey = byDedupeKey;
  }

  append(entry: LedgerEntry): void {
    if (this.byDedupeKey.has(entry.dedupeKey)) {
      throw new Error(
        `Duplicate dedupeKey: "${entry.dedupeKey}" already exists in the ledger`,
      );
    }
    const cloned = clone(entry);
    this.entries.push(cloned);
    this.byId.set(cloned.id, cloned);
    this.byDedupeKey.set(cloned.dedupeKey, cloned);
  }

  appendBatch(entries: readonly LedgerEntry[]): void {
    // Validate ALL entries before committing any (atomicity)
    for (const entry of entries) {
      if (this.byDedupeKey.has(entry.dedupeKey)) {
        throw new Error(
          `Duplicate dedupeKey: "${entry.dedupeKey}" already exists in the ledger`,
        );
      }
    }
    // Also check for duplicates within the batch itself
    const batchKeys = new Set<string>();
    for (const entry of entries) {
      if (batchKeys.has(entry.dedupeKey)) {
        throw new Error(
          `Duplicate dedupeKey within batch: "${entry.dedupeKey}"`,
        );
      }
      batchKeys.add(entry.dedupeKey);
    }
    // Commit all
    for (const entry of entries) {
      const cloned = clone(entry);
      this.entries.push(cloned);
      this.byId.set(cloned.id, cloned);
      this.byDedupeKey.set(cloned.dedupeKey, cloned);
    }
  }

  findById(id: EntryId): LedgerEntry | undefined {
    const e = this.byId.get(id);
    return e ? clone(e) : undefined;
  }

  findByAccount(accountId: AccountId): readonly LedgerEntry[] {
    return cloneArray(this.entries.filter((e) => e.accountId === accountId));
  }

  findByDateRange(
    start: CalendarDate,
    end: CalendarDate,
  ): readonly LedgerEntry[] {
    return cloneArray(
      this.entries.filter(
        (e) => e.date >= (start as string) && e.date <= (end as string),
      ),
    );
  }

  findByDedupeKey(key: string): LedgerEntry | undefined {
    const e = this.byDedupeKey.get(key);
    return e ? clone(e) : undefined;
  }

  findAll(): readonly LedgerEntry[] {
    return cloneArray(this.entries);
  }

  count(): number {
    return this.entries.length;
  }
}

// ──────────────────────────────────────────────
// MemoryPriceRepository
// ──────────────────────────────────────────────

class MemoryPriceRepository implements PriceRepository {
  private readonly prices: Price[];

  constructor(prices: Price[]) {
    this.prices = prices;
  }

  save(price: Price): void {
    // Remove existing price for same instrument+date
    const idx = this.prices.findIndex(
      (p) => p.instrumentId === price.instrumentId && p.date === price.date,
    );
    if (idx !== -1) {
      this.prices[idx] = clone(price);
    } else {
      this.prices.push(clone(price));
    }
  }

  saveBatch(prices: readonly Price[]): void {
    for (const price of prices) {
      this.save(price);
    }
  }

  getLatestPrice(
    instrumentId: InstrumentId,
    asOf: CalendarDate,
  ): Price | undefined {
    let latest: Price | undefined;
    for (const p of this.prices) {
      if (p.instrumentId !== instrumentId) continue;
      if ((p.date as string) > (asOf as string)) continue;
      if (!latest || (p.date as string) > (latest.date as string)) {
        latest = p;
      }
    }
    return latest ? clone(latest) : undefined;
  }

  getPriceHistory(instrumentId: InstrumentId): readonly Price[] {
    const history = this.prices
      .filter((p) => p.instrumentId === instrumentId)
      .sort((a, b) => (a.date as string).localeCompare(b.date as string));
    return cloneArray(history);
  }
}

// ──────────────────────────────────────────────
// MemoryImportBatchRepository
// ──────────────────────────────────────────────

class MemoryImportBatchRepository implements ImportBatchRepository {
  private readonly data: Map<string, ImportBatch>;
  private readonly byHash: Map<string, ImportBatch>;

  constructor(
    data: Map<string, ImportBatch>,
    byHash: Map<string, ImportBatch>,
  ) {
    this.data = data;
    this.byHash = byHash;
  }

  save(batch: ImportBatch): void {
    const cloned = clone(batch);
    this.data.set(cloned.id, cloned);
    this.byHash.set(cloned.sourceFileHash, cloned);
  }

  findByFileHash(hash: string): ImportBatch | undefined {
    const b = this.byHash.get(hash);
    return b ? clone(b) : undefined;
  }

  findAll(): readonly ImportBatch[] {
    return cloneArray([...this.data.values()]);
  }
}

// ──────────────────────────────────────────────
// MemoryUnitOfWork
// ──────────────────────────────────────────────

/**
 * In-memory implementation of UnitOfWork with transaction support.
 *
 * All repositories operate over shared mutable state. The `transaction` method
 * snapshots the state before executing, and restores on error (rollback).
 */
export class MemoryUnitOfWork implements UnitOfWork {
  // Internal mutable state
  private _accounts: Map<string, Account> = new Map();
  private _instruments: Map<string, Instrument> = new Map();
  private _instrumentsByIsin: Map<string, InstrumentId> = new Map();
  private _entries: LedgerEntry[] = [];
  private _entriesById: Map<string, LedgerEntry> = new Map();
  private _entriesByDedupeKey: Map<string, LedgerEntry> = new Map();
  private _prices: Price[] = [];
  private _importBatches: Map<string, ImportBatch> = new Map();
  private _importBatchesByHash: Map<string, ImportBatch> = new Map();

  readonly accounts: AccountRepository;
  readonly instruments: InstrumentRepository;
  readonly ledger: LedgerRepository;
  readonly prices: PriceRepository;
  readonly importBatches: ImportBatchRepository;

  constructor() {
    this.accounts = new MemoryAccountRepository(this._accounts);
    this.instruments = new MemoryInstrumentRepository(
      this._instruments,
      this._instrumentsByIsin,
    );
    this.ledger = new MemoryLedgerRepository(
      this._entries,
      this._entriesById,
      this._entriesByDedupeKey,
    );
    this.prices = new MemoryPriceRepository(this._prices);
    this.importBatches = new MemoryImportBatchRepository(
      this._importBatches,
      this._importBatchesByHash,
    );
  }

  /**
   * Execute a function atomically. If the function throws, all changes are
   * rolled back to the state before the transaction started.
   */
  transaction<T>(fn: () => T): T {
    const snapshot = this.takeSnapshot();
    try {
      const result = fn();
      return result;
    } catch (error) {
      this.restoreSnapshot(snapshot);
      throw error;
    }
  }

  private takeSnapshot(): StoreSnapshot {
    return {
      accounts: new Map(
        [...this._accounts.entries()].map(([k, v]) => [k, clone(v)]),
      ),
      instruments: new Map(
        [...this._instruments.entries()].map(([k, v]) => [k, clone(v)]),
      ),
      instrumentsByIsin: new Map(this._instrumentsByIsin),
      entries: this._entries.map((e) => clone(e)),
      entriesById: new Map(
        [...this._entriesById.entries()].map(([k, v]) => [k, clone(v)]),
      ),
      entriesByDedupeKey: new Map(
        [...this._entriesByDedupeKey.entries()].map(([k, v]) => [k, clone(v)]),
      ),
      prices: this._prices.map((p) => clone(p)),
      importBatches: new Map(
        [...this._importBatches.entries()].map(([k, v]) => [k, clone(v)]),
      ),
      importBatchesByHash: new Map(
        [...this._importBatchesByHash.entries()].map(([k, v]) => [k, clone(v)]),
      ),
    };
  }

  private restoreSnapshot(snapshot: StoreSnapshot): void {
    // Restore accounts
    this._accounts.clear();
    for (const [k, v] of snapshot.accounts) this._accounts.set(k, v);

    // Restore instruments
    this._instruments.clear();
    for (const [k, v] of snapshot.instruments) this._instruments.set(k, v);
    this._instrumentsByIsin.clear();
    for (const [k, v] of snapshot.instrumentsByIsin)
      this._instrumentsByIsin.set(k, v);

    // Restore entries
    this._entries.length = 0;
    this._entries.push(...snapshot.entries);
    this._entriesById.clear();
    for (const [k, v] of snapshot.entriesById) this._entriesById.set(k, v);
    this._entriesByDedupeKey.clear();
    for (const [k, v] of snapshot.entriesByDedupeKey)
      this._entriesByDedupeKey.set(k, v);

    // Restore prices
    this._prices.length = 0;
    this._prices.push(...snapshot.prices);

    // Restore import batches
    this._importBatches.clear();
    for (const [k, v] of snapshot.importBatches) this._importBatches.set(k, v);
    this._importBatchesByHash.clear();
    for (const [k, v] of snapshot.importBatchesByHash)
      this._importBatchesByHash.set(k, v);
  }
}

/**
 * Create a new in-memory unit of work with all repositories.
 *
 * @returns A fresh MemoryUnitOfWork instance
 */
export function createMemoryUnitOfWork(): UnitOfWork {
  return new MemoryUnitOfWork();
}
