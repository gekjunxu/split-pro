import { HeartHandshakeIcon, Landmark, RefreshCcwDot, X } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useTranslation } from 'next-i18next';
import Link from 'next/link';
import { useRouter } from 'next/router';
import React, { useCallback } from 'react';
import { toast } from 'sonner';

import { useTranslationWithUtils } from '~/hooks/useTranslationWithUtils';
import { cronToBackend } from '~/lib/cron';
import { type CurrencyCode, isCurrencyCode } from '~/lib/currency';
import { calculateExchangeRateFromSettlement } from '~/lib/originalExpense';
import { serializeSplitShares } from '~/lib/splitShares';
import { cn } from '~/lib/utils';
import { clearAddExpenseDraft, useAddExpenseStore } from '~/store/addStore';
import { api } from '~/utils/api';
import { BigMath, currencyConversion } from '~/utils/numbers';
import { isStringQueryParam } from '~/utils/queryParams';

import { CurrencyConversion } from '../Friend/CurrencyConversion';
import { Button } from '../ui/button';
import { CurrencyConversionIcon } from '../ui/categoryIcons';
import { CurrencyInput } from '../ui/currency-input';
import { Input } from '../ui/input';
import AddBankTransactions from './AddBankTransactions';
import { CardSelector } from './CardSelector';
import { CategoryPicker } from './CategoryPicker';
import { CurrencyPicker } from './CurrencyPicker';
import { DateSelector } from './DateSelector';
import { OriginalExpenseDetails } from './OriginalExpenseDetails';
import { RecurrenceInput } from './RecurrenceInput';
import { SelectUserOrGroup } from './SelectUserOrGroup';
import { PayerSelectionForm, SplitExpenseForm } from './SplitTypeSection';
import { UploadFile } from './UploadFile';
import { UserInput } from './UserInput';

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
  const originalAmountStr = useAddExpenseStore((s) => s.originalAmountStr);
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
    setExpenseDate,
    setMultipleTransactions,
    setIsTransactionLoading,
    setSingleTransaction,
  } = useAddExpenseStore((s) => s.actions);

  const addExpenseMutation = api.expense.addOrEditExpense.useMutation();
  const cardsQuery = api.card.list.useQuery(
    { groupId: group?.id ?? null },
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  );
  const apiUtils = api.useUtils();
  const { update } = useSession();
  const selectedPaymentSource = React.useMemo(
    () => cardsQuery.data?.find((card) => card.id === cardId),
    [cardId, cardsQuery.data],
  );

  const defaultSettlementCurrency = React.useMemo<CurrencyCode>(() => {
    if (isCurrencyCode(selectedPaymentSource?.settlementCurrency)) {
      return selectedPaymentSource.settlementCurrency;
    }
    if (isCurrencyCode(group?.defaultCurrency)) {
      return group.defaultCurrency;
    }
    if (isCurrencyCode(currentUser?.defaultCurrency)) {
      return currentUser.defaultCurrency;
    }
    if (isCurrencyCode(currentUser?.currency)) {
      return currentUser.currency;
    }
    return currency;
  }, [
    currency,
    currentUser?.currency,
    currentUser?.defaultCurrency,
    group?.defaultCurrency,
    selectedPaymentSource?.settlementCurrency,
  ]);

  const isOverseasActive = Boolean(originalCurrency && originalCurrency !== currency);
  const previousCurrencyRef = React.useRef<CurrencyCode | null>(null);
  const router = useRouter();

  const onStartOverseas = useCallback(
    (paidCurrency: CurrencyCode) => {
      const targetSettlementCurrency =
        defaultSettlementCurrency !== paidCurrency ? defaultSettlementCurrency : currency;

      if (targetSettlementCurrency === paidCurrency) {
        setCurrency(paidCurrency);
        clearOriginalExpense();
        return;
      }

      const nextOriginalAmount =
        originalAmount !== undefined && 0n < originalAmount
          ? originalAmount
          : 0n < amount
            ? amount
            : undefined;
      const nextOriginalAmountStr =
        originalAmountStr !== undefined && '' !== originalAmountStr
          ? originalAmountStr
          : 0n < amount
            ? amtStr
            : '';

      setCurrency(targetSettlementCurrency);
      if (0n < amount && (originalAmount === undefined || 0n === originalAmount)) {
        setAmount(0n);
        setAmountStr('');
      }
      setOriginalExpense({
        originalAmount: nextOriginalAmount,
        originalAmountStr: nextOriginalAmountStr,
        originalCurrency: paidCurrency,
        conversionRate: undefined,
      });
    },
    [
      amount,
      amtStr,
      clearOriginalExpense,
      currency,
      defaultSettlementCurrency,
      originalAmount,
      originalAmountStr,
      setAmount,
      setAmountStr,
      setCurrency,
      setOriginalExpense,
    ],
  );

  const onCurrencyPick = useCallback(
    (newCurrency: CurrencyCode | null) => {
      if (!newCurrency) {
        return;
      }

      if (isOverseasActive) {
        if (newCurrency === currency) {
          if (originalAmount !== undefined && 0n < originalAmount) {
            const signedOrig = (isNegative ? -1n : 1n) * originalAmount;
            setAmount(signedOrig);
            setAmountStr(
              originalAmountStr ??
                getCurrencyHelpersCached(newCurrency).toUIString(signedOrig, true, true),
            );
          }
          clearOriginalExpense();
          return;
        }

        const nextRate =
          originalAmount && 0n < originalAmount && 0n < amount
            ? calculateExchangeRateFromSettlement({
                paidAmount: (isNegative ? -1n : 1n) * originalAmount,
                paidCurrency: newCurrency,
                settlementAmount: (isNegative ? -1n : 1n) * amount,
                settlementCurrency: currency,
              })
            : undefined;

        setOriginalExpense({
          originalAmount,
          originalAmountStr,
          originalCurrency: newCurrency,
          conversionRate: nextRate,
        });
        return;
      }

      if (newCurrency !== defaultSettlementCurrency) {
        onStartOverseas(newCurrency);
        return;
      }

      previousCurrencyRef.current = currency;
      setCurrency(newCurrency);
      clearOriginalExpense();
    },
    [
      amount,
      clearOriginalExpense,
      currency,
      defaultSettlementCurrency,
      getCurrencyHelpersCached,
      isNegative,
      isOverseasActive,
      onStartOverseas,
      originalAmount,
      originalAmountStr,
      setAmount,
      setAmountStr,
      setCurrency,
      setOriginalExpense,
    ],
  );

  const onChangeSettlementCurrency = useCallback(
    (nextSettlementCurrency: CurrencyCode) => {
      setCurrency(nextSettlementCurrency);
      if (originalCurrency && originalAmount && 0n < originalAmount && 0n < amount) {
        const nextRate = calculateExchangeRateFromSettlement({
          paidAmount: (isNegative ? -1n : 1n) * originalAmount,
          paidCurrency: originalCurrency,
          settlementAmount: (isNegative ? -1n : 1n) * amount,
          settlementCurrency: nextSettlementCurrency,
        });
        setOriginalExpense({
          originalAmount,
          originalAmountStr,
          originalCurrency,
          conversionRate: nextRate,
        });
      }
    },
    [
      amount,
      isNegative,
      originalAmount,
      originalAmountStr,
      originalCurrency,
      setCurrency,
      setOriginalExpense,
    ],
  );

  const onKeepInPaidCurrency = useCallback(() => {
    if (!originalCurrency) {
      return;
    }

    setCurrency(originalCurrency);
    if (originalAmount !== undefined && 0n < originalAmount) {
      const signedOrig = (isNegative ? -1n : 1n) * originalAmount;
      setAmount(signedOrig);
      setAmountStr(
        originalAmountStr ??
          getCurrencyHelpersCached(originalCurrency).toUIString(signedOrig, true, true),
      );
    }
    clearOriginalExpense();
  }, [
    clearOriginalExpense,
    getCurrencyHelpersCached,
    isNegative,
    originalAmount,
    originalAmountStr,
    originalCurrency,
    setAmount,
    setAmountStr,
    setCurrency,
  ]);

  const onUpdateAmount = useCallback(
    ({ strValue, bigIntValue }: { strValue?: string; bigIntValue?: bigint }) => {
      if (isOverseasActive && originalCurrency) {
        const nextOriginalAmount =
          bigIntValue !== undefined ? BigMath.abs(bigIntValue) : originalAmount;
        const nextOriginalAmountStr = strValue !== undefined ? strValue : originalAmountStr;
        const nextSign =
          bigIntValue !== undefined ? (bigIntValue < 0n ? -1n : 1n) : isNegative ? -1n : 1n;

        if (0n < amount && bigIntValue !== undefined) {
          setAmount(nextSign * amount);
        }

        const nextRate =
          nextOriginalAmount && 0n < nextOriginalAmount && 0n < amount
            ? calculateExchangeRateFromSettlement({
                paidAmount: nextSign * nextOriginalAmount,
                paidCurrency: originalCurrency,
                settlementAmount: nextSign * amount,
                settlementCurrency: currency,
              })
            : conversionRate;

        setOriginalExpense({
          originalAmount: nextOriginalAmount,
          originalAmountStr: nextOriginalAmountStr,
          originalCurrency,
          conversionRate: nextRate,
        });
        return;
      }

      if (strValue !== undefined) {
        setAmountStr(strValue);
      }
      if (bigIntValue !== undefined) {
        setAmount(bigIntValue);
      }
      previousCurrencyRef.current = null;
      clearOriginalExpense();
    },
    [
      amount,
      clearOriginalExpense,
      conversionRate,
      currency,
      isNegative,
      isOverseasActive,
      originalAmount,
      originalAmountStr,
      originalCurrency,
      setAmount,
      setAmountStr,
      setOriginalExpense,
    ],
  );

  const onUpdateSettlementAmount = useCallback(
    ({ strValue, bigIntValue }: { strValue?: string; bigIntValue?: bigint }) => {
      if (strValue !== undefined) {
        setAmountStr(strValue);
      }

      const nextAbsSettlement = bigIntValue !== undefined ? BigMath.abs(bigIntValue) : amount;
      const sign = isNegative ? -1n : 1n;

      if (bigIntValue !== undefined) {
        setAmount(sign * nextAbsSettlement);
      }

      if (originalCurrency && originalAmount && 0n < originalAmount) {
        const nextRate =
          0n < nextAbsSettlement
            ? calculateExchangeRateFromSettlement({
                paidAmount: sign * originalAmount,
                paidCurrency: originalCurrency,
                settlementAmount: sign * nextAbsSettlement,
                settlementCurrency: currency,
              })
            : undefined;
        setOriginalExpense({
          originalAmount,
          originalAmountStr,
          originalCurrency,
          conversionRate: nextRate,
        });
      }
    },
    [
      amount,
      currency,
      isNegative,
      originalAmount,
      originalAmountStr,
      originalCurrency,
      setAmount,
      setAmountStr,
      setOriginalExpense,
    ],
  );

  const onApplyRate = useCallback(
    ({
      conversionRate: nextConversionRate,
      settlementAmount: nextSettlementAmount,
      settlementAmountStr: nextSettlementAmountStr,
    }: {
      conversionRate: number;
      settlementAmount: bigint;
      settlementAmountStr: string;
    }) => {
      if (!originalCurrency) {
        return;
      }

      const sign = isNegative ? -1n : 1n;
      setAmount(sign * BigMath.abs(nextSettlementAmount));
      setAmountStr(nextSettlementAmountStr);
      setOriginalExpense({
        originalAmount,
        originalAmountStr,
        originalCurrency,
        conversionRate: nextConversionRate,
      });
    },
    [
      isNegative,
      originalAmount,
      originalAmountStr,
      originalCurrency,
      setAmount,
      setAmountStr,
      setOriginalExpense,
    ],
  );

  const addExpense = useCallback(async () => {
    if (!paidBy) {
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
      'CASH' === selectedPaymentSource?.type &&
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
              clearAddExpenseDraft();
              await apiUtils.invalidate();

              if (0 < multipleTransactions.length) {
                const allTransactions = [...multipleTransactions];
                const transactionToAdd = allTransactions.pop();
                if (transactionToAdd) {
                  setMultipleTransactions(allTransactions);
                  setSingleTransaction(transactionToAdd);
                }
                return;
              } else {
                const id = 0 < d.length ? d[0]?.id : expenseId;

                let navPromise: () => Promise<any> = () => Promise.resolve(true);

                const { friendId, groupId } = router.query;

                if (isStringQueryParam(friendId) && friendId && !groupId) {
                  navPromise = () => router.push(`/balances/${friendId}/expenses/${id}`);
                } else if (isStringQueryParam(groupId) && groupId) {
                  navPromise = () => router.push(`/groups/${groupId}/expenses/${id}`);
                } else {
                  navPromise = () => router.push(`/expenses/${id}?keepAdding=1`);
                }

                if (expenseId) {
                  navPromise = async () => router.back();
                }

                navPromise().catch(console.error);
                update((session: any) => ({
                  ...session,
                  user: {
                    ...(session?.user ?? {}),
                    currency: mutationCurrency,
                  },
                })).catch(console.error);
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
        toast.error(t('errors.expense_submission_failed'));
      }
    }
  }, [
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
    addExpenseMutation,
    apiUtils,
    group,
    paidBy,
    splitType,
    fileKey,
    setMultipleTransactions,
    transactionId,
    setIsTransactionLoading,
    cronExpression,
    multipleTransactions,
    setSingleTransaction,
    t,
    update,
  ]);

  const handleDescriptionChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setDescription(e.target.value ?? '');
    },
    [setDescription],
  );

  const clearTransaction = useCallback(() => {
    clearAddExpenseDraft();
    resetState();
    setMultipleTransactions([]);
  }, [resetState, setMultipleTransactions]);

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
        (0n <= absAmount ? 1n : -1n) *
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

  const onCardPick = useCallback(
    (nextCardId?: number | null) => {
      const nextPaymentSource = cardsQuery.data?.find((card) => card.id === nextCardId);

      setCardId(nextCardId);

      if ('CASH' === nextPaymentSource?.type && isCurrencyCode(nextPaymentSource.defaultCurrency)) {
        const cashSettlement = isCurrencyCode(nextPaymentSource.settlementCurrency)
          ? nextPaymentSource.settlementCurrency
          : defaultSettlementCurrency;

        if (
          nextPaymentSource.autoConvertToSettlement &&
          cashSettlement !== nextPaymentSource.defaultCurrency
        ) {
          const nextOriginalAmount =
            originalAmount !== undefined && 0n < originalAmount
              ? originalAmount
              : 0n < amount
                ? amount
                : undefined;
          const nextOriginalAmountStr =
            originalAmountStr !== undefined && '' !== originalAmountStr
              ? originalAmountStr
              : 0n < amount
                ? amtStr
                : '';

          setCurrency(cashSettlement);
          if (0n < amount && (originalAmount === undefined || 0n === originalAmount)) {
            setAmount(0n);
            setAmountStr('');
          }
          setOriginalExpense({
            originalAmount: nextOriginalAmount,
            originalAmountStr: nextOriginalAmountStr,
            originalCurrency: nextPaymentSource.defaultCurrency,
            conversionRate:
              nextPaymentSource.defaultRate && 0 < nextPaymentSource.defaultRate
                ? 1 / nextPaymentSource.defaultRate
                : undefined,
          });
          return;
        }

        if (0n === amount && !isOverseasActive) {
          setCurrency(nextPaymentSource.defaultCurrency);
          clearOriginalExpense();
        }
      }
    },
    [
      amount,
      amtStr,
      cardsQuery.data,
      clearOriginalExpense,
      defaultSettlementCurrency,
      isOverseasActive,
      originalAmount,
      originalAmountStr,
      setAmount,
      setAmountStr,
      setCardId,
      setCurrency,
      setOriginalExpense,
    ],
  );

  const currencyConversionComponent = React.useMemo(() => {
    if (
      isOverseasActive ||
      currency === previousCurrencyRef.current ||
      null === previousCurrencyRef.current ||
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
  }, [amount, currency, isOverseasActive, onConvertAmount]);

  const onBackButtonPress = useCallback(() => {
    clearAddExpenseDraft();
    router.back();
  }, [router]);

  const topInputCurrency = isOverseasActive && originalCurrency ? originalCurrency : currency;
  const topInputStrValue = isOverseasActive ? (originalAmountStr ?? '') : amtStr;
  const hasAnyAmountEntered = 0n < amount || 0n < (originalAmount ?? 0n);

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
            addExpenseMutation.isPending ||
            !amount ||
            '' === description ||
            isFileUploading ||
            !isExpenseSettled
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
              currentCurrency={topInputCurrency}
              onCurrencyPick={onCurrencyPick}
              preferredCurrencies={groupQuickCurrencies}
            />
            <CurrencyInput
              placeholder={t('expense_details.add_expense_details.amount_placeholder')}
              currency={topInputCurrency}
              strValue={topInputStrValue}
              allowNegative
              hideSymbol
              onValueChange={onUpdateAmount}
              rightIcon={currencyConversionComponent}
            />
          </div>
          <CardSelector groupId={group?.id ?? null} cardId={cardId} onCardPick={onCardPick} />
          <OriginalExpenseDetails
            expenseDate={expenseDate}
            settlementAmount={(isNegative ? -1n : 1n) * amount}
            settlementAmountStr={amtStr}
            settlementCurrency={currency}
            originalAmount={
              originalAmount !== undefined ? (isNegative ? -1n : 1n) * originalAmount : undefined
            }
            originalCurrency={originalCurrency}
            conversionRate={conversionRate}
            cardId={cardId}
            groupId={group?.id ?? null}
            onStartOverseas={onStartOverseas}
            onChangeSettlementCurrency={onChangeSettlementCurrency}
            onKeepInPaidCurrency={onKeepInPaidCurrency}
            onUpdateSettlementAmount={onUpdateSettlementAmount}
            onApplyRate={onApplyRate}
            preferredCurrencies={groupQuickCurrencies}
          />
          <div className="h-[180px]">
            {hasAnyAmountEntered && '' !== description ? (
              <>
                <div className="flex flex-col items-center justify-center text-sm text-gray-400 sm:mt-4 sm:flex-row">
                  <p>{t(`ui.expense.${isNegative ? 'received_by' : 'paid_by'}`)}</p>
                  <PayerSelectionForm>
                    <Button
                      variant="ghost"
                      className="text-primary h-8 max-w-full min-w-0 justify-start px-1.5 py-0 text-base sm:max-w-none"
                    >
                      <span className="max-w-full truncate">
                        {paidBy?.id === currentUser?.id
                          ? t(`ui.expense.${isNegative ? 'recipient' : 'payer'}.current_user`)
                          : displayName(paidBy)}
                      </span>
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
                        isNegative,
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
                      (!topInputStrValue || !description) && 'invisible',
                      'size-6',
                    )}
                  />
                  <span className="sr-only">{t('recurrence.toggle_options')}</span>
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
