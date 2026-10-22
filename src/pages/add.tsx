import { type GetServerSideProps } from 'next';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useEffect, useRef } from 'react';
import { AddOrEditExpensePage } from '~/components/AddExpense/AddExpensePage';
import MainLayout from '~/components/Layout/MainLayout';
import { env } from '~/env';
import { cronFromBackend } from '~/lib/cron';
import { parseCurrencyCode } from '~/lib/currency';
import { hasOriginalExpenseDetails } from '~/lib/originalExpense';
import { deserializeSplitShares } from '~/lib/splitShares';
import { isBankConnectionConfigured } from '~/server/bankTransactionHelper';
import {
  getAddExpenseDraftScopeKey,
  loadAddExpenseDraft,
  saveAddExpenseDraft,
  useAddExpenseStore,
} from '~/store/addStore';
import { type NextPageWithUser } from '~/types';
import { api } from '~/utils/api';
import { customServerSideTranslations } from '~/utils/i18n/server';
import { useTranslationWithUtils } from '~/hooks/useTranslationWithUtils';
import { toast } from 'sonner';
import { deserializeDefaultSplit } from '~/lib/defaultSplit';
import { useAppStore } from '~/store/appStore';
import { BigMath } from '~/utils/numbers';
import { isStringQueryParam } from '~/utils/queryParams';

const AddPage: NextPageWithUser<{
  enableSendingInvites: boolean;
  bankConnectionEnabled: boolean;
  maxUploadFileSizeMB: number;
}> = ({ user, enableSendingInvites, bankConnectionEnabled, maxUploadFileSizeMB }) => {
  const { t, getCurrencyHelpersCached } = useTranslationWithUtils();
  const {
    setCurrentUser,
    setGroup,
    setParticipants,
    setCurrency,
    setAmount,
    setDescription,
    setPaidBy,
    setAmountStr,
    setExpenseDate,
    setCategory,
    setOriginalExpense,
    setCardId,
    resetState,
    setCronExpression,
    setFileKey,
    setSplitType,
    applySplitPreset,
  } = useAddExpenseStore((s) => s.actions);
  const currentUser = useAddExpenseStore((s) => s.currentUser);
  const initializedUserIdRef = useRef<number | null>(null);
  const initializedGroupIdRef = useRef<number | null>(null);
  const initializedFriendIdRef = useRef<number | null>(null);
  const initializedExpenseIdRef = useRef<string | null>(null);
  const draftRestoredKeyRef = useRef<string | null>(null);

  useEffect(
    () => () => {
      resetState();
      initializedUserIdRef.current = null;
      initializedExpenseIdRef.current = null;
      initializedGroupIdRef.current = null;
      initializedFriendIdRef.current = null;
      draftRestoredKeyRef.current = null;
    },
    [resetState],
  );

  // TODO: Set this globally from env var with app router later
  const { setMaxUploadFileSizeMB } = useAppStore((s) => s.actions);
  setMaxUploadFileSizeMB(maxUploadFileSizeMB);

  const router = useRouter();
  const { friendId, groupId, expenseId } = router.query;

  const parsedGroupId = isStringQueryParam(groupId) ? parseInt(groupId) : Number.NaN;
  const parsedFriendId = isStringQueryParam(friendId) ? parseInt(friendId) : Number.NaN;
  const parsedExpenseId = isStringQueryParam(expenseId) ? expenseId : '';
  const draftScopeKey = router.isReady
    ? getAddExpenseDraftScopeKey({
        groupId: Number.isNaN(parsedGroupId) ? undefined : parsedGroupId,
        friendId: Number.isNaN(parsedFriendId) ? undefined : parsedFriendId,
        expenseId: parsedExpenseId,
      })
    : '';

  useEffect(() => {
    if (!router.isReady) {
      return;
    }

    if (initializedUserIdRef.current !== user.id) {
      initializedUserIdRef.current = user.id;
      setCurrentUser({
        ...user,
        defaultCurrency: user.defaultCurrency ?? null,
        emailVerified: null,
        name: user.name ?? null,
        email: user.email ?? null,
        image: user.image ?? null,
        obapiProviderId: user.obapiProviderId ?? null,
        bankingId: user.bankingId ?? null,
      });
    }

    if (!groupId && !parsedExpenseId) {
      const existingDraft = loadAddExpenseDraft(draftScopeKey);
      if (!existingDraft) {
        const preferredCurrency = user.defaultCurrency ?? user.currency;
        if (preferredCurrency) {
          setCurrency(parseCurrencyCode(preferredCurrency));
        }
      }
    }
  }, [setCurrentUser, setCurrency, groupId, parsedExpenseId, draftScopeKey, router.isReady, user]);
  const groupQuery = api.group.getGroupDetails.useQuery(
    { groupId: parsedGroupId },
    {
      enabled: router.isReady && Boolean(parsedGroupId) && !parsedExpenseId,
      refetchOnReconnect: false,
      refetchOnWindowFocus: false,
    },
  );

  const friendQuery = api.user.getFriend.useQuery(
    { friendId: parsedFriendId },
    {
      enabled: router.isReady && Boolean(parsedFriendId) && !parsedExpenseId,
      refetchOnReconnect: false,
      refetchOnWindowFocus: false,
    },
  );

  const expenseQuery = api.expense.getExpenseDetails.useQuery(
    { expenseId: parsedExpenseId },
    {
      enabled: router.isReady && Boolean(parsedExpenseId),
      refetchOnReconnect: false,
      refetchOnWindowFocus: false,
    },
  );

  useEffect(() => {
    if (!groupId || !parsedGroupId) {
      initializedGroupIdRef.current = null;
      return;
    }

    if (initializedGroupIdRef.current === parsedGroupId) {
      return;
    }

    // Set group
    if (groupId && !groupQuery.isPending && groupQuery.data && currentUser) {
      initializedGroupIdRef.current = parsedGroupId;
      setGroup(groupQuery.data);

      setParticipants([
        currentUser,
        ...groupQuery.data.groupUsers
          .map((gu) => gu.user)
          .filter((groupUser) => groupUser.id !== currentUser.id),
      ]);
      const existingDraft = loadAddExpenseDraft(draftScopeKey);
      if (!existingDraft) {
        const preferredCurrency =
          groupQuery.data.defaultCurrency ?? currentUser.defaultCurrency ?? currentUser.currency;
        if (preferredCurrency) {
          setCurrency(parseCurrencyCode(preferredCurrency));
        }
      }
      const parsedDefaultSplit = deserializeDefaultSplit(groupQuery.data.defaultSplit);
      if (parsedDefaultSplit) {
        applySplitPreset(parsedDefaultSplit.splitType, parsedDefaultSplit.shares);
      }
      useAddExpenseStore.setState({ showFriends: false });
    }
  }, [
    parsedGroupId,
    groupId,
    groupQuery.isPending,
    groupQuery.data,
    currentUser,
    setGroup,
    setParticipants,
    setCurrency,
    applySplitPreset,
    draftScopeKey,
  ]);

  useEffect(() => {
    if (!friendId || !parsedFriendId) {
      initializedFriendIdRef.current = null;
      return;
    }

    if (initializedFriendIdRef.current === parsedFriendId) {
      return;
    }

    if (friendId && currentUser && friendQuery.data) {
      initializedFriendIdRef.current = parsedFriendId;
      setParticipants([currentUser, friendQuery.data]);
      const parsedDefaultSplit = deserializeDefaultSplit(friendQuery.data.defaultSplit);
      if (parsedDefaultSplit) {
        applySplitPreset(parsedDefaultSplit.splitType, parsedDefaultSplit.shares);
      }
      useAddExpenseStore.setState({ showFriends: false });
    }
  }, [parsedFriendId, friendId, friendQuery.data, currentUser, setParticipants, applySplitPreset]);

  useEffect(() => {
    if (!parsedExpenseId || !expenseQuery.data) {
      initializedExpenseIdRef.current = null;
      return;
    }

    if (initializedExpenseIdRef.current === parsedExpenseId) {
      return;
    }

    initializedExpenseIdRef.current = parsedExpenseId;

    if (expenseQuery.data.group) {
      setGroup(expenseQuery.data.group);
    }
    setPaidBy(expenseQuery.data.paidByUser);
    setCurrency(parseCurrencyCode(expenseQuery.data.currency));
    setAmountStr(
      getCurrencyHelpersCached(expenseQuery.data.currency).toUIString(
        expenseQuery.data.amount,
        true,
        true,
      ),
    );
    setDescription(expenseQuery.data.name);
    setCategory(expenseQuery.data.category);
    setAmount(expenseQuery.data.amount);
    if (hasOriginalExpenseDetails(expenseQuery.data)) {
      const origCurrency = parseCurrencyCode(expenseQuery.data.originalCurrency ?? '');
      const origAmount =
        expenseQuery.data.originalAmount !== null
          ? BigMath.abs(expenseQuery.data.originalAmount)
          : undefined;
      setOriginalExpense({
        originalAmount: origAmount,
        originalAmountStr:
          undefined !== origAmount
            ? getCurrencyHelpersCached(origCurrency).toUIString(origAmount, false, true)
            : '',
        originalCurrency: origCurrency,
        conversionRate: expenseQuery.data.conversionRate ?? undefined,
      });
    } else {
      setOriginalExpense();
    }
    setCardId(expenseQuery.data.cardId);
    setParticipants(
      expenseQuery.data.expenseParticipants.map((ep) => ({
        ...ep.user,
        amount: ep.amount,
      })),
      expenseQuery.data.splitType,
    );
    const savedSplitShares = deserializeSplitShares(
      expenseQuery.data.splitShares,
      expenseQuery.data.splitType,
    );
    if (savedSplitShares) {
      applySplitPreset(expenseQuery.data.splitType, savedSplitShares);
    }
    useAddExpenseStore.setState({ showFriends: false });
    setExpenseDate(expenseQuery.data.expenseDate);
    if (expenseQuery.data.recurrence) {
      try {
        const cronExpression = cronFromBackend(expenseQuery.data.recurrence.job.schedule);
        setCronExpression(cronExpression);
      } catch {
        toast.error(t('errors.invalid_cron_expression'));
        console.error(
          `Failed to parse cron expression for expense: ${expenseQuery.data.recurrence.job.schedule}`,
        );
      }
    }
    if (expenseQuery.data.fileKey) {
      setFileKey(expenseQuery.data.fileKey);
    }
  }, [
    parsedExpenseId,
    expenseQuery.data,
    setAmount,
    setAmountStr,
    setCategory,
    setCurrency,
    setDescription,
    setExpenseDate,
    setGroup,
    setPaidBy,
    setParticipants,
    applySplitPreset,
    setOriginalExpense,
    setCardId,
    setCronExpression,
    setFileKey,
    getCurrencyHelpersCached,
    t,
  ]);

  useEffect(() => {
    if (!router.isReady || parsedExpenseId || !draftScopeKey || !currentUser) {
      return;
    }

    if (groupId && (groupQuery.isPending || !groupQuery.data)) {
      return;
    }

    if (friendId && (friendQuery.isPending || !friendQuery.data)) {
      return;
    }

    if (draftRestoredKeyRef.current === draftScopeKey) {
      return;
    }

    draftRestoredKeyRef.current = draftScopeKey;
    const savedDraft = loadAddExpenseDraft(draftScopeKey);
    if (!savedDraft) {
      return;
    }

    setDescription(savedDraft.description);
    setCurrency(savedDraft.currency);
    setAmountStr(savedDraft.amountStr);
    const parsedAmount = BigInt(savedDraft.amount || '0');
    setAmount(savedDraft.isNegative ? -parsedAmount : parsedAmount);
    setCategory(savedDraft.category);
    setCardId(savedDraft.cardId);
    setCronExpression(savedDraft.cronExpression);
    if (savedDraft.expenseDateIso) {
      const parsedDate = new Date(savedDraft.expenseDateIso);
      if (!Number.isNaN(parsedDate.getTime())) {
        setExpenseDate(parsedDate);
      }
    }
    if (savedDraft.originalCurrency) {
      setOriginalExpense({
        originalAmount: savedDraft.originalAmount ? BigInt(savedDraft.originalAmount) : undefined,
        originalAmountStr: savedDraft.originalAmountStr ?? '',
        originalCurrency: savedDraft.originalCurrency,
        conversionRate: savedDraft.conversionRate,
      });
    } else {
      setOriginalExpense();
    }
    if (savedDraft.splitType) {
      setSplitType(savedDraft.splitType);
    }
    if (savedDraft.paidById) {
      const payer = useAddExpenseStore
        .getState()
        .participants.find((p) => p.id === savedDraft.paidById);
      if (payer) {
        setPaidBy(payer);
      }
    }
    useAddExpenseStore.setState({ showFriends: false });
  }, [
    router.isReady,
    parsedExpenseId,
    draftScopeKey,
    currentUser,
    groupId,
    groupQuery.isPending,
    groupQuery.data,
    friendId,
    friendQuery.isPending,
    friendQuery.data,
    setDescription,
    setCurrency,
    setAmountStr,
    setAmount,
    setCategory,
    setCardId,
    setCronExpression,
    setExpenseDate,
    setOriginalExpense,
    setSplitType,
    setPaidBy,
  ]);

  useEffect(() => {
    if (!router.isReady || parsedExpenseId || !draftScopeKey) {
      return;
    }

    return useAddExpenseStore.subscribe((state) => {
      if (draftRestoredKeyRef.current !== draftScopeKey) {
        return;
      }
      saveAddExpenseDraft(draftScopeKey, state);
    });
  }, [router.isReady, parsedExpenseId, draftScopeKey]);

  return (
    <>
      <Head>
        <title>{parsedExpenseId ? t('actions.edit_expense') : t('actions.add_expense')}</title>
      </Head>
      <MainLayout hideAppBar>
        {currentUser && (!parsedExpenseId || expenseQuery.data) && (
          <AddOrEditExpensePage
            enableSendingInvites={enableSendingInvites}
            expenseId={parsedExpenseId}
            bankConnectionEnabled={bankConnectionEnabled}
          />
        )}
      </MainLayout>
    </>
  );
};

AddPage.auth = true;

export default AddPage;

export const getServerSideProps: GetServerSideProps = async (context) => ({
  props: {
    enableSendingInvites: env.ENABLE_SENDING_INVITES,
    bankConnectionEnabled: isBankConnectionConfigured(),
    maxUploadFileSizeMB: env.UPLOAD_MAX_FILE_SIZE_MB,
    ...(await customServerSideTranslations(context.locale, ['common', 'categories', 'currencies'])),
  },
});
