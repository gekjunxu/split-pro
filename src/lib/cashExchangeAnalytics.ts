import { type CurrencyCode, isCurrencyCode } from '~/lib/currency';
import { calculatePaidPerSettlementRate } from '~/lib/originalExpense';

type UsableCashExchange = CashExchangeAnalyticsInput & {
  cashCurrency: CurrencyCode;
  settlementCurrency: CurrencyCode;
};

export interface CashExchangeAnalyticsInput {
  id: string;
  name: string;
  exchangeDate: Date;
  cashAmount: bigint;
  cashCurrency: string;
  settlementAmount: bigint;
  settlementCurrency: string;
  card: { id: number; name: string } | null;
}

export interface CashExchangeRateHistoryItem extends CashExchangeAnalyticsInput {
  rate: number;
}

export interface CashExchangeRateAverage {
  cardId: number | null;
  cardName: string | null;
  cashCurrency: string;
  settlementCurrency: string;
  averageRate: number;
  count: number;
}

export interface CashExchangeAnalyticsSummary {
  history: CashExchangeRateHistoryItem[];
  averages: CashExchangeRateAverage[];
}

const isUsableExchange = (exchange: CashExchangeAnalyticsInput): exchange is UsableCashExchange =>
  0n < exchange.cashAmount &&
  0n < exchange.settlementAmount &&
  exchange.cashCurrency !== exchange.settlementCurrency &&
  isCurrencyCode(exchange.cashCurrency) &&
  isCurrencyCode(exchange.settlementCurrency);

const calculateRate = (exchange: UsableCashExchange) =>
  calculatePaidPerSettlementRate({
    paidAmount: exchange.cashAmount,
    paidCurrency: exchange.cashCurrency,
    settlementAmount: exchange.settlementAmount,
    settlementCurrency: exchange.settlementCurrency,
  });

export const calculateCashExchangeAnalytics = (
  exchanges: CashExchangeAnalyticsInput[],
): CashExchangeAnalyticsSummary => {
  const usableExchanges = exchanges.filter(isUsableExchange);
  const history = usableExchanges
    .map((exchange) => ({ ...exchange, rate: calculateRate(exchange) }))
    .sort((a, b) => {
      const timeDiff = a.exchangeDate.getTime() - b.exchangeDate.getTime();
      return 0 !== timeDiff ? timeDiff : a.id.localeCompare(b.id);
    });

  const buckets = new Map<
    string,
    {
      cardId: number | null;
      cardName: string | null;
      cashCurrency: CurrencyCode;
      settlementCurrency: CurrencyCode;
      cashAmount: bigint;
      settlementAmount: bigint;
      count: number;
    }
  >();

  usableExchanges.forEach((exchange) => {
    const key = `${exchange.cashCurrency}:${exchange.settlementCurrency}:${exchange.card?.id ?? 'none'}`;
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.cashAmount += exchange.cashAmount;
      bucket.settlementAmount += exchange.settlementAmount;
      bucket.count += 1;
      return;
    }

    buckets.set(key, {
      cardId: exchange.card?.id ?? null,
      cardName: exchange.card?.name ?? null,
      cashCurrency: exchange.cashCurrency,
      settlementCurrency: exchange.settlementCurrency,
      cashAmount: exchange.cashAmount,
      settlementAmount: exchange.settlementAmount,
      count: 1,
    });
  });

  const averages = [...buckets.values()]
    .map((bucket) => ({
      cardId: bucket.cardId,
      cardName: bucket.cardName,
      cashCurrency: bucket.cashCurrency,
      settlementCurrency: bucket.settlementCurrency,
      averageRate: calculatePaidPerSettlementRate({
        paidAmount: bucket.cashAmount,
        paidCurrency: bucket.cashCurrency,
        settlementAmount: bucket.settlementAmount,
        settlementCurrency: bucket.settlementCurrency,
      }),
      count: bucket.count,
    }))
    .sort((a, b) => {
      const currencyDiff = `${a.cashCurrency}/${a.settlementCurrency}`.localeCompare(
        `${b.cashCurrency}/${b.settlementCurrency}`,
      );
      return 0 !== currencyDiff ? currencyDiff : (a.cardName ?? '').localeCompare(b.cardName ?? '');
    });

  return { history, averages };
};
