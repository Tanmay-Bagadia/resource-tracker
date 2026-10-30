/**
 * @module cli
 * Command-line interface definition built with CAC.
 */

import { cac } from "cac";
import fs from "node:fs";
import { formatINR } from "@resource-tracker/core";
import { TrackerService } from "./service.ts";
import type { SourceFormat } from "@resource-tracker/ingest";

const defaultVaultPath = process.env["RT_VAULT_PATH"] ?? "./.rt-vault.json";

/**
 * Build the CAC CLI instance wired to a TrackerService.
 *
 * @param service - Optional service instance (defaults to new instance with persistence)
 * @returns Configured CAC CLI instance
 */
export function createCli(
  service: TrackerService = new TrackerService(undefined, defaultVaultPath),
) {
  const cli = cac("rt");

  // ── Record Command ────────────────────────────────────────────────────────
  cli
    .command(
      "record <kind>",
      "Record a new ledger event (expense, income, transfer)",
    )
    .option("--account <account>", "Source account ID (e.g. hdfc-salary)")
    .option("--amount <amount>", "Amount in INR (e.g. 1500.50)")
    .option("--description <description>", "Description of the event")
    .option("--date <date>", "Transaction date (YYYY-MM-DD, defaults to today)")
    .option(
      "--to-account <toAccount>",
      "Destination account ID (for transfers)",
    )
    .action((kind, options) => {
      if (!options.account) {
        throw new Error("Missing required option: --account <id>");
      }
      if (options.amount === undefined) {
        throw new Error("Missing required option: --amount <rupees>");
      }
      if (!options.description) {
        throw new Error("Missing required option: --description <text>");
      }

      const numAmount = parseFloat(options.amount);
      if (isNaN(numAmount) || numAmount <= 0) {
        throw new Error("Invalid amount: must be a positive number");
      }

      if (kind !== "expense" && kind !== "income" && kind !== "transfer") {
        throw new Error(
          `Invalid entry kind: "${kind}". Must be expense, income, or transfer.`,
        );
      }

      const entry = service.record({
        kind,
        account: options.account,
        amountRupees: numAmount,
        description: options.description,
        date: options.date,
        toAccount: options.toAccount,
      });

      console.log(
        `[OK] Recorded ${entry.kind}: ${entry.description} (${formatINR(entry.amountPaise)}) on ${entry.date}`,
      );
    });

  // ── Ingest Command ────────────────────────────────────────────────────────
  cli
    .command("ingest <file>", "Ingest a bank or mutual fund statement file")
    .option("--account <account>", "Target account ID")
    .option(
      "--format <format>",
      "Override format detection (e.g. hdfc_bank, icici_bank)",
    )
    .action((file, options) => {
      if (!options.account) {
        throw new Error("Missing required option: --account <id>");
      }
      if (!fs.existsSync(file)) {
        throw new Error(`File not found: ${file}`);
      }

      const content = fs.readFileSync(file, "utf-8");
      const result = service.ingestStatement({
        content,
        account: options.account,
        format: options.format as SourceFormat | undefined,
      });

      console.log("──────────────── Ingestion Summary ────────────────");
      console.log(
        `Format detected : ${result.detectedFormat.source} (${result.detectedFormat.confidence} confidence)`,
      );
      console.log(`Imported entries: ${result.rows.length}`);
      console.log(`Duplicates skipped: ${result.skippedDuplicates}`);
      console.log(`Needs review    : ${result.needsReview}`);
      if (result.errors.length > 0) {
        console.log(`Errors encountered: ${result.errors.length}`);
      }
      console.log("───────────────────────────────────────────────────");
    });

  // ── Balances Command ──────────────────────────────────────────────────────
  cli
    .command("balances", "Display derived account balances as of a date")
    .option("--as-of <date>", "Point-in-time calculation date (YYYY-MM-DD)")
    .action((options) => {
      const balances = service.getBalances(options.asOf);
      console.log("──────────────── Account Balances ────────────────");
      if (balances.length === 0) {
        console.log("No balances found.");
      } else {
        for (const b of balances) {
          console.log(`• ${b.accountId.padEnd(20)}: ${b.formatted}`);
        }
      }
      console.log("───────────────────────────────────────────────────");
    });

  // ── Status Command ────────────────────────────────────────────────────────
  cli
    .command("status", "Compute financial overview, net worth, and runway")
    .option("--as-of <date>", "Point-in-time calculation date (YYYY-MM-DD)")
    .action((options) => {
      const snap = service.getStatus(options.asOf);
      console.log("──────────────── Portfolio Status ─────────────────");
      console.log(`As of date      : ${snap.asOf}`);
      console.log(`Net Worth       : ${formatINR(snap.netWorthPaise)}`);
      console.log(`Liquid Assets   : ${formatINR(snap.liquidAssetsPaise)}`);
      console.log(`Monthly Spending: ${formatINR(snap.monthlySpendingPaise)}`);
      console.log(
        `Runway (months) : ${snap.runwayMonths === Infinity ? "Infinity" : snap.runwayMonths.toFixed(1)}`,
      );
      console.log(`Savings Rate    : ${(snap.savingsRate * 100).toFixed(1)}%`);
      if (snap.warnings.length > 0) {
        console.log("Warnings        :");
        for (const w of snap.warnings) {
          console.log(`  ⚠ ${w}`);
        }
      }
      console.log("───────────────────────────────────────────────────");
    });

  // ── Audit Trail Command ───────────────────────────────────────────────────
  cli
    .command("trail", "View immutable audit trail of ledger events")
    .option("--account <account>", "Filter by account ID")
    .option("--limit <limit>", "Limit number of entries shown", { default: 20 })
    .action((options) => {
      const limit =
        typeof options.limit === "number"
          ? options.limit
          : parseInt(options.limit ?? "20", 10);
      const entries = service.getAuditTrail({
        account: options.account,
        limit,
      });

      console.log("────────────────── Audit Trail ────────────────────");
      if (entries.length === 0) {
        console.log("No entries recorded in the ledger.");
      } else {
        for (const e of entries) {
          console.log(
            `[${e.date}] ${e.kind.toUpperCase().padEnd(8)} ${formatINR(e.amountPaise).padStart(14)} | ${e.description} (${e.accountId})`,
          );
        }
      }
      console.log("───────────────────────────────────────────────────");
    });

  cli.help();
  cli.version("0.1.0");

  return cli;
}
