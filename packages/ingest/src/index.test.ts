import { describe, it, expect } from "vitest";
import {
  parseCSV,
  serializeCSV,
  detectFormat,
  normalizeRows,
  generateDedupeKey,
  deduplicateRows,
  validateRow,
  validateBatch,
  ingest,
  toLedgerEntries,
} from "./index.ts";
import type { NormalizedRow, IngestOptions } from "./index.ts";
import { accountId, calendarDate, paise } from "@resource-tracker/core";

describe("@resource-tracker/ingest", () => {
  const targetAcc = accountId("acc-hdfc-123");

  describe("CSV Parser (RFC 4180)", () => {
    it("parses simple CSV content", () => {
      const csv =
        "Date,Description,Amount\n2025-01-01,Groceries,500\n2025-01-02,Salary,50000";
      const rows = parseCSV(csv);
      expect(rows).toHaveLength(2);
      expect(rows[0]).toEqual({
        Date: "2025-01-01",
        Description: "Groceries",
        Amount: "500",
      });
    });

    it("parses quoted fields with embedded commas and doubled quotes", () => {
      const csv =
        'Date,Description,Amount\n2025-01-01,"Swiggy, Bangalore",450\n2025-01-02,"Book: ""Clean Code""",800';
      const rows = parseCSV(csv);
      expect(rows[0]?.Description).toBe("Swiggy, Bangalore");
      expect(rows[1]?.Description).toBe('Book: "Clean Code"');
    });

    it("strips UTF-8 Byte Order Mark (BOM)", () => {
      const bomCsv = "\uFEFFDate,Amount\n2025-01-01,100";
      const rows = parseCSV(bomCsv);
      expect(rows[0]).toHaveProperty("Date");
      expect(rows[0]?.Date).toBe("2025-01-01");
    });

    it("serializes records back to CSV", () => {
      const records = [{ Name: "Tanmay", Note: "Hello, World" }];
      const serialized = serializeCSV(records);
      expect(serialized).toContain('"Hello, World"');
    });
  });

  describe("Format Detector", () => {
    it("detects HDFC Bank CSV headers", () => {
      const hdfcSample =
        "Date,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance\n01/01/25,UPI,REF123,01/01/25,500.00,,10000.00";
      const res = detectFormat(hdfcSample);
      expect(res.format).toBe("csv");
      expect(res.source).toBe("hdfc_bank");
      expect(res.confidence).toBe("high");
    });

    it("detects ICICI Bank CSV headers", () => {
      const iciciSample =
        "Transaction Date,Value Date,Description,Debit,Credit,Balance\n01-01-2025,01-01-2025,Salary,,50000.00,100000.00";
      const res = detectFormat(iciciSample);
      expect(res.source).toBe("icici_bank");
    });

    it("detects JSON array input", () => {
      const jsonSample = JSON.stringify([
        { Date: "2025-01-01", Amount: "500" },
      ]);
      const res = detectFormat(jsonSample);
      expect(res.format).toBe("json");
    });

    it("falls back to generic bank or unknown", () => {
      const generic =
        "Txn Date,Particulars,Amount,Balance\n2025-01-01,Coffee,100,5000";
      const res = detectFormat(generic);
      expect(res.source).toBe("generic_bank");

      const unknown = "Foo,Bar,Baz\n1,2,3";
      expect(detectFormat(unknown).source).toBe("unknown");
    });
  });

  describe("Normalizer", () => {
    const defaultOptions: IngestOptions = { accountId: targetAcc };

    it("normalizes HDFC rows with separate debit/credit into expense/income in Paise", () => {
      const rows = [
        {
          Date: "15/01/2025",
          Narration: "Swiggy UPI",
          "Chq./Ref.No.": "REF001",
          "Value Dt": "15/01/2025",
          "Withdrawal Amt.": "450.50",
          "Deposit Amt.": "",
          "Closing Balance": "50,000.00",
        },
        {
          Date: "20/01/2025",
          Narration: "Tech Corp Salary",
          "Chq./Ref.No.": "REF002",
          "Value Dt": "20/01/2025",
          "Withdrawal Amt.": "",
          "Deposit Amt.": "1,25,000.00",
          "Closing Balance": "1,75,000.00",
        },
      ];

      const { normalized, errors } = normalizeRows(
        rows,
        "hdfc_bank",
        defaultOptions,
      );
      expect(errors).toHaveLength(0);
      expect(normalized).toHaveLength(2);

      // Debit row -> expense
      expect(normalized[0]?.date).toBe("2025-01-15");
      expect(normalized[0]?.kind).toBe("expense");
      expect(normalized[0]?.amountPaise).toBe(45050); // ₹450.50 = 45050 paise
      expect(normalized[0]?.balance).toBe(5000000);

      // Credit row -> income
      expect(normalized[1]?.kind).toBe("income");
      expect(normalized[1]?.amountPaise).toBe(12500000); // ₹1,25,000.00 = 12500000 paise
    });

    it("flags ambiguous dates for review", () => {
      const rows = [
        { Date: "05/06/2025", Description: "Test", Debit: "100", Credit: "" },
      ];
      const { normalized } = normalizeRows(
        rows,
        "generic_bank",
        defaultOptions,
      );
      expect(normalized[0]?.needsReview).toBe(true);
      expect(normalized[0]?.reviewReason).toContain("Ambiguous date");
    });
  });

  describe("Deduplication and Idempotency", () => {
    it("generates deterministic dedup keys", () => {
      const row: NormalizedRow = {
        date: calendarDate("2025-01-01"),
        description: "Amazon Order",
        amountPaise: paise(149900),
        kind: "expense",
        needsReview: false,
        rawRow: {},
      };

      const key1 = generateDedupeKey(row, targetAcc, 0);
      const key2 = generateDedupeKey(row, targetAcc, 0);
      expect(key1).toBe(key2);
      expect(key1).toContain("2025-01-01:expense:149900");
    });

    it("assigns distinct occurrence index to identical same-day transactions", () => {
      const row: NormalizedRow = {
        date: calendarDate("2025-01-01"),
        description: "Metro Ticket",
        amountPaise: paise(4000),
        kind: "expense",
        needsReview: false,
        rawRow: {},
      };

      const { unique } = deduplicateRows([row, row], new Set(), targetAcc);
      expect(unique).toHaveLength(2);
      expect(unique[0]?.dedupeKey).not.toBe(unique[1]?.dedupeKey);
      expect(unique[0]?.dedupeKey).toContain(":0");
      expect(unique[1]?.dedupeKey).toContain(":1");
    });

    it("skips previously ingested transactions when present in existingKeys (idempotency)", () => {
      const row: NormalizedRow = {
        date: calendarDate("2025-01-01"),
        description: "Metro Ticket",
        amountPaise: paise(4000),
        kind: "expense",
        needsReview: false,
        rawRow: {},
      };

      const existingKey = generateDedupeKey(row, targetAcc, 0);
      const existingKeys = new Set([existingKey]);

      const { unique, duplicateCount } = deduplicateRows(
        [row],
        existingKeys,
        targetAcc,
      );
      expect(unique).toHaveLength(0);
      expect(duplicateCount).toBe(1);
    });
  });

  describe("Validation", () => {
    it("validates well-formed rows", () => {
      const row: NormalizedRow = {
        date: calendarDate("2025-01-10"),
        description: "Valid Entry",
        amountPaise: paise(50000),
        kind: "expense",
        needsReview: false,
        rawRow: {},
      };
      const res = validateRow(row);
      expect(res.ok).toBe(true);
    });

    it("rejects invalid rows and produces structured errors", () => {
      const invalid = {
        date: "invalid-date",
        description: "Test",
        amountPaise: "not-a-number",
      };
      const res = validateRow(invalid);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.length).toBeGreaterThan(0);
      }
    });

    it("validates batches cleanly", () => {
      const row: NormalizedRow = {
        date: calendarDate("2025-01-10"),
        description: "Valid Entry",
        amountPaise: paise(50000),
        kind: "expense",
        needsReview: false,
        rawRow: {},
      };
      const { valid, errors } = validateBatch([row]);
      expect(valid).toHaveLength(1);
      expect(errors).toHaveLength(0);
    });
  });

  describe("Full Ingestion Pipeline & toLedgerEntries", () => {
    const csvContent = `Date,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance
15/01/2025,Swiggy UPI,REF101,15/01/2025,450.00,,50000.00
20/01/2025,Salary,REF102,20/01/2025,,100000.00,150000.00`;

    it("ingests CSV and outputs valid DeduplicatedRows", () => {
      const res = ingest(csvContent, { accountId: targetAcc });
      expect(res.rows).toHaveLength(2);
      expect(res.skippedDuplicates).toBe(0);
      expect(res.detectedFormat.source).toBe("hdfc_bank");

      // Verify conversion to immutable LedgerEntry domain events
      const entries = toLedgerEntries(res.rows, targetAcc);
      expect(entries).toHaveLength(2);
      expect(entries[0]?.kind).toBe("expense");
      expect(entries[0]?.amountPaise).toBe(45000);
      expect(entries[1]?.kind).toBe("income");
      expect(entries[1]?.amountPaise).toBe(10000000);
    });

    it("re-ingesting with existingKeys skips duplicate entries", () => {
      const first = ingest(csvContent, { accountId: targetAcc });
      const existingKeys = new Set(first.rows.map((r) => r.dedupeKey));

      const second = ingest(csvContent, {
        accountId: targetAcc,
        existingKeys,
      });

      expect(second.rows).toHaveLength(0);
      expect(second.skippedDuplicates).toBe(2);
    });
  });
});
