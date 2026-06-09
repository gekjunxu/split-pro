import { SplitType, type User } from '@prisma/client';

import {
  calculateExchangeRateFromSettlement,
  calculatePaidPerSettlementRate,
  calculateSettlementAmount,
  validateAndNormalizeOriginalExpenseFields,
} from '~/lib/originalExpense';
import { type AddExpenseState, calculateParticipantSplit, initSplitShares } from '~/store/addStore';
import { currencyConversion } from '~/utils/numbers';

const createMockUser = (id: number, name: string): User => ({
  id,
  name,
  email: `${name.toLowerCase()}@example.com`,
  currency: 'SGD',
  defaultCurrency: null,
  emailVerified: null,
  image: null,
  preferredLanguage: 'en',
  obapiProviderId: null,
  bankingId: null,
  hiddenFriendIds: [],
});

const alice = createMockUser(1, 'Alice');
const bob = createMockUser(2, 'Bob');

const createEqualSplitState = (amount: bigint): AddExpenseState =>
  ({
    amount,
    participants: [
      { ...alice, amount: 0n },
      { ...bob, amount: 0n },
    ],
    splitType: SplitType.EQUAL,
    splitShares: {
      [alice.id]: { ...initSplitShares(), [SplitType.EQUAL]: 1n },
      [bob.id]: { ...initSplitShares(), [SplitType.EQUAL]: 1n },
    },
    paidBy: alice,
    expenseDate: new Date('2026-05-21'),
  }) as AddExpenseState;

describe('validateAndNormalizeOriginalExpenseFields', () => {
  it('calculates settlement amount from paid currency to settlement currency', () => {
    const settlementAmount = calculateSettlementAmount({
      paidAmount: 1250n,
      paidCurrency: 'JPY',
      settlementCurrency: 'SGD',
      exchangeRate: 0.0091,
    });

    expect(settlementAmount).toBe(1138n);
  });

  it('uses the rate as settlement currency per one paid currency unit', () => {
    const settlementAmount = calculateSettlementAmount({
      paidAmount: 42000n,
      paidCurrency: 'USD',
      settlementCurrency: 'SGD',
      exchangeRate: 1.35,
    });

    expect(settlementAmount).toBe(56700n);
  });

  it('derives the stored exchange rate from the card charged amount', () => {
    const exchangeRate = calculateExchangeRateFromSettlement({
      paidAmount: 6400n,
      paidCurrency: 'KRW',
      settlementAmount: 546n,
      settlementCurrency: 'SGD',
    });

    expect(exchangeRate).toBeCloseTo(0.000853125);
    expect(
      calculateSettlementAmount({
        paidAmount: 6400n,
        paidCurrency: 'KRW',
        settlementCurrency: 'SGD',
        exchangeRate,
      }),
    ).toBe(546n);
  });

  it('derives the traveler-facing card rate from the card charged amount', () => {
    const cardRate = calculatePaidPerSettlementRate({
      paidAmount: 6400n,
      paidCurrency: 'KRW',
      settlementAmount: 546n,
      settlementCurrency: 'SGD',
    });

    expect(cardRate).toBeCloseTo(1172.161172);
  });

  it('keeps same-currency expenses unchanged by clearing original fields', () => {
    const normalized = validateAndNormalizeOriginalExpenseFields({
      amount: 1138n,
      currency: 'SGD',
      originalAmount: 1138n,
      originalCurrency: 'SGD',
      conversionRate: 1,
    });

    expect(normalized).toEqual({
      amount: 1138n,
      currency: 'SGD',
      originalAmount: null,
      originalCurrency: null,
      conversionRate: null,
    });
  });

  it('preserves a foreign-currency expense with a reproducible settlement amount', () => {
    const normalized = validateAndNormalizeOriginalExpenseFields({
      amount: 1138n,
      currency: 'SGD',
      originalAmount: 1250n,
      originalCurrency: 'JPY',
      conversionRate: 0.0091,
      cardId: 1,
    });

    expect(normalized.originalAmount).toBe(1250n);
    expect(normalized.originalCurrency).toBe('JPY');
    expect(normalized.conversionRate).toBe(0.0091);
    expect(normalized.cardId).toBe(1);
  });

  it('splits a foreign-currency settlement amount evenly for balances', () => {
    const normalized = validateAndNormalizeOriginalExpenseFields({
      amount: 1138n,
      currency: 'SGD',
      originalAmount: 1250n,
      originalCurrency: 'JPY',
      conversionRate: 0.0091,
    });

    const result = calculateParticipantSplit(createEqualSplitState(normalized.amount));

    expect(result.participants[0]?.amount).toBe(569n);
    expect(result.participants[1]?.amount).toBe(-569n);
  });

  it('does not change balance splits when a card is attached', () => {
    const normalized = validateAndNormalizeOriginalExpenseFields({
      amount: 1138n,
      currency: 'SGD',
      originalAmount: 1250n,
      originalCurrency: 'JPY',
      conversionRate: 0.0091,
      cardId: 1,
    });

    const result = calculateParticipantSplit(createEqualSplitState(normalized.amount));

    expect(result.participants[0]?.amount).toBe(569n);
    expect(result.participants[1]?.amount).toBe(-569n);
  });

  it('supports mixed same-currency and foreign expenses without changing canonical totals', () => {
    const sameCurrencyExpense = validateAndNormalizeOriginalExpenseFields({
      amount: 1000n,
      currency: 'SGD',
      originalAmount: null,
      originalCurrency: null,
      conversionRate: null,
    });
    const foreignExpense = validateAndNormalizeOriginalExpenseFields({
      amount: 1138n,
      currency: 'SGD',
      originalAmount: 1250n,
      originalCurrency: 'JPY',
      conversionRate: 0.0091,
    });

    expect(sameCurrencyExpense.originalCurrency).toBeNull();
    expect(foreignExpense.originalCurrency).toBe('JPY');
    expect(sameCurrencyExpense.amount + foreignExpense.amount).toBe(2138n);
  });

  it('supports negative foreign-currency refunds when the converted settlement amount matches', () => {
    const normalized = validateAndNormalizeOriginalExpenseFields({
      amount: -1138n,
      currency: 'SGD',
      originalAmount: -1250n,
      originalCurrency: 'JPY',
      conversionRate: 0.0091,
    });

    expect(normalized.originalAmount).toBe(-1250n);
    expect(normalized.amount).toBe(-1138n);
  });

  it('supports editing foreign-currency fields when the new rate still reproduces settlement', () => {
    const editedAmount = currencyConversion({
      amount: 1500n,
      rate: 0.0092,
      from: 'JPY',
      to: 'SGD',
    });

    const normalized = validateAndNormalizeOriginalExpenseFields({
      amount: editedAmount,
      currency: 'SGD',
      originalAmount: 1500n,
      originalCurrency: 'JPY',
      conversionRate: 0.0092,
    });

    expect(normalized.amount).toBe(1380n);
    expect(normalized.conversionRate).toBe(0.0092);
  });
});
