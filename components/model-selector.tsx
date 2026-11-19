'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  ChevronDown,
  HelpCircle,
  RefreshCw,
  Search,
  Sparkles,
  WifiOff,
} from 'lucide-react';
import {
  formatModelPrice,
  groupModelsByProvider,
  isRecommendedProductModel,
  pickPreferredDefaultModel,
  type DiscoverySource,
  type ModelTier,
  type NormalizedImageModel,
} from '@/lib/models';
import type { ModelCostStatsMap } from '@/lib/db';
import { Input } from '@/components/ui/input';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export interface DiscoveryStatus {
  source: DiscoverySource;
  updatedAt: number;
  error?: string;
  failedCount: number;
}

interface ModelSelectorProps {
  models: NormalizedImageModel[];
  tier: ModelTier;
  onTierChange: (tier: ModelTier) => void;
  selectedModelId: string;
  onSelectModel: (modelId: string) => void;
  inputMode: 'text' | 'photo';
  discoveryStatus: DiscoveryStatus;
  isLoadingModels: boolean;
  onRetryDiscovery: () => void;
  costStats?: ModelCostStatsMap;
  label?: string;
  compact?: boolean;
}

function formatCacheAge(updatedAt: number): string {
  const diffMin = Math.max(0, Math.round((Date.now() - updatedAt) / 60_000));
  if (diffMin < 1) return 'Cached just now';
  if (diffMin === 1) return 'Cached from 1 min ago';
  return `Cached from ${diffMin} min ago`;
}

export function ModelSelector({
  models,
  tier,
  onTierChange,
  selectedModelId,
  onSelectModel,
  inputMode,
  discoveryStatus,
  isLoadingModels,
  onRetryDiscovery,
  costStats,
  label,
  compact = false,
}: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [recommendedOnly, setRecommendedOnly] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const freeCount = useMemo(
    () => models.filter((m) => m.tier === 'free').length,
    [models]
  );
  const paidCount = useMemo(
    () => models.filter((m) => m.tier === 'paid').length,
    [models]
  );

  const tierModels = useMemo(
    () => models.filter((m) => m.tier === tier),
    [models, tier]
  );

  const recommendedInTierCount = useMemo(
    () => tierModels.filter((m) => isRecommendedProductModel(m.id)).length,
    [tierModels]
  );

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const baseList = recommendedOnly
      ? tierModels.filter((m) => isRecommendedProductModel(m.id))
      : tierModels;
    const list = q
      ? baseList.filter(
          (m) =>
            m.name.toLowerCase().includes(q) ||
            m.id.toLowerCase().includes(q) ||
            m.providerLabel.toLowerCase().includes(q) ||
            m.provider.toLowerCase().includes(q)
        )
      : baseList;
    return groupModelsByProvider(list);
  }, [tierModels, recommendedOnly, search]);

  const selectedModel = useMemo(
    () =>
      models.find((m) => m.id === selectedModelId) ??
      pickPreferredDefaultModel(tierModels, { tier, inputMode }) ??
      tierModels[0],
    [models, selectedModelId, tierModels, tier, inputMode]
  );

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    window.addEventListener('keydown', handleEsc);
    const t = setTimeout(() => searchInputRef.current?.focus(), 20);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="space-y-2.5">
      {/* Real Discovery Status Banner */}
      {isLoadingModels ? (
        <div className="flex items-center justify-between rounded-[6px] border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5">
          <span className="h-3 w-28 animate-pulse rounded bg-[var(--muted)]" />
          <span className="h-3 w-12 animate-pulse rounded bg-[var(--muted)]" />
        </div>
      ) : discoveryStatus.source === 'offline' ? (
        <div className="flex items-center justify-between gap-2 rounded-[6px] border border-amber-500/40 bg-[var(--surface)] px-2.5 py-1.5 text-[11px] text-amber-500">
          <span className="flex items-center gap-1.5 min-w-0">
            <WifiOff className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              Offline list (reason: {discoveryStatus.error || 'network error'})
            </span>
          </span>
          <button
            type="button"
            onClick={onRetryDiscovery}
            className="inline-flex items-center gap-1 rounded-[4px] border border-amber-500/40 px-1.5 py-0.5 font-medium text-amber-500 hover:bg-amber-500/10 cursor-pointer shrink-0"
          >
            <RefreshCw className="h-2.5 w-2.5" />
            <span>Retry</span>
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2 rounded-[6px] border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-[11px] text-[var(--muted-foreground)]">
          <span className="font-mono tabular-nums">
            {discoveryStatus.source === 'live'
              ? `Live: ${models.length} models`
              : formatCacheAge(discoveryStatus.updatedAt)}
          </span>
          {discoveryStatus.failedCount > 0 ? (
            <span className="font-mono text-[10px] text-[var(--muted-foreground)]">
              {discoveryStatus.failedCount} partial
            </span>
          ) : null}
        </div>
      )}

      {/* Segmented Free | Paid Tier Toggle */}
      <div className="flex items-center justify-between gap-2">
        {label ? (
          <span className="text-[12px] font-medium text-[var(--muted-foreground)]">
            {label}
          </span>
        ) : null}

        <div
          role="tablist"
          aria-label="Model pricing tier"
          className={cn(
            'grid grid-cols-2 rounded-[6px] border border-[var(--border)] bg-[var(--surface)] p-0.5',
            label ? 'w-44' : 'w-full'
          )}
        >
          {(['free', 'paid'] as const).map((t) => {
            const active = tier === t;
            const count = t === 'free' ? freeCount : paidCount;
            return (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setSearch('');
                  setOpen(false);
                  onTierChange(t);
                }}
                className={cn(
                  'inline-flex h-7 items-center justify-center gap-1.5 rounded-[5px] px-2.5 text-[12px] font-medium capitalize transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070f3]',
                  active
                    ? 'bg-[var(--foreground)] text-[var(--background)]'
                    : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                )}
              >
                <span>{t}</span>
                <span className="font-mono text-[10px] opacity-70 tabular-nums">
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Loading Skeleton for Picker */}
      {isLoadingModels ? (
        <div className="space-y-2 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] p-3">
          <div className="h-4 w-2/3 animate-pulse rounded bg-[var(--muted)]" />
          <div className="h-3 w-full animate-pulse rounded bg-[var(--muted)]" />
        </div>
      ) : tier === 'free' && tierModels.length === 0 ? (
        /* Empty Free List Notice */
        <div className="rounded-[8px] border border-[var(--border)] bg-[var(--surface)] p-3 text-[12px] space-y-2">
          <div className="flex items-start gap-2 text-[var(--foreground)]">
            <AlertCircle className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" />
            <span>
              Free image models rotate frequently on OpenRouter and none are active right now.
              Switch to Paid to browse all available models.
            </span>
          </div>
          <button
            type="button"
            onClick={() => onTierChange('paid')}
            className="inline-flex h-7 items-center rounded-[6px] border border-[var(--border)] bg-[var(--card)] px-2.5 text-[12px] font-medium text-[var(--foreground)] hover:border-[var(--border-hover)] cursor-pointer"
          >
            Switch to Paid
          </button>
        </div>
      ) : (
        /* Searchable Provider-Grouped Model Dropdown */
        <div className="relative">
          <button
            type="button"
            aria-expanded={open}
            aria-haspopup="listbox"
            onClick={() => setOpen((prev) => !prev)}
            className={cn(
              'flex w-full items-center justify-between gap-2 rounded-[6px] border border-[var(--border)] bg-[var(--surface)] px-3 text-left text-[13px] text-[var(--foreground)] transition-colors duration-150 hover:border-[var(--border-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070f3] cursor-pointer',
              compact ? 'h-9' : 'h-10'
            )}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="truncate font-medium">
                {selectedModel ? selectedModel.name : 'Select model'}
              </span>
              {selectedModel ? (
                <span className="font-mono text-[11px] text-[var(--muted-foreground)] shrink-0 tabular-nums">
                  {formatModelPrice(selectedModel, costStats?.[selectedModel.id])}
                </span>
              ) : null}
            </div>
            <ChevronDown
              className={cn(
                'h-3.5 w-3.5 shrink-0 text-[var(--muted-foreground)] transition-transform duration-150',
                open && 'rotate-180'
              )}
            />
          </button>

          {open ? (
            <div className="absolute left-0 right-0 z-50 mt-1.5 overflow-hidden rounded-[8px] border border-[var(--border)] bg-[var(--card)]">
              <div className="border-b border-[var(--border)] p-2 space-y-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--muted-foreground)]" />
                  <Input
                    ref={searchInputRef}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={`Filter ${tier} models or providers...`}
                    className="h-8 pl-8 text-[12px]"
                  />
                </div>

                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    aria-pressed={recommendedOnly}
                    onClick={() => setRecommendedOnly((prev) => !prev)}
                    className={cn(
                      'inline-flex h-6 items-center gap-1.5 rounded-[5px] border px-2 text-[11px] font-medium transition-colors cursor-pointer',
                      recommendedOnly
                        ? 'border-[var(--foreground)] bg-[var(--foreground)] text-[var(--background)]'
                        : 'border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)] hover:border-[var(--border-hover)] hover:text-[var(--foreground)]'
                    )}
                  >
                    <Sparkles className="h-3 w-3" />
                    <span>Recommended</span>
                    <span className="font-mono text-[10px] opacity-75 tabular-nums">
                      {recommendedInTierCount}
                    </span>
                  </button>

                  {recommendedOnly ? (
                    <button
                      type="button"
                      onClick={() => setRecommendedOnly(false)}
                      className="text-[11px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer"
                    >
                      Show all
                    </button>
                  ) : null}
                </div>
              </div>

              <div
                role="listbox"
                className="studio-scrollbar max-h-72 overflow-y-auto p-1.5 space-y-2"
              >
                {filteredGroups.length === 0 ? (
                  <div className="py-6 px-3 text-center space-y-2">
                    <p className="text-[12px] text-[var(--muted-foreground)]">
                      {recommendedOnly && recommendedInTierCount === 0
                        ? `No recommended product models in the ${tier} tier.`
                        : `No matching ${tier} models found.`}
                    </p>
                    {recommendedOnly && recommendedInTierCount === 0 && tier === 'free' ? (
                      <button
                        type="button"
                        onClick={() => onTierChange('paid')}
                        className="inline-flex h-7 items-center rounded-[6px] border border-[var(--border)] bg-[var(--surface)] px-2.5 text-[11px] font-medium text-[var(--foreground)] hover:border-[var(--border-hover)] cursor-pointer"
                      >
                        Switch to Paid tier
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <TooltipProvider delayDuration={150}>
                    {filteredGroups.map((group) => (
                      <div key={group.providerLabel} className="space-y-0.5">
                        <div className="px-2 py-1 font-mono text-[10px] font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
                          {group.providerLabel}
                        </div>
                        {group.models.map((m) => {
                          const isSelected = m.id === selectedModelId;
                          const isDisabled =
                            m.requiresReference && inputMode === 'text';
                          const isRecommended = isRecommendedProductModel(m.id);
                          const mStats = costStats?.[m.id];

                          return (
                            <button
                              key={m.id}
                              type="button"
                              role="option"
                              aria-selected={isSelected}
                              disabled={isDisabled}
                              onClick={() => {
                                if (isDisabled) return;
                                onSelectModel(m.id);
                                setOpen(false);
                                setSearch('');
                              }}
                              className={cn(
                                'flex w-full items-start justify-between gap-2 rounded-[6px] px-2 py-2 text-left transition-colors',
                                isDisabled
                                  ? 'opacity-45 cursor-not-allowed'
                                  : isSelected
                                    ? 'bg-[var(--muted)] text-[var(--foreground)] cursor-pointer'
                                    : 'text-[var(--foreground)] hover:bg-[var(--surface)] cursor-pointer'
                              )}
                            >
                              <div className="flex items-start gap-2 min-w-0">
                                <span className="mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                                  {isSelected ? <Check className="h-3.5 w-3.5" /> : null}
                                </span>
                                <div className="min-w-0 space-y-1">
                                  <div className="truncate text-[12px] font-medium">
                                    {m.name}
                                  </div>
                                  {(isRecommended ||
                                    m.requiresReference ||
                                    m.supportsReference ||
                                    m.supportsSvg ||
                                    m.badge) ? (
                                    <div className="flex flex-wrap items-center gap-1">
                                      {isRecommended ? (
                                        <span className="rounded-[4px] border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-500">
                                          Recommended for products
                                        </span>
                                      ) : null}
                                      {m.requiresReference ? (
                                        <span className="rounded-[4px] border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-500">
                                          Needs reference image
                                        </span>
                                      ) : null}
                                      {m.supportsReference ? (
                                        <span className="rounded-[4px] border border-[var(--border)] bg-[var(--background)] px-1.5 py-0.5 text-[10px] text-[var(--muted-foreground)]">
                                          {m.maxReferences > 1
                                            ? `up to ${m.maxReferences} photos`
                                            : '1 reference photo'}
                                        </span>
                                      ) : null}
                                      {m.supportsSvg ? (
                                        <span className="rounded-[4px] border border-[var(--border)] bg-[var(--background)] px-1.5 py-0.5 text-[10px] text-[var(--muted-foreground)]">
                                          SVG output
                                        </span>
                                      ) : null}
                                      {m.badge ? (
                                        <span className="rounded-[4px] border border-[var(--border)] bg-[var(--background)] px-1.5 py-0.5 text-[10px] text-[var(--muted-foreground)]">
                                          {m.badge}
                                        </span>
                                      ) : null}
                                    </div>
                                  ) : null}
                                </div>
                              </div>

                              <div className="flex items-center gap-1 shrink-0 pt-0.5">
                                <span className="font-mono text-[11px] text-[var(--muted-foreground)] tabular-nums">
                                  {formatModelPrice(m, mStats)}
                                </span>
                                {m.priceUsd === null &&
                                m.priceUnverified &&
                                !(mStats && mStats.count > 0) ? (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="inline-flex text-[var(--muted-foreground)]">
                                        <HelpCircle className="h-3 w-3" />
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      Unverified: endpoint pricing lookup timed out or failed.
                                    </TooltipContent>
                                  </Tooltip>
                                ) : null}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </TooltipProvider>
                )}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* Active Model Details Summary Card */}
      {!isLoadingModels && selectedModel && tierModels.length > 0 ? (
        <div className="rounded-[8px] border border-[var(--border)] bg-[var(--surface)] p-2.5 text-[12px]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 font-mono text-[11px] text-[var(--foreground)] tabular-nums">
              <span>
                {selectedModel.providerLabel} ·{' '}
                {formatModelPrice(selectedModel, costStats?.[selectedModel.id])}
              </span>
              {selectedModel.priceUsd === null &&
              selectedModel.priceUnverified &&
              !(costStats?.[selectedModel.id]?.count) ? (
                <TooltipProvider delayDuration={150}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="rounded-[4px] border border-[var(--border)] px-1 py-0.5 text-[10px] text-[var(--muted-foreground)] cursor-help">
                        unverified
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      Pricing could not be verified from OpenRouter endpoints.
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : null}
            </span>

            <div className="flex flex-wrap items-center gap-1">
              {isRecommendedProductModel(selectedModel.id) ? (
                <span className="rounded-[4px] border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-500">
                  Recommended for products
                </span>
              ) : null}
              {selectedModel.requiresReference ? (
                <span className="rounded-[4px] border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-500">
                  Needs reference image
                </span>
              ) : null}
              {selectedModel.supportsReference ? (
                <span className="rounded-[4px] border border-[var(--border)] bg-[var(--card)] px-1.5 py-0.5 text-[10px] text-[var(--muted-foreground)]">
                  {selectedModel.maxReferences > 1
                    ? `up to ${selectedModel.maxReferences} photos`
                    : '1 reference photo'}
                </span>
              ) : null}
              {selectedModel.supportsSvg ? (
                <span className="rounded-[4px] border border-[var(--border)] bg-[var(--card)] px-1.5 py-0.5 text-[10px] text-[var(--muted-foreground)]">
                  SVG output
                </span>
              ) : null}
              {selectedModel.badge ? (
                <span className="rounded-[4px] border border-[var(--border)] bg-[var(--card)] px-1.5 py-0.5 text-[10px] text-[var(--foreground)]">
                  {selectedModel.badge}
                </span>
              ) : null}
            </div>
          </div>
          {selectedModel.description ? (
            <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-[var(--muted-foreground)]">
              {selectedModel.description}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
