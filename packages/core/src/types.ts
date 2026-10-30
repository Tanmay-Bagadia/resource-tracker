/**
 * @module types
 * Core domain types for the resource-tracker.
 * Uses branded types for type safety and discriminated unions for events.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Branded primitives
// ---------------------------------------------------------------------------

/** Unique brand symbol for Paise type. */
export declare const PaiseBrand: unique symbol;
/** Money in Indian paise (1 INR = 100 paise). Always an integer. */
export type Paise = number & { readonly [PaiseBrand]: typeof PaiseBrand };

/** Unique brand symbol for CalendarDate type. */
export declare const CalendarDateBrand: unique symbol;
/** ISO date string in YYYY-MM-DD format. */
export type CalendarDate = string & {
  readonly [CalendarDateBrand]: typeof CalendarDateBrand;
};

/** Unique brand symbol for AccountId type. */
export declare const AccountIdBrand: unique symbol;
/** Unique identifier for an account. */
export type AccountId = string & {
  readonly [AccountIdBrand]: typeof AccountIdBrand;
};

/** Unique brand symbol for InstrumentId type. */
export declare const InstrumentIdBrand: unique symbol;
/** Unique identifier for a financial instrument. */
export type InstrumentId = string & {
  readonly [InstrumentIdBrand]: typeof InstrumentIdBrand;
};

/** Unique brand symbol for EntryId type. */
export declare const EntryIdBrand: unique symbol;
/** Unique identifier for a ledger entry. */
export type EntryId = string & {
  readonly [EntryIdBrand]: typeof EntryIdBrand;
};

// ---------------------------------------------------------------------------
// Smart Constructors
// ---------------------------------------------------------------------------

/**
 * Create a CalendarDate from a YYYY-MM-DD string.
 * @throws if the string is not a valid date format.
 */
export function calendarDate(value: string): CalendarDate {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new Error(`CalendarDate must be YYYY-MM-DD, got "${value}"`);
  }
  const [, y, m, d] = match;
  const date = new Date(value + "T00:00:00Z");
  if (
    isNaN(date.getTime()) ||
    date.getUTCFullYear() !== parseInt(y!, 10) ||
    date.getUTCMonth() + 1 !== parseInt(m!, 10) ||
    date.getUTCDate() !== parseInt(d!, 10)
  ) {
    throw new Error(`CalendarDate is not a valid date: "${value}"`);
  }
  return value as CalendarDate;
}

/**
 * Create an AccountId from a non-empty string.
 * @throws if the string is empty.
 */
export function accountId(value: string): AccountId {
  if (value.length === 0) throw new Error("AccountId cannot be empty");
  return value as AccountId;
}

/**
 * Create an InstrumentId from a non-empty string.
 * @throws if the string is empty.
 */
export function instrumentId(value: string): InstrumentId {
  if (value.length === 0) throw new Error("InstrumentId cannot be empty");
  return value as InstrumentId;
}

/**
 * Create an EntryId from a non-empty string.
 * @throws if the string is empty.
 */
export function entryId(value: string): EntryId {
  if (value.length === 0) throw new Error("EntryId cannot be empty");
  return value as EntryId;
}

// ---------------------------------------------------------------------------
// Zod schemas for branded types
// ---------------------------------------------------------------------------

/** Zod schema that validates an ISO date string (YYYY-MM-DD). */
export const CalendarDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD format")
  .transform((s) => s as CalendarDate);

/** Zod schema that validates a safe integer for Paise. */
export const PaiseSchema = z
  .number()
  .int("Paise must be an integer")
  .safe("Paise must be a safe integer")
  .transform((n) => n as Paise);

/** Zod schema for AccountId. */
export const AccountIdSchema = z
  .string()
  .min(1)
  .transform((s) => s as AccountId);

/** Zod schema for InstrumentId. */
export const InstrumentIdSchema = z
  .string()
  .min(1)
  .transform((s) => s as InstrumentId);

/** Zod schema for EntryId. */
export const EntryIdSchema = z
  .string()
  .min(1)
  .transform((s) => s as EntryId);

// ---------------------------------------------------------------------------
// Account
// ---------------------------------------------------------------------------

/** Supported account types. */
export const AccountTypeEnum = z.enum([
  "bank",
  "credit_card",
  "broker",
  "mf_folio",
  "loan",
  "manual",
]);
export type AccountType = z.infer<typeof AccountTypeEnum>;

/** A financial account the user tracks. */
export interface Account {
  readonly id: AccountId;
  readonly name: string;
  readonly type: AccountType;
  readonly currency: "INR";
}

export const AccountSchema = z.object({
  id: AccountIdSchema,
  name: z.string().min(1),
  type: AccountTypeEnum,
  currency: z.literal("INR"),
});

// ---------------------------------------------------------------------------
// Instrument
// ---------------------------------------------------------------------------

/** Supported instrument types. */
export const InstrumentTypeEnum = z.enum([
  "equity",
  "mutual_fund",
  "fd",
  "ppf",
  "crypto",
  "esop",
]);
export type InstrumentType = z.infer<typeof InstrumentTypeEnum>;

/** A financial instrument (stock, MF, FD, etc.). */
export interface Instrument {
  readonly id: InstrumentId;
  readonly name: string;
  readonly type: InstrumentType;
  readonly isin?: string;
  readonly amfiCode?: string;
}

export const InstrumentSchema = z.object({
  id: InstrumentIdSchema,
  name: z.string().min(1),
  type: InstrumentTypeEnum,
  isin: z.string().optional(),
  amfiCode: z.string().optional(),
});

// ---------------------------------------------------------------------------
// LedgerEntry — discriminated union on `kind`
// ---------------------------------------------------------------------------

/** All possible entry kinds. */
export const EntryKindEnum = z.enum([
  "expense",
  "income",
  "transfer",
  "buy",
  "sell",
  "dividend",
  "interest",
  "fee",
  "sip",
]);
export type EntryKind = z.infer<typeof EntryKindEnum>;

/** Fields shared by every ledger entry. */
interface LedgerEntryBase {
  readonly id: EntryId;
  readonly accountId: AccountId;
  readonly date: CalendarDate;
  readonly amountPaise: Paise;
  readonly description: string;
  readonly sourceRef?: string;
  readonly dedupeKey: string;
  readonly createdAt: string;
}

/** Expense entry: money going out. */
export interface ExpenseEntry extends LedgerEntryBase {
  readonly kind: "expense";
}

/** Income entry: money coming in. */
export interface IncomeEntry extends LedgerEntryBase {
  readonly kind: "income";
}

/** Transfer between two accounts. */
export interface TransferEntry extends LedgerEntryBase {
  readonly kind: "transfer";
  readonly toAccountId: AccountId;
}

/** Instrument purchase. */
export interface BuyEntry extends LedgerEntryBase {
  readonly kind: "buy";
  readonly instrumentId: InstrumentId;
  readonly units: number;
  readonly pricePerUnitPaise: Paise;
}

/** Instrument sale. */
export interface SellEntry extends LedgerEntryBase {
  readonly kind: "sell";
  readonly instrumentId: InstrumentId;
  readonly units: number;
  readonly pricePerUnitPaise: Paise;
}

/** Dividend income from an instrument. */
export interface DividendEntry extends LedgerEntryBase {
  readonly kind: "dividend";
  readonly instrumentId?: InstrumentId;
}

/** Interest earned. */
export interface InterestEntry extends LedgerEntryBase {
  readonly kind: "interest";
  readonly instrumentId?: InstrumentId;
}

/** Fee charged. */
export interface FeeEntry extends LedgerEntryBase {
  readonly kind: "fee";
}

/** Systematic Investment Plan purchase. */
export interface SipEntry extends LedgerEntryBase {
  readonly kind: "sip";
  readonly instrumentId: InstrumentId;
  readonly units: number;
  readonly pricePerUnitPaise: Paise;
}

/** Discriminated union of all ledger entry types. */
export type LedgerEntry =
  | ExpenseEntry
  | IncomeEntry
  | TransferEntry
  | BuyEntry
  | SellEntry
  | DividendEntry
  | InterestEntry
  | FeeEntry
  | SipEntry;

// ---------------------------------------------------------------------------
// Zod schemas for LedgerEntry variants
// ---------------------------------------------------------------------------

const LedgerEntryBaseSchema = z.object({
  id: EntryIdSchema,
  accountId: AccountIdSchema,
  date: CalendarDateSchema,
  amountPaise: PaiseSchema,
  description: z.string(),
  sourceRef: z.string().optional(),
  dedupeKey: z.string(),
  createdAt: z.string(),
});

export const ExpenseEntrySchema = LedgerEntryBaseSchema.extend({
  kind: z.literal("expense"),
});

export const IncomeEntrySchema = LedgerEntryBaseSchema.extend({
  kind: z.literal("income"),
});

export const TransferEntrySchema = LedgerEntryBaseSchema.extend({
  kind: z.literal("transfer"),
  toAccountId: AccountIdSchema,
});

export const BuyEntrySchema = LedgerEntryBaseSchema.extend({
  kind: z.literal("buy"),
  instrumentId: InstrumentIdSchema,
  units: z.number(),
  pricePerUnitPaise: PaiseSchema,
});

export const SellEntrySchema = LedgerEntryBaseSchema.extend({
  kind: z.literal("sell"),
  instrumentId: InstrumentIdSchema,
  units: z.number(),
  pricePerUnitPaise: PaiseSchema,
});

export const DividendEntrySchema = LedgerEntryBaseSchema.extend({
  kind: z.literal("dividend"),
  instrumentId: InstrumentIdSchema.optional(),
});

export const InterestEntrySchema = LedgerEntryBaseSchema.extend({
  kind: z.literal("interest"),
  instrumentId: InstrumentIdSchema.optional(),
});

export const FeeEntrySchema = LedgerEntryBaseSchema.extend({
  kind: z.literal("fee"),
});

export const SipEntrySchema = LedgerEntryBaseSchema.extend({
  kind: z.literal("sip"),
  instrumentId: InstrumentIdSchema,
  units: z.number(),
  pricePerUnitPaise: PaiseSchema,
});

export const LedgerEntrySchema = z.discriminatedUnion("kind", [
  ExpenseEntrySchema,
  IncomeEntrySchema,
  TransferEntrySchema,
  BuyEntrySchema,
  SellEntrySchema,
  DividendEntrySchema,
  InterestEntrySchema,
  FeeEntrySchema,
  SipEntrySchema,
]);

// ---------------------------------------------------------------------------
// Price
// ---------------------------------------------------------------------------

/** Market price for an instrument on a given date. */
export interface Price {
  readonly instrumentId: InstrumentId;
  readonly date: CalendarDate;
  readonly valuePaise: Paise;
  readonly source: string;
  readonly fetchedAt: string;
}

export const PriceSchema = z.object({
  instrumentId: InstrumentIdSchema,
  date: CalendarDateSchema,
  valuePaise: PaiseSchema,
  source: z.string(),
  fetchedAt: z.string(),
});

// ---------------------------------------------------------------------------
// Derived types
// ---------------------------------------------------------------------------

/** A holding derived from replaying buy/sell/sip events. */
export interface Holding {
  readonly instrumentId: InstrumentId;
  readonly accountId: AccountId;
  readonly units: number;
  readonly avgCostPaise: Paise;
  readonly currentValuePaise?: Paise;
}

/** A point-in-time snapshot of the user's financial state. */
export interface Snapshot {
  readonly asOf: CalendarDate;
  readonly netWorthPaise: Paise;
  readonly liquidAssetsPaise: Paise;
  readonly monthlySpendingPaise: Paise;
  readonly runwayMonths: number;
  readonly savingsRate: number;
  readonly allocation: ReadonlyMap<string, Paise>;
  readonly unpricedHoldings: readonly Holding[];
  readonly warnings: readonly string[];
}
