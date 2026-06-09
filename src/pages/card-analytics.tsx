import { BarChart3, CreditCard, TrendingUp } from 'lucide-react';
import Head from 'next/head';
import React from 'react';

import MainLayout from '~/components/Layout/MainLayout';
import { useTranslationWithUtils } from '~/hooks/useTranslationWithUtils';
import { isCurrencyCode } from '~/lib/currency';
import { formatConversionRate } from '~/lib/originalExpense';
import { type NextPageWithUser } from '~/types';
import { api } from '~/utils/api';
import { withI18nStaticProps } from '~/utils/i18n/server';

const CardAnalyticsPage: NextPageWithUser = () => {
  const { t, getCurrencyHelpersCached, toUIDate } = useTranslationWithUtils();
  const analyticsQuery = api.card.analytics.useQuery();
  const analytics = analyticsQuery.data;

  const formatAmount = (currency: string, amount: bigint) => {
    if (!isCurrencyCode(currency)) {
      return `${currency} ${amount.toString()}`;
    }

    return getCurrencyHelpersCached(currency).toUIString(amount);
  };

  return (
    <>
      <Head>
        <title>{t('cards.analytics.title')}</title>
      </Head>
      <MainLayout title={t('cards.analytics.title')} loading={analyticsQuery.isPending}>
        {!analytics ||
        (0 === analytics.spendingByCard.length &&
          0 === analytics.foreignSpendingByCurrency.length) ? (
          <p className="mt-16 text-center text-gray-500">{t('cards.analytics.empty')}</p>
        ) : (
          <div className="flex flex-col gap-6">
            <Section title={t('cards.analytics.insights')} icon={<TrendingUp className="size-5" />}>
              {analytics.insights.mostUsedCard ? (
                <Metric
                  label={t('cards.analytics.most_used_card')}
                  value={analytics.insights.mostUsedCard}
                />
              ) : null}
              {analytics.insights.highestForeignSpendCard ? (
                <Metric
                  label={t('cards.analytics.highest_foreign_spend')}
                  value={analytics.insights.highestForeignSpendCard}
                />
              ) : null}
              {analytics.insights.bestAverageRates.map((insight) => (
                <Metric
                  key={insight.currency}
                  label={t('cards.analytics.best_average_rate', { currency: insight.currency })}
                  value={`${insight.cardName} ${formatConversionRate(insight.averageRate)}`}
                />
              ))}
              {!analytics.insights.mostUsedCard &&
              !analytics.insights.highestForeignSpendCard &&
              0 === analytics.insights.bestAverageRates.length ? (
                <p className="text-sm text-gray-500">{t('cards.analytics.not_enough_data')}</p>
              ) : null}
            </Section>

            <Section
              title={t('cards.analytics.spending_by_card')}
              icon={<CreditCard className="size-5" />}
            >
              {analytics.spendingByCard.map((entry) => (
                <Metric
                  key={`${entry.cardId}-${entry.currency}`}
                  label={entry.cardName}
                  value={formatAmount(entry.currency, entry.amount)}
                />
              ))}
            </Section>

            <Section
              title={t('cards.analytics.foreign_by_currency')}
              icon={<BarChart3 className="size-5" />}
            >
              {analytics.foreignSpendingByCurrency.map((entry) => (
                <Metric
                  key={entry.currency}
                  label={entry.currency}
                  value={formatAmount(entry.currency, entry.amount)}
                />
              ))}
            </Section>

            <Section
              title={t('cards.analytics.usage_count')}
              icon={<CreditCard className="size-5" />}
            >
              {analytics.cardUsageCounts.map((entry) => (
                <Metric
                  key={entry.cardId}
                  label={entry.cardName}
                  value={t('cards.analytics.expense_count', { count: entry.count })}
                />
              ))}
            </Section>

            <Section
              title={t('cards.analytics.average_rates')}
              icon={<TrendingUp className="size-5" />}
            >
              {analytics.averageRatesByCurrency.map((currencyGroup) => (
                <div key={currencyGroup.currency} className="grid gap-2">
                  <p className="font-medium">{currencyGroup.currency}</p>
                  {currencyGroup.cards.map((entry) => (
                    <Metric
                      key={entry.cardId}
                      label={entry.cardName}
                      value={`${formatConversionRate(entry.averageRate)} (${entry.count})`}
                    />
                  ))}
                </div>
              ))}
            </Section>

            <Section
              title={t('cards.analytics.rate_trends')}
              icon={<TrendingUp className="size-5" />}
            >
              <RateTrendGraph
                history={analytics.rateHistory}
                formatDate={(date) => toUIDate(date, { year: true })}
              />
            </Section>
          </div>
        )}
      </MainLayout>
    </>
  );
};

const Section: React.FC<React.PropsWithChildren<{ title: string; icon: React.ReactNode }>> = ({
  children,
  icon,
  title,
}) => (
  <section className="grid gap-3">
    <div className="flex items-center gap-2 text-lg font-semibold">
      {icon}
      <h2>{title}</h2>
    </div>
    <div className="grid gap-2">{children}</div>
  </section>
);

const Metric: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex items-center justify-between gap-3 rounded-md border p-3">
    <span className="min-w-0 truncate text-sm text-gray-500">{label}</span>
    <span className="shrink-0 text-right font-medium">{value}</span>
  </div>
);

const RateTrendGraph: React.FC<{
  history: { currency: string; cardId: number; cardName: string; date: Date; rate: number }[];
  formatDate: (date: Date) => string;
}> = ({ history, formatDate }) => {
  const series = React.useMemo(() => {
    const grouped = history.reduce<
      Record<string, { cardName: string; currency: string; points: { date: Date; rate: number }[] }>
    >((acc, point) => {
      const key = `${point.currency}:${point.cardId}`;
      acc[key] ??= {
        cardName: point.cardName,
        currency: point.currency,
        points: [],
      };
      acc[key].points.push({ date: point.date, rate: point.rate });
      return acc;
    }, {});

    return Object.values(grouped).filter((entry) => entry.points.length >= 2);
  }, [history]);

  const firstSeries = series[0];
  if (!firstSeries) {
    return <p className="text-sm text-gray-500">More rate history is needed for a graph.</p>;
  }

  return (
    <div className="grid gap-3">
      {series.map((entry) => (
        <SingleRateTrend
          key={`${entry.currency}-${entry.cardName}`}
          entry={entry}
          formatDate={formatDate}
        />
      ))}
    </div>
  );
};

const SingleRateTrend: React.FC<{
  entry: { cardName: string; currency: string; points: { date: Date; rate: number }[] };
  formatDate: (date: Date) => string;
}> = ({ entry, formatDate }) => {
  const width = 320;
  const height = 140;
  const padding = 20;
  const points = entry.points.toSorted((a, b) => a.date.getTime() - b.date.getTime());
  const minTime = points[0]!.date.getTime();
  const maxTime = points[points.length - 1]!.date.getTime();
  const rates = points.map((point) => point.rate);
  const minRate = Math.min(...rates);
  const maxRate = Math.max(...rates);
  const timeSpan = Math.max(maxTime - minTime, 1);
  const rateSpan = Math.max(maxRate - minRate, 0.0000001);

  const coordinates = points.map((point) => {
    const x = padding + ((point.date.getTime() - minTime) / timeSpan) * (width - padding * 2);
    const y = height - padding - ((point.rate - minRate) / rateSpan) * (height - padding * 2);
    return { ...point, x, y };
  });

  const path = coordinates
    .map((point, index) => `${0 === index ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ');

  return (
    <div className="grid gap-2 rounded-md border p-3">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium">{firstSeries.cardName}</span>
        <span className="text-gray-500">{entry.currency}</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-40 w-full">
        <path d={path} fill="none" stroke="currentColor" strokeWidth="2" className="text-primary" />
        {coordinates.map((point) => (
          <circle
            key={point.date.toISOString()}
            cx={point.x}
            cy={point.y}
            r="3"
            className="fill-primary"
          />
        ))}
      </svg>
      <div className="flex justify-between text-xs text-gray-500">
        <span>{formatDate(points[0]!.date)}</span>
        <span>{formatDate(points[points.length - 1]!.date)}</span>
      </div>
      <div className="flex justify-between text-xs text-gray-500">
        <span>{formatConversionRate(minRate)}</span>
        <span>{formatConversionRate(maxRate)}</span>
      </div>
    </div>
  );
};

CardAnalyticsPage.auth = true;

export const getStaticProps = withI18nStaticProps(['common']);

export default CardAnalyticsPage;
