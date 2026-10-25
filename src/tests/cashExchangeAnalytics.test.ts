import {
  type CashExchangeAnalyticsInput,
  calculateCashExchangeAnalytics,
} from '~/lib/cashExchangeAnalytics';

const exchange = (
  overrides: Partial<CashExchangeAnalyticsInput> = {},
): CashExchangeAnalyticsInput => ({
  id: 'exchange-1',
  name: 'Money changer',
  exchangeDate: new Date('2026-10-20T00:00:00.000Z'),
  cashAmount: 11000n,
  cashCurrency: 'JPY',
  settlementAmount: 1000n,
  settlementCurrency: 'SGD',
  card: { id: 1, name: 'Japan cash' },
  ...overrides,
});

describe('calculateCashExchangeAnalytics', () => {
  it('calculates exchange history and weighted rates per cash tranche', () => {
    const analytics = calculateCashExchangeAnalytics([
      exchange(),
      exchange({
        id: 'exchange-2',
        cashAmount: 23000n,
        settlementAmount: 2000n,
        exchangeDate: new Date('2026-10-21T00:00:00.000Z'),
      }),
    ]);

    expect(analytics.history).toMatchObject([
      { id: 'exchange-1', rate: 1100 },
      { id: 'exchange-2', rate: 1150 },
    ]);
    expect(analytics.averages).toEqual([
      {
        cardId: 1,
        cardName: 'Japan cash',
        cashCurrency: 'JPY',
        settlementCurrency: 'SGD',
        averageRate: expect.closeTo(1133.333333, 5),
        count: 2,
      },
    ]);
  });

  it('returns no history or averages for empty input', () => {
    expect(calculateCashExchangeAnalytics([])).toEqual({ history: [], averages: [] });
  });

  it('keeps standalone exchanges separate from tranche averages', () => {
    const analytics = calculateCashExchangeAnalytics([
      exchange(),
      exchange({ id: 'standalone-1', card: null, cashAmount: 10000n, settlementAmount: 900n }),
    ]);

    expect(analytics.averages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ cardId: 1, count: 1 }),
        expect.objectContaining({ cardId: null, cardName: null, count: 1 }),
      ]),
    );
  });
});
