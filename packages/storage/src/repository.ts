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

/**
 * Repository for managing Account entities.
 */
export interface AccountRepository {
  /** Persist an account, overwriting any existing account with the same id. */
  save(account: Account): void;
  /** Find an account by its unique identifier. */
  findById(id: AccountId): Account | undefined;
  /** Return all accounts. */
  findAll(): readonly Account[];
  /** Delete an account by id. Returns true if it existed. */
  delete(id: AccountId): boolean;
}

/**
 * Repository for managing Instrument entities.
 */
export interface InstrumentRepository {
  /** Persist an instrument, overwriting any existing instrument with the same id. */
  save(instrument: Instrument): void;
  /** Find an instrument by its unique identifier. */
  findById(id: InstrumentId): Instrument | undefined;
  /** Find an instrument by its ISIN code. */
  findByIsin(isin: string): Instrument | undefined;
  /** Return all instruments. */
  findAll(): readonly Instrument[];
}

/**
 * Repository for append-only ledger entries.
 */
export interface LedgerRepository {
  /** Append a single ledger entry. Rejects duplicate dedupeKey values. */
  append(entry: LedgerEntry): void;
  /** Append a batch of entries atomically. All succeed or none do. */
  appendBatch(entries: readonly LedgerEntry[]): void;
  /** Find an entry by its unique identifier. */
  findById(id: EntryId): LedgerEntry | undefined;
  /** Find all entries belonging to a specific account. */
  findByAccount(accountId: AccountId): readonly LedgerEntry[];
  /** Find entries within a date range (inclusive on both ends). */
  findByDateRange(
    start: CalendarDate,
    end: CalendarDate,
  ): readonly LedgerEntry[];
  /** Find an entry by its deduplication key. */
  findByDedupeKey(key: string): LedgerEntry | undefined;
  /** Return all entries in insertion order. */
  findAll(): readonly LedgerEntry[];
  /** Return the total number of entries. */
  count(): number;
}

/**
 * Repository for instrument price observations.
 */
export interface PriceRepository {
  /** Persist a single price observation. */
  save(price: Price): void;
  /** Persist a batch of price observations. */
  saveBatch(prices: readonly Price[]): void;
  /** Get the latest price for an instrument on or before the given date. */
  getLatestPrice(
    instrumentId: InstrumentId,
    asOf: CalendarDate,
  ): Price | undefined;
  /** Get all price observations for an instrument, ordered by date. */
  getPriceHistory(instrumentId: InstrumentId): readonly Price[];
}

/**
 * Metadata about a batch of imported entries.
 */
export interface ImportBatch {
  readonly id: string;
  readonly sourceFileHash: string;
  readonly fileName: string;
  readonly importedAt: string;
  readonly entryCount: number;
}

/**
 * Repository for tracking import batches.
 */
export interface ImportBatchRepository {
  /** Persist an import batch record. */
  save(batch: ImportBatch): void;
  /** Find an import batch by its source file hash. */
  findByFileHash(hash: string): ImportBatch | undefined;
  /** Return all import batches. */
  findAll(): readonly ImportBatch[];
}

/**
 * Unit of work providing access to all repositories with transaction support.
 */
export interface UnitOfWork {
  readonly accounts: AccountRepository;
  readonly instruments: InstrumentRepository;
  readonly ledger: LedgerRepository;
  readonly prices: PriceRepository;
  readonly importBatches: ImportBatchRepository;
  /** Execute a function atomically – either all changes commit or none do. */
  transaction<T>(fn: () => T): T;
}
