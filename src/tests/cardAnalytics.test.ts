import { type CardAnalyticsExpense, calculateCardAnalytics } from '~/lib/cardAnalytics';

const trust = { id: 1, name: 'Trust Cashback' };
const youTrip = { id: 2, name: 'YouTrip' };

const expense = (overrides: Partial<CardAnalyticsExpense> = {}): CardAnalyticsExpense => ({
  amount: 546n,
  originalAmount: 6400n,
  originalCurrency: 'KRW',
  conversionRate: 0.000853125,
  currency: 'SGD',
  card: trust,
  ...overrides,
});

describe('calculateCardAnalytics', () => {
  it('calculates spending, currency totals, usage counts, and average effective rates', () => {
    const analytics = calculateCardAnalytics([
      expense(),
      expense({ amount: 1000n, originalAmount: 11720n, conversionRate: 0.0008532423 }),
      expense({
        amount: 8400n,
        originalAmount: 42000n,
        originalCurrency: 'USD',
        conversionRate: 0.2,
        card: youTrip,
      }),
    ]);

    expect(analytics.spendingByCard).toEqual([
      { cardId: 2, cardName: 'YouTrip', currency: 'SGD', amount: 8400n },
      { cardId: 1, cardName: 'Trust Cashback', currency: 'SGD', amount: 1546n },
    ]);
    expect(analytics.foreignSpendingByCurrency).toEqual([
      { currency: 'USD', amount: 42000n },
      { currency: 'KRW', amount: 18120n },
    ]);
    expect(analytics.cardUsageCounts).toEqual([
      { cardId: 1, cardName: 'Trust Cashback', count: 2 },
      { cardId: 2, cardName: 'YouTrip', count: 1 },
    ]);

    const krwRate = analytics.averageRatesByCurrency.find((entry) => entry.currency === 'KRW')
      ?.cards[0];
    const usdRate = analytics.averageRatesByCurrency.find((entry) => entry.currency === 'USD')
      ?.cards[0];

    expect(krwRate).toMatchObject({
      cardId: 1,
      cardName: 'Trust Cashback',
      count: 2,
    });
    expect(krwRate?.averageRate).toBeCloseTo(1172.080586);
    expect(usdRate).toMatchObject({
      cardId: 2,
      cardName: 'YouTrip',
      count: 1,
    });
    expect(usdRate?.averageRate).toBeCloseTo(5);
  });

  it('only generates rate insights when a card has enough samples', () => {
    const analytics = calculateCardAnalytics([
      expense(),
      expense({ amount: 1000n, originalAmount: 11720n, conversionRate: 0.0008532423 }),
      expense({ amount: 500n, originalAmount: 5900n, conversionRate: 0.0008474576 }),
      expense({ card: youTrip, conversionRate: 0.01 }),
    ]);

    expect(analytics.insights.mostUsedCard).toBe('Trust Cashback');
    expect(analytics.insights.bestAverageRates).toEqual([
      {
        cardId: 1,
        cardName: 'Trust Cashback',
        count: 3,
        currency: 'KRW',
        averageRate: expect.any(Number),
      },
    ]);
    expect(analytics.insights.bestAverageRates[0]?.averageRate).toBeCloseTo(1174.72039);
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
      { cardId: 1, cardName: 'Trust Cashback', currency: 'SGD', amount: 1092n },
    ]);
    expect(analytics.foreignSpendingByCurrency).toEqual([]);
    expect(analytics.averageRatesByCurrency).toEqual([]);
  });

  it('includes dayKey, paidAmount, and settlementAmount in rateHistory for same-day and multi-day transactions', () => {
    const analytics = calculateCardAnalytics([
      expense({
        id: 'txn-2',
        name: 'Night Market',
        amount: 2110n,
        originalAmount: 50000n,
        originalCurrency: 'TWD',
        conversionRate: 0.0422,
        expenseDate: new Date('2026-10-22T00:00:00.000Z'),
      }),
      expense({
        id: 'txn-1',
        name: 'Beef Noodles',
        amount: 1475n,
        originalAmount: 35000n,
        originalCurrency: 'TWD',
        conversionRate: 0.04214285,
        expenseDate: new Date('2026-10-22T00:00:00.000Z'),
      }),
    ]);

    expect(analytics.rateHistory).toHaveLength(2);
    expect(analytics.rateHistory[0]).toMatchObject({
      id: 'txn-1',
      name: 'Beef Noodles',
      currency: 'TWD',
      settlementCurrency: 'SGD',
      dayKey: '2026-10-22',
      paidAmount: 35000n,
      settlementAmount: 1475n,
    });
    expect(analytics.rateHistory[1]).toMatchObject({
      id: 'txn-2',
      name: 'Night Market',
      currency: 'TWD',
      settlementCurrency: 'SGD',
      dayKey: '2026-10-22',
      paidAmount: 50000n,
      settlementAmount: 2110n,
    });
  });
});
