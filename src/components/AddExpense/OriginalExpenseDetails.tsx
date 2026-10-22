'use client';

import { ArrowLeftRight, Globe } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useTranslationWithUtils } from '~/hooks/useTranslationWithUtils';
import { type CurrencyCode } from '~/lib/currency';
import {
  calculateExchangeRateFromSettlement,
  calculatePaidPerSettlementRate,
  calculateSettlementAmount,
  formatConversionRate,
  formatDisplayRate,
} from '~/lib/originalExpense';
import { api } from '~/utils/api';
import { BigMath, MAX_RATE_PRECISION } from '~/utils/numbers';

import { Button } from '../ui/button';
import { CurrencyInput } from '../ui/currency-input';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { CurrencyPicker } from './CurrencyPicker';

type RateMode = 'statement' | 'manual' | 'auto';
type RateDirection = 'paidPerSettlement' | 'settlementPerPaid';

export const OriginalExpenseDetails: React.FC<{
  expenseDate: Date;
  settlementAmount: bigint;
  settlementAmountStr: string;
  settlementCurrency: CurrencyCode;
  originalAmount?: bigint;
  originalCurrency?: CurrencyCode;
  conversionRate?: number;
  cardId?: number | null;
  preferredCurrencies?: CurrencyCode[];
  onStartOverseas: (paidCurrency: CurrencyCode) => void;
  onChangeSettlementCurrency: (currency: CurrencyCode) => void;
  onKeepInPaidCurrency: () => void;
  onUpdateSettlementAmount: (value: { strValue?: string; bigIntValue?: bigint }) => void;
  onApplyRate: (data: {
    conversionRate: number;
    settlementAmount: bigint;
    settlementAmountStr: string;
  }) => void;
}> = ({
  expenseDate,
  settlementAmount,
  settlementAmountStr,
  settlementCurrency,
  originalAmount,
  originalCurrency,
  conversionRate,
  cardId,
  preferredCurrencies = [],
  onStartOverseas,
  onChangeSettlementCurrency,
  onKeepInPaidCurrency,
  onUpdateSettlementAmount,
  onApplyRate,
}) => {
  const { t, getCurrencyHelpersCached } = useTranslationWithUtils();

  const cardsQuery = api.card.list.useQuery(undefined, {
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const selectedPaymentSource = useMemo(
    () => cardsQuery.data?.find((card) => card.id === cardId),
    [cardId, cardsQuery.data],
  );

  const isForeignCurrency = Boolean(originalCurrency && originalCurrency !== settlementCurrency);
  const absOriginalAmount = BigMath.abs(originalAmount ?? 0n);
  const absSettlementAmount = BigMath.abs(settlementAmount);

  const [rateMode, setRateMode] = useState<RateMode>(() =>
    'CASH' === selectedPaymentSource?.type && selectedPaymentSource.defaultRate
      ? 'manual'
      : 'statement',
  );
  const [rateDirection, setRateDirection] = useState<RateDirection>('paidPerSettlement');
  const [localRateInput, setLocalRateInput] = useState<string>(() => {
    if ('CASH' === selectedPaymentSource?.type && selectedPaymentSource.defaultRate) {
      return formatDisplayRate(selectedPaymentSource.defaultRate);
    }
    if (conversionRate && 0 < conversionRate) {
      return formatDisplayRate(1 / conversionRate);
    }
    return '';
  });

  const prevCardIdRef = useRef<number | null | undefined>(cardId);
  const prevIsForeignRef = useRef<boolean>(isForeignCurrency);

  const rateQuery = api.expense.getCurrencyRate.useQuery(
    {
      from: originalCurrency ?? settlementCurrency,
      to: settlementCurrency,
      date: expenseDate,
    },
    {
      enabled: isForeignCurrency && 'auto' === rateMode,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  );

  const applyComputedRate = useCallback(
    (exchangeRate: number) => {
      if (!originalCurrency || !Number.isFinite(exchangeRate) || 0 >= exchangeRate) {
        return;
      }

      const nextSettlementAmount =
        0n < absOriginalAmount
          ? calculateSettlementAmount({
              paidAmount: absOriginalAmount,
              paidCurrency: originalCurrency,
              settlementCurrency,
              exchangeRate,
            })
          : 0n;

      if (absSettlementAmount === nextSettlementAmount && conversionRate === exchangeRate) {
        return;
      }

      const nextSettlementAmountStr =
        0n < nextSettlementAmount
          ? getCurrencyHelpersCached(settlementCurrency).toUIString(
              nextSettlementAmount,
              true,
              true,
            )
          : '';

      onApplyRate({
        conversionRate: exchangeRate,
        settlementAmount: nextSettlementAmount,
        settlementAmountStr: nextSettlementAmountStr,
      });
    },
    [
      absOriginalAmount,
      absSettlementAmount,
      conversionRate,
      getCurrencyHelpersCached,
      onApplyRate,
      originalCurrency,
      settlementCurrency,
    ],
  );

  useEffect(() => {
    const cardChanged = prevCardIdRef.current !== cardId;
    const becameForeign = !prevIsForeignRef.current && isForeignCurrency;
    prevCardIdRef.current = cardId;
    prevIsForeignRef.current = isForeignCurrency;

    if (!cardChanged && !becameForeign) {
      return;
    }

    if (
      'CASH' === selectedPaymentSource?.type &&
      selectedPaymentSource.defaultRate &&
      0 < selectedPaymentSource.defaultRate
    ) {
      setRateMode('manual');
      setRateDirection('paidPerSettlement');
      setLocalRateInput(formatDisplayRate(selectedPaymentSource.defaultRate));
      applyComputedRate(1 / selectedPaymentSource.defaultRate);
    }
  }, [
    applyComputedRate,
    cardId,
    isForeignCurrency,
    selectedPaymentSource?.defaultRate,
    selectedPaymentSource?.type,
  ]);

  useEffect(() => {
    if (!isForeignCurrency || 'auto' !== rateMode || !rateQuery.data?.rate) {
      return;
    }

    applyComputedRate(rateQuery.data.rate);
  }, [applyComputedRate, isForeignCurrency, rateMode, rateQuery.data?.rate]);

  const manualExchangeRate = useMemo(() => {
    const parsed = Number(localRateInput);
    if (!Number.isFinite(parsed) || 0 >= parsed) {
      return 0;
    }
    return 'paidPerSettlement' === rateDirection ? 1 / parsed : parsed;
  }, [localRateInput, rateDirection]);

  useEffect(() => {
    if (!isForeignCurrency || 'manual' !== rateMode || 0 >= manualExchangeRate) {
      return;
    }

    applyComputedRate(manualExchangeRate);
  }, [applyComputedRate, isForeignCurrency, manualExchangeRate, rateMode]);

  const onRateModeChange = useCallback(
    (nextMode: RateMode) => {
      setRateMode(nextMode);
      if ('manual' === nextMode) {
        const cashRate =
          'CASH' === selectedPaymentSource?.type && selectedPaymentSource.defaultRate
            ? selectedPaymentSource.defaultRate
            : undefined;
        if (cashRate && 0 < cashRate) {
          setRateDirection('paidPerSettlement');
          setLocalRateInput(formatDisplayRate(cashRate));
          applyComputedRate(1 / cashRate);
        } else if (conversionRate && 0 < conversionRate) {
          const displayVal =
            'paidPerSettlement' === rateDirection
              ? formatDisplayRate(1 / conversionRate)
              : formatConversionRate(conversionRate);
          setLocalRateInput(displayVal);
        }
      }
    },
    [
      applyComputedRate,
      conversionRate,
      rateDirection,
      selectedPaymentSource?.defaultRate,
      selectedPaymentSource?.type,
    ],
  );

  const onToggleRateDirection = useCallback(() => {
    const currentNum = Number(localRateInput);
    const nextDirection: RateDirection =
      'paidPerSettlement' === rateDirection ? 'settlementPerPaid' : 'paidPerSettlement';
    setRateDirection(nextDirection);
    if (Number.isFinite(currentNum) && 0 < currentNum) {
      const inverted = 1 / currentNum;
      setLocalRateInput(
        'paidPerSettlement' === nextDirection
          ? formatDisplayRate(inverted)
          : formatConversionRate(inverted),
      );
    }
  }, [localRateInput, rateDirection]);

  const onChangeManualRate = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/,/g, '.');
    if ('' === raw) {
      setLocalRateInput('');
      return;
    }

    if (!/^[0-9]*\.?[0-9]*$/.test(raw)) {
      return;
    }

    const [int = '', dec = ''] = raw.split('.');
    const trimmedDec = dec.slice(0, MAX_RATE_PRECISION);
    setLocalRateInput(raw.includes('.') ? `${int}.${trimmedDec}` : int);
  }, []);

  const handleSettlementCurrencyPick = useCallback(
    (nextCurrency: CurrencyCode | null) => {
      if (!nextCurrency) {
        return;
      }
      if (nextCurrency === originalCurrency) {
        onKeepInPaidCurrency();
        return;
      }
      onChangeSettlementCurrency(nextCurrency);
    },
    [onChangeSettlementCurrency, onKeepInPaidCurrency, originalCurrency],
  );

  const handleOpenOverseas = useCallback(() => {
    const fallbackPaidCurrency =
      preferredCurrencies.find((c) => c !== settlementCurrency) ??
      ('SGD' === settlementCurrency ? 'TWD' : 'SGD');
    onStartOverseas(fallbackPaidCurrency);
  }, [onStartOverseas, preferredCurrencies, settlementCurrency]);

  const effectiveExchangeRate = useMemo(() => {
    if (!originalCurrency || !isForeignCurrency) {
      return 0;
    }
    if ('statement' === rateMode) {
      return calculateExchangeRateFromSettlement({
        paidAmount: absOriginalAmount,
        paidCurrency: originalCurrency,
        settlementAmount: absSettlementAmount,
        settlementCurrency,
      });
    }
    return conversionRate ?? 0;
  }, [
    absOriginalAmount,
    absSettlementAmount,
    conversionRate,
    isForeignCurrency,
    originalCurrency,
    rateMode,
    settlementCurrency,
  ]);

  const effectiveCardRate = useMemo(() => {
    if (!originalCurrency || !isForeignCurrency) {
      return 0;
    }
    if (0n < absOriginalAmount && 0n < absSettlementAmount) {
      return calculatePaidPerSettlementRate({
        paidAmount: absOriginalAmount,
        paidCurrency: originalCurrency,
        settlementAmount: absSettlementAmount,
        settlementCurrency,
      });
    }
    return 0 < effectiveExchangeRate ? 1 / effectiveExchangeRate : 0;
  }, [
    absOriginalAmount,
    absSettlementAmount,
    effectiveExchangeRate,
    isForeignCurrency,
    originalCurrency,
    settlementCurrency,
  ]);

  const paidAmountLabel = useMemo(
    () =>
      originalCurrency
        ? getCurrencyHelpersCached(originalCurrency).toUIString(absOriginalAmount, false, false)
        : '',
    [absOriginalAmount, getCurrencyHelpersCached, originalCurrency],
  );

  const settlementAmountLabel = useMemo(
    () =>
      getCurrencyHelpersCached(settlementCurrency).toUIString(absSettlementAmount, false, false),
    [absSettlementAmount, getCurrencyHelpersCached, settlementCurrency],
  );

  if (!isForeignCurrency || !originalCurrency) {
    return (
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={handleOpenOverseas}
        >
          <Globe className="size-3.5" />
          {t('expense_details.add_expense_details.overseas.button')}
        </Button>
      </div>
    );
  }

  return (
    <div className="border-primary/40 bg-muted/20 flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Globe className="text-primary size-4" />
          <span>{t('expense_details.add_expense_details.overseas.title')}</span>
          <span className="text-xs text-gray-400">
            ({originalCurrency} → {settlementCurrency})
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-400">
            {t('expense_details.add_expense_details.overseas.settlement_currency')}:
          </span>
          <CurrencyPicker
            currentCurrency={settlementCurrency}
            onCurrencyPick={handleSettlementCurrencyPick}
            preferredCurrencies={preferredCurrencies}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs text-gray-400 hover:text-white"
            onClick={onKeepInPaidCurrency}
          >
            {t('expense_details.add_expense_details.overseas.keep_in_currency', {
              currency: originalCurrency,
              defaultValue: `Keep in ${originalCurrency}`,
            })}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1">
          <Button
            type="button"
            variant={'statement' === rateMode ? 'secondary' : 'ghost'}
            size="sm"
            className="h-7 px-2.5 text-xs"
            onClick={() => onRateModeChange('statement')}
          >
            {t('expense_details.add_expense_details.overseas.card_charge')}
          </Button>
          <Button
            type="button"
            variant={'manual' === rateMode ? 'secondary' : 'ghost'}
            size="sm"
            className="h-7 px-2.5 text-xs"
            onClick={() => onRateModeChange('manual')}
          >
            {t('expense_details.add_expense_details.overseas.edit_rate')}
          </Button>
          <Button
            type="button"
            variant={'auto' === rateMode ? 'secondary' : 'ghost'}
            size="sm"
            className="h-7 px-2.5 text-xs"
            onClick={() => onRateModeChange('auto')}
          >
            {t('expense_details.add_expense_details.overseas.auto_rate')}
          </Button>
        </div>
        {0 < effectiveCardRate ? (
          <span className="text-primary text-xs font-medium">
            {t('expense_details.add_expense_details.overseas.card_rate_direction', {
              rate: formatDisplayRate(effectiveCardRate),
              paidCurrency: originalCurrency,
              settlementCurrency,
            })}
          </span>
        ) : null}
      </div>

      {'statement' === rateMode ? (
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-gray-300">
            {t('expense_details.add_expense_details.overseas.card_charged')} ({settlementCurrency})
          </Label>
          <CurrencyInput
            currency={settlementCurrency}
            strValue={settlementAmountStr}
            hideSymbol
            placeholder={t('expense_details.add_expense_details.overseas.card_charged_help', {
              settlementCurrency,
            })}
            onValueChange={onUpdateSettlementAmount}
          />
        </div>
      ) : null}

      {'manual' === rateMode ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs text-gray-300">
              {'paidPerSettlement' === rateDirection
                ? `1 ${settlementCurrency} = ? ${originalCurrency}`
                : `1 ${originalCurrency} = ? ${settlementCurrency}`}
            </Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 gap-1 px-2 text-xs text-gray-400"
              onClick={onToggleRateDirection}
            >
              <ArrowLeftRight className="size-3" />
              {'paidPerSettlement' === rateDirection
                ? `${originalCurrency}/${settlementCurrency}`
                : `${settlementCurrency}/${originalCurrency}`}
            </Button>
          </div>
          <Input
            type="text"
            value={localRateInput}
            inputMode="decimal"
            placeholder={
              'paidPerSettlement' === rateDirection
                ? `${originalCurrency} per 1 ${settlementCurrency}`
                : `${settlementCurrency} per 1 ${originalCurrency}`
            }
            onChange={onChangeManualRate}
          />
        </div>
      ) : null}

      {'auto' === rateMode && rateQuery.isPending ? (
        <span className="text-xs text-gray-400">{t('currency_conversion.fetching_rate')}</span>
      ) : null}

      {0n < absOriginalAmount && 0n < absSettlementAmount ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-800 pt-2 text-xs text-gray-400">
          <span>
            {t('expense_details.add_expense_details.overseas.conversion_direction', {
              paidAmount: paidAmountLabel,
              settlementAmount: settlementAmountLabel,
            })}
          </span>
          {0 < effectiveExchangeRate ? (
            <span>
              1 {originalCurrency} = {formatConversionRate(effectiveExchangeRate)}{' '}
              {settlementCurrency}
            </span>
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-gray-400">
          {'statement' === rateMode
            ? t('expense_details.add_expense_details.overseas.card_charged_help', {
                settlementCurrency,
              })
            : t('expense_details.add_expense_details.overseas.description')}
        </p>
      )}
    </div>
  );
};
