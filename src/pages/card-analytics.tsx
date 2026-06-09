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
  const { t, getCurrencyHelpersCached } = useTranslationWithUtils();
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

CardAnalyticsPage.auth = true;

export const getStaticProps = withI18nStaticProps(['common']);

export default CardAnalyticsPage;
