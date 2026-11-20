'use client';

import React, { useMemo, useState } from 'react';
import {
  Check,
  ChevronDown,
  Minus,
  Plus,
  Sliders,
  Sparkles,
} from 'lucide-react';
import {
  detectQualityModeForModel,
  formatPerImageShortPrice,
  QUALITY_MODE_CONFIGS,
  resolveQualityModeModel,
  type ModelTier,
  type NormalizedImageModel,
  type QualityModeId,
} from '@/lib/models';
import type { ModelCostStatsMap } from '@/lib/db';
import {
  ModelSelector,
  type DiscoveryStatus,
} from '@/components/model-selector';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface StepOutputProps {
  models: NormalizedImageModel[];
  tier: ModelTier;
  onTierChange: (tier: ModelTier) => void;
  selectedModel: NormalizedImageModel;
  onSelectModel: (modelId: string) => void;
  onSelectQualityMode: (modeId: QualityModeId, resolvedModel: NormalizedImageModel) => void;
  inputMode: 'text' | 'photo';
  discoveryStatus: DiscoveryStatus;
  isLoadingModels: boolean;
  onRetryDiscovery: () => void;
  costStats: ModelCostStatsMap;
  variations: number;
  onVariationsChange: (count: number) => void;
  enhanceEnabled: boolean;
  onEnhanceChange: (enabled: boolean) => void;
  resolution: string;
  onResolutionChange: (res: string) => void;
  effectiveQuality: string;
  onQualityChange: (quality: string) => void;
  backgroundMode: 'auto' | 'opaque' | 'transparent';
  onBackgroundModeChange: (bg: 'auto' | 'opaque' | 'transparent') => void;
  outputFormat: 'auto' | 'png' | 'webp' | 'jpeg' | 'svg';
  onOutputFormatChange: (fmt: 'auto' | 'png' | 'webp' | 'jpeg' | 'svg') => void;
  customSeed: string;
  onCustomSeedChange: (seed: string) => void;
}

export function StepOutput({
  models,
  tier,
  onTierChange,
  selectedModel,
  onSelectModel,
  onSelectQualityMode,
  inputMode,
  discoveryStatus,
  isLoadingModels,
  onRetryDiscovery,
  costStats,
  variations,
  onVariationsChange,
  enhanceEnabled,
  onEnhanceChange,
  resolution,
  onResolutionChange,
  effectiveQuality,
  onQualityChange,
  backgroundMode,
  onBackgroundModeChange,
  outputFormat,
  onOutputFormatChange,
  customSeed,
  onCustomSeedChange,
}: StepOutputProps) {
  const [manualModelOpen, setManualModelOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const activeQualityMode = useMemo(
    () => detectQualityModeForModel(selectedModel.id, models, inputMode),
    [selectedModel.id, models, inputMode]
  );

  const qualityOptions = useMemo(
    () =>
      QUALITY_MODE_CONFIGS.map((cfg) => ({
        ...cfg,
        resolvedModel: resolveQualityModeModel(cfg.id, models, inputMode),
      })),
    [models, inputMode]
  );

  const hasParam = (param: string) =>
    selectedModel.supportedParams.includes(param);

  const hasAnyAdvancedControls =
    hasParam('resolution') ||
    hasParam('quality') ||
    hasParam('background') ||
    hasParam('output_format') ||
    hasParam('seed');

  return (
    <div className="space-y-3.5">
      {/* Three Quality Mode Cards */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label>Quality mode</Label>
          {activeQualityMode === null ? (
            <span className="font-mono text-[10px] text-[var(--muted-foreground)]">
              Custom: {selectedModel.name}
            </span>
          ) : null}
        </div>

        <div className="grid grid-cols-3 gap-2">
          {qualityOptions.map((opt) => {
            const resolved = opt.resolvedModel;
            const isActive =
              resolved !== null &&
              selectedModel.id === resolved.id &&
              activeQualityMode === opt.id;
            const disabled = !resolved;

            return (
              <button
                key={opt.id}
                type="button"
                disabled={disabled}
                aria-pressed={isActive}
                onClick={() => {
                  if (!resolved) return;
                  onSelectQualityMode(opt.id, resolved);
                }}
                title={
                  resolved
                    ? `${opt.label}: uses ${resolved.name}`
                    : inputMode === 'photo'
                      ? 'No reference-capable model available on this tier'
                      : 'Unavailable on this server'
                }
                className={cn(
                  'flex flex-col items-start justify-between gap-1.5 rounded-[8px] border p-2.5 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070f3]',
                  disabled
                    ? 'border-[var(--border)] bg-[var(--surface)] opacity-45 cursor-not-allowed'
                    : isActive
                      ? 'border-[var(--foreground)] bg-[var(--surface)] cursor-pointer'
                      : 'border-[var(--border)] bg-[var(--background)] hover:border-[var(--border-hover)] cursor-pointer'
                )}
              >
                <div className="flex w-full items-center justify-between gap-1">
                  <span className="text-[12px] font-semibold text-[var(--foreground)]">
                    {opt.label}
                  </span>
                  {isActive ? (
                    <Check className="h-3.5 w-3.5 shrink-0 text-[var(--foreground)]" />
                  ) : null}
                </div>

                <div className="w-full space-y-0.5">
                  <div className="truncate text-[10px] text-[var(--muted-foreground)]">
                    {resolved ? resolved.name : 'Unavailable'}
                  </div>
                  <div className="font-mono text-[11px] font-medium tabular-nums text-[var(--foreground)]">
                    {resolved
                      ? formatPerImageShortPrice(resolved, costStats[resolved.id])
                      : '—'}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* "Choose model manually" link */}
        <div className="flex items-center justify-between gap-2 pt-0.5">
          <span className="text-[11px] text-[var(--muted-foreground)] truncate">
            Active:{' '}
            <span className="font-medium text-[var(--foreground)]">
              {selectedModel.name}
            </span>
          </span>
          <button
            type="button"
            aria-expanded={manualModelOpen}
            onClick={() => setManualModelOpen((prev) => !prev)}
            className="shrink-0 text-[11px] font-medium text-[#0070f3] hover:underline cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070f3] rounded-[3px]"
          >
            {manualModelOpen ? 'Hide model list' : 'Choose model manually'}
          </button>
        </div>

        {manualModelOpen ? (
          <div className="rounded-[8px] border border-[var(--border)] bg-[var(--surface)]/50 p-2.5">
            <ModelSelector
              models={models}
              tier={tier}
              onTierChange={onTierChange}
              selectedModelId={selectedModel.id}
              onSelectModel={onSelectModel}
              inputMode={inputMode}
              discoveryStatus={discoveryStatus}
              isLoadingModels={isLoadingModels}
              onRetryDiscovery={onRetryDiscovery}
              costStats={costStats}
              compact
            />
          </div>
        ) : null}
      </div>

      {/* Variations (1..4) Stepper */}
      <div className="flex items-center justify-between gap-3 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2">
        <div>
          <Label className="text-[12px] font-medium text-[var(--foreground)]">
            Variations
          </Label>
          <p className="text-[10px] text-[var(--muted-foreground)]">
            Images generated per shot (1–4)
          </p>
        </div>

        <div className="inline-flex items-center gap-1 rounded-[6px] border border-[var(--border)] bg-[var(--card)] p-0.5">
          <button
            type="button"
            aria-label="Decrease variations"
            disabled={variations <= 1}
            onClick={() => onVariationsChange(Math.max(1, variations - 1))}
            className="inline-flex h-7 w-7 items-center justify-center rounded-[5px] text-[var(--foreground)] hover:bg-[var(--surface)] disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer transition-colors"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <span
            aria-live="polite"
            className="w-7 text-center font-mono text-[12px] font-semibold tabular-nums text-[var(--foreground)]"
          >
            {variations}
          </span>
          <button
            type="button"
            aria-label="Increase variations"
            disabled={variations >= 4}
            onClick={() => onVariationsChange(Math.min(4, variations + 1))}
            className="inline-flex h-7 w-7 items-center justify-center rounded-[5px] text-[var(--foreground)] hover:bg-[var(--surface)] disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Enhance with AI switch + 1-line explanation */}
      <div className="flex items-center justify-between gap-3 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2">
        <div className="min-w-0">
          <Label
            htmlFor="enhance-switch"
            className="flex items-center gap-1.5 text-[12px] font-medium text-[var(--foreground)] cursor-pointer"
          >
            <Sparkles className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
            <span>Enhance with AI</span>
          </Label>
          <p className="text-[10px] text-[var(--muted-foreground)]">
            Refines studio lighting and material language automatically
          </p>
        </div>
        <Switch
          id="enhance-switch"
          checked={enhanceEnabled}
          onCheckedChange={onEnhanceChange}
        />
      </div>

      {/* Collapsed Advanced Section (only parameters supported by current model) */}
      {hasAnyAdvancedControls ? (
        <div className="rounded-[8px] border border-[var(--border)] bg-[var(--surface)]/50">
          <button
            type="button"
            aria-expanded={advancedOpen}
            onClick={() => setAdvancedOpen((prev) => !prev)}
            className="flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070f3] rounded-[8px]"
          >
            <span className="flex items-center gap-1.5 text-[12px] font-medium text-[var(--foreground)]">
              <Sliders className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
              <span>Advanced</span>
            </span>
            <ChevronDown
              className={cn(
                'h-4 w-4 text-[var(--muted-foreground)] transition-transform duration-150',
                advancedOpen && 'rotate-180'
              )}
            />
          </button>

          <div
            className={cn(
              'grid transition-[grid-template-rows] duration-150 ease-out',
              advancedOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
            )}
          >
            <div className="overflow-hidden">
              <div className="border-t border-[var(--border)] px-2.5 py-3 grid grid-cols-2 gap-2.5">
                {hasParam('resolution') ? (
                  <div className="space-y-1">
                    <Label htmlFor="resolution-select">Resolution</Label>
                    <Select value={resolution} onValueChange={onResolutionChange}>
                      <SelectTrigger id="resolution-select" className="h-8 text-[12px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">Auto</SelectItem>
                        {(selectedModel.supportedResolutions ?? ['1K', '2K']).map(
                          (resOpt) => (
                            <SelectItem key={resOpt} value={resOpt}>
                              {resOpt}
                            </SelectItem>
                          )
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}

                {hasParam('quality') ? (
                  <div className="space-y-1">
                    <Label htmlFor="quality-select">Quality</Label>
                    <Select value={effectiveQuality} onValueChange={onQualityChange}>
                      <SelectTrigger id="quality-select" className="h-8 text-[12px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">Auto</SelectItem>
                        {(selectedModel.supportedQualities ?? ['low', 'medium', 'high']).map(
                          (qOpt) => (
                            <SelectItem key={qOpt} value={qOpt}>
                              {qOpt}
                            </SelectItem>
                          )
                        )}
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] leading-snug text-[var(--muted-foreground)]">
                      Medium default keeps costs low.
                    </p>
                  </div>
                ) : null}

                {hasParam('background') ? (
                  <div className="space-y-1">
                    <Label htmlFor="background-select">Background</Label>
                    <Select
                      value={backgroundMode}
                      onValueChange={(val) =>
                        onBackgroundModeChange(val as 'auto' | 'opaque' | 'transparent')
                      }
                    >
                      <SelectTrigger id="background-select" className="h-8 text-[12px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">Auto</SelectItem>
                        {(selectedModel.supportedBackgrounds ?? ['opaque', 'transparent']).map(
                          (bgOpt) => (
                            <SelectItem key={bgOpt} value={bgOpt}>
                              {bgOpt}
                            </SelectItem>
                          )
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}

                {hasParam('output_format') ? (
                  <div className="space-y-1">
                    <Label htmlFor="output-format-select">Format</Label>
                    <Select
                      value={outputFormat}
                      onValueChange={(val) =>
                        onOutputFormatChange(
                          val as 'auto' | 'png' | 'webp' | 'jpeg' | 'svg'
                        )
                      }
                    >
                      <SelectTrigger id="output-format-select" className="h-8 text-[12px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">Auto</SelectItem>
                        {(selectedModel.supportedOutputFormats ?? ['png', 'webp', 'jpeg'])
                          .filter((f) => ['png', 'webp', 'jpeg', 'svg'].includes(f.toLowerCase()))
                          .map((fmt) => (
                            <SelectItem key={fmt} value={fmt.toLowerCase()}>
                              {fmt.toUpperCase()}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}

                {hasParam('seed') ? (
                  <div className="space-y-1">
                    <Label htmlFor="seed-input">Seed (optional)</Label>
                    <Input
                      id="seed-input"
                      value={customSeed}
                      onChange={(e) =>
                        onCustomSeedChange(e.target.value.replace(/[^0-9]/g, '').slice(0, 9))
                      }
                      placeholder="Random"
                      className="h-8 font-mono text-[12px]"
                    />
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
