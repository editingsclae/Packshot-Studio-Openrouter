'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  BarChart3,
  Camera,
  FolderOpen,
  Settings,
} from 'lucide-react';
import {
  getRecordSpendUsd,
  type GenerationRecord,
  type ModelCostStatsMap,
} from '@/lib/db';
import {
  findModelById,
  formatUsdCompact,
  type NormalizedImageModel,
} from '@/lib/models';
import { getShotPreset } from '@/lib/presets';
import { Button } from '@/components/ui/button';
import {
  formatMonthKey,
  formatMonthLabel,
  UsageHistoryChart,
} from '@/components/usage-history-chart';
import { cn } from '@/lib/utils';

interface UsageViewProps {
  records: GenerationRecord[];
  models: NormalizedImageModel[];
  costStats: ModelCostStatsMap;
  sessionSpendUsd: number;
  sessionSpendLimitUsd: number | null;
  initialMonthKey?: string;
  onGoToGenerate: () => void;
  onGoToLibrary: () => void;
  onGoToSettings: () => void;
}

type BreakdownScope = 'month' | 'all';

function formatRecordTimestamp(ts: number): string {
  return new Date(ts).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function UsageView({
  records,
  models,
  costStats,
  sessionSpendUsd,
  sessionSpendLimitUsd,
  initialMonthKey,
  onGoToGenerate,
  onGoToLibrary,
  onGoToSettings,
}: UsageViewProps) {
  const [selectedMonth, setSelectedMonth] = useState<string>(
    () => initialMonthKey ?? formatMonthKey(new Date())
  );
  const [currentMonthKey, setCurrentMonthKey] = useState<string>(
    () => initialMonthKey ?? formatMonthKey(new Date())
  );
  const [scope, setScope] = useState<BreakdownScope>('month');

  useEffect(() => {
    const localMonth = formatMonthKey(new Date());
    setCurrentMonthKey(localMonth);
    setSelectedMonth((prev) =>
      initialMonthKey && prev === initialMonthKey ? localMonth : prev
    );
  }, [initialMonthKey]);

  const lifetimeSpendUsd = useMemo(
    () => records.reduce((sum, rec) => sum + getRecordSpendUsd(rec), 0),
    [records]
  );

  const scopedRecords = useMemo(() => {
    if (scope === 'all') {
      return [...records].sort((a, b) => b.createdAt - a.createdAt);
    }
    const [yearStr, monthStr] = selectedMonth.split('-');
    const year = Number(yearStr);
    const monthIndex = Number(monthStr) - 1;
    return records
      .filter((rec) => {
        const d = new Date(rec.createdAt);
        return d.getFullYear() === year && d.getMonth() === monthIndex;
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [records, scope, selectedMonth]);

  const modelBreakdown = useMemo(() => {
    const byModel = new Map<
      string,
      {
        modelId: string;
        modelName: string;
        tier: 'free' | 'paid';
        batches: number;
        images: number;
        totalSpend: number;
      }
    >();

    for (const rec of scopedRecords) {
      const tier =
        rec.modelTier ?? (rec.modelId.endsWith(':free') ? 'free' : 'paid');
      const spend = tier === 'paid' ? getRecordSpendUsd(rec) : 0;
      const existing = byModel.get(rec.modelId);
      const resolvedName =
        findModelById(models, rec.modelId)?.name ?? rec.modelId;

      if (existing) {
        existing.batches += 1;
        existing.images += rec.images.length;
        existing.totalSpend += spend;
      } else {
        byModel.set(rec.modelId, {
          modelId: rec.modelId,
          modelName: resolvedName,
          tier,
          batches: 1,
          images: rec.images.length,
          totalSpend: spend,
        });
      }
    }

    return Array.from(byModel.values()).sort((a, b) => {
      if (b.totalSpend !== a.totalSpend) return b.totalSpend - a.totalSpend;
      return b.images - a.images;
    });
  }, [scopedRecords, models]);

  const scopeLabel =
    scope === 'month' ? formatMonthLabel(selectedMonth) : 'All time';

  return (
    <div className="mx-auto max-w-[1440px] px-4 sm:px-6 py-6 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between border-b border-[var(--border)] pb-5">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-[20px] font-semibold tracking-[-0.02em] text-[var(--foreground)]">
              Usage History
            </h1>
            <span className="rounded-[6px] border border-[var(--border)] bg-[var(--surface)] px-2.5 py-0.5 font-mono text-[12px] tabular-nums text-[var(--muted-foreground)]">
              Session:{' '}
              <span className="font-medium text-[var(--foreground)]">
                {formatUsdCompact(sessionSpendUsd)}
              </span>
            </span>
            <span className="rounded-[6px] border border-[var(--border)] bg-[var(--surface)] px-2.5 py-0.5 font-mono text-[12px] tabular-nums text-[var(--muted-foreground)]">
              Lifetime:{' '}
              <span className="font-medium text-[var(--foreground)]">
                {formatUsdCompact(lifetimeSpendUsd)}
              </span>
            </span>
            {sessionSpendLimitUsd !== null ? (
              <span className="rounded-[6px] border border-[var(--border)] bg-[var(--surface)] px-2.5 py-0.5 font-mono text-[12px] tabular-nums text-[var(--muted-foreground)]">
                Session limit:{' '}
                <span className="font-medium text-[var(--foreground)]">
                  {formatUsdCompact(sessionSpendLimitUsd)}
                </span>
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-[13px] text-[var(--muted-foreground)]">
            Track daily spending on paid image models, per-model cost averages, and recent generation activity.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="default" onClick={onGoToSettings}>
            <Settings className="h-3.5 w-3.5" />
            <span>Spend limit</span>
          </Button>
          <Button variant="secondary" size="default" onClick={onGoToLibrary}>
            <FolderOpen className="h-3.5 w-3.5" />
            <span>Library</span>
          </Button>
          <Button variant="default" size="default" onClick={onGoToGenerate}>
            <Camera className="h-3.5 w-3.5" />
            <span>New generation</span>
          </Button>
        </div>
      </div>

      {/* Primary Monthly Bar Chart */}
      <UsageHistoryChart
        records={records}
        models={models}
        selectedMonth={selectedMonth}
        currentMonthKey={currentMonthKey}
        onSelectedMonthChange={setSelectedMonth}
      />

      {/* Breakdown Scope Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-[var(--muted-foreground)]" />
          <h2 className="text-[14px] font-semibold tracking-[-0.02em] text-[var(--foreground)]">
            Detailed Breakdown
          </h2>
          <span className="font-mono text-[11px] text-[var(--muted-foreground)]">
            {scopeLabel}
          </span>
        </div>

        <div
          role="tablist"
          aria-label="Breakdown timeframe"
          className="grid grid-cols-2 rounded-[6px] border border-[var(--border)] bg-[var(--surface)] p-0.5"
        >
          {(
            [
              { id: 'month', label: 'Selected month' },
              { id: 'all', label: 'All time' },
            ] as const
          ).map((item) => {
            const active = scope === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setScope(item.id)}
                className={cn(
                  'h-7 rounded-[5px] px-3 text-[12px] font-medium transition-colors cursor-pointer whitespace-nowrap',
                  active
                    ? 'bg-[var(--foreground)] text-[var(--background)]'
                    : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                )}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Two-Column Breakdown: Model Cost Ledger + Recent Activity */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Spending by Model */}
        <section
          aria-labelledby="usage-by-model-heading"
          className="rounded-[12px] border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5 space-y-3"
        >
          <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] pb-3">
            <div>
              <h3
                id="usage-by-model-heading"
                className="text-[14px] font-semibold tracking-[-0.02em] text-[var(--foreground)]"
              >
                Spending by Model
              </h3>
              <p className="text-[11px] text-[var(--muted-foreground)]">
                Aggregated spend and learned per-image averages for {scopeLabel}.
              </p>
            </div>
            <span className="font-mono text-[11px] tabular-nums text-[var(--muted-foreground)]">
              {modelBreakdown.length}{' '}
              {modelBreakdown.length === 1 ? 'model' : 'models'}
            </span>
          </div>

          {modelBreakdown.length === 0 ? (
            <div className="py-10 text-center text-[12px] text-[var(--muted-foreground)]">
              No generations recorded in {scopeLabel}.
            </div>
          ) : (
            <div className="studio-scrollbar max-h-[360px] overflow-y-auto divide-y divide-[var(--border)] pr-1">
              {modelBreakdown.map((row) => {
                const learnedAvg = costStats[row.modelId]?.averageActualCost;
                const avgDisplay =
                  row.tier === 'free'
                    ? 'Free'
                    : typeof learnedAvg === 'number'
                      ? `~${formatUsdCompact(learnedAvg)} avg`
                      : row.images > 0 && row.totalSpend > 0
                        ? `~${formatUsdCompact(row.totalSpend / row.images)} avg`
                        : '—';

                return (
                  <div
                    key={row.modelId}
                    className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[13px] font-medium text-[var(--foreground)]">
                          {row.modelName}
                        </span>
                        <span className="shrink-0 rounded-[4px] border border-[var(--border)] bg-[var(--surface)] px-1.5 py-0.2 font-mono text-[10px] uppercase text-[var(--muted-foreground)]">
                          {row.tier}
                        </span>
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 font-mono text-[11px] tabular-nums text-[var(--muted-foreground)]">
                        <span>
                          {row.images} {row.images === 1 ? 'image' : 'images'}
                        </span>
                        <span>·</span>
                        <span>
                          {row.batches} {row.batches === 1 ? 'run' : 'runs'}
                        </span>
                        <span>·</span>
                        <span>{avgDisplay}</span>
                      </div>
                    </div>

                    <div className="shrink-0 text-right font-mono text-[13px] font-semibold tabular-nums text-[var(--foreground)]">
                      {row.tier === 'free'
                        ? '$0.00'
                        : formatUsdCompact(row.totalSpend)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Generation Activity Ledger */}
        <section
          aria-labelledby="usage-ledger-heading"
          className="rounded-[12px] border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5 space-y-3"
        >
          <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] pb-3">
            <div>
              <h3
                id="usage-ledger-heading"
                className="text-[14px] font-semibold tracking-[-0.02em] text-[var(--foreground)]"
              >
                Generation Ledger
              </h3>
              <p className="text-[11px] text-[var(--muted-foreground)]">
                Recent batches and actual reported OpenRouter charges.
              </p>
            </div>
            <button
              type="button"
              onClick={onGoToLibrary}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer transition-colors"
            >
              <span>View images</span>
              <ArrowUpRight className="h-3 w-3" />
            </button>
          </div>

          {scopedRecords.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <p className="text-[12px] text-[var(--muted-foreground)]">
                No generation batches found in {scopeLabel}.
              </p>
              <Button variant="secondary" size="sm" onClick={onGoToGenerate}>
                Generate packshots
              </Button>
            </div>
          ) : (
            <div className="studio-scrollbar max-h-[360px] overflow-y-auto divide-y divide-[var(--border)] pr-1">
              {scopedRecords.slice(0, 50).map((rec) => {
                const tier =
                  rec.modelTier ??
                  (rec.modelId.endsWith(':free') ? 'free' : 'paid');
                const spend = tier === 'paid' ? getRecordSpendUsd(rec) : 0;
                const modelName =
                  findModelById(models, rec.modelId)?.name ?? rec.modelId;
                const shotName = getShotPreset(rec.shotId).name;

                return (
                  <div
                    key={rec.id}
                    className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-[13px] font-medium text-[var(--foreground)]">
                          {rec.brief.name || 'Untitled product'}
                        </span>
                        {rec.multiViewSet ? (
                          <span className="shrink-0 rounded-[4px] border border-[var(--border)] bg-[var(--surface)] px-1.5 py-0.2 font-mono text-[10px] text-[var(--foreground)]">
                            Multi-view set
                          </span>
                        ) : null}
                        <span className="shrink-0 font-mono text-[10px] text-[var(--muted-foreground)]">
                          {shotName}
                        </span>
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 font-mono text-[11px] tabular-nums text-[var(--muted-foreground)]">
                        <span className="truncate max-w-[160px]">{modelName}</span>
                        <span>·</span>
                        <span>
                          {rec.images.length}{' '}
                          {rec.multiViewSet
                            ? rec.images.length === 1
                              ? 'view'
                              : 'views'
                            : rec.images.length === 1
                              ? 'shot'
                              : 'shots'}
                        </span>
                        <span>·</span>
                        <span>{formatRecordTimestamp(rec.createdAt)}</span>
                      </div>
                    </div>

                    <div className="shrink-0 text-right font-mono text-[12px] tabular-nums">
                      {tier === 'free' ? (
                        <span className="text-[var(--muted-foreground)]">
                          Free
                        </span>
                      ) : (
                        <span className="font-semibold text-[var(--foreground)]">
                          {formatUsdCompact(spend)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
