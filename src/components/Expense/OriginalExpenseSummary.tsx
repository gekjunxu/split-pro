import React, { useMemo } from 'react';

import { useTranslationWithUtils } from '~/hooks/useTranslationWithUtils';
import { isCurrencyCode } from '~/lib/currency';
import { formatConversionRate, hasOriginalExpenseDetails } from '~/lib/originalExpense';

export const OriginalExpenseSummary: React.FC<{
  expense: {
    currency: string;
    originalAmount?: bigint | null;
    originalCurrency?: string | null;
    conversionRate?: number | null;
    card?: { name: string } | null;
  };
  className?: string;
}> = ({ expense, className }) => {
  const { t, getCurrencyHelpersCached } = useTranslationWithUtils();

  const summary = useMemo(() => {
    if (!hasOriginalExpenseDetails(expense) || !isCurrencyCode(expense.originalCurrency)) {
      return null;
    }

    const originalSummary = t('ui.expense.original_summary', {
      amount: getCurrencyHelpersCached(expense.originalCurrency).toUIString(
        expense.originalAmount ?? 0n,
      ),
      rate: formatConversionRate(expense.conversionRate ?? 0),
      settlementCurrency: expense.currency,
      originalCurrency: expense.originalCurrency,
    });

    if (!expense.card) {
      return originalSummary;
    }

    return `${originalSummary} • ${t('cards.card')}: ${expense.card.name}`;
  }, [expense, getCurrencyHelpersCached, t]);

  if (!summary) {
    return null;
  }

  return <p className={className}>{summary}</p>;
};
