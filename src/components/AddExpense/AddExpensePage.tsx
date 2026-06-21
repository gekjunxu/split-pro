import { HeartHandshakeIcon, Landmark, RefreshCcwDot, X } from 'lucide-react';
import { useTranslation } from 'next-i18next';
import Link from 'next/link';
import { useRouter } from 'next/router';
import React, { useCallback } from 'react';

import { type CurrencyCode, isCurrencyCode } from '~/lib/currency';
import { useAddExpenseStore } from '~/store/addStore';
import { api } from '~/utils/api';

import { toast } from 'sonner';
import { useTranslationWithUtils } from '~/hooks/useTranslationWithUtils';
import { cronToBackend } from '~/lib/cron';
import { serializeSplitShares } from '~/lib/splitShares';
import { cn } from '~/lib/utils';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import AddBankTransactions from './AddBankTransactions';
import { CardSelector } from './CardSelector';
import { CategoryPicker } from './CategoryPicker';
import { CurrencyPicker } from './CurrencyPicker';
import { DateSelector } from './DateSelector';
import { RecurrenceInput } from './RecurrenceInput';
import { SelectUserOrGroup } from './SelectUserOrGroup';
import { PayerSelectionForm, SplitExpenseForm } from './SplitTypeSection';
import { UploadFile } from './UploadFile';
import { UserInput } from './UserInput';
import { OriginalExpenseDetails } from './OriginalExpenseDetails';
import { CurrencyInput } from '../ui/currency-input';
import { CurrencyConversion } from '../Friend/CurrencyConversion';
import { BigMath, currencyConversion } from '~/utils/numbers';
import { CurrencyConversionIcon } from '../ui/categoryIcons';
import { useSession } from 'next-auth/react';

export const AddOrEditExpensePage: React.FC<{
  enableSendingInvites: boolean;
  expenseId?: string;
  bankConnectionEnabled: boolean;
}> = ({ enableSendingInvites, expenseId, bankConnectionEnabled }) => {
  const showFriends = useAddExpenseStore((s) => s.showFriends);
  const amount = useAddExpenseStore((s) => s.amount);
  const isNegative = useAddExpenseStore((s) => s.isNegative);
  const participants = useAddExpenseStore((s) => s.participants);
  const group = useAddExpenseStore((s) => s.group);
  const currency = useAddExpenseStore((s) => s.currency);
  const category = useAddExpenseStore((s) => s.category);
  const description = useAddExpenseStore((s) => s.description);
  const originalAmount = useAddExpenseStore((s) => s.originalAmount);
  const originalCurrency = useAddExpenseStore((s) => s.originalCurrency);
  const conversionRate = useAddExpenseStore((s) => s.conversionRate);
  const cardId = useAddExpenseStore((s) => s.cardId);
  const isFileUploading = useAddExpenseStore((s) => s.isFileUploading);
  const amtStr = useAddExpenseStore((s) => s.amountStr);
  const expenseDate = useAddExpenseStore((s) => s.expenseDate);
  const isExpenseSettled = useAddExpenseStore((s) => s.canSplitScreenClosed);
  const paidBy = useAddExpenseStore((s) => s.paidBy);
  const splitType = useAddExpenseStore((s) => s.splitType);
  const fileKey = useAddExpenseStore((s) => s.fileKey);
  const currentUser = useAddExpenseStore((s) => s.currentUser);
  const splitShares = useAddExpenseStore((s) => s.splitShares);
  const transactionId = useAddExpenseStore((s) => s.transactionId);
  const cronExpression = useAddExpenseStore((s) => s.cronExpression);
  const multipleTransactions = useAddExpenseStore((s) => s.multipleTransactions);

  const { t, displayName, generateSplitDescription, getCurrencyHelpersCached } =
    useTranslationWithUtils();

  const {
    setCurrency,
    setCategory,
    setDescription,
    setAmount,
    setAmountStr,
    setOriginalExpense,
    setCardId,
    clearOriginalExpense,
    resetState,
    setSplitScreenOpen,
    setExpenseDate,
    setMultipleTransactions,
    setIsTransactionLoading,
    setSingleTransaction,
  } = useAddExpenseStore((s) => s.actions);

  const addExpenseMutation = api.expense.addOrEditExpense.useMutation();
  const cardsQuery = api.card.list.useQuery();
  const apiUtils = api.useUtils();
  const updateProfile = api.user.updateUserDetail.useMutation();
  const { update } = useSession();
  const selectedPaymentSource = React.useMemo(
    () => cardsQuery.data?.find((card) => card.id === cardId),
    [cardId, cardsQuery.data],
  );

  const onCurrencyPick = useCallback(
    (newCurrency: CurrencyCode | null) => {
      if (!newCurrency) {
        return;
      }

      updateProfile.mutate({ currency: newCurrency });

      previousCurrencyRef.current = currency;
      setCurrency(newCurrency);
      clearOriginalExpense();
    },
    [clearOriginalExpense, currency, setCurrency, updateProfile],
  );

  const router = useRouter();

  const onUpdateAmount = useCallback(
    ({ strValue, bigIntValue }: { strValue?: string; bigIntValue?: bigint }) => {
      if (strValue !== undefined) {
        setAmountStr(strValue);
      }
      if (bigIntValue !== undefined) {
        setAmount(bigIntValue);
      }
      previousCurrencyRef.current = null;
      clearOriginalExpense();
    },
    [clearOriginalExpense, setAmount, setAmountStr],
  );

  const addExpense = useCallback(async () => {
    if (!paidBy) {
      return;
    }

    if (!isExpenseSettled) {
      setSplitScreenOpen(true);
      return;
    }

    setMultipleTransactions([]);
    setIsTransactionLoading(false);

    const sign = isNegative ? -1n : 1n;
    const signedAmount = amount * sign;
    const signedParticipants = participants.map((p) => ({
      userId: p.id,
      amount: (p.amount ?? 0n) * sign,
    }));
    const shouldAutoConvertCash =
      !originalCurrency &&
      !conversionRate &&
      selectedPaymentSource?.type === 'CASH' &&
      selectedPaymentSource.autoConvertToSettlement &&
      selectedPaymentSource.defaultRate &&
      isCurrencyCode(selectedPaymentSource.defaultCurrency) &&
      isCurrencyCode(selectedPaymentSource.settlementCurrency) &&
      selectedPaymentSource.defaultCurrency === currency &&
      selectedPaymentSource.settlementCurrency !== selectedPaymentSource.defaultCurrency;
    const autoConversionRate =
      shouldAutoConvertCash && selectedPaymentSource.defaultRate
        ? 1 / selectedPaymentSource.defaultRate
        : undefined;
    const convertedAmount =
      shouldAutoConvertCash && autoConversionRate
        ? currencyConversion({
            amount: signedAmount,
            rate: autoConversionRate,
            from: selectedPaymentSource.defaultCurrency as CurrencyCode,
            to: selectedPaymentSource.settlementCurrency as CurrencyCode,
          })
        : signedAmount;
    const convertedParticipants =
      shouldAutoConvertCash && autoConversionRate
        ? signedParticipants.map((participant) => ({
            ...participant,
            amount: currencyConversion({
              amount: participant.amount,
              rate: autoConversionRate,
              from: selectedPaymentSource.defaultCurrency as CurrencyCode,
              to: selectedPaymentSource.settlementCurrency as CurrencyCode,
            }),
          }))
        : signedParticipants;
    const participantRoundingDelta = convertedParticipants.reduce(
      (total, participant) => total + participant.amount,
      0n,
    );
    const normalizedParticipants =
      0n !== participantRoundingDelta
        ? convertedParticipants.map((participant) =>
            participant.userId === paidBy.id
              ? { ...participant, amount: participant.amount - participantRoundingDelta }
              : participant,
          )
        : convertedParticipants;
    const mutationCurrency =
      shouldAutoConvertCash && isCurrencyCode(selectedPaymentSource.settlementCurrency)
        ? selectedPaymentSource.settlementCurrency
        : currency;

    try {
      await addExpenseMutation.mutateAsync(
        [
          {
            name: description,
            currency: mutationCurrency,
            amount: convertedAmount,
            groupId: group?.id ?? null,
            splitType,
            splitShares: serializeSplitShares(splitShares),
            participants: normalizedParticipants,
            originalAmount: shouldAutoConvertCash
              ? signedAmount
              : originalAmount !== undefined
                ? originalAmount * sign
                : undefined,
            originalCurrency: shouldAutoConvertCash
              ? selectedPaymentSource.defaultCurrency
              : originalCurrency,
            conversionRate: shouldAutoConvertCash ? autoConversionRate : conversionRate,
            cardId,
            paidBy: paidBy.id,
            category,
            fileKey,
            expenseDate,
            expenseId,
            transactionId,
            cronExpression: cronExpression ? cronToBackend(cronExpression) : undefined,
          },
        ],
        {
          onSuccess: async (d) => {
            if (d) {
              await apiUtils.invalidate();

              if (multipleTransactions.length > 0) {
                const allTransactions = [...multipleTransactions];
                const transactionToAdd = allTransactions.pop();
                if (transactionToAdd) {
                  setMultipleTransactions(allTransactions);
                  setSingleTransaction(transactionToAdd);
                }
                return;
              } else {
                const id = d.length > 0 ? d[0]?.id : expenseId;

                let navPromise: () => Promise<any> = () => Promise.resolve(true);

                const { friendId, groupId } = router.query;

                if (friendId && !groupId) {
                  navPromise = () => router.push(`/balances/${friendId as string}/expenses/${id}`);
                } else if (groupId) {
                  navPromise = () => router.push(`/groups/${groupId as string}/expenses/${id}`);
                } else {
                  navPromise = () => router.push(`/expenses/${id}?keepAdding=1`);
                }

                if (expenseId) {
                  navPromise = async () => router.back();
                }

                update((session: any) => ({
                  ...session,
                  user: {
                    ...(session?.user ?? {}),
                    currency: mutationCurrency,
                  },
                }))
                  .then(() => navPromise())
                  .then(() => resetState())
                  .catch(console.error);
              }
            }
          },
        },
      );
    } catch (error) {
      console.error(error);
      if (error instanceof Error) {
        toast.error(error.message);
      } else {
        toast.error('An unexpected error occurred while submitting the expense.');
      }
    }
  }, [
    setSplitScreenOpen,
    description,
    currency,
    isNegative,
    amount,
    participants,
    splitShares,
    category,
    originalAmount,
    originalCurrency,
    conversionRate,
    cardId,
    selectedPaymentSource,
    expenseDate,
    expenseId,
    router,
    resetState,
    addExpenseMutation,
    apiUtils,
    group,
                        paidBy,
    splitType,
    fileKey,
    isExpenseSettled,
    setMultipleTransactions,
    transactionId,
    setIsTransactionLoading,
    cronExpression,
    multipleTransactions,
    setSingleTransaction,
    update,
  ]);

  const handleDescriptionChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setDescription(e.target.value.toString() ?? '');
    },
    [setDescription],
  );

  const clearTransaction = useCallback(() => {
    resetState();
    setMultipleTransactions([]);
  }, [resetState, setMultipleTransactions]);

  const previousCurrencyRef = React.useRef<CurrencyCode | null>(null);

  const groupQuickCurrencies = React.useMemo(
    () => group?.frequentCurrencies.filter(isCurrencyCode) ?? [],
    [group?.frequentCurrencies],
  );

  const onConvertAmount: React.ComponentProps<typeof CurrencyConversion>['onSubmit'] = useCallback(
    ({ amount: absAmount, rate }) => {
      if (!previousCurrencyRef.current) {
        return;
      }

      const targetAmount =
        (absAmount >= 0n ? 1n : -1n) *
        currencyConversion({
          amount: absAmount,
          rate,
          from: previousCurrencyRef.current,
          to: currency,
        });
      setAmount(targetAmount);
      setAmountStr(getCurrencyHelpersCached(currency).toUIString(targetAmount, false, true));
      previousCurrencyRef.current = null;
      clearOriginalExpense();
    },
    [clearOriginalExpense, setAmount, setAmountStr, currency, getCurrencyHelpersCached],
  );

  const onApplyOriginalExpense = useCallback(
    ({
      settlementAmount,
      originalAmount: nextOriginalAmount,
      originalCurrency: nextOriginalCurrency,
      conversionRate: nextConversionRate,
    }: {
      settlementAmount: bigint;
      originalAmount: bigint;
      originalCurrency: CurrencyCode;
      conversionRate: number;
    }) => {
      setAmount(settlementAmount);
      setAmountStr(getCurrencyHelpersCached(currency).toUIString(settlementAmount, true, true));
      setOriginalExpense({
        originalAmount: BigMath.abs(nextOriginalAmount),
        originalCurrency: nextOriginalCurrency,
        conversionRate: nextConversionRate,
      });
    },
    [currency, getCurrencyHelpersCached, setAmount, setAmountStr, setOriginalExpense],
  );

  const onClearOriginalExpense = useCallback(() => {
    clearOriginalExpense();
  }, [clearOriginalExpense]);

  const onCardPick = useCallback(
    (nextCardId?: number | null) => {
      const nextPaymentSource = cardsQuery.data?.find((card) => card.id === nextCardId);

      setCardId(nextCardId);

      if (
        0n === amount &&
        nextPaymentSource?.type === 'CASH' &&
        nextPaymentSource.autoConvertToSettlement &&
        isCurrencyCode(nextPaymentSource.defaultCurrency)
      ) {
        setCurrency(nextPaymentSource.defaultCurrency);
        clearOriginalExpense();
      }
    },
    [amount, cardsQuery.data, clearOriginalExpense, setCardId, setCurrency],
  );

  const currencyConversionComponent = React.useMemo(() => {
    if (
      currency === previousCurrencyRef.current ||
      previousCurrencyRef.current === null ||
      !amount ||
      0n === amount
    ) {
      return null;
    }

    return (
      <CurrencyConversion
        onSubmit={onConvertAmount}
        amount={amount}
        currency={previousCurrencyRef.current}
        editingTargetCurrency={currency}
      >
        <Button size="icon" variant="secondary" className="size-8">
          <CurrencyConversionIcon className="size-4" />
        </Button>
      </CurrencyConversion>
    );
  }, [amount, currency, onConvertAmount]);

  const onBackButtonPress = useCallback(() => {
    router.back();
  }, [router]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" className="text-primary px-0" onClick={onBackButtonPress}>
          {t('actions.cancel')}
        </Button>
        <div className="text-center">
          {expenseId ? t('actions.edit_expense') : t('actions.add_expense')}
        </div>
        <Button
          variant="ghost"
          className="text-primary px-0"
          disabled={
            addExpenseMutation.isPending || !amount || '' === description || isFileUploading
          }
          onClick={addExpense}
        >
          {t('actions.save')}
        </Button>{' '}
      </div>
      <UserInput isEditing={Boolean(expenseId)} />
      {showFriends || (1 === participants.length && !group) ? (
        <SelectUserOrGroup enableSendingInvites={enableSendingInvites} />
      ) : (
        <>
          <div className="mt-4 flex gap-2 sm:mt-10">
            <CategoryPicker category={category} onCategoryPick={setCategory} />
            <Input
              placeholder={t('expense_details.add_expense_details.description_placeholder')}
              value={description}
              onChange={handleDescriptionChange}
              className="text-lg placeholder:text-sm"
              autoFocus
            />
          </div>
          <div className="flex gap-2">
            <CurrencyPicker
              currentCurrency={currency}
              onCurrencyPick={onCurrencyPick}
              preferredCurrencies={groupQuickCurrencies}
            />
            <CurrencyInput
              placeholder={t('expense_details.add_expense_details.amount_placeholder')}
              currency={currency}
              strValue={amtStr}
              allowNegative
              hideSymbol
              onValueChange={onUpdateAmount}
              rightIcon={currencyConversionComponent}
            />
          </div>
          <CardSelector cardId={cardId} onCardPick={onCardPick} />
          <OriginalExpenseDetails
            expenseDate={expenseDate}
            settlementAmount={(isNegative ? -1n : 1n) * amount}
            settlementCurrency={currency}
            originalAmount={
              originalAmount !== undefined ? (isNegative ? -1n : 1n) * originalAmount : undefined
            }
            originalCurrency={originalCurrency}
            conversionRate={conversionRate}
            cardId={cardId}
            onApply={onApplyOriginalExpense}
            onClear={onClearOriginalExpense}
            preferredCurrencies={groupQuickCurrencies}
          />
          <div className="h-[180px]">
            {amount && '' !== description ? (
              <>
                <div className="flex flex-col items-center justify-center text-sm text-gray-400 sm:mt-4 sm:flex-row">
                  <p>{t(`ui.expense.${isNegative ? 'received_by' : 'paid_by'}`)}</p>
                  <PayerSelectionForm>
                    <Button variant="ghost" className="text-primary h-8 px-1.5 py-0 text-base">
                      {displayName(paidBy, currentUser?.id, 'dativus')}
                    </Button>
                  </PayerSelectionForm>
                  <p>{t('ui.and')} </p>
                  <SplitExpenseForm>
                    <Button variant="ghost" className="text-primary h-8 px-1.5 py-0 text-base">
                      {generateSplitDescription(
                        splitType,
                        participants,
                        splitShares,
                        paidBy,
                        currentUser,
                      )}
                    </Button>
                  </SplitExpenseForm>
                </div>

                <div className="mt-4 flex items-start justify-between sm:mt-10">
                  <DateSelector
                    mode="single"
                    required
                    selected={expenseDate}
                    onSelect={setExpenseDate}
                  />
                  <div className="flex items-center gap-4">
                    <UploadFile />
                    <Button
                      className="min-w-[100px]"
                      size="sm"
                      loading={addExpenseMutation.isPending || isFileUploading}
                      disabled={
                        addExpenseMutation.isPending ||
                        !amount ||
                        '' === description ||
                        isFileUploading ||
                        !isExpenseSettled
                      }
                      onClick={addExpense}
                    >
                      {t('actions.save')}
                    </Button>
                  </div>
                </div>
              </>
            ) : null}
          </div>
          <div className="flex items-center justify-evenly px-4 lg:px-0">
            {!expenseId && (
              <RecurrenceInput>
                <Button variant="ghost" size="sm">
                  <RefreshCcwDot
                    className={cn(
                      cronExpression && 'text-primary',
                      (!amtStr || !description) && 'invisible',
                      'size-6',
                    )}
                  />
                  <span className="sr-only">Toggle recurring expense options</span>
                </Button>
              </RecurrenceInput>
            )}
            <SponsorUs />
            <div className="flex gap-2">
              <AddBankTransactions bankConnectionEnabled={bankConnectionEnabled}>
                <Button
                  variant="ghost"
                  className="hover:text-foreground/80 items-center justify-between px-2"
                >
                  <Landmark
                    className={cn(transactionId ? 'text-primary' : 'text-white-500', 'h-6 w-6')}
                  />
                </Button>
              </AddBankTransactions>
              <Button
                variant="ghost"
                className={cn('px-2', transactionId ? 'text-red-500' : 'invisible')}
                disabled={!transactionId}
                onClick={clearTransaction}
              >
                <X className="h-6 w-6" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

const SponsorUs = () => {
  const { t } = useTranslation();
  return (
    <div className="flex justify-center">
      <Link href="https://github.com/sponsors/krokosik" target="_blank" className="mx-auto">
        <Button
          variant="outline"
          className="text-md hover:text-foreground/80 justify-between rounded-full border-pink-500"
        >
          <div className="flex items-center gap-4">
            <HeartHandshakeIcon className="h-5 w-5 text-pink-500" />
            {t('expense_details.add_expense_details.sponsor_us')}
          </div>
        </Button>
      </Link>
    </div>
  );
};
