'use client';

import React from 'react';
import { RefreshCw } from 'lucide-react';
import {
  ASPECT_RATIOS,
  formatUsdCompact,
  type AspectRatio,
  type ModelTier,
  type NormalizedImageModel,
} from '@/lib/models';
import type { ModelCostStatsMap, StudioSettings } from '@/lib/db';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import {
  ModelSelector,
  type DiscoveryStatus,
} from '@/components/model-selector';
import { cn } from '@/lib/utils';

interface SettingsViewProps {
  settings: StudioSettings;
  onUpdateSettings: (patch: Partial<StudioSettings>) => void;
  models: NormalizedImageModel[];
  costStats: ModelCostStatsMap;
  sessionSpendUsd: number;
  onTierChange: (tier: ModelTier) => void;
  onSelectDefaultModel: (modelId: string) => void;
  inputMode: 'text' | 'photo';
  discoveryStatus: DiscoveryStatus;
  isLoadingModels: boolean;
  isRefreshingModels: boolean;
  onRefreshModels: () => void;
  serverStatus: {
    hasApiKey: boolean;
    enhancerModel: string;
  } | null;
}

export function SettingsView({
  settings,
  onUpdateSettings,
  models,
  costStats,
  sessionSpendUsd,
  onTierChange,
  onSelectDefaultModel,
  inputMode,
  discoveryStatus,
  isLoadingModels,
  isRefreshingModels,
  onRefreshModels,
  serverStatus,
}: SettingsViewProps) {
  const limitEnabled = settings.sessionSpendLimitUsd !== null;

  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 py-8 space-y-8">
      <div className="border-b border-[var(--border)] pb-5">
        <h1 className="text-[20px] font-semibold tracking-[-0.02em] text-[var(--foreground)]">
          Studio Settings
        </h1>
        <p className="mt-1 text-[13px] text-[var(--muted-foreground)]">
          Defaults are persisted locally in IndexedDB. API credentials stay strictly server-side in environment variables.
        </p>
      </div>

      {/* Default Generation Preferences */}
      <section className="space-y-5 rounded-[12px] border border-[var(--border)] bg-[var(--card)] p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-[var(--foreground)]">
            Generation Defaults
          </h2>

          <Button
            variant="secondary"
            size="sm"
            disabled={isRefreshingModels || isLoadingModels}
            onClick={onRefreshModels}
          >
            <RefreshCw
              className={cn(
                'h-3.5 w-3.5',
                (isRefreshingModels || isLoadingModels) && 'animate-spin'
              )}
            />
            <span>{isRefreshingModels ? 'Refreshing...' : 'Refresh models'}</span>
          </Button>
        </div>

        <div className="space-y-2">
          <Label>Model tier &amp; default model</Label>
          <ModelSelector
            models={models}
            tier={settings.modelTier}
            onTierChange={onTierChange}
            selectedModelId={settings.defaultModel}
            onSelectModel={onSelectDefaultModel}
            inputMode={inputMode}
            discoveryStatus={discoveryStatus}
            isLoadingModels={isLoadingModels}
            onRetryDiscovery={onRefreshModels}
            costStats={costStats}
          />
        </div>

        <div className="space-y-2">
          <Label>Default aspect ratio</Label>
          <div className="flex flex-wrap gap-2">
            {ASPECT_RATIOS.map((ar) => {
              const active = settings.defaultAspectRatio === ar.value;
              return (
                <button
                  key={ar.value}
                  type="button"
                  onClick={() =>
                    onUpdateSettings({ defaultAspectRatio: ar.value as AspectRatio })
                  }
                  className={cn(
                    'inline-flex h-9 items-center gap-2 rounded-[6px] border px-3 text-[13px] transition-colors duration-150 cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070f3]',
                    active
                      ? 'border-[var(--foreground)] bg-[var(--foreground)] text-[var(--background)] font-medium'
                      : 'border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] hover:border-[var(--border-hover)]'
                  )}
                >
                  <span className="font-mono text-[12px]">{ar.label}</span>
                  <span className="text-[11px] opacity-75">{ar.hint}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Optional Spend Limit Per Session */}
        <div className="border-t border-[var(--border)] pt-4 space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="spend-limit-switch" className="text-[13px] text-[var(--foreground)]">
                Spend limit per session
              </Label>
              <p className="mt-0.5 text-[12px] text-[var(--muted-foreground)]">
                Optional cap for this browser session. Blocks paid generations once session spend plus estimate exceeds the limit.
              </p>
            </div>
            <Switch
              id="spend-limit-switch"
              checked={limitEnabled}
              onCheckedChange={(checked) =>
                onUpdateSettings({
                  sessionSpendLimitUsd: checked ? 1.0 : null,
                })
              }
            />
          </div>

          {limitEnabled ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] p-3">
              <div className="flex items-center gap-2">
                <Label htmlFor="spend-limit-input" className="text-[12px] text-[var(--muted-foreground)]">
                  Max USD
                </Label>
                <div className="relative w-28">
                  <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 font-mono text-[12px] text-[var(--muted-foreground)]">
                    $
                  </span>
                  <Input
                    id="spend-limit-input"
                    type="number"
                    min="0.01"
                    step="0.25"
                    value={settings.sessionSpendLimitUsd ?? 1}
                    onChange={(e) => {
                      const raw = parseFloat(e.target.value);
                      if (Number.isFinite(raw) && raw > 0) {
                        onUpdateSettings({ sessionSpendLimitUsd: raw });
                      }
                    }}
                    className="h-8 pl-6 font-mono text-[12px] tabular-nums"
                  />
                </div>

                <div className="hidden sm:flex items-center gap-1">
                  {[0.5, 1, 2.5, 5].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => onUpdateSettings({ sessionSpendLimitUsd: preset })}
                      className={cn(
                        'h-7 rounded-[5px] border px-2 font-mono text-[11px] tabular-nums transition-colors cursor-pointer',
                        settings.sessionSpendLimitUsd === preset
                          ? 'border-[var(--foreground)] bg-[var(--foreground)] text-[var(--background)]'
                          : 'border-[var(--border)] bg-[var(--card)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                      )}
                    >
                      ${preset.toFixed(preset % 1 === 0 ? 0 : 2)}
                    </button>
                  ))}
                </div>
              </div>

              <span className="font-mono text-[11px] tabular-nums text-[var(--muted-foreground)]">
                Spent this session: {formatUsdCompact(sessionSpendUsd)}
              </span>
            </div>
          ) : null}
        </div>
      </section>

      {/* Workspace Appearance & Inspector */}
      <section className="space-y-4 rounded-[12px] border border-[var(--border)] bg-[var(--card)] p-5">
        <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-[var(--foreground)]">
          Workspace Interface
        </h2>

        <div className="flex items-center justify-between gap-4 border-b border-[var(--border)] pb-4">
          <div>
            <Label htmlFor="show-inspector-switch" className="text-[13px] text-[var(--foreground)]">
              Show Prompt Inspector
            </Label>
            <p className="mt-0.5 text-[12px] text-[var(--muted-foreground)]">
              Inspect and manually override the deterministic Realism Engine prompt before generating.
            </p>
          </div>
          <Switch
            id="show-inspector-switch"
            checked={settings.showPromptInspector}
            onCheckedChange={(checked) =>
              onUpdateSettings({ showPromptInspector: checked })
            }
          />
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <Label className="text-[13px] text-[var(--foreground)]">Theme</Label>
            <p className="mt-0.5 text-[12px] text-[var(--muted-foreground)]">
              Monochrome dark mode is recommended for evaluating studio highlights and pure white borders.
            </p>
          </div>
          <div className="flex items-center rounded-[6px] border border-[var(--border)] bg-[var(--surface)] p-0.5">
            {(['dark', 'light'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => onUpdateSettings({ theme: t })}
                className={cn(
                  'h-8 rounded-[5px] px-3 text-[12px] font-medium capitalize transition-colors cursor-pointer',
                  settings.theme === t
                    ? 'bg-[var(--foreground)] text-[var(--background)]'
                    : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Server Environment Configuration (read-only status) */}
      <section className="space-y-3 rounded-[12px] border border-[var(--border)] bg-[var(--card)] p-5">
        <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-[var(--foreground)]">
          Server Configuration
        </h2>
        <div className="space-y-2 text-[13px]">
          <div className="flex items-center justify-between border-b border-[var(--border)] pb-2">
            <span className="font-mono text-[12px] text-[var(--muted-foreground)]">
              OPENROUTER_API_KEY
            </span>
            <span className="font-mono text-[12px] text-[var(--foreground)]">
              {serverStatus === null
                ? 'Checking...'
                : serverStatus.hasApiKey
                  ? 'Configured (.env)'
                  : 'Not detected'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-mono text-[12px] text-[var(--muted-foreground)]">
              OPENROUTER_ENHANCER_MODEL
            </span>
            <span className="font-mono text-[12px] text-[var(--foreground)]">
              {serverStatus?.enhancerModel ?? 'openai/gpt-4o-mini'}
            </span>
          </div>
        </div>
        <p className="text-[12px] text-[var(--muted-foreground)]">
          Keys are read exclusively by Next.js Route Handlers and never exposed to client bundles.
        </p>
      </section>
    </div>
  );
}
