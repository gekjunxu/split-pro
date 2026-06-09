import { CreditCard, PencilIcon, PlusIcon, RotateCcw, Trash2 } from 'lucide-react';
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
import { Input } from '~/components/ui/input';
import { Textarea } from '~/components/ui/textarea';
import { useTranslationWithUtils } from '~/hooks/useTranslationWithUtils';
import { type NextPageWithUser } from '~/types';
import { api } from '~/utils/api';
import { withI18nStaticProps } from '~/utils/i18n/server';

interface CardFormState {
  id?: number;
  name: string;
  issuer: string;
  network: string;
  notes: string;
}

const emptyCardForm: CardFormState = {
  name: '',
  issuer: '',
  network: '',
  notes: '',
};

const CardsPage: NextPageWithUser = () => {
  const { t } = useTranslationWithUtils();
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

  const onEdit = useCallback((card: NonNullable<typeof cardsQuery.data>[number]) => {
    setForm({
      id: card.id,
      name: card.name,
      issuer: card.issuer ?? '',
      network: card.network ?? '',
      notes: card.notes ?? '',
    });
    setOpen(true);
  }, []);

  const onSave = useCallback(async () => {
    try {
      if (form.id) {
        await updateCard.mutateAsync({ ...form, id: form.id });
      } else {
        await createCard.mutateAsync(form);
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
            {t('cards.add_card')}
          </Button>
          {cardsQuery.data?.length ? (
            cardsQuery.data.map((card) => (
              <div
                key={card.id}
                className="flex items-center justify-between gap-3 rounded-md border p-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <CreditCard className="size-5 shrink-0 text-cyan-500" />
                  <div className="min-w-0">
                    <p className="truncate font-medium">{card.name}</p>
                    <p className="truncate text-sm text-gray-500">
                      {[card.issuer, card.network].filter(Boolean).join(' / ') || t('ui.not_set')}
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
              <DialogTitle>{form.id ? t('cards.edit_card') : t('cards.add_card')}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-3">
              <Input
                value={form.name}
                onChange={updateForm('name')}
                placeholder={t('cards.name')}
              />
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
