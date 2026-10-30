# Resource Tracker

A high-integrity personal finance platform designed for Indian salaried investors. Transforms statement exports (bank CSVs, mutual fund statements) into a unified, accurate picture of net worth, cash flow, runway, and portfolio asset allocation — completely offline and local-first.

---

## Core Design Principles

1. **Fixed-Point Integer Money Math** ([ADR 001](docs/adr/001-money-representation.md)):
   Monetary values are never stored or calculated with floating-point numbers. All currency amounts are represented in integer minor units (paise for INR, where ₹1.00 = 100 paise) via TypeScript branded types (`Paise`), eliminating floating-point rounding drift.

2. **Event-Sourced Ledger — "Derive State, Don't Store It"** ([ADR 002](docs/adr/002-event-based-ledger.md)):
   Balances, holdings, and portfolio valuations are not stored as mutable summary rows. Instead, the ledger stores an immutable stream of dated events (`LedgerEntry`). Account balances, asset allocations, and net worth snapshots are purely derived by deterministic event replay.

3. **Safe Ingestion & Idempotency**:
   Bank and broker statements are parsed using RFC 4180 compliant CSV parsers with bank-specific normalizers (HDFC, ICICI, SBI, Axis, and generic statements). Deterministic fingerprint keys prevent duplicate entries upon re-ingestion.

---

## Monorepo Layout

```
├── packages/
│   ├── core/       # Pure domain models, branded money units, event ledger, replay, periods
│   ├── storage/    # Persistence repositories (Unit of Work, Event Store, Snapshot Cache)
│   ├── ingest/     # CSV/JSON parsers, format detection, normalizers, and dedup pipeline
│   └── market/     # In-memory price registry, AMFI NAV parser, asset lookup, staleness reports
├── apps/
│   └── cli/        # Command-line interface (`rt`) built with CAC
└── docs/
    └── adr/        # Architecture Decision Records
```

---

## Getting Started

### Prerequisites

- **Node.js**: `>= 22.0.0`
- **npm**: `>= 11.0.0`

### Installation & Build

```bash
# Install workspace dependencies
npm install

# Type-check across all packages
npm run check-types

# Build packages and applications
npm run build

# Run unit and property-based test suites
npm test

# Lint source files
npm run lint

# Format code
npm run format
```

---

## CLI Usage (`rt`)

The repository includes a fast command-line test bench and operational tool (`@resource-tracker/cli`).

### Record Ledger Events

```bash
# Record an income event
npx rt record income --account hdfc-salary --amount 125000.00 --description "Monthly Salary" --date 2025-01-01

# Record an expense
npx rt record expense --account hdfc-salary --amount 18500.00 --description "Rent Payment" --date 2025-01-05

# Record an inter-account transfer (does not double-count as expense)
npx rt record transfer --account hdfc-salary --to-account sbi-savings --amount 25000.00 --description "Emergency Fund" --date 2025-01-10
```

### Ingest Bank Statements

```bash
# Ingest statement CSV (auto-detects HDFC, ICICI, SBI, Axis, or generic format)
npx rt ingest statement.csv --account hdfc-salary
```

Re-importing the same statement is idempotent — existing records are automatically detected and skipped.

### Query Balances & Portfolio Status

```bash
# View derived balances across all accounts
npx rt balances

# Point-in-time balances
npx rt balances --as-of 2025-01-15

# View net worth, monthly burn rate, runway, and savings rate
npx rt status
```

### View Audit Trail

```bash
# View chronological audit trail of ledger events
npx rt trail

# Filter audit trail by account
npx rt trail --account hdfc-salary --limit 50
```

---

## Testing

The test suite uses [Vitest](https://vitest.dev/) and [fast-check](https://fast-check.dev/) to verify both unit behavior and mathematical invariants:

- **Conservation of money**: Splitting and recombining amounts retains exact integer paise totals.
- **Algebraic invariants**: Addition commutativity ($a + b = b + a$) and identity ($a + 0 = a$).
- **Replay determinism**: Shuffled or re-ordered event logs produce identical account balances.
- **Idempotency**: Ingesting the same transaction file multiple times yields zero duplicate entries.

```bash
npm test
```
