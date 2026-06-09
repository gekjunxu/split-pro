'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { type CurrencyCode, isCurrencyCode } from '~/lib/currency';
import { cn } from '~/lib/utils';
import { calculateSettlementAmount, formatConversionRate } from '~/lib/originalExpense';
import { api } from '~/utils/api';
import { BigMath, MAX_RATE_PRECISION, getRatePrecision } from '~/utils/numbers';
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
    originalAmount ?? BigMath.abs(settlementAmount),
  );
  const [localOriginalAmountStr, setLocalOriginalAmountStr] = useState('');
  const [localRate, setLocalRate] = useState(conversionRate ? String(conversionRate) : '');
  const [isEditingRate, setIsEditingRate] = useState(false);

  const rateQuery = api.expense.getCurrencyRate.useQuery(
    {
      from: localOriginalCurrency,
      to: settlementCurrency,
      date: expenseDate,
    },
    {
      enabled: open && localOriginalCurrency !== settlementCurrency,
    },
  );

  useEffect(() => {
    setLocalOriginalCurrency(originalCurrency ?? settlementCurrency);
    setLocalOriginalAmount(originalAmount ?? BigMath.abs(settlementAmount));
    setLocalOriginalAmountStr(
      getCurrencyHelpersCached(originalCurrency ?? settlementCurrency).toUIString(
        originalAmount ?? BigMath.abs(settlementAmount),
        true,
        true,
      ),
    );
    setLocalRate(conversionRate ? String(conversionRate) : '');
    setIsEditingRate(false);
  }, [
    conversionRate,
    getCurrencyHelpersCached,
    originalAmount,
    originalCurrency,
    settlementAmount,
    settlementCurrency,
  ]);

  useEffect(() => {
    if (
      localOriginalCurrency === settlementCurrency ||
      !rateQuery.data?.rate ||
      isEditingRate ||
      (Boolean(localRate) && localOriginalCurrency === originalCurrency)
    ) {
      return;
    }

    const precision = getRatePrecision(rateQuery.data.rate, MAX_RATE_PRECISION);
    setLocalRate(rateQuery.data.rate.toFixed(precision));
  }, [
    isEditingRate,
    localOriginalCurrency,
    localRate,
    originalCurrency,
    rateQuery.data?.rate,
    settlementCurrency,
  ]);

  const settlementPreviewAmount = useMemo(() => {
    if (localOriginalCurrency === settlementCurrency || !localRate) {
      return localOriginalAmount;
    }

    return calculateSettlementAmount({
      paidAmount: localOriginalAmount,
      paidCurrency: localOriginalCurrency,
      settlementCurrency,
      exchangeRate: Number(localRate),
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
    setIsEditingRate(false);
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
  const parsedRate = Number(localRate);
  const canSave =
    isForeignCurrency &&
    localOriginalAmount > 0n &&
    Boolean(localRate) &&
    Number.isFinite(parsedRate) &&
    parsedRate > 0 &&
    isCurrencyCode(localOriginalCurrency);

  const onSave = useCallback(() => {
    if (!canSave || !isCurrencyCode(localOriginalCurrency)) {
      return;
    }

    onApply({
      settlementAmount: settlementPreviewAmount,
      originalAmount: localOriginalAmount,
      originalCurrency: localOriginalCurrency,
      conversionRate: parsedRate,
    });
    setOpen(false);
  }, [
    canSave,
    localOriginalCurrency,
    localOriginalAmount,
    onApply,
    parsedRate,
    settlementPreviewAmount,
  ]);

  const onEditRate = useCallback(() => {
    setIsEditingRate((current) => {
      if (current) {
        setLocalRate('');
      }

      return !current;
    });
  }, []);

  const paidAmountLabel = useMemo(
    () =>
      getCurrencyHelpersCached(localOriginalCurrency).toUIString(localOriginalAmount, false, false),
    [getCurrencyHelpersCached, localOriginalAmount, localOriginalCurrency],
  );

  const settlementAmountLabel = useMemo(
    () =>
      getCurrencyHelpersCached(settlementCurrency).toUIString(
        settlementPreviewAmount,
        false,
        false,
      ),
    [getCurrencyHelpersCached, settlementCurrency, settlementPreviewAmount],
  );

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
      settlementAmount: getCurrencyHelpersCached(settlementCurrency).toUIString(
        calculateSettlementAmount({
          paidAmount: originalAmount,
          paidCurrency: originalCurrency,
          settlementCurrency,
          exchangeRate: conversionRate,
        }),
      ),
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
            <div className="grid gap-1 rounded-md border p-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-gray-500">
                  {t('expense_details.add_expense_details.overseas.settlement_currency')}
                </span>
                <span className="font-medium">{settlementCurrency}</span>
              </div>
              <p className="text-xs text-gray-500">
                {t('expense_details.add_expense_details.overseas.settlement_currency_help')}
              </p>
            </div>
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
                  hideSymbol
                  onValueChange={onChangeOriginalAmount}
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <Label>{t('expense_details.add_expense_details.overseas.rate')}</Label>
                <Button variant="ghost" size="sm" className="h-7 px-2" onClick={onEditRate}>
                  {t(
                    `expense_details.add_expense_details.overseas.${
                      isEditingRate ? 'use_auto_rate' : 'edit_rate'
                    }`,
                  )}
                </Button>
              </div>
              {isEditingRate ? (
                <Input
                  type="text"
                  step={`0.${'0'.repeat(MAX_RATE_PRECISION - 1)}1`}
                  min={0}
                  value={localRate}
                  inputMode="decimal"
                  onChange={onChangeRate}
                  disabled={!isForeignCurrency}
                />
              ) : null}
              {rateQuery.isPending && isForeignCurrency && !localRate ? (
                <span className="text-xs text-gray-500">
                  {t('currency_conversion.fetching_rate')}
                </span>
              ) : null}
              {localRate ? (
                <span className="text-xs text-gray-500">
                  {t('expense_details.add_expense_details.overseas.rate_direction', {
                    paidCurrency: localOriginalCurrency,
                    rate: Number(localRate).toFixed(ratePrecision),
                    settlementCurrency,
                  })}
                </span>
              ) : null}
              {localRate ? (
                <span className="text-xs text-gray-500">
                  {t('expense_details.add_expense_details.overseas.conversion_direction', {
                    paidAmount: paidAmountLabel,
                    settlementAmount: settlementAmountLabel,
                  })}
                </span>
              ) : null}
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-gray-500">
                {t('expense_details.add_expense_details.overseas.preview')}
              </div>
              <div className="text-lg font-medium">
                {getCurrencyHelpersCached(settlementCurrency).toUIString(settlementPreviewAmount)}
              </div>
              <p className="text-xs text-gray-500">
                {t('expense_details.add_expense_details.overseas.preview_help')}
              </p>
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
