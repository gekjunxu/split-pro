import { PlusIcon, Trash2 } from 'lucide-react';
import React, { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { SimpleConfirmationDialog } from '~/components/SimpleConfirmationDialog';
import { useTranslationWithUtils } from '~/hooks/useTranslationWithUtils';
import { type CashExchangeRateHistoryItem } from '~/lib/cashExchangeAnalytics';
import { type CurrencyCode, isCurrencyCode } from '~/lib/currency';
import { api } from '~/utils/api';

import { CurrencyPicker } from '../AddExpense/CurrencyPicker';
import { DateSelector } from '../AddExpense/DateSelector';
import { Button } from '../ui/button';
import { CurrencyInput } from '../ui/currency-input';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { NativeSelect, NativeSelectOption } from '../ui/native-select';

export const CashExchangeDialog: React.FC<{
  groupId: number;
  exchange?: CashExchangeRateHistoryItem;
  trigger?: React.ReactElement;
  onSaved?: () => void;
}> = ({ exchange, groupId, onSaved, trigger }) => {
  const { t, getCurrencyHelpersCached } = useTranslationWithUtils();
  const utils = api.useUtils();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [exchangeDate, setExchangeDate] = useState(() => new Date());
  const [cashCurrency, setCashCurrency] = useState<CurrencyCode>('JPY');
  const [settlementCurrency, setSettlementCurrency] = useState<CurrencyCode>('USD');
  const [cashAmount, setCashAmount] = useState<bigint | null>(null);
  const [cashAmountStr, setCashAmountStr] = useState('');
  const [settlementAmount, setSettlementAmount] = useState<bigint | null>(null);
  const [settlementAmountStr, setSettlementAmountStr] = useState('');
  const [cardId, setCardId] = useState<number | null>(null);
  const cardsQuery = api.card.list.useQuery(
    { groupId, includeArchived: true },
    { enabled: open, refetchOnWindowFocus: false, refetchOnReconnect: false },
  );
  const createExchange = api.cashExchange.create.useMutation();
  const updateExchange = api.cashExchange.update.useMutation();
  const deleteExchange = api.cashExchange.delete.useMutation();

  const loadForm = useCallback(() => {
    const nextCashCurrency = isCurrencyCode(exchange?.cashCurrency) ? exchange.cashCurrency : 'JPY';
    const nextSettlementCurrency = isCurrencyCode(exchange?.settlementCurrency)
      ? exchange.settlementCurrency
      : 'USD';
    setName(exchange?.name ?? '');
    setExchangeDate(exchange?.exchangeDate ?? new Date());
    setCashCurrency(nextCashCurrency);
    setSettlementCurrency(nextSettlementCurrency);
    setCashAmount(exchange?.cashAmount ?? null);
    setCashAmountStr(
      exchange
        ? getCurrencyHelpersCached(nextCashCurrency).toUIString(exchange.cashAmount, true, true)
        : '',
    );
    setSettlementAmount(exchange?.settlementAmount ?? null);
    setSettlementAmountStr(
      exchange
        ? getCurrencyHelpersCached(nextSettlementCurrency).toUIString(
            exchange.settlementAmount,
            true,
            true,
          )
        : '',
    );
    setCardId(exchange?.card?.id ?? null);
  }, [exchange, getCurrencyHelpersCached]);

  const onOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        loadForm();
      }
      setOpen(nextOpen);
    },
    [loadForm],
  );

  const onSave = useCallback(async () => {
    if (
      '' === name.trim() ||
      !cashAmount ||
      !settlementAmount ||
      cashCurrency === settlementCurrency
    ) {
      return;
    }

    try {
      const input = {
        groupId,
        cardId,
        name: name.trim(),
        exchangeDate,
        cashAmount,
        cashCurrency,
        settlementAmount,
        settlementCurrency,
      };
      if (exchange) {
        await updateExchange.mutateAsync({ ...input, id: exchange.id });
      } else {
        await createExchange.mutateAsync(input);
      }
      await Promise.all([
        utils.card.analytics.invalidate({ groupId }),
        utils.cashExchange.list.invalidate({ groupId }),
      ]);
      onOpenChange(false);
      onSaved?.();
      toast.success(t('cards.analytics.cash_exchange_saved'));
    } catch (error) {
      console.error(error);
      toast.error(t('errors.something_went_wrong'));
    }
  }, [
    cardId,
    cashAmount,
    cashCurrency,
    createExchange,
    exchangeDate,
    exchange,
    groupId,
    name,
    onOpenChange,
    onSaved,
    settlementAmount,
    settlementCurrency,
    t,
    updateExchange,
    utils.card.analytics,
    utils.cashExchange.list,
  ]);

  const onDelete = useCallback(async () => {
    if (!exchange) {
      return;
    }

    try {
      await deleteExchange.mutateAsync({ groupId, id: exchange.id });
      await Promise.all([
        utils.card.analytics.invalidate({ groupId }),
        utils.cashExchange.list.invalidate({ groupId }),
      ]);
      onOpenChange(false);
      toast.success(t('cards.analytics.cash_exchange_deleted'));
    } catch (error) {
      console.error(error);
      toast.error(t('errors.something_went_wrong'));
    }
  }, [
    deleteExchange,
    exchange,
    groupId,
    onOpenChange,
    t,
    utils.card.analytics,
    utils.cashExchange.list,
  ]);

  const cashCards = cardsQuery.data?.filter((card) => 'CASH' === card.type) ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger ? (
        <DialogTrigger asChild>{trigger}</DialogTrigger>
      ) : (
        <DialogTrigger asChild>
          <Button type="button" variant="outline" className="w-fit gap-2">
            <PlusIcon className="size-4" />
            {t('cards.analytics.add_cash_exchange')}
          </Button>
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {exchange
              ? t('cards.analytics.edit_cash_exchange')
              : t('cards.analytics.add_cash_exchange')}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-2">
            <Label htmlFor="cash-exchange-name">{t('cards.analytics.cash_exchange_name')}</Label>
            <Input
              id="cash-exchange-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t('cards.analytics.cash_exchange_name_placeholder')}
            />
          </div>
          <DateSelector
            mode="single"
            required
            selected={exchangeDate}
            onSelect={(date: Date | undefined) => date && setExchangeDate(date)}
          />
          <div className="grid gap-2">
            <Label>{t('cards.analytics.cash_tranche')}</Label>
            <NativeSelect
              value={cardId?.toString() ?? ''}
              onChange={(event) =>
                setCardId('' === event.target.value ? null : Number(event.target.value))
              }
            >
              <NativeSelectOption value="">
                {t('cards.analytics.cash_tranche_placeholder')}
              </NativeSelectOption>
              {cashCards.map((card) => (
                <NativeSelectOption key={card.id} value={card.id.toString()}>
                  {card.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="grid gap-2">
            <Label>{t('cards.analytics.cash_amount')}</Label>
            <div className="flex gap-2">
              <CurrencyPicker
                currentCurrency={cashCurrency}
                onCurrencyPick={(currency) => currency && setCashCurrency(currency)}
              />
              <CurrencyInput
                className="flex-1"
                currency={cashCurrency}
                strValue={cashAmountStr}
                hideSymbol
                onValueChange={({ strValue, bigIntValue }) => {
                  setCashAmountStr(strValue ?? cashAmountStr);
                  setCashAmount(bigIntValue ?? cashAmount);
                }}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>{t('cards.analytics.settlement_amount')}</Label>
            <div className="flex gap-2">
              <CurrencyPicker
                currentCurrency={settlementCurrency}
                onCurrencyPick={(currency) => currency && setSettlementCurrency(currency)}
              />
              <CurrencyInput
                className="flex-1"
                currency={settlementCurrency}
                strValue={settlementAmountStr}
                hideSymbol
                onValueChange={({ strValue, bigIntValue }) => {
                  setSettlementAmountStr(strValue ?? settlementAmountStr);
                  setSettlementAmount(bigIntValue ?? settlementAmount);
                }}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          {exchange ? (
            <SimpleConfirmationDialog
              title={t('cards.analytics.delete_cash_exchange')}
              description={t('cards.analytics.delete_cash_exchange_description')}
              hasPermission
              onConfirm={onDelete}
              loading={deleteExchange.isPending}
              variant="destructive"
            >
              <Button type="button" variant="ghost" size="icon">
                <Trash2 className="size-4 text-red-400" />
              </Button>
            </SimpleConfirmationDialog>
          ) : null}
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t('actions.cancel')}
          </Button>
          <Button
            type="button"
            disabled={
              '' === name.trim() ||
              !cashAmount ||
              !settlementAmount ||
              cashCurrency === settlementCurrency ||
              createExchange.isPending ||
              updateExchange.isPending
            }
            onClick={onSave}
          >
            {t('actions.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
