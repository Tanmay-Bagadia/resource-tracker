# ADR 001: Money Representation via Integer Minor Units

## Status

Accepted

## Context

Financial calculations in JavaScript/TypeScript using standard floating-point `number` (`0.1 + 0.2 !== 0.3`) accumulate rounding errors, create currency drift, and lead to invalid mathematical comparisons.

## Decision

All monetary values inside `@resource-tracker/core` and storage will be represented strictly as **integer minor units** (paise for INR: ₹1.00 = 100 paise).

- Floating-point `number` is prohibited for storing money.
- Units and quantities (e.g., mutual fund units with 3-4 decimals) use explicit decimal scaling or dedicated decimal math.
- Branded types are used to enforce domain boundaries (e.g. separating DailyBurn from MonthlyBurn at compile time).

## Consequences

- No floating-point precision drift.
- All database columns storing currency are standard integers (`INTEGER` in SQLite).
- Currency formatting (e.g. `₹1,00,000.50`) is restricted to the presentation boundary.
