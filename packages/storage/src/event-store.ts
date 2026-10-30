import type { LedgerEntry, CalendarDate } from "@resource-tracker/core";

import type { LedgerRepository } from "./repository.ts";

/**
 * An append-only event store for ledger entries with replay capability.
 */
export interface EventStore {
  /** Append a single ledger entry to the event store. */
  append(entry: LedgerEntry): void;
  /** Append a batch of ledger entries atomically. */
  appendBatch(entries: readonly LedgerEntry[]): void;
  /** Replay all events in insertion order. */
  replay(): readonly LedgerEntry[];
  /** Replay events with dates strictly after the given date. */
  replaySince(after: CalendarDate): readonly LedgerEntry[];
  /** Return the current version (total number of events). */
  getVersion(): number;
  /** Check if a dedupeKey already exists. */
  isDuplicate(dedupeKey: string): boolean;
}

/**
 * In-memory event store backed by a LedgerRepository.
 *
 * Delegates storage to the underlying LedgerRepository while providing
 * event-sourcing primitives (replay, version tracking, dedup checking).
 */
export class MemoryEventStore implements EventStore {
  constructor(private readonly ledger: LedgerRepository) {}

  /** Append a single entry, rejecting duplicates. */
  append(entry: LedgerEntry): void {
    this.ledger.append(entry);
  }

  /** Append a batch of entries atomically. */
  appendBatch(entries: readonly LedgerEntry[]): void {
    this.ledger.appendBatch(entries);
  }

  /** Replay all events in insertion order. Returns defensive copies. */
  replay(): readonly LedgerEntry[] {
    return this.ledger.findAll();
  }

  /**
   * Replay events with dates strictly after the given date.
   *
   * @param after - Only events with date > after are returned
   * @returns Events in insertion order filtered by date
   */
  replaySince(after: CalendarDate): readonly LedgerEntry[] {
    const all = this.ledger.findAll();
    return all.filter((e) => (e.date as string) > (after as string));
  }

  /** Return the current event count (version). */
  getVersion(): number {
    return this.ledger.count();
  }

  /** Check whether a dedupeKey has already been recorded. */
  isDuplicate(dedupeKey: string): boolean {
    return this.ledger.findByDedupeKey(dedupeKey) !== undefined;
  }
}
