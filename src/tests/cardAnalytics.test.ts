import { calculateCardAnalytics, type CardAnalyticsExpense } from '~/lib/cardAnalytics';

const trust = { id: 1, name: 'Trust Cashback' };
const youTrip = { id: 2, name: 'YouTrip' };

const expense = (
  overrides: Partial<CardAnalyticsExpense> = {},
): CardAnalyticsExpense => ({
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
});
