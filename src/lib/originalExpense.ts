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

const undefinedToNull = <T>(value: T | null | undefined) => value ?? null;

export const hasOriginalExpenseDetails = ({
  currency,
  originalAmount,
  originalCurrency,
  conversionRate,
}: Partial<OriginalExpenseFields>) =>
  null !== undefinedToNull(originalAmount) &&
  null !== undefinedToNull(originalCurrency) &&
  null !== undefinedToNull(conversionRate) &&
  undefinedToNull(originalCurrency) !== currency;

export const validateAndNormalizeOriginalExpenseFields = <T extends OriginalExpenseFields>(
  expense: T,
): T => {
  const originalAmount = undefinedToNull(expense.originalAmount);
  const originalCurrency = undefinedToNull(expense.originalCurrency);
  const conversionRate = undefinedToNull(expense.conversionRate);
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

  if (!Number.isFinite(conversionRate) || 0 >= conversionRate) {
    throw new Error('Conversion rate must be a positive finite number');
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
