# Overseas expense tracking spike

## Existing currency model reused

- Settlement amount and settlement currency continue to use the existing canonical `Expense.amount` and `Expense.currency` fields.
- Existing balance calculations still read settlement values only, so no balance SQL or simplification logic changed.
- The spike reuses the existing `currencyConversion()` helper for reproducible rounding.

## Schema changes

- Added nullable `Expense.originalAmount`
- Added nullable `Expense.originalCurrency`
- Added nullable `Expense.conversionRate`

Existing expenses remain valid because all new fields are nullable.

## Rate meaning

- `conversionRate` means **settlement-currency major units per 1 original-currency major unit**.
- Example: `0.0091` means `1 JPY = 0.0091 SGD`.

## Rounding behavior

- Settlement amounts are still stored as `BigInt` minor units.
- Conversion uses the existing `currencyConversion()` helper, which rounds with `BigMath.roundDiv()`.
- This keeps stored settlement amounts reproducible from `originalAmount`, `originalCurrency`, `currency`, and `conversionRate`.

## Manual testing steps

1. Create a normal same-currency expense and confirm it looks unchanged.
2. Create an expense in a settlement currency, open **Original paid amount**, and enter a different paid currency, amount, and rate.
3. Confirm the settlement preview updates and saving the drawer updates the main settlement amount.
4. Save the expense and verify balances still use the settlement amount.
5. Open the saved expense and confirm the original amount/currency appears as secondary metadata.
6. Edit the expense, change the original paid amount or rate, and confirm the activity feed still shows the expense as edited.
7. Create a negative/refund expense with foreign-currency metadata and confirm the converted settlement amount stays negative.

## Deferred work

- No Trip model
- No trip dashboards
- No CSV export
- No cash lots
- No payment methods
- No card analytics
- No new FX providers

# Travel Wallet and card analytics

## Data model

- Added `Card` as a user-owned wallet item with optional issuer, network, notes, and `archivedAt`.
- Added nullable `Expense.cardId` with `ON DELETE SET NULL` so historical expenses remain valid if a card record is removed later.
- Archived cards are hidden from expense entry but preserved for historical analytics.

## Expense behavior

- Card attribution is optional and is stored beside the existing overseas metadata.
- `Expense.amount` and `Expense.currency` remain the canonical settlement values.
- Balance, settlement, participant split, and simplification logic continue to read the same fields as before.

## Analytics

- Card analytics use only stored expense data. No external FX APIs are called.
- Spending by card is grouped by settlement currency.
- Foreign spending by currency is grouped by original currency.
- Average effective rates use stored `Expense.conversionRate` values.
- Insights require at least three relevant samples before naming a most-used or best-rate card.

## Future expansion points

- Card fee modeling can be added with card-level fee fields or a separate fee schedule table.
- Cashback tracking can be layered onto cards without changing expense settlement fields.
- Live FX benchmarking can compare stored effective rates with a new benchmark table or provider cache.
- Shared card analytics can be added by introducing explicit card-sharing permissions instead of overloading group membership.
