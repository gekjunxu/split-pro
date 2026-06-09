import { isCurrencyCode } from '~/lib/currency';
import { calculatePaidPerSettlementRate } from '~/lib/originalExpense';

export interface CardAnalyticsExpense {
  amount: bigint;
  originalAmount: bigint | null;
  originalCurrency: string | null;
  conversionRate: number | null;
  currency: string;
  card: {
    id: number;
    name: string;
  } | null;
}

export interface CardAnalyticsSummary {
  spendingByCard: { cardId: number; cardName: string; currency: string; amount: bigint }[];
  foreignSpendingByCurrency: { currency: string; amount: bigint }[];
  cardUsageCounts: { cardId: number; cardName: string; count: number }[];
  averageRatesByCurrency: {
    currency: string;
    cards: { cardId: number; cardName: string; averageRate: number; count: number }[];
  }[];
  insights: {
    mostUsedCard?: string;
    highestForeignSpendCard?: string;
    bestAverageRates: { currency: string; cardName: string; averageRate: number; count: number }[];
  };
}

const MIN_INSIGHT_SAMPLE_SIZE = 3;

const hasForeignMetadata = (expense: CardAnalyticsExpense) =>
  null !== expense.originalAmount &&
  null !== expense.originalCurrency &&
  null !== expense.conversionRate &&
  expense.originalCurrency !== expense.currency;

const incrementBigIntMap = (map: Map<string, bigint>, key: string, amount: bigint) => {
  map.set(key, (map.get(key) ?? 0n) + amount);
};

const incrementNumberMap = (map: Map<string, number>, key: string, amount: number) => {
  map.set(key, (map.get(key) ?? 0) + amount);
};

const compareBigIntDesc = (a: bigint, b: bigint) => (a === b ? 0 : a > b ? -1 : 1);

export const calculateCardAnalytics = (
  expenses: CardAnalyticsExpense[],
): CardAnalyticsSummary => {
  const spendingByCard = new Map<string, bigint>();
  const foreignSpendingByCurrency = new Map<string, bigint>();
  const cardUsageCounts = new Map<string, number>();
  const rateTotals = new Map<string, number>();
  const rateCounts = new Map<string, number>();
  const cardNames = new Map<number, string>();

  expenses.forEach((expense) => {
    if (!expense.card) {
      return;
    }

    cardNames.set(expense.card.id, expense.card.name);
    incrementBigIntMap(
      spendingByCard,
      `${expense.card.id}:${expense.currency}`,
      expense.amount < 0n ? -expense.amount : expense.amount,
    );
    incrementNumberMap(cardUsageCounts, expense.card.id.toString(), 1);

    if (!hasForeignMetadata(expense)) {
      return;
    }

    incrementBigIntMap(
      foreignSpendingByCurrency,
      expense.originalCurrency!,
      expense.originalAmount! < 0n ? -expense.originalAmount! : expense.originalAmount!,
    );
    const rateKey = `${expense.originalCurrency}:${expense.card.id}`;
    const effectiveCardRate =
      isCurrencyCode(expense.originalCurrency) && isCurrencyCode(expense.currency)
        ? calculatePaidPerSettlementRate({
            paidAmount:
              expense.originalAmount! < 0n ? -expense.originalAmount! : expense.originalAmount!,
            paidCurrency: expense.originalCurrency,
            settlementAmount: expense.amount < 0n ? -expense.amount : expense.amount,
            settlementCurrency: expense.currency,
          })
        : expense.conversionRate!;
    incrementNumberMap(rateTotals, rateKey, effectiveCardRate);
    incrementNumberMap(rateCounts, rateKey, 1);
  });

  const cardUsage = [...cardUsageCounts.entries()]
    .map(([cardId, count]) => ({
      cardId: Number(cardId),
      cardName: cardNames.get(Number(cardId)) ?? 'Unknown card',
      count,
    }))
    .sort((a, b) => b.count - a.count);

  const spending = [...spendingByCard.entries()]
    .map(([key, amount]) => {
      const [cardId, currency] = key.split(':');
      const numericCardId = Number(cardId);
      return {
        cardId: numericCardId,
        cardName: cardNames.get(numericCardId) ?? 'Unknown card',
        currency: currency!,
        amount,
      };
    })
    .sort((a, b) => compareBigIntDesc(a.amount, b.amount));

  const foreignSpending = [...foreignSpendingByCurrency.entries()]
    .map(([currency, amount]) => ({ currency, amount }))
    .sort((a, b) => compareBigIntDesc(a.amount, b.amount));

  const averageRatesByCurrencyMap = new Map<
    string,
    { cardId: number; cardName: string; averageRate: number; count: number }[]
  >();

  rateTotals.forEach((total, key) => {
    const [currency, cardId] = key.split(':');
    const numericCardId = Number(cardId);
    const count = rateCounts.get(key) ?? 0;
    if (!currency || 0 === count) {
      return;
    }

    const entries = averageRatesByCurrencyMap.get(currency) ?? [];
    entries.push({
      cardId: numericCardId,
      cardName: cardNames.get(numericCardId) ?? 'Unknown card',
      averageRate: total / count,
      count,
    });
    averageRatesByCurrencyMap.set(currency, entries);
  });

  const averageRatesByCurrency = [...averageRatesByCurrencyMap.entries()]
    .map(([currency, cards]) => ({
      currency,
      cards: cards.sort((a, b) => b.averageRate - a.averageRate),
    }))
    .sort((a, b) => a.currency.localeCompare(b.currency));

  const mostUsedCard = cardUsage.find((card) => card.count >= MIN_INSIGHT_SAMPLE_SIZE)?.cardName;

  const foreignSpendByCard = expenses.reduce<Map<number, bigint>>((acc, expense) => {
    if (!expense.card || !hasForeignMetadata(expense)) {
      return acc;
    }

    acc.set(
      expense.card.id,
      (acc.get(expense.card.id) ?? 0n) + (expense.amount < 0n ? -expense.amount : expense.amount),
    );
    return acc;
  }, new Map());
  const foreignExpenseCount = expenses.filter(
    (expense) => expense.card && hasForeignMetadata(expense),
  ).length;

  const highestForeignSpendCardId = [...foreignSpendByCard.entries()].sort((a, b) =>
    compareBigIntDesc(a[1], b[1]),
  )[0]?.[0];

  const highestForeignSpendCard = highestForeignSpendCardId
    ? cardNames.get(highestForeignSpendCardId)
    : undefined;

  return {
    spendingByCard: spending,
    foreignSpendingByCurrency: foreignSpending,
    cardUsageCounts: cardUsage,
    averageRatesByCurrency,
    insights: {
      mostUsedCard,
      highestForeignSpendCard:
        foreignExpenseCount >= MIN_INSIGHT_SAMPLE_SIZE ? highestForeignSpendCard : undefined,
      bestAverageRates: averageRatesByCurrency.flatMap(({ currency, cards }) => {
        const best = cards.find((card) => card.count >= MIN_INSIGHT_SAMPLE_SIZE);
        return best ? [{ currency, ...best }] : [];
      }),
    },
  };
};
