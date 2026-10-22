import { type Group, SplitType, type User } from '@prisma/client';
import Router from 'next/router';
import { create } from 'zustand';

import { DEFAULT_CATEGORY } from '~/lib/category';
import { type CurrencyCode, isCurrencyCode } from '~/lib/currency';
import { recoverPercentageWeights, recoverShareWeights } from '~/lib/shareSplit';
import type { TransactionAddInputModel } from '~/types';
import { shuffleArray } from '~/utils/array';
import { BigMath } from '~/utils/numbers';
import { cyrb128, splitmix32 } from '~/utils/random';

export type Participant = User & { amount?: bigint };
export type SplitShares = Record<number, Record<SplitType, bigint | undefined>>;

export interface AddExpenseState {
  amount: bigint;
  amountStr: string;
  isNegative: boolean;
  currentUser?: User;
  splitType: SplitType;
  group?: Group;
  participants: Participant[];
  splitShares: SplitShares;
  description: string;
  currency: CurrencyCode;
  originalAmount?: bigint;
  originalAmountStr: string;
  originalCurrency?: CurrencyCode;
  conversionRate?: number;
  cardId?: number | null;
  category: string;
  nameOrEmail: string;
  paidBy?: User;
  showFriends: boolean;
  isFileUploading: boolean;
  fileKey?: string;
  canSplitScreenClosed: boolean;
  splitScreenOpen: boolean;
  expenseDate: Date;
  cronExpression: string;
  transactionId?: string;
  multipleTransactions: TransactionAddInputModel[];
  isTransactionLoading: boolean;
  actions: {
    setAmount: (amount: bigint) => void;
    setAmountStr: (amountStr: string) => void;
    setSplitType: (splitType: SplitType) => void;
    setGroup: (group: Group | undefined) => void;
    addOrUpdateParticipant: (user: Participant) => void;
    setSplitShare: (splitType: SplitType, userId: number, share: bigint) => void;
    applySplitPreset: (splitType: SplitType, shares: Record<number, bigint>) => void;
    setParticipants: (participants: Participant[], splitType?: SplitType) => void;
    removeParticipant: (userId: number) => void;
    removeLastParticipant: () => void;
    setCurrency: (currency: CurrencyCode) => void;
    setOriginalExpense: (data?: {
      originalAmount?: bigint;
      originalAmountStr?: string;
      originalCurrency?: CurrencyCode;
      conversionRate?: number;
    }) => void;
    setOriginalAmountStr: (originalAmountStr: string) => void;
    setCardId: (cardId?: number | null) => void;
    clearOriginalExpense: () => void;
    setCategory: (category: string) => void;
    setNameOrEmail: (nameOrEmail: string) => void;
    setPaidBy: (user: User) => void;
    setCurrentUser: (user: User) => void;
    setDescription: (description: string) => void;
    setFileUploading: (isFileUploading: boolean) => void;
    setFileKey: (fileKey: string) => void;
    resetState: () => void;
    setSplitScreenOpen: (splitScreenOpen: boolean) => void;
    setExpenseDate: (expenseDate: Date | undefined) => void;
    setTransactionId: (transactionId?: string) => void;
    setMultipleTransactions: (multipleTransactions: TransactionAddInputModel[]) => void;
    setSingleTransaction: (singleTransaction: TransactionAddInputModel) => void;
    setIsTransactionLoading: (isTransactionLoading: boolean) => void;
    setCronExpression: (cronExpression: string) => void;
  };
}

export const useAddExpenseStore = create<AddExpenseState>()((set) => ({
  amount: 0n,
  amountStr: '',
  isNegative: false,
  splitType: SplitType.EQUAL,
  participants: [],
  splitShares: {
    [SplitType.EQUAL]: {},
    [SplitType.PERCENTAGE]: {},
    [SplitType.SHARE]: {},
    [SplitType.EXACT]: {},
    [SplitType.ADJUSTMENT]: {},
    [SplitType.SETTLEMENT]: {},
  },
  currency: 'USD',
  originalAmountStr: '',
  category: DEFAULT_CATEGORY,
  nameOrEmail: '',
  description: '',
  showFriends: true,
  isFileUploading: false,
  canSplitScreenClosed: true,
  splitScreenOpen: false,
  expenseDate: new Date(),
  repeatEvery: 1,
  multipleTransactions: [],
  isTransactionLoading: false,
  cronExpression: '',
  actions: {
    setAmount: (realAmount) =>
      set((s) => {
        const isNegative = realAmount < 0n;
        const amount = BigMath.abs(realAmount);
        return calculateParticipantSplit({ ...s, isNegative, amount });
      }),
    setAmountStr: (amountStr) => set({ amountStr }),
    setSplitType: (splitType) => set((state) => calculateParticipantSplit({ ...state, splitType })),
    setSplitShare: (splitType, userId, share) =>
      set((state) => {
        const splitShares: SplitShares = {
          ...state.splitShares,
          [userId]: {
            ...(state.splitShares[userId] ?? initSplitShares()),
            [splitType]: share,
          },
        };

        return calculateParticipantSplit({ ...state, splitShares });
      }),
    applySplitPreset: (splitType, shares) =>
      set((state) => {
        const splitShares = state.participants.reduce<SplitShares>((acc, participant) => {
          const existingShares = state.splitShares[participant.id] ?? initSplitShares();
          const defaultShare = splitType === SplitType.EQUAL ? 1n : 0n;
          acc[participant.id] = {
            ...existingShares,
            [splitType]: shares[participant.id] ?? defaultShare,
          };
          return acc;
        }, {});

        return calculateParticipantSplit({ ...state, splitType, splitShares });
      }),
    setGroup: (group) => {
      set({ group });
    },
    addOrUpdateParticipant: (user) =>
      set((state) => {
        const participants = [...state.participants];
        const splitShares = { ...state.splitShares };
        const userIndex = participants.findIndex((p) => p.id === user.id);
        if (-1 !== userIndex) {
          participants[userIndex] = user;
        } else {
          participants.push({ ...user });
          splitShares[user.id] = initSplitShares();
        }
        return calculateParticipantSplit({ ...state, participants, splitShares });
      }),
    setParticipants: (participants, splitType) =>
      set((state) => {
        const splitShares = participants.reduce<SplitShares>((res, p) => {
          res[p.id] = initSplitShares();
          return res;
        }, {});
        if (splitType) {
          calculateSplitShareBasedOnAmount(
            state.amount,
            participants,
            splitType,
            splitShares,
            state.paidBy,
          );
        } else {
          splitType = SplitType.EQUAL;
        }
        return calculateParticipantSplit({ ...state, participants, splitType, splitShares });
      }),
    removeLastParticipant: () => {
      set((state) => {
        const currentPath = window.location.pathname;
        const searchParams = new URLSearchParams(window.location.search);
        searchParams.delete('friendId');

        Router.push(`${currentPath}?${searchParams.toString()}`).catch(console.error);

        if (1 >= state.participants.length) {
          return {};
        }
        const newParticipants = [...state.participants];
        const { id } = newParticipants.pop()!;
        const { [id]: _, ...rest } = state.splitShares;
        return calculateParticipantSplit({
          ...state,
          participants: newParticipants,
          splitShares: rest,
        });
      });
    },
    removeParticipant: (userId) => {
      set((state) => {
        const currentPath = window.location.pathname;
        const searchParams = new URLSearchParams(window.location.search);
        searchParams.delete('friendId');

        Router.push(`${currentPath}?${searchParams.toString()}`).catch(console.error);

        const newParticipants = state.participants.filter((p) => p.id !== userId);
        const { [userId]: _, ...rest } = state.splitShares;
        return calculateParticipantSplit({
          ...state,
          participants: newParticipants,
          splitShares: rest,
        });
      });
    },
    setCurrency: (currency) => set({ currency }),
    setOriginalExpense: (data) =>
      set((s) => ({
        originalAmount: data?.originalAmount,
        originalAmountStr:
          undefined !== data?.originalAmountStr ? data.originalAmountStr : s.originalAmountStr,
        originalCurrency: data?.originalCurrency,
        conversionRate: data?.conversionRate,
      })),
    setOriginalAmountStr: (originalAmountStr) => set({ originalAmountStr }),
    clearOriginalExpense: () =>
      set({
        originalAmount: undefined,
        originalAmountStr: '',
        originalCurrency: undefined,
        conversionRate: undefined,
      }),
    setCardId: (cardId) => set({ cardId }),
    setCategory: (category) => set({ category }),
    setNameOrEmail: (nameOrEmail) => set({ nameOrEmail, showFriends: 0 < nameOrEmail.length }),
    setPaidBy: (paidBy) => set((state) => calculateParticipantSplit({ ...state, paidBy })),
    setCurrentUser: (currentUser) =>
      set((s) => {
        const cUser = s.participants.find((p) => p.id === currentUser.id);
        const splitShares = { ...s.splitShares };
        const participants = [...s.participants];

        if (!cUser) {
          participants.push(currentUser);
        }
        if (!splitShares[currentUser.id]) {
          splitShares[currentUser.id] = initSplitShares();
        }
        return { currentUser, splitShares, paidBy: currentUser, participants };
      }),
    setDescription: (description) => set({ description }),
    setFileUploading: (isFileUploading) => set({ isFileUploading }),
    setFileKey: (fileKey) => set({ fileKey }),
    resetState: () => {
      set((s) => ({
        amount: 0n,
        participants: s.currentUser ? [s.currentUser] : [],
        description: '',
        fileKey: '',
        category: DEFAULT_CATEGORY,
        originalAmount: undefined,
        originalAmountStr: '',
        originalCurrency: undefined,
        conversionRate: undefined,
        cardId: undefined,
        splitType: SplitType.EQUAL,
        group: undefined,
        amountStr: '',
        splitShares: s.currentUser ? { [s.currentUser.id]: initSplitShares() } : {},
        isNegative: false,
        canSplitScreenClosed: true,
        splitScreenOpen: false,
        expenseDate: new Date(),
        transactionId: undefined,
        multipleTransactions: [],
        isTransactionLoading: false,
        cronExpression: '',
        isFileUploading: false,
        paidBy: s.currentUser,
      }));
    },
    setSplitScreenOpen: (splitScreenOpen) => set({ splitScreenOpen }),
    setExpenseDate: (expenseDate) => set({ expenseDate }),
    setTransactionId: (transactionId) => set({ transactionId }),
    setMultipleTransactions: (multipleTransactions) => set({ multipleTransactions }),
    setSingleTransaction: (singleTransaction: TransactionAddInputModel) =>
      set((s) => {
        const isNegative = singleTransaction.amount < 0n;
        const amount = BigMath.abs(singleTransaction.amount);
        return {
          ...calculateParticipantSplit({ ...s, amount, isNegative }),
          expenseDate: singleTransaction.date,
          description: singleTransaction.description,
          currency: singleTransaction.currency,
          originalAmount: undefined,
          originalAmountStr: '',
          originalCurrency: undefined,
          conversionRate: undefined,
          cardId: undefined,
          amountStr: singleTransaction.amountStr,
          transactionId: singleTransaction.transactionId,
        };
      }),
    setIsTransactionLoading: (isTransactionLoading) => set({ isTransactionLoading }),
    setCronExpression: (cronExpression) => set({ cronExpression }),
  },
}));

export function calculateParticipantSplit(
  state: Pick<
    AddExpenseState,
    | 'amount'
    | 'participants'
    | 'splitType'
    | 'splitShares'
    | 'paidBy'
    | 'expenseDate'
    | 'isNegative'
  >,
) {
  const { amount, participants, splitType, splitShares, paidBy, expenseDate } = state;
  let canSplitScreenClosed = true;
  if (0n === amount) {
    return { ...state, canSplitScreenClosed };
  }

  let updatedParticipants = participants;

  const getSplitShare = (p: Participant) => splitShares[p.id]?.[splitType];

  switch (splitType) {
    case SplitType.EQUAL:
      const totalParticipants = participants.filter((p) => 0n !== getSplitShare(p)).length;
      updatedParticipants = participants.map((p) => ({
        ...p,
        amount: 0n === getSplitShare(p) ? 0n : amount / BigInt(totalParticipants),
      }));
      canSplitScreenClosed = 0 < totalParticipants;
      break;
    case SplitType.PERCENTAGE:
      updatedParticipants = participants.map((p) => ({
        ...p,
        amount: ((getSplitShare(p) ?? 0n) * amount) / 10000n,
      }));
      canSplitScreenClosed =
        10000n === participants.reduce((acc, p) => acc + (getSplitShare(p) ?? 0n), 0n);
      break;
    case SplitType.SHARE:
      const totalShare = participants.reduce((acc, p) => acc + Number(getSplitShare(p) ?? 0n), 0);
      canSplitScreenClosed = 0 < totalShare;
      updatedParticipants = participants.map((p) => ({
        ...p,
        amount:
          0n === (getSplitShare(p) ?? 0n)
            ? 0n
            : ((getSplitShare(p) ?? 0n) * amount) / BigInt(Math.round(totalShare)),
      }));
      break;
    case SplitType.EXACT:
      const totalSplitShare = participants.reduce((acc, p) => acc + (getSplitShare(p) ?? 0n), 0n);

      canSplitScreenClosed = amount === totalSplitShare;

      updatedParticipants = participants.map((p) => ({ ...p, amount: getSplitShare(p) }));

      break;
    case SplitType.ADJUSTMENT:
      const totalAdjustment = participants.reduce((acc, p) => acc + (getSplitShare(p) ?? 0n), 0n);
      if (totalAdjustment > amount) {
        canSplitScreenClosed = false;
      }
      const remainingAmountShare = (amount - totalAdjustment) / BigInt(participants.length);
      updatedParticipants = participants.map((p) => ({
        ...p,
        amount: remainingAmountShare + (getSplitShare(p) ?? 0n),
      }));
      break;
  }

  if (paidBy) {
    updatedParticipants = updatedParticipants.map((p) => {
      if (p.id === paidBy.id) {
        return { ...p, amount: -(p.amount ?? 0n) + amount };
      }
      return { ...p, amount: -(p.amount ?? 0n) };
    });

    if (canSplitScreenClosed) {
      let penniesLeft = updatedParticipants.reduce((acc, p) => acc + (p.amount ?? 0n), 0n);
      const participantsToPick =
        splitType === SplitType.EQUAL
          ? updatedParticipants.filter((p) => p.id !== paidBy?.id && 0n !== getSplitShare(p))
          : updatedParticipants.filter((p) => p.amount);
      const seed =
        cyrb128(
          `${participantsToPick
            .map((p) => p.amount)
            .toSorted((a, b) => Number((a ?? 0n) - (b ?? 0n)))
            .join('-')}-${new Intl.DateTimeFormat('en').format(expenseDate)}`,
        )[0] ?? 0;
      const random = splitmix32(seed);

      if (0 < participantsToPick.length) {
        shuffleArray(participantsToPick, random);
        let i = 0;
        while (0n !== penniesLeft) {
          const p = participantsToPick[i % participantsToPick.length]!;
          p.amount! -= BigMath.sign(penniesLeft);
          penniesLeft -= BigMath.sign(penniesLeft);
          i++;
        }
      }
    }

    if (
      canSplitScreenClosed &&
      1 < participants.length &&
      updatedParticipants.every((p) => 0n === (p.amount ?? 0n))
    ) {
      canSplitScreenClosed = false;
    }
  }

  return { ...state, participants: updatedParticipants, canSplitScreenClosed };
}

export const initSplitShares = (): Record<SplitType, undefined> =>
  // @ts-expect-error TS enums/string coersion *eyeroll*
  Object.fromEntries(Object.values(SplitType).map((type) => [type, undefined]));

export function calculateSplitShareBasedOnAmount(
  amount: bigint,
  participants: Participant[],
  splitType: SplitType,
  splitShares: SplitShares,
  paidBy?: User,
) {
  switch (splitType) {
    case SplitType.EQUAL:
      participants.forEach((p) => {
        splitShares[p.id]![splitType] =
          (p.id === paidBy?.id ? amount : 0n) === p.amount && participants.length > 1 ? 0n : 1n;
      });

      break;

    case SplitType.PERCENTAGE:
    case SplitType.SHARE:
      const costs = participants.map((p) =>
        p.id === paidBy?.id ? BigMath.abs(amount - (p.amount ?? 0n)) : BigMath.abs(p.amount ?? 0n),
      );
      const shares =
        0n === amount
          ? costs.map(() => 0n)
          : SplitType.PERCENTAGE === splitType
            ? recoverPercentageWeights(costs)
            : recoverShareWeights(costs);

      participants.forEach((p, index) => {
        splitShares[p.id]![splitType] = shares[index];
      });

      break;

    case SplitType.EXACT:
      participants.forEach((p) => {
        splitShares[p.id]![splitType] =
          paidBy?.id !== p.id
            ? BigMath.abs(p.amount ?? 0n)
            : BigMath.abs(amount - (p.amount ?? 0n));
      });

      break;

    case SplitType.ADJUSTMENT:
      const minAmount = BigMath.min(
        ...participants
          .filter(({ amount: participantAmount }) => 0n !== participantAmount)
          .map((p) =>
            p.id === paidBy?.id
              ? BigMath.abs(amount - (p.amount ?? 0n))
              : BigMath.abs(p.amount ?? 0n),
          ),
      );

      participants.forEach((p) => {
        splitShares[p.id]![splitType] =
          paidBy?.id !== p.id
            ? BigMath.abs(p.amount ?? 0n) - minAmount
            : amount - BigMath.abs(p.amount ?? 0n) - minAmount;
      });

      break;
  }
}

const ADD_EXPENSE_DRAFT_KEY_PREFIX = 'splitpro:add-expense-draft:';

export interface AddExpenseDraft {
  scopeKey: string;
  description: string;
  currency: CurrencyCode;
  amount: string;
  amountStr: string;
  isNegative: boolean;
  originalAmount?: string;
  originalAmountStr: string;
  originalCurrency?: CurrencyCode;
  conversionRate?: number;
  cardId?: number | null;
  category: string;
  splitType: SplitType;
  expenseDateIso: string;
  cronExpression: string;
  paidById?: number;
  groupId?: number;
  participantIds?: number[];
}

export const getAddExpenseDraftScopeKey = (params: {
  groupId?: number | string;
  friendId?: number | string;
  expenseId?: string;
}) => {
  if (params.expenseId) {
    return '';
  }
  const gid = params.groupId ? String(params.groupId) : '';
  const fid = params.friendId ? String(params.friendId) : '';
  return `${ADD_EXPENSE_DRAFT_KEY_PREFIX}g=${gid}&f=${fid}`;
};

export const saveAddExpenseDraft = (scopeKey: string, state: AddExpenseState) => {
  if ('undefined' === typeof window || !scopeKey) {
    return;
  }

  try {
    const hasContent =
      0n !== state.amount ||
      '' !== state.amountStr ||
      '' !== state.description ||
      undefined !== state.originalCurrency ||
      0n !== (state.originalAmount ?? 0n) ||
      '' !== state.originalAmountStr ||
      undefined !== state.cardId ||
      DEFAULT_CATEGORY !== state.category;

    if (!hasContent) {
      window.sessionStorage.removeItem(scopeKey);
      return;
    }

    const draft: AddExpenseDraft = {
      scopeKey,
      description: state.description,
      currency: state.currency,
      amount: state.amount.toString(),
      amountStr: state.amountStr,
      isNegative: state.isNegative,
      originalAmount: state.originalAmount?.toString(),
      originalAmountStr: state.originalAmountStr,
      originalCurrency: state.originalCurrency,
      conversionRate: state.conversionRate,
      cardId: state.cardId,
      category: state.category,
      splitType: state.splitType,
      expenseDateIso: state.expenseDate.toISOString(),
      cronExpression: state.cronExpression,
      paidById: state.paidBy?.id,
      groupId: state.group?.id,
      participantIds: state.participants.map((p) => p.id),
    };

    window.sessionStorage.setItem(scopeKey, JSON.stringify(draft));
  } catch {
    // Ignore storage quota or private mode errors
  }
};

export const loadAddExpenseDraft = (scopeKey: string): AddExpenseDraft | null => {
  if ('undefined' === typeof window || !scopeKey) {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(scopeKey);
    if (!raw) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || 'object' !== typeof parsed) {
      return null;
    }
    const record: Record<string, unknown> = Object.fromEntries(Object.entries(parsed));
    if (record.scopeKey !== scopeKey || !isCurrencyCode(record.currency)) {
      return null;
    }
    const originalCurrency =
      'string' === typeof record.originalCurrency && '' !== record.originalCurrency
        ? record.originalCurrency
        : undefined;
    if (originalCurrency && !isCurrencyCode(originalCurrency)) {
      return null;
    }

    return {
      scopeKey,
      amount: 'string' === typeof record.amount ? record.amount : '0',
      amountStr: 'string' === typeof record.amountStr ? record.amountStr : '',
      isNegative: Boolean(record.isNegative),
      currency: record.currency,
      category: 'string' === typeof record.category ? record.category : DEFAULT_CATEGORY,
      description: 'string' === typeof record.description ? record.description : '',
      originalAmount: 'string' === typeof record.originalAmount ? record.originalAmount : undefined,
      originalAmountStr:
        'string' === typeof record.originalAmountStr ? record.originalAmountStr : undefined,
      originalCurrency,
      conversionRate: 'number' === typeof record.conversionRate ? record.conversionRate : undefined,
      cardId:
        'number' === typeof record.cardId || null === record.cardId ? record.cardId : undefined,
      expenseDate:
        'string' === typeof record.expenseDate ? record.expenseDate : new Date().toISOString(),
    };
  } catch {
    return null;
  }
};

export const clearAddExpenseDraft = (scopeKey?: string) => {
  if ('undefined' === typeof window) {
    return;
  }

  try {
    if (scopeKey) {
      window.sessionStorage.removeItem(scopeKey);
      return;
    }
    const keysToRemove: string[] = [];
    for (let i = 0; i < window.sessionStorage.length; i += 1) {
      const k = window.sessionStorage.key(i);
      if (k?.startsWith(ADD_EXPENSE_DRAFT_KEY_PREFIX)) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach((k) => window.sessionStorage.removeItem(k));
  } catch {
    // Ignore storage errors
  }
};
