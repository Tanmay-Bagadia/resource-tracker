/**
 * @module service
 * Application service coordinating core domain models, persistence, and ingestion.
 */

import {
  accountId,
  calendarDate,
  entryId,
  fromRupees,
  formatINR,
  deriveAccountBalances,
  computeSnapshot,
} from "@resource-tracker/core";
import type { LedgerEntry, Paise, Snapshot } from "@resource-tracker/core";
import { createMemoryUnitOfWork } from "@resource-tracker/storage";
import type { UnitOfWork } from "@resource-tracker/storage";
import { ingest, toLedgerEntries } from "@resource-tracker/ingest";
import type { SourceFormat, IngestResult } from "@resource-tracker/ingest";

export interface RecordParams {
  readonly kind: "expense" | "income" | "transfer";
  readonly account: string;
  readonly amountRupees: number;
  readonly description: string;
  readonly date?: string;
  readonly toAccount?: string;
}

export interface IngestFileParams {
  readonly content: string;
  readonly account: string;
  readonly format?: SourceFormat;
}

export interface AuditTrailOptions {
  readonly account?: string;
  readonly limit?: number;
}

export interface BalanceReport {
  readonly accountId: string;
  readonly balancePaise: Paise;
  readonly formatted: string;
}

/**
 * High-level tracker service encapsulating repository operations.
 */
export class TrackerService {
  constructor(public readonly uow: UnitOfWork = createMemoryUnitOfWork()) {}

  /**
   * Record a new manual ledger event.
   */
  record(params: RecordParams): LedgerEntry {
    const targetAccId = accountId(params.account);
    const date = params.date
      ? calendarDate(params.date)
      : calendarDate(new Date().toISOString().slice(0, 10));
    const amountPaise = fromRupees(params.amountRupees);
    const now = new Date().toISOString();
    const id = entryId(
      `manual_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    );
    const dedupeKey = `manual:${targetAccId}:${date}:${params.kind}:${amountPaise}:${params.description.trim()}`;

    let entry: LedgerEntry;

    if (params.kind === "transfer") {
      if (!params.toAccount) {
        throw new Error("Transfer entries require --to-account destination");
      }
      entry = {
        id,
        accountId: targetAccId,
        toAccountId: accountId(params.toAccount),
        date,
        amountPaise,
        description: params.description,
        dedupeKey,
        createdAt: now,
        kind: "transfer",
      };
    } else if (params.kind === "income") {
      entry = {
        id,
        accountId: targetAccId,
        date,
        amountPaise,
        description: params.description,
        dedupeKey,
        createdAt: now,
        kind: "income",
      };
    } else {
      entry = {
        id,
        accountId: targetAccId,
        date,
        amountPaise,
        description: params.description,
        dedupeKey,
        createdAt: now,
        kind: "expense",
      };
    }

    this.uow.ledger.append(entry);
    return entry;
  }

  /**
   * Ingest statement content into the ledger atomically.
   */
  ingestStatement(params: IngestFileParams): IngestResult {
    const targetAccId = accountId(params.account);

    // Collect all existing dedupe keys from the ledger for deduplication
    const existingEntries = this.uow.ledger.findAll();
    const existingKeys = new Set(existingEntries.map((e) => e.dedupeKey));

    const result = ingest(params.content, {
      accountId: targetAccId,
      format: params.format,
      existingKeys,
    });

    if (result.rows.length > 0) {
      const entries = toLedgerEntries(result.rows, targetAccId);
      this.uow.transaction(() => {
        this.uow.ledger.appendBatch(entries);
        this.uow.importBatches.save({
          id: `batch_${Date.now()}`,
          sourceFileHash: result.sourceFileHash,
          fileName: `statement_${params.account}`,
          importedAt: new Date().toISOString(),
          entryCount: entries.length,
        });
      });
    }

    return result;
  }

  /**
   * Derive account balances as of a date.
   */
  getBalances(asOfDate?: string): BalanceReport[] {
    const asOf = asOfDate
      ? calendarDate(asOfDate)
      : calendarDate(new Date().toISOString().slice(0, 10));
    const entries = this.uow.ledger.findAll();
    const balances = deriveAccountBalances(entries, asOf);

    const reports: BalanceReport[] = [];
    for (const [accId, bal] of balances.entries()) {
      reports.push({
        accountId: accId,
        balancePaise: bal,
        formatted: formatINR(bal),
      });
    }

    return reports;
  }

  /**
   * Query the audit trail of immutable ledger events.
   */
  getAuditTrail(options: AuditTrailOptions = {}): readonly LedgerEntry[] {
    let entries = this.uow.ledger.findAll();
    if (options.account) {
      const targetAccId = accountId(options.account);
      entries = entries.filter((e) => e.accountId === targetAccId);
    }
    if (options.limit && options.limit > 0) {
      entries = entries.slice(-options.limit);
    }
    return entries;
  }

  /**
   * Compute point-in-time financial snapshot.
   */
  getStatus(asOfDate?: string): Snapshot {
    const asOf = asOfDate
      ? calendarDate(asOfDate)
      : calendarDate(new Date().toISOString().slice(0, 10));
    const entries = this.uow.ledger.findAll();
    return computeSnapshot(entries, [], asOf);
  }
}
