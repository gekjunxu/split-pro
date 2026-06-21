import { Banknote, CreditCard, PencilIcon, PlusIcon, RotateCcw, Trash2 } from 'lucide-react';
import Head from 'next/head';
import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import MainLayout from '~/components/Layout/MainLayout';
import { Button } from '~/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import { Label } from '~/components/ui/label';
import { Input } from '~/components/ui/input';
import { NativeSelect, NativeSelectOption } from '~/components/ui/native-select';
import { Switch } from '~/components/ui/switch';
import { Textarea } from '~/components/ui/textarea';
import { useTranslationWithUtils } from '~/hooks/useTranslationWithUtils';
import { CURRENCIES, isCurrencyCode } from '~/lib/currency';
import { type NextPageWithUser } from '~/types';
import { api } from '~/utils/api';
import { withI18nStaticProps } from '~/utils/i18n/server';
import { CurrencyInput } from '~/components/ui/currency-input';

interface CardFormState {
  id?: number;
  name: string;
  issuer: string;
  network: string;
  notes: string;
  type: 'CARD' | 'CASH';
  defaultCurrency: string;
  settlementCurrency: string;
  defaultRate: string;
  autoConvertToSettlement: boolean;
  startingBalance: bigint | null;
  startingBalanceStr: string;
}

const emptyCardForm: CardFormState = {
  name: '',
  issuer: '',
  network: '',
  notes: '',
  type: 'CARD',
  defaultCurrency: 'USD',
  settlementCurrency: 'USD',
  defaultRate: '',
  autoConvertToSettlement: false,
  startingBalance: null,
  startingBalanceStr: '',
};

const CardsPage: NextPageWithUser = () => {
  const { t, getCurrencyHelpersCached } = useTranslationWithUtils();
  const utils = api.useUtils();
  const cardsQuery = api.card.list.useQuery({ includeArchived: true });
  const createCard = api.card.create.useMutation();
  const updateCard = api.card.update.useMutation();
  const archiveCard = api.card.archive.useMutation();
  const restoreCard = api.card.restore.useMutation();
  const [form, setForm] = useState<CardFormState>(emptyCardForm);
  const [open, setOpen] = useState(false);

  const refreshCards = useCallback(async () => {
    await utils.card.list.invalidate();
  }, [utils.card.list]);

  const onAdd = useCallback(() => {
    setForm(emptyCardForm);
    setOpen(true);
  }, []);

  const onEdit = useCallback(
    (card: NonNullable<typeof cardsQuery.data>[number]) => {
      setForm({
        id: card.id,
        name: card.name,
        issuer: card.issuer ?? '',
        network: card.network ?? '',
        notes: card.notes ?? '',
        type: card.type === 'CASH' ? 'CASH' : 'CARD',
        defaultCurrency: card.defaultCurrency ?? 'USD',
        settlementCurrency: card.settlementCurrency ?? 'USD',
        defaultRate: card.defaultRate ? String(card.defaultRate) : '',
        autoConvertToSettlement: card.autoConvertToSettlement,
        startingBalance: card.startingBalance ?? null,
        startingBalanceStr:
          card.startingBalance && isCurrencyCode(card.defaultCurrency ?? '')
            ? getCurrencyHelpersCached(card.defaultCurrency ?? 'USD').toUIString(
                card.startingBalance,
                true,
                true,
              )
            : '',
      });
      setOpen(true);
    },
    [getCurrencyHelpersCached],
  );

  const onSave = useCallback(async () => {
    try {
      if (form.id) {
        await updateCard.mutateAsync({
          ...form,
          id: form.id,
          defaultRate: form.defaultRate ? Number(form.defaultRate) : null,
          startingBalance: form.startingBalance,
        });
      } else {
        await createCard.mutateAsync({
          ...form,
          defaultRate: form.defaultRate ? Number(form.defaultRate) : null,
          startingBalance: form.startingBalance,
        });
      }
      await refreshCards();
      setOpen(false);
      toast.success(t('cards.saved'));
    } catch (error) {
      console.error(error);
      toast.error(t('errors.something_went_wrong'));
    }
  }, [createCard, form, refreshCards, t, updateCard]);

  const onArchive = useCallback(
    async (id: number) => {
      await archiveCard.mutateAsync({ id });
      await refreshCards();
    },
    [archiveCard, refreshCards],
  );

  const onRestore = useCallback(
    async (id: number) => {
      await restoreCard.mutateAsync({ id });
      await refreshCards();
    },
    [restoreCard, refreshCards],
  );

  const updateForm = useCallback(
    (key: keyof CardFormState) =>
      (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setForm((current) => ({ ...current, [key]: event.target.value })),
    [],
  );

  const onTypeChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    setForm((current) => ({
      ...current,
      type: event.target.value === 'CASH' ? 'CASH' : 'CARD',
    }));
  }, []);

  const onCurrencyChange = useCallback(
    (key: 'defaultCurrency' | 'settlementCurrency') =>
      (event: React.ChangeEvent<HTMLSelectElement>) => {
        setForm((current) => ({ ...current, [key]: event.target.value }));
      },
    [],
  );

  const onStartingBalanceChange = useCallback(
    ({ strValue, bigIntValue }: { strValue?: string; bigIntValue?: bigint }) => {
      setForm((current) => ({
        ...current,
        startingBalanceStr: strValue ?? current.startingBalanceStr,
        startingBalance: bigIntValue !== undefined ? bigIntValue : current.startingBalance,
      }));
    },
    [],
  );

  const onAutoConvertToSettlementChange = useCallback((checked: boolean) => {
    setForm((current) => ({
      ...current,
      autoConvertToSettlement: checked,
    }));
  }, []);

  useEffect(() => {
    if (!open) {
      setForm(emptyCardForm);
    }
  }, [open]);

  return (
    <>
      <Head>
        <title>{t('cards.title')}</title>
      </Head>
      <MainLayout title={t('cards.title')} loading={cardsQuery.isPending}>
        <div className="flex flex-col gap-4">
          <Button className="w-full gap-2" onClick={onAdd}>
            <PlusIcon className="size-4" />
            {t('cards.add_source')}
          </Button>
          {cardsQuery.data?.length ? (
            cardsQuery.data.map((card) => (
              <div
                key={card.id}
                className="flex items-center justify-between gap-3 rounded-md border p-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  {card.type === 'CASH' ? (
                    <Banknote className="size-5 shrink-0 text-emerald-500" />
                  ) : (
                    <CreditCard className="size-5 shrink-0 text-cyan-500" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate font-medium">{card.name}</p>
                    <p className="truncate text-sm text-gray-500">
                      {card.type === 'CASH'
                        ? [
                            card.defaultCurrency,
                            card.settlementCurrency,
                            card.defaultRate
                              ? `${card.defaultRate} ${card.defaultCurrency}/${card.settlementCurrency}`
                              : null,
                            card.autoConvertToSettlement ? t('cards.auto_convert_enabled') : null,
                          ]
                            .filter(Boolean)
                            .join(' / ')
                        : [card.issuer, card.network].filter(Boolean).join(' / ') ||
                          t('ui.not_set')}
                    </p>
                    {card.archivedAt ? (
                      <p className="text-xs text-gray-500">{t('cards.archived')}</p>
                    ) : null}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="icon" onClick={() => onEdit(card)}>
                    <PencilIcon className="size-4" />
                  </Button>
                  {card.archivedAt ? (
                    <Button variant="ghost" size="icon" onClick={() => onRestore(card.id)}>
                      <RotateCcw className="size-4" />
                    </Button>
                  ) : (
                    <Button variant="ghost" size="icon" onClick={() => onArchive(card.id)}>
                      <Trash2 className="size-4 text-orange-500" />
                    </Button>
                  )}
                </div>
              </div>
            ))
          ) : (
            <p className="mt-16 text-center text-gray-500">{t('cards.empty')}</p>
          )}
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{form.id ? t('cards.edit_source') : t('cards.add_source')}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-3">
              <Input
                value={form.name}
                onChange={updateForm('name')}
                placeholder={t('cards.name')}
              />
              <NativeSelect value={form.type} onChange={onTypeChange}>
                <NativeSelectOption value="CARD">{t('cards.types.card')}</NativeSelectOption>
                <NativeSelectOption value="CASH">{t('cards.types.cash')}</NativeSelectOption>
              </NativeSelect>
              {form.type === 'CARD' ? (
                <>
                  <Input
                    value={form.issuer}
                    onChange={updateForm('issuer')}
                    placeholder={t('cards.issuer')}
                  />
                  <Input
                    value={form.network}
                    onChange={updateForm('network')}
                    placeholder={t('cards.network')}
                  />
                </>
              ) : (
                <>
                  <div className="grid gap-2">
                    <Label>{t('cards.cash_currency')}</Label>
                    <NativeSelect
                      value={form.defaultCurrency}
                      onChange={onCurrencyChange('defaultCurrency')}
                    >
                      {Object.keys(CURRENCIES).map((currency) => (
                        <NativeSelectOption key={currency} value={currency}>
                          {currency}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </div>
                  <div className="grid gap-2">
                    <Label>{t('cards.settlement_currency')}</Label>
                    <NativeSelect
                      value={form.settlementCurrency}
                      onChange={onCurrencyChange('settlementCurrency')}
                    >
                      {Object.keys(CURRENCIES).map((currency) => (
                        <NativeSelectOption key={currency} value={currency}>
                          {currency}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </div>
                  <div className="grid gap-2">
                    <Label>{t('cards.default_rate')}</Label>
                    <Input
                      value={form.defaultRate}
                      onChange={updateForm('defaultRate')}
                      placeholder={t('cards.default_rate_placeholder')}
                      inputMode="decimal"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-md border p-3">
                    <div className="grid gap-1">
                      <Label htmlFor="auto-convert-cash">
                        {t('cards.auto_convert_to_settlement')}
                      </Label>
                      <p className="text-xs text-gray-500">
                        {t('cards.auto_convert_to_settlement_help')}
                      </p>
                    </div>
                    <Switch
                      id="auto-convert-cash"
                      checked={form.autoConvertToSettlement}
                      onCheckedChange={onAutoConvertToSettlementChange}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>{t('cards.starting_balance')}</Label>
                    <CurrencyInput
                      currency={isCurrencyCode(form.defaultCurrency) ? form.defaultCurrency : 'USD'}
                      strValue={form.startingBalanceStr}
                      hideSymbol
                      onValueChange={onStartingBalanceChange}
                    />
                  </div>
                </>
              )}
              <Textarea
                value={form.notes}
                onChange={updateForm('notes')}
                placeholder={t('cards.notes')}
              />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                {t('actions.cancel')}
              </Button>
              <Button
                disabled={'' === form.name || createCard.isPending || updateCard.isPending}
                onClick={onSave}
              >
                {t('actions.save')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </MainLayout>
    </>
  );
};

CardsPage.auth = true;

export const getStaticProps = withI18nStaticProps(['common']);

export default CardsPage;
