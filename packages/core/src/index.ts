/**
 * @module @resource-tracker/core
 * Core domain types, fixed-point integer money math, event-sourced ledger,
 * period utilities, and snapshot generation.
 */

export const CORE_VERSION = "0.1.0";

// Domain Types and Schemas
export * from "./types.ts";

// Fixed-point Integer Money Representation & Math
export * from "./money.ts";

// Financial Reporting Periods
export * from "./period.ts";

// Functional Result Type
export * from "./result.ts";

// Event-Sourced Ledger Operations & Balance / Holdings Derivation
export * from "./ledger.ts";

// Financial Snapshots
export * from "./snapshot.ts";
