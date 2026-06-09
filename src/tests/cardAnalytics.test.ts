import { calculateCardAnalytics, type CardAnalyticsExpense } from '~/lib/cardAnalytics';

const trust = { id: 1, name: 'Trust Cashback' };
const youTrip = { id: 2, name: 'YouTrip' };

const expense = (
  overrides: Partial<CardAnalyticsExpense> = {},
): CardAnalyticsExpense => ({
  amount: 10000n,
  originalAmount: 1000000n,
  originalCurrency: 'JPY',
  conversionRate: 0.01,
  currency: 'SGD',
  card: trust,
  ...overrides,
});

describe('calculateCardAnalytics', () => {
  it('calculates spending, currency totals, usage counts, and average effective rates', () => {
    const analytics = calculateCardAnalytics([
      expense({ amount: 11375n, conversionRate: 0.0091 }),
      expense({ amount: 22500n, originalAmount: 2500000n, conversionRate: 0.009 }),
      expense({
        amount: 8400n,
        originalAmount: 42000n,
        originalCurrency: 'USD',
        conversionRate: 0.2,
        card: youTrip,
      }),
    ]);

    expect(analytics.spendingByCard).toEqual([
      { cardId: 1, cardName: 'Trust Cashback', currency: 'SGD', amount: 33875n },
      { cardId: 2, cardName: 'YouTrip', currency: 'SGD', amount: 8400n },
    ]);
    expect(analytics.foreignSpendingByCurrency).toEqual([
      { currency: 'JPY', amount: 3500000n },
      { currency: 'USD', amount: 42000n },
    ]);
    expect(analytics.cardUsageCounts).toEqual([
      { cardId: 1, cardName: 'Trust Cashback', count: 2 },
      { cardId: 2, cardName: 'YouTrip', count: 1 },
    ]);
    expect(analytics.averageRatesByCurrency).toEqual([
      {
        currency: 'JPY',
        cards: [{ cardId: 1, cardName: 'Trust Cashback', averageRate: 0.00905, count: 2 }],
      },
      {
        currency: 'USD',
        cards: [{ cardId: 2, cardName: 'YouTrip', averageRate: 0.2, count: 1 }],
      },
    ]);
  });

  it('only generates rate insights when a card has enough samples', () => {
    const analytics = calculateCardAnalytics([
      expense({ conversionRate: 0.0091 }),
      expense({ conversionRate: 0.0092 }),
      expense({ conversionRate: 0.0093 }),
      expense({ card: youTrip, conversionRate: 0.01 }),
    ]);

    expect(analytics.insights.mostUsedCard).toBe('Trust Cashback');
    expect(analytics.insights.bestAverageRates).toEqual([
      {
        cardId: 1,
        cardName: 'Trust Cashback',
        count: 3,
        currency: 'JPY',
        averageRate: 0.0092,
      },
    ]);
  });

  it('ignores same-currency expenses for foreign currency analysis', () => {
    const analytics = calculateCardAnalytics([
      expense({
        originalAmount: null,
        originalCurrency: null,
        conversionRate: null,
      }),
      expense({
        originalAmount: 10000n,
        originalCurrency: 'SGD',
        conversionRate: 1,
      }),
    ]);

    expect(analytics.spendingByCard).toEqual([
      { cardId: 1, cardName: 'Trust Cashback', currency: 'SGD', amount: 20000n },
    ]);
    expect(analytics.foreignSpendingByCurrency).toEqual([]);
    expect(analytics.averageRatesByCurrency).toEqual([]);
  });
});
