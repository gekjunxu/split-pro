'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { type CurrencyCode, isCurrencyCode } from '~/lib/currency';
import { cn } from '~/lib/utils';
import { formatConversionRate } from '~/lib/originalExpense';
import { api } from '~/utils/api';
import { MAX_RATE_PRECISION, currencyConversion, getRatePrecision } from '~/utils/numbers';
import { useTranslationWithUtils } from '~/hooks/useTranslationWithUtils';

import { CurrencyPicker } from './CurrencyPicker';
import { Button } from '../ui/button';
import { CurrencyInput } from '../ui/currency-input';
import { AppDrawer } from '../ui/drawer';
import { Input } from '../ui/input';
import { Label } from '../ui/label';

export const OriginalExpenseDetails: React.FC<{
  expenseDate: Date;
  settlementAmount: bigint;
  settlementCurrency: CurrencyCode;
  originalAmount?: bigint;
  originalCurrency?: CurrencyCode;
  conversionRate?: number;
  onApply: (data: {
    settlementAmount: bigint;
    originalAmount: bigint;
    originalCurrency: CurrencyCode;
    conversionRate: number;
  }) => void;
  onClear: () => void;
}> = ({
  expenseDate,
  settlementAmount,
  settlementCurrency,
  originalAmount,
  originalCurrency,
  conversionRate,
  onApply,
  onClear,
}) => {
  const { t, getCurrencyHelpersCached } = useTranslationWithUtils();

  const [open, setOpen] = useState(false);
  const [localOriginalCurrency, setLocalOriginalCurrency] = useState<CurrencyCode>(
    originalCurrency ?? settlementCurrency,
  );
  const [localOriginalAmount, setLocalOriginalAmount] = useState<bigint>(
    originalAmount ?? settlementAmount,
  );
  const [localOriginalAmountStr, setLocalOriginalAmountStr] = useState('');
  const [localRate, setLocalRate] = useState(conversionRate ? String(conversionRate) : '');

  const rateQuery = api.expense.getCurrencyRate.useQuery(
    {
      from: localOriginalCurrency,
      to: settlementCurrency,
      date: expenseDate,
    },
    {
      enabled: localOriginalCurrency !== settlementCurrency,
    },
  );

  useEffect(() => {
    setLocalOriginalCurrency(originalCurrency ?? settlementCurrency);
    setLocalOriginalAmount(originalAmount ?? settlementAmount);
    setLocalOriginalAmountStr(
      getCurrencyHelpersCached(originalCurrency ?? settlementCurrency).toUIString(
        originalAmount ?? settlementAmount,
        true,
        true,
      ),
    );
    setLocalRate(conversionRate ? String(conversionRate) : '');
  }, [
    conversionRate,
    getCurrencyHelpersCached,
    originalAmount,
    originalCurrency,
    settlementAmount,
    settlementCurrency,
  ]);

  useEffect(() => {
    if (localOriginalCurrency === settlementCurrency || !rateQuery.data?.rate || conversionRate) {
      return;
    }

    const precision = getRatePrecision(rateQuery.data.rate, MAX_RATE_PRECISION);
    setLocalRate(rateQuery.data.rate.toFixed(precision));
  }, [conversionRate, localOriginalCurrency, rateQuery.data?.rate, settlementCurrency]);

  const previewAmount = useMemo(() => {
    if (localOriginalCurrency === settlementCurrency || !localRate) {
      return localOriginalAmount;
    }

    return currencyConversion({
      amount: localOriginalAmount,
      rate: Number(localRate),
      from: localOriginalCurrency,
      to: settlementCurrency,
    });
  }, [localOriginalAmount, localOriginalCurrency, localRate, settlementCurrency]);

  const ratePrecision = useMemo(() => {
    if (!localRate) {
      return 0;
    }

    return getRatePrecision(Number(localRate), MAX_RATE_PRECISION);
  }, [localRate]);

  const onChangeOriginalAmount = useCallback(
    ({ strValue, bigIntValue }: { strValue?: string; bigIntValue?: bigint }) => {
      if (strValue !== undefined) {
        setLocalOriginalAmountStr(strValue);
      }
      if (bigIntValue !== undefined) {
        setLocalOriginalAmount(bigIntValue);
      }
    },
    [],
  );

  const onChangeOriginalCurrency = useCallback((currency: CurrencyCode | null) => {
    if (!currency) {
      return;
    }

    setLocalOriginalCurrency(currency);
    setLocalRate('');
  }, []);

  const onChangeRate = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/,/g, '.');
    if ('' === raw) {
      setLocalRate('');
      return;
    }

    if (!/^[0-9]*\.?[0-9]*$/.test(raw)) {
      return;
    }

    const [int = '', dec = ''] = raw.split('.');
    const trimmedDec = dec.slice(0, MAX_RATE_PRECISION);
    setLocalRate(raw.includes('.') ? `${int}.${trimmedDec}` : int);
  }, []);

  const isForeignCurrency = localOriginalCurrency !== settlementCurrency;
  const canSave =
    isForeignCurrency &&
    Boolean(localOriginalAmountStr) &&
    Boolean(localRate) &&
    Number(localRate) > 0 &&
    isCurrencyCode(localOriginalCurrency);

  const onSave = useCallback(() => {
    if (!canSave || !isCurrencyCode(localOriginalCurrency)) {
      return;
    }

    onApply({
      settlementAmount: previewAmount,
      originalAmount: localOriginalAmount,
      originalCurrency: localOriginalCurrency,
      conversionRate: Number(localRate),
    });
    setOpen(false);
  }, [canSave, localOriginalCurrency, localOriginalAmount, localRate, onApply, previewAmount]);

  const summary = useMemo(() => {
    if (
      !originalCurrency ||
      !isCurrencyCode(originalCurrency) ||
      undefined === originalAmount ||
      undefined === conversionRate
    ) {
      return null;
    }

    return t('expense_details.add_expense_details.overseas.summary', {
      amount: getCurrencyHelpersCached(originalCurrency).toUIString(originalAmount),
      rate: formatConversionRate(conversionRate),
      settlementCurrency,
      originalCurrency,
    });
  }, [
    conversionRate,
    getCurrencyHelpersCached,
    originalAmount,
    originalCurrency,
    settlementCurrency,
    t,
  ]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <AppDrawer
          open={open}
          onOpenChange={setOpen}
          trigger={
            <Button variant="outline" size="sm" className={cn(summary && 'border-primary')}>
              {t('expense_details.add_expense_details.overseas.button')}
            </Button>
          }
          title={t('expense_details.add_expense_details.overseas.title')}
          leftAction={t('actions.back')}
          actionTitle={t('actions.save')}
          actionOnClick={onSave}
          actionDisabled={!canSave}
        >
          <div className="flex flex-col gap-4">
            <p className="text-sm text-gray-500">
              {t('expense_details.add_expense_details.overseas.description')}
            </p>
            <div className="flex items-end gap-2">
              <div className="flex flex-col gap-2">
                <Label>{t('expense_details.add_expense_details.overseas.paid_currency')}</Label>
                <CurrencyPicker
                  currentCurrency={localOriginalCurrency}
                  onCurrencyPick={onChangeOriginalCurrency}
                />
              </div>
              <div className="flex-1">
                <Label>{t('expense_details.add_expense_details.overseas.paid_amount')}</Label>
                <CurrencyInput
                  currency={localOriginalCurrency}
                  strValue={localOriginalAmountStr}
                  allowNegative
                  hideSymbol
                  onValueChange={onChangeOriginalAmount}
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label>{t('expense_details.add_expense_details.overseas.rate')}</Label>
              <Input
                type="number"
                step={`0.${'0'.repeat(MAX_RATE_PRECISION - 1)}1`}
                min={0}
                value={localRate}
                inputMode="decimal"
                onChange={onChangeRate}
                disabled={!isForeignCurrency}
              />
              {rateQuery.isPending && isForeignCurrency ? (
                <span className="text-xs text-gray-500">
                  {t('currency_conversion.fetching_rate')}
                </span>
              ) : null}
              {localRate ? (
                <span className="text-xs text-gray-500">
                  1 {localOriginalCurrency} = {Number(localRate).toFixed(ratePrecision)}{' '}
                  {settlementCurrency}
                </span>
              ) : null}
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-gray-500">
                {t('expense_details.add_expense_details.overseas.preview')}
              </div>
              <div className="text-lg font-medium">
                {getCurrencyHelpersCached(settlementCurrency).toUIString(previewAmount)}
              </div>
            </div>
          </div>
        </AppDrawer>
        {summary ? (
          <Button variant="ghost" size="sm" className="px-2" onClick={onClear}>
            {t('expense_details.clear')}
          </Button>
        ) : null}
      </div>
      {summary ? <p className="text-sm text-gray-500">{summary}</p> : null}
    </div>
  );
};
