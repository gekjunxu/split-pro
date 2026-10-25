import { BarChart3, PencilIcon, TrendingUp, WalletCards } from 'lucide-react';
import Head from 'next/head';
import React, { useMemo, useState } from 'react';

import { CashExchangeDialog } from '~/components/Account/CashExchangeDialog';
import MainLayout from '~/components/Layout/MainLayout';
import { Button } from '~/components/ui/button';
import { NativeSelect, NativeSelectOption } from '~/components/ui/native-select';
import { useTranslationWithUtils } from '~/hooks/useTranslationWithUtils';
import { type CardRateHistoryItem } from '~/lib/cardAnalytics';
import { isCurrencyCode } from '~/lib/currency';
import { formatDisplayRate } from '~/lib/originalExpense';
import { cn } from '~/lib/utils';
import { type NextPageWithUser } from '~/types';
import { api } from '~/utils/api';
import { withI18nStaticProps } from '~/utils/i18n/server';

type RangeZoom = 'all' | '7d' | '1d';
type AnalyticsScope = 'all' | 'personal' | number;

const CardAnalyticsPage: NextPageWithUser = () => {
  const { t, getCurrencyHelpersCached, toUIDate } = useTranslationWithUtils();
  const [scope, setScope] = useState<AnalyticsScope>('all');
  const groupsQuery = api.group.getAllGroups.useQuery();
  const analyticsQuery = api.card.analytics.useQuery(
    'all' === scope ? undefined : { groupId: 'personal' === scope ? null : scope },
  );
  const analytics = analyticsQuery.data;
  const selectedGroup =
    'number' === typeof scope
      ? groupsQuery.data?.find(({ group }) => group.id === scope)?.group
      : undefined;

  const formatAmount = React.useCallback(
    (currency: string, amount: bigint) => {
      if (!isCurrencyCode(currency)) {
        return `${currency} ${amount.toString()}`;
      }

      return getCurrencyHelpersCached(currency).toUIString(amount);
    },
    [getCurrencyHelpersCached],
  );

  return (
    <>
      <Head>
        <title>{t('cards.analytics.title')}</title>
      </Head>
      <MainLayout
        title={t('cards.analytics.title')}
        loading={analyticsQuery.isPending || groupsQuery.isPending}
      >
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="grid gap-1">
            <label htmlFor="analytics-scope" className="text-sm text-gray-500">
              {t('cards.analytics.scope_trip')}
            </label>
            <NativeSelect
              id="analytics-scope"
              value={scope.toString()}
              onChange={(event) => {
                const value = event.target.value;
                setScope(
                  'all' === value ? 'all' : 'personal' === value ? 'personal' : Number(value),
                );
              }}
            >
              <NativeSelectOption value="all">{t('cards.analytics.scope_all')}</NativeSelectOption>
              <NativeSelectOption value="personal">
                {t('cards.analytics.scope_personal')}
              </NativeSelectOption>
              {groupsQuery.data?.map(({ group }) => (
                <NativeSelectOption key={group.id} value={group.id.toString()}>
                  {group.name}
                  {group.archivedAt ? ` (${t('cards.archived')})` : ''}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          {'number' === typeof scope && !selectedGroup?.archivedAt ? (
            <CashExchangeDialog groupId={scope} />
          ) : null}
        </div>
        {!analytics ||
        (0 === analytics.spendingByCard.length &&
          0 === analytics.foreignSpendingByCurrency.length &&
          0 === analytics.cashExchanges.history.length) ? (
          <p className="mt-16 text-center text-gray-500">{t('cards.analytics.empty')}</p>
        ) : (
          <div className="flex flex-col gap-6">
            {0 < analytics.cashExchanges.history.length ? (
              <Section
                title={t('cards.analytics.cash_exchanges')}
                icon={<TrendingUp className="size-5" />}
              >
                {analytics.cashExchanges.averages.map((entry) => (
                  <Metric
                    key={`${entry.cardId ?? 'standalone'}-${entry.cashCurrency}-${entry.settlementCurrency}`}
                    label={`${entry.cardName ?? t('cards.analytics.cash_exchange_standalone')} · ${entry.cashCurrency}/${entry.settlementCurrency}`}
                    value={`${formatDisplayRate(entry.averageRate)} (${t('cards.analytics.cash_exchange_count', { count: entry.count })})`}
                  />
                ))}
                {analytics.cashExchanges.history.map((entry) => (
                  <Metric
                    key={entry.id}
                    label={`${entry.name} · ${toUIDate(entry.exchangeDate)}`}
                    value={`${formatAmount(entry.cashCurrency, entry.cashAmount)} → ${formatAmount(entry.settlementCurrency, entry.settlementAmount)} @ ${formatDisplayRate(entry.rate)}`}
                    action={
                      'number' === typeof scope && !selectedGroup?.archivedAt ? (
                        <CashExchangeDialog
                          groupId={scope}
                          exchange={entry}
                          trigger={
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label={t('cards.analytics.edit_cash_exchange')}
                            >
                              <PencilIcon className="size-4" />
                            </Button>
                          }
                        />
                      ) : null
                    }
                  />
                ))}
              </Section>
            ) : null}
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
                  value={`${insight.cardName} (${formatDisplayRate(insight.averageRate)})`}
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
              icon={<WalletCards className="size-5" />}
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
              icon={<WalletCards className="size-5" />}
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
                      value={`${formatDisplayRate(entry.averageRate)} (${entry.count})`}
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
                formatShortDate={(date) => toUIDate(date)}
                formatAmount={formatAmount}
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

const Metric: React.FC<{ label: string; value: string; action?: React.ReactNode }> = ({
  action,
  label,
  value,
}) => (
  <div className="flex items-center justify-between gap-3 rounded-md border p-3">
    <span className="min-w-0 flex-1 truncate text-sm text-gray-500">{label}</span>
    <span className="shrink-0 text-right font-medium">{value}</span>
    {action}
  </div>
);

interface RateSeriesEntry {
  cardId: number;
  cardName: string;
  currency: string;
  settlementCurrency: string;
  points: CardRateHistoryItem[];
}

const RateTrendGraph: React.FC<{
  history: CardRateHistoryItem[];
  formatDate: (date: Date) => string;
  formatShortDate: (date: Date) => string;
  formatAmount: (currency: string, amount: bigint) => string;
}> = ({ history, formatDate, formatShortDate, formatAmount }) => {
  const { t } = useTranslationWithUtils();

  const series = useMemo(() => {
    const grouped = history.reduce<Record<string, RateSeriesEntry>>((acc, point) => {
      const key = `${point.currency}:${point.settlementCurrency}:${point.cardId}`;
      acc[key] ??= {
        cardId: point.cardId,
        cardName: point.cardName,
        currency: point.currency,
        settlementCurrency: point.settlementCurrency,
        points: [],
      };
      acc[key].points.push(point);
      return acc;
    }, {});

    return Object.values(grouped).filter((entry) => 1 <= entry.points.length);
  }, [history]);

  if (0 === series.length) {
    return <p className="text-sm text-gray-500">{t('cards.analytics.not_enough_data')}</p>;
  }

  return (
    <div className="grid gap-4">
      {series.map((entry) => (
        <SingleRateTrend
          key={`${entry.currency}-${entry.settlementCurrency}-${entry.cardId}`}
          entry={entry}
          formatDate={formatDate}
          formatShortDate={formatShortDate}
          formatAmount={formatAmount}
        />
      ))}
    </div>
  );
};

interface DayBucket {
  dayKey: string;
  date: Date;
  points: CardRateHistoryItem[];
  averageRate: number;
}

const SingleRateTrend: React.FC<{
  entry: RateSeriesEntry;
  formatDate: (date: Date) => string;
  formatShortDate: (date: Date) => string;
  formatAmount: (currency: string, amount: bigint) => string;
}> = ({ entry, formatDate, formatShortDate, formatAmount }) => {
  const [rangeZoom, setRangeZoom] = useState<RangeZoom>('all');
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);

  const allDayBuckets = useMemo<DayBucket[]>(() => {
    const map = new Map<string, CardRateHistoryItem[]>();
    entry.points.forEach((point) => {
      const list = map.get(point.dayKey) ?? [];
      list.push(point);
      map.set(point.dayKey, list);
    });

    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([dayKey, points]) => ({
        dayKey,
        date: points[0]!.date,
        points,
        averageRate: points.reduce((sum, p) => sum + p.rate, 0) / points.length,
      }));
  }, [entry.points]);

  const latestDayBucket = allDayBuckets[allDayBuckets.length - 1];
  const activeDayKey =
    selectedDayKey && allDayBuckets.some((b) => b.dayKey === selectedDayKey)
      ? selectedDayKey
      : (latestDayBucket?.dayKey ?? null);

  const visibleDayBuckets = useMemo<DayBucket[]>(() => {
    if (0 === allDayBuckets.length) {
      return [];
    }

    if ('1d' === rangeZoom) {
      const match = allDayBuckets.find((b) => b.dayKey === activeDayKey);
      return match ? [match] : [allDayBuckets[allDayBuckets.length - 1]!];
    }

    if ('7d' === rangeZoom && latestDayBucket) {
      const cutoffTime = latestDayBucket.date.getTime() - 6 * 24 * 60 * 60 * 1000;
      return allDayBuckets.filter((b) => b.date.getTime() >= cutoffTime);
    }

    return allDayBuckets;
  }, [activeDayKey, allDayBuckets, latestDayBucket, rangeZoom]);

  const visiblePoints = useMemo(
    () => visibleDayBuckets.flatMap((bucket) => bucket.points),
    [visibleDayBuckets],
  );

  const rates = visiblePoints.map((p) => p.rate);
  const minRate = 0 < rates.length ? Math.min(...rates) : 0;
  const maxRate = 0 < rates.length ? Math.max(...rates) : 0;
  const avgRate = 0 < rates.length ? rates.reduce((sum, r) => sum + r, 0) / rates.length : 0;

  const rawSpan = maxRate - minRate;
  const yPad = 0.0005 > rawSpan ? Math.max(minRate * 0.005, 0.05) : rawSpan * 0.18;
  const yMin = minRate - yPad;
  const yMax = maxRate + yPad;
  const ySpan = Math.max(yMax - yMin, 0.0001);

  const width = 360;
  const height = 160;
  const padLeft = 22;
  const padRight = 22;
  const padTop = 18;
  const padBottom = 22;
  const plotWidth = width - padLeft - padRight;
  const plotHeight = height - padTop - padBottom;

  const toY = (rate: number) => height - padBottom - ((rate - yMin) / ySpan) * plotHeight;

  const chartData = useMemo(() => {
    const bucketCount = visibleDayBuckets.length;
    const bucketSpacing = 1 < bucketCount ? plotWidth / (bucketCount - 1) : plotWidth;
    const maxSpread =
      1 === bucketCount
        ? Math.min(140, visiblePoints.length * 28)
        : Math.min(24, bucketSpacing * 0.36);

    const bucketCenters: { dayKey: string; x: number; avgY: number; date: Date }[] = [];
    const dots: {
      key: string;
      x: number;
      y: number;
      point: CardRateHistoryItem;
      isSelectedDay: boolean;
    }[] = [];

    visibleDayBuckets.forEach((bucket, bIdx) => {
      const centerX =
        1 === bucketCount ? width / 2 : padLeft + (bIdx / (bucketCount - 1)) * plotWidth;
      const avgY = height - padBottom - ((bucket.averageRate - yMin) / ySpan) * plotHeight;
      bucketCenters.push({
        dayKey: bucket.dayKey,
        x: centerX,
        avgY,
        date: bucket.date,
      });

      const count = bucket.points.length;
      bucket.points.forEach((point, pIdx) => {
        const offset = 1 === count ? 0 : ((pIdx - (count - 1) / 2) / (count - 1)) * maxSpread;
        const x = centerX + offset;
        const y = height - padBottom - ((point.rate - yMin) / ySpan) * plotHeight;
        dots.push({
          key: point.id ?? `${bucket.dayKey}-${pIdx}`,
          x,
          y,
          point,
          isSelectedDay: bucket.dayKey === activeDayKey,
        });
      });
    });

    const avgTrendPath =
      1 < bucketCenters.length
        ? bucketCenters
            .map((center, idx) => `${0 === idx ? 'M' : 'L'} ${center.x} ${center.avgY}`)
            .join(' ')
        : '';

    return { bucketCenters, dots, avgTrendPath };
  }, [
    activeDayKey,
    height,
    padBottom,
    padLeft,
    plotHeight,
    plotWidth,
    visibleDayBuckets,
    visiblePoints.length,
    width,
    yMin,
    ySpan,
  ]);

  const activeBucket = useMemo(
    () =>
      visibleDayBuckets.find((b) => b.dayKey === activeDayKey) ??
      visibleDayBuckets[visibleDayBuckets.length - 1],
    [activeDayKey, visibleDayBuckets],
  );

  const pairLabel = `${entry.currency}/${entry.settlementCurrency}`;

  return (
    <div className="grid gap-3 rounded-lg border p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-medium">{entry.cardName}</span>
          <span className="rounded bg-gray-800 px-2 py-0.5 text-xs text-gray-300">{pairLabel}</span>
        </div>
        <div className="flex items-center gap-1">
          {(['all', '7d', '1d'] as const).map((zoom) => (
            <Button
              key={zoom}
              type="button"
              variant={zoom === rangeZoom ? 'secondary' : 'ghost'}
              size="sm"
              className="h-6 px-2 text-xs uppercase"
              onClick={() => setRangeZoom(zoom)}
            >
              {zoom}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-400">
        <span>
          Avg: <strong className="text-gray-200">{formatDisplayRate(avgRate)}</strong>
        </span>
        <span>
          High: <strong className="text-emerald-400">{formatDisplayRate(maxRate)}</strong>
        </span>
        <span>
          Low: <strong className="text-amber-400">{formatDisplayRate(minRate)}</strong>
        </span>
        <span>
          {visiblePoints.length} {1 === visiblePoints.length ? 'txn' : 'txns'} ·{' '}
          {visibleDayBuckets.length} {1 === visibleDayBuckets.length ? 'day' : 'days'}
        </span>
      </div>

      <div className="relative">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-44 w-full overflow-visible">
          <line
            x1={padLeft}
            y1={toY(maxRate)}
            x2={width - padRight}
            y2={toY(maxRate)}
            stroke="currentColor"
            strokeDasharray="2 3"
            className="text-gray-800"
          />
          <line
            x1={padLeft}
            y1={toY(avgRate)}
            x2={width - padRight}
            y2={toY(avgRate)}
            stroke="currentColor"
            strokeDasharray="2 3"
            className="text-gray-800"
          />
          <line
            x1={padLeft}
            y1={toY(minRate)}
            x2={width - padRight}
            y2={toY(minRate)}
            stroke="currentColor"
            strokeDasharray="2 3"
            className="text-gray-800"
          />

          {chartData.bucketCenters.map((center) => (
            <line
              key={`grid-${center.dayKey}`}
              x1={center.x}
              y1={padTop}
              x2={center.x}
              y2={height - padBottom}
              stroke="currentColor"
              strokeWidth={center.dayKey === activeDayKey ? '1.5' : '1'}
              className={center.dayKey === activeDayKey ? 'text-primary/30' : 'text-gray-800/60'}
            />
          ))}

          {chartData.avgTrendPath ? (
            <path
              d={chartData.avgTrendPath}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeDasharray="4 3"
              className="text-primary/60"
            />
          ) : null}

          {chartData.dots.map((dot) => (
            <circle
              key={dot.key}
              cx={dot.x}
              cy={dot.y}
              r={dot.isSelectedDay ? 5 : 4}
              onClick={() => setSelectedDayKey(dot.point.dayKey)}
              className={cn(
                'cursor-pointer transition-all',
                dot.isSelectedDay
                  ? 'fill-primary stroke-background stroke-2'
                  : 'fill-primary/70 hover:fill-primary',
              )}
            >
              <title>
                {`${dot.point.name ?? entry.currency} (${formatDate(dot.point.date)}): ${formatDisplayRate(dot.point.rate)} ${pairLabel}`}
              </title>
            </circle>
          ))}
        </svg>

        <div className="flex justify-between text-xs text-gray-500">
          <span>{visibleDayBuckets[0] ? formatDate(visibleDayBuckets[0].date) : ''}</span>
          <span>
            {1 < visibleDayBuckets.length
              ? formatDate(visibleDayBuckets[visibleDayBuckets.length - 1]!.date)
              : ''}
          </span>
        </div>
      </div>

      {1 < allDayBuckets.length ? (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {visibleDayBuckets.map((bucket) => {
            const isSelected = bucket.dayKey === activeBucket?.dayKey;
            return (
              <Button
                key={bucket.dayKey}
                type="button"
                variant={isSelected ? 'secondary' : 'outline'}
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => setSelectedDayKey(bucket.dayKey)}
              >
                {formatShortDate(bucket.date)} ({bucket.points.length})
              </Button>
            );
          })}
        </div>
      ) : null}

      {activeBucket ? (
        <div className="bg-muted/20 grid gap-1.5 rounded-md border border-gray-800 p-2.5">
          <div className="flex items-center justify-between text-xs text-gray-400">
            <span className="font-medium text-gray-300">
              {formatDate(activeBucket.date)} ({activeBucket.points.length}{' '}
              {1 === activeBucket.points.length ? 'txn' : 'txns'})
            </span>
            <span>
              Day avg: {formatDisplayRate(activeBucket.averageRate)} {pairLabel}
            </span>
          </div>
          <div className="grid gap-1">
            {activeBucket.points.map((point) => (
              <div
                key={
                  point.id ??
                  `${point.dayKey}-${point.paidAmount.toString()}-${point.settlementAmount.toString()}-${point.name ?? ''}`
                }
                className="flex items-center justify-between gap-2 text-xs"
              >
                <span className="min-w-0 truncate text-gray-300">
                  {point.name || entry.currency}
                </span>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-gray-400">
                    {formatAmount(entry.currency, point.paidAmount)} →{' '}
                    {formatAmount(entry.settlementCurrency, point.settlementAmount)}
                  </span>
                  <span className="text-primary font-medium">{formatDisplayRate(point.rate)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
};

CardAnalyticsPage.auth = true;

export const getStaticProps = withI18nStaticProps(['common']);

export default CardAnalyticsPage;
