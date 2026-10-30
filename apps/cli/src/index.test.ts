import { describe, it, expect, vi } from "vitest";
import { TrackerService } from "./service.ts";
import { createCli } from "./cli.ts";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

describe("@resource-tracker/cli", () => {
  describe("TrackerService", () => {
    it("records manual expense, income, and transfer events", () => {
      const service = new TrackerService();

      const inc = service.record({
        kind: "income",
        account: "bank-salary",
        amountRupees: 100000,
        description: "Monthly Salary",
        date: "2025-01-01",
      });
      expect(inc.amountPaise).toBe(10000000);
      expect(inc.kind).toBe("income");

      const exp = service.record({
        kind: "expense",
        account: "bank-salary",
        amountRupees: 15000,
        description: "Rent Payment",
        date: "2025-01-05",
      });
      expect(exp.amountPaise).toBe(1500000);

      const trf = service.record({
        kind: "transfer",
        account: "bank-salary",
        toAccount: "bank-savings",
        amountRupees: 20000,
        description: "Move to savings",
        date: "2025-01-10",
      });
      expect(trf.kind).toBe("transfer");

      // Verify balances:
      // bank-salary: 100k - 15k - 20k = 65k
      // bank-savings: +20k
      const balances = service.getBalances("2025-01-31");
      const salaryBal = balances.find((b) => b.accountId === "bank-salary");
      const savingsBal = balances.find((b) => b.accountId === "bank-savings");

      expect(salaryBal?.balancePaise).toBe(6500000);
      expect(savingsBal?.balancePaise).toBe(2000000);
    });

    it("requires --to-account for transfer entries", () => {
      const service = new TrackerService();
      expect(() =>
        service.record({
          kind: "transfer",
          account: "bank-1",
          amountRupees: 500,
          description: "No destination",
        }),
      ).toThrow(/Transfer entries require --to-account/);
    });

    it("ingests statement CSV files and deduplicates re-imports", () => {
      const service = new TrackerService();
      const csv = `Date,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance
01/01/2025,Salary,REF1,01/01/2025,,100000.00,100000.00
05/01/2025,Swiggy,REF2,05/01/2025,500.00,,99500.00`;

      const first = service.ingestStatement({
        content: csv,
        account: "bank-hdfc",
      });
      expect(first.rows).toHaveLength(2);
      expect(first.skippedDuplicates).toBe(0);

      // Re-ingest exact same content -> zero new rows, 2 skipped
      const second = service.ingestStatement({
        content: csv,
        account: "bank-hdfc",
      });
      expect(second.rows).toHaveLength(0);
      expect(second.skippedDuplicates).toBe(2);

      // Verify balance reflects first import: 100k - 500 = 99,500
      const balances = service.getBalances("2025-01-31");
      const hdfc = balances.find((b) => b.accountId === "bank-hdfc");
      expect(hdfc?.balancePaise).toBe(9950000);
    });

    it("retrieves audit trail and applies filters", () => {
      const service = new TrackerService();
      service.record({
        kind: "income",
        account: "acc-1",
        amountRupees: 1000,
        description: "Entry 1",
        date: "2025-01-01",
      });
      service.record({
        kind: "expense",
        account: "acc-2",
        amountRupees: 200,
        description: "Entry 2",
        date: "2025-01-02",
      });
      service.record({
        kind: "expense",
        account: "acc-1",
        amountRupees: 300,
        description: "Entry 3",
        date: "2025-01-03",
      });

      const all = service.getAuditTrail();
      expect(all).toHaveLength(3);

      const filtered = service.getAuditTrail({ account: "acc-1" });
      expect(filtered).toHaveLength(2);

      const limited = service.getAuditTrail({ limit: 1 });
      expect(limited).toHaveLength(1);
      expect(limited[0]?.description).toBe("Entry 3");
    });

    it("computes financial status and runway", () => {
      const service = new TrackerService();
      service.record({
        kind: "income",
        account: "acc-salary",
        amountRupees: 80000,
        description: "Salary",
        date: "2025-01-01",
      });
      service.record({
        kind: "expense",
        account: "acc-salary",
        amountRupees: 20000,
        description: "Expenses",
        date: "2025-01-10",
      });

      const status = service.getStatus("2025-01-15");
      expect(status.netWorthPaise).toBe(6000000); // 80k - 20k = 60k
      expect(status.monthlySpendingPaise).toBe(2000000);
      expect(status.runwayMonths).toBeCloseTo(3.0, 1); // 60k / 20k = 3 months
    });
  });

  describe("CAC CLI Command Handlers", () => {
    it("handles `record` command via CAC parse", () => {
      const service = new TrackerService();
      const cli = createCli(service);
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      cli.parse([
        "node",
        "rt",
        "record",
        "expense",
        "--account",
        "hdfc-test",
        "--amount",
        "1250.75",
        "--description",
        "Books and stationery",
        "--date",
        "2025-01-10",
      ]);

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining("[OK] Recorded expense: Books and stationery"),
      );

      const trail = service.getAuditTrail();
      expect(trail).toHaveLength(1);
      expect(trail[0]?.amountPaise).toBe(125075);

      logSpy.mockRestore();
    });

    it("handles `balances` command via CAC parse", () => {
      const service = new TrackerService();
      service.record({
        kind: "income",
        account: "hdfc-main",
        amountRupees: 50000,
        description: "Consulting",
        date: "2025-01-01",
      });

      const cli = createCli(service);
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      cli.parse(["node", "rt", "balances"]);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("hdfc-main"));

      logSpy.mockRestore();
    });

    it("handles `status` command via CAC parse", () => {
      const service = new TrackerService();
      service.record({
        kind: "income",
        account: "acc-1",
        amountRupees: 10000,
        description: "Bonus",
        date: "2025-01-01",
      });

      const cli = createCli(service);
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      cli.parse(["node", "rt", "status"]);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Net Worth"));

      logSpy.mockRestore();
    });

    it("handles `ingest` command reading a file via CAC parse", () => {
      const tmpDir = os.tmpdir();
      const testCsvPath = path.join(tmpDir, `rt_test_${Date.now()}.csv`);
      const csv = `Date,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance
01/01/2025,Salary,REF001,01/01/2025,,75000.00,75000.00`;
      fs.writeFileSync(testCsvPath, csv, "utf-8");

      try {
        const service = new TrackerService();
        const cli = createCli(service);
        const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

        cli.parse([
          "node",
          "rt",
          "ingest",
          testCsvPath,
          "--account",
          "hdfc-imported",
        ]);

        expect(logSpy).toHaveBeenCalledWith(
          expect.stringContaining("Imported entries: 1"),
        );
        expect(service.getAuditTrail()).toHaveLength(1);

        logSpy.mockRestore();
      } finally {
        fs.unlinkSync(testCsvPath);
      }
    });
  });
});

