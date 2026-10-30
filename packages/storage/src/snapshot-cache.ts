import type { Snapshot, CalendarDate } from "@resource-tracker/core";

/**
 * Cache for derived portfolio snapshots keyed by date.
 */
export interface SnapshotCache {
  /** Retrieve a cached snapshot for a given date. */
  get(asOf: CalendarDate): Snapshot | undefined;
  /** Cache a snapshot for a given date. */
  set(asOf: CalendarDate, snapshot: Snapshot): void;
  /** Clear all cached snapshots. */
  invalidate(): void;
  /** Clear all cached snapshots on or after the given date. */
  invalidateSince(date: CalendarDate): void;
}

/**
 * In-memory snapshot cache backed by a Map.
 *
 * Snapshots are stored as defensive copies to prevent external mutation.
 */
export class MemorySnapshotCache implements SnapshotCache {
  private readonly cache = new Map<string, Snapshot>();

  /** Retrieve a cached snapshot for the given date. */
  get(asOf: CalendarDate): Snapshot | undefined {
    const s = this.cache.get(asOf as string);
    return s ? structuredClone(s) : undefined;
  }

  /** Cache a snapshot for the given date (stored as a defensive copy). */
  set(asOf: CalendarDate, snapshot: Snapshot): void {
    this.cache.set(asOf as string, structuredClone(snapshot));
  }

  /** Clear all cached snapshots. */
  invalidate(): void {
    this.cache.clear();
  }

  /** Clear all cached snapshots on or after the given date. */
  invalidateSince(date: CalendarDate): void {
    const dateStr = date as string;
    for (const key of [...this.cache.keys()]) {
      if (key >= dateStr) {
        this.cache.delete(key);
      }
    }
  }
}
