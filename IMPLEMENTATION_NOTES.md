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
