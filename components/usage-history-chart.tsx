'use client';

import React, { useMemo, useState, useSyncExternalStore } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { GenerationRecord } from '@/lib/db';
import { findModelById, type NormalizedImageModel } from '@/lib/models';

interface UsageHistoryChartProps {
  records: GenerationRecord[];
  models: NormalizedImageModel[];
  selectedMonth?: string;
  onSelectedMonthChange?: (month: string) => void;
}

interface DailySpendDatum {
  day: number;
  dateKey: string;
  shortLabel: string;
  fullDate: string;
  cost: number;
  paidImages: number;
  paidBatches: number;
}

const subscribeNoop = () => () => {};

function getRecordPaidCost(record: GenerationRecord): number {
  const tier =
    record.modelTier ?? (record.modelId.endsWith(':free') ? 'free' : 'paid');
  if (tier !== 'paid') return 0;

  if (typeof record.actualCost === 'number' && Number.isFinite(record.actualCost)) {
    return record.actualCost;
  }

  const imageCosts = record.images.reduce(
    (sum, img) => sum + (typeof img.cost === 'number' ? img.cost : 0),
    0
  );
  if (imageCosts > 0) return imageCosts;

  return typeof record.totalCost === 'number' && Number.isFinite(record.totalCost)
    ? record.totalCost
    : 0;
}

export function formatMonthKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function formatMonthLabel(monthKey: string): string {
  const [yearStr, monthStr] = monthKey.split('-');
  const d = new Date(Number(yearStr), Number(monthStr) - 1, 1);
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function shiftMonth(monthKey: string, delta: number): string {
  const [yearStr, monthStr] = monthKey.split('-');
  const d = new Date(Number(yearStr), Number(monthStr) - 1 + delta, 1);
  return formatMonthKey(d);
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: DailySpendDatum }>;
}

function SpendTooltip({ active, payload }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0].payload;

  return (
    <div className="rounded-[8px] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[12px] text-[var(--foreground)]">
      <div className="font-medium">{d.fullDate}</div>
      <div className="mt-1 space-y-0.5 font-mono text-[11px] tabular-nums text-[var(--muted-foreground)]">
        <div className="flex items-center justify-between gap-4">
          <span>Paid spend</span>
          <span className="text-[var(--foreground)] font-medium">
            ${d.cost.toFixed(4)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span>Paid images</span>
          <span className="text-[var(--foreground)]">{d.paidImages}</span>
        </div>
      </div>
    </div>
  );
}

export function UsageHistoryChart({
  records,
  models,
  selectedMonth: controlledMonth,
  onSelectedMonthChange,
}: UsageHistoryChartProps) {
  const isClient = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false
  );

  const currentMonthKey = formatMonthKey(new Date());
  const [internalMonth, setInternalMonth] = useState<string>(currentMonthKey);
  const selectedMonth = controlledMonth ?? internalMonth;

  const updateMonth = (delta: number) => {
    const next = shiftMonth(selectedMonth, delta);
    if (onSelectedMonthChange) {
      onSelectedMonthChange(next);
    } else {
      setInternalMonth(next);
    }
  };

  const {
    dailyData,
    monthlySpend,
    paidImagesCount,
    paidBatchesCount,
    peakDay,
    topModelName,
  } = useMemo(() => {
    const [yearStr, monthStr] = selectedMonth.split('-');
    const year = Number(yearStr);
    const monthIndex = Number(monthStr) - 1;
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

    const byDate = new Map<
      string,
      { cost: number; paidImages: number; paidBatches: number }
    >();
    const spendByModel = new Map<string, number>();

    for (const rec of records) {
      const tier =
        rec.modelTier ?? (rec.modelId.endsWith(':free') ? 'free' : 'paid');
      if (tier !== 'paid') continue;

      const d = new Date(rec.createdAt);
      if (d.getFullYear() !== year || d.getMonth() !== monthIndex) continue;

      const dateKey = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(
        d.getDate()
      ).padStart(2, '0')}`;
      const cost = getRecordPaidCost(rec);

      const prev = byDate.get(dateKey) ?? {
        cost: 0,
        paidImages: 0,
        paidBatches: 0,
      };
      byDate.set(dateKey, {
        cost: prev.cost + cost,
        paidImages: prev.paidImages + rec.images.length,
        paidBatches: prev.paidBatches + 1,
      });

      spendByModel.set(
        rec.modelId,
        (spendByModel.get(rec.modelId) ?? 0) + cost
      );
    }

    const monthShort = new Date(year, monthIndex, 1).toLocaleDateString(
      'en-US',
      { month: 'short' }
    );

    const rows: DailySpendDatum[] = [];
    let totalCost = 0;
    let totalImages = 0;
    let totalBatches = 0;
    let bestDay: DailySpendDatum | null = null;

    for (let day = 1; day <= daysInMonth; day++) {
      const dateKey = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(
        day
      ).padStart(2, '0')}`;
      const agg = byDate.get(dateKey) ?? {
        cost: 0,
        paidImages: 0,
        paidBatches: 0,
      };
      const row: DailySpendDatum = {
        day,
        dateKey,
        shortLabel: `${day}`,
        fullDate: `${monthShort} ${day}, ${year}`,
        cost: Number(agg.cost.toFixed(6)),
        paidImages: agg.paidImages,
        paidBatches: agg.paidBatches,
      };
      rows.push(row);
      totalCost += agg.cost;
      totalImages += agg.paidImages;
      totalBatches += agg.paidBatches;

      if (agg.cost > 0 && (!bestDay || agg.cost > bestDay.cost)) {
        bestDay = row;
      }
    }

    let topId: string | null = null;
    let topVal = -1;
    for (const [mId, val] of spendByModel.entries()) {
      if (val > topVal) {
        topVal = val;
        topId = mId;
      }
    }
    const resolvedTopName = topId
      ? findModelById(models, topId)?.name ?? topId
      : null;

    return {
      dailyData: rows,
      monthlySpend: totalCost,
      paidImagesCount: totalImages,
      paidBatchesCount: totalBatches,
      peakDay: bestDay,
      topModelName: resolvedTopName,
    };
  }, [records, models, selectedMonth]);

  const isCurrentMonth = selectedMonth === currentMonthKey;

  return (
    <section
      aria-labelledby="usage-history-heading"
      className="rounded-[12px] border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5 space-y-4"
    >
      {/* Section Header + Month Stepper */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2
            id="usage-history-heading"
            className="text-[15px] font-semibold tracking-[-0.02em] text-[var(--foreground)]"
          >
            Usage History
          </h2>
          <p className="text-[12px] text-[var(--muted-foreground)]">
            Daily spending on paid models for {formatMonthLabel(selectedMonth)}.
          </p>
        </div>

        <div className="flex items-center gap-1 rounded-[6px] border border-[var(--border)] bg-[var(--surface)] p-0.5">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => updateMonth(-1)}
            className="inline-flex h-7 w-7 items-center justify-center rounded-[5px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--card)] cursor-pointer transition-colors"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <span className="min-w-[124px] px-2 text-center font-mono text-[12px] text-[var(--foreground)] whitespace-nowrap">
            {formatMonthLabel(selectedMonth)}
          </span>
          <button
            type="button"
            aria-label="Next month"
            disabled={isCurrentMonth}
            onClick={() => updateMonth(1)}
            className="inline-flex h-7 w-7 items-center justify-center rounded-[5px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--card)] disabled:opacity-35 disabled:pointer-events-none cursor-pointer transition-colors"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] p-3">
        <div>
          <span className="block text-[11px] text-[var(--muted-foreground)]">
            Monthly paid spend
          </span>
          <span className="mt-0.5 block font-mono text-[15px] font-semibold tabular-nums text-[var(--foreground)]">
            ${monthlySpend.toFixed(4)}
          </span>
        </div>

        <div>
          <span className="block text-[11px] text-[var(--muted-foreground)]">
            Paid generations
          </span>
          <span className="mt-0.5 block font-mono text-[15px] font-semibold tabular-nums text-[var(--foreground)]">
            {paidImagesCount}{' '}
            <span className="text-[11px] font-normal text-[var(--muted-foreground)]">
              ({paidBatchesCount} {paidBatchesCount === 1 ? 'batch' : 'batches'})
            </span>
          </span>
        </div>

        <div>
          <span className="block text-[11px] text-[var(--muted-foreground)]">
            Peak day
          </span>
          <span className="mt-0.5 block font-mono text-[15px] font-semibold tabular-nums text-[var(--foreground)]">
            {peakDay ? `$${peakDay.cost.toFixed(4)}` : '$0.0000'}
          </span>
        </div>

        <div className="min-w-0">
          <span className="block text-[11px] text-[var(--muted-foreground)]">
            Top paid model
          </span>
          <span
            title={topModelName ?? undefined}
            className="mt-0.5 block truncate font-mono text-[12px] font-medium text-[var(--foreground)] pt-0.5"
          >
            {topModelName ?? '—'}
          </span>
        </div>
      </div>

      {/* Daily Spend Bar Chart (Recharts) */}
      <div className="relative h-[220px] w-full">
        {!isClient ? (
          <div className="h-full w-full rounded-[8px] border border-[var(--border)] bg-[var(--surface)]" />
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={dailyData}
              margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
            >
              <CartesianGrid
                stroke="var(--border)"
                strokeDasharray="3 3"
                vertical={false}
              />
              <XAxis
                dataKey="shortLabel"
                tickLine={false}
                axisLine={{ stroke: 'var(--border)' }}
                interval={dailyData.length > 20 ? 1 : 0}
                tick={{
                  fill: 'var(--muted-foreground)',
                  fontSize: 11,
                  fontFamily: 'var(--font-geist-mono), monospace',
                }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={56}
                tickFormatter={(v: number) =>
                  v === 0 ? '$0' : v < 0.01 ? `$${v.toFixed(3)}` : `$${v.toFixed(2)}`
                }
                tick={{
                  fill: 'var(--muted-foreground)',
                  fontSize: 11,
                  fontFamily: 'var(--font-geist-mono), monospace',
                }}
              />
              <Tooltip
                cursor={{ fill: 'var(--surface)', opacity: 0.7 }}
                content={<SpendTooltip />}
              />
              <Bar
                dataKey="cost"
                name="Daily paid spend"
                fill="var(--foreground)"
                radius={[4, 4, 0, 0]}
                maxBarSize={22}
              />
            </BarChart>
          </ResponsiveContainer>
        )}

        {isClient && monthlySpend === 0 && paidImagesCount === 0 ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="rounded-[6px] border border-[var(--border)] bg-[var(--card)]/95 px-3 py-1.5 text-[12px] text-[var(--muted-foreground)]">
              No paid model spending recorded in {formatMonthLabel(selectedMonth)}.
            </span>
          </div>
        ) : null}
      </div>
    </section>
  );
}
