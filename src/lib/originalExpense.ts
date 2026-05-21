import { type Expense } from '@prisma/client';

import { type CurrencyCode, isCurrencyCode } from '~/lib/currency';
import {
  MAX_RATE_PRECISION,
  currencyConversion,
  getRatePrecision,
  removeTrailingZeros,
} from '~/utils/numbers';

type OriginalExpenseFields = Pick<
  Expense,
  'amount' | 'currency' | 'originalAmount' | 'originalCurrency' | 'conversionRate'
>;

const normalizeNullable = <T>(value: T | null | undefined) => value ?? null;

export const hasOriginalExpenseDetails = ({
  currency,
  originalAmount,
  originalCurrency,
  conversionRate,
}: Partial<OriginalExpenseFields>) =>
  null !== normalizeNullable(originalAmount) &&
  null !== normalizeNullable(originalCurrency) &&
  null !== normalizeNullable(conversionRate) &&
  normalizeNullable(originalCurrency) !== currency;

export const normalizeOriginalExpenseFields = <T extends OriginalExpenseFields>(expense: T): T => {
  const originalAmount = normalizeNullable(expense.originalAmount);
  const originalCurrency = normalizeNullable(expense.originalCurrency);
  const conversionRate = normalizeNullable(expense.conversionRate);
  const hasAnyOriginalField =
    null !== originalAmount || null !== originalCurrency || null !== conversionRate;

  if (!hasAnyOriginalField || originalCurrency === expense.currency) {
    return {
      ...expense,
      originalAmount: null,
      originalCurrency: null,
      conversionRate: null,
    };
  }

  if (null === originalAmount || null === originalCurrency || null === conversionRate) {
    throw new Error('Original amount, original currency, and conversion rate are required');
  }

  if (!isCurrencyCode(expense.currency)) {
    throw new Error(`Invalid settlement currency code: ${expense.currency}`);
  }

  if (!isCurrencyCode(originalCurrency)) {
    throw new Error(`Invalid original currency code: ${originalCurrency}`);
  }

  if (!Number.isFinite(conversionRate) || conversionRate <= 0) {
    throw new Error('Conversion rate must be positive');
  }

  const expectedSettlementAmount = currencyConversion({
    amount: originalAmount,
    rate: conversionRate,
    from: originalCurrency,
    to: expense.currency,
  });

  if (expectedSettlementAmount !== expense.amount) {
    throw new Error('Settlement amount does not match the original amount and conversion rate');
  }

  return {
    ...expense,
    originalAmount,
    originalCurrency,
    conversionRate,
  };
};

export const formatConversionRate = (conversionRate: number) =>
  removeTrailingZeros(conversionRate.toFixed(getRatePrecision(conversionRate, MAX_RATE_PRECISION)));
