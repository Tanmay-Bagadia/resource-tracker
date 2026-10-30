# ADR 002: Event-Based Ledger ("Derive State, Don't Store It")

## Status

Accepted

## Context

Traditional tracker apps store mutable summary state (`currentBalance`, `currentValue`, `totalSpent`, `vestedUnits`). Over time, deletions, edits, split transactions, and market price updates cause stored balances to drift out of sync with real accounts. Furthermore, calculating XIRR and capital gains requires dated transaction histories.

## Decision

The core ledger records immutable **events** (`LedgerEntry`). State is never stored directly as a source of truth.

- Accounts, instruments, dated entries, and market prices are stored.
- Holdings, portfolio values, net worth snapshots, asset allocation, and capital gains are **purely derived** from the ledger events + price history as of a specific date.

## Consequences

- Eliminates balance desynchronization and `NaN` states.
- Enables point-in-time reconstruction of net worth.
- Makes testing deterministic: given the same events and prices, derived state is identical.
