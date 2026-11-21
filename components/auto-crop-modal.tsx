'use client';

import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Crop,
  Crosshair,
  Eye,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import {
  MARKETPLACE_ALIGN_PRESETS,
  autoCropAndCenterImage,
  getMarketplaceAlignPreset,
  type AlignBackdropMode,
  type AlignCanvasMode,
  type AutoCropResult,
  type MarketplaceAlignPresetId,
} from '@/lib/packshot-crop';
import type { GeneratedImageItem } from '@/lib/db';
import {
  formatPackshotBackgroundLabel,
  type PackshotCheckResult,
} from '@/lib/packshot-check';
import { StudioModal } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface AutoCropModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  image: GeneratedImageItem | null;
  productName: string;
  initialPresetId?: MarketplaceAlignPresetId;
  onApplyAlignment: (patch: {
    dataUrl: string;
    mediaType: string;
    packshotCheck: PackshotCheckResult;
    alignedLabel: string;
  }) => void;
  onRevertOriginal: () => void;
}

export function AutoCropModal({
  open,
  onOpenChange,
  image,
  productName,
  initialPresetId = 'amazon',
  onApplyAlignment,
  onRevertOriginal,
}: AutoCropModalProps) {
  const initialPreset = getMarketplaceAlignPreset(initialPresetId);

  const [presetId, setPresetId] =
    useState<MarketplaceAlignPresetId | 'custom'>(initialPreset.id);
  const [targetFillPercent, setTargetFillPercent] = useState<number>(
    Math.round(initialPreset.targetFill * 100)
  );
  const [canvasMode, setCanvasMode] = useState<AlignCanvasMode>(
    initialPreset.canvasMode
  );
  const [backdropMode, setBackdropMode] = useState<AlignBackdropMode>(
    initialPreset.backdropMode
  );
  const [showGuides, setShowGuides] = useState(true);
  const [compareOriginal, setCompareOriginal] = useState(false);

  const [previewState, setPreviewState] = useState<{
    configKey: string;
    result: AutoCropResult | null;
    error: string | null;
  } | null>(null);

  const sourceDataUrl = image ? image.originalDataUrl ?? image.dataUrl : '';
  const configKey = open && sourceDataUrl
    ? `${image?.id ?? 'none'}::${targetFillPercent}::${canvasMode}::${backdropMode}`
    : '';

  const isComputing = Boolean(
    open && configKey && previewState?.configKey !== configKey
  );
  const activeResult =
    previewState?.configKey === configKey ? previewState.result : null;
  const activeError =
    previewState?.configKey === configKey ? previewState.error : null;

  useEffect(() => {
    if (!open || !sourceDataUrl || !configKey) return;
    let cancelled = false;

    const timer = setTimeout(() => {
      void autoCropAndCenterImage(sourceDataUrl, {
        targetFill: targetFillPercent / 100,
        canvasMode,
        backdropMode,
      })
        .then((res) => {
          if (!cancelled) {
            setPreviewState({ configKey, result: res, error: null });
          }
        })
        .catch((err) => {
          if (!cancelled) {
            setPreviewState({
              configKey,
              result: null,
              error:
                err instanceof Error
                  ? err.message
                  : 'Failed to analyze and crop image',
            });
          }
        });
    }, 60);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, sourceDataUrl, configKey, targetFillPercent, canvasMode, backdropMode]);

  if (!image) return null;

  const selectPreset = (id: MarketplaceAlignPresetId) => {
    const p = getMarketplaceAlignPreset(id);
    setPresetId(p.id);
    setTargetFillPercent(Math.round(p.targetFill * 100));
    setCanvasMode(p.canvasMode);
    setBackdropMode(p.backdropMode);
    setCompareOriginal(false);
  };

  const displaySrc = compareOriginal
    ? sourceDataUrl
    : activeResult?.dataUrl ?? image.dataUrl;

  const safeMarginPct = Math.max(3, (100 - targetFillPercent) / 2);

  const appliedLabel =
    presetId !== 'custom'
      ? getMarketplaceAlignPreset(presetId).shortLabel
      : `Aligned ${targetFillPercent}%`;

  const displayCheck = compareOriginal
    ? image.packshotCheck
    : activeResult?.packshotCheck ?? image.packshotCheck;

  return (
    <StudioModal
      open={open}
      onOpenChange={onOpenChange}
      title="Marketplace Auto-Crop & Object Centering"
      className="max-w-4xl overflow-hidden p-0"
    >
      <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_340px]">
        {/* Left: Live Alignment Preview Canvas */}
        <div className="relative flex flex-col justify-between bg-[var(--surface)] border-b lg:border-b-0 lg:border-r border-[var(--border)] p-4 sm:p-5 gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Crop className="h-4 w-4 text-[var(--muted-foreground)]" />
              <span className="text-[13px] font-semibold text-[var(--foreground)]">
                {productName || 'Product'} Alignment
              </span>
              {activeResult ? (
                <span className="font-mono text-[11px] tabular-nums text-[var(--muted-foreground)]">
                  {activeResult.width}×{activeResult.height}px
                </span>
              ) : null}
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                aria-pressed={showGuides}
                onClick={() => setShowGuides((prev) => !prev)}
                className={cn(
                  'inline-flex h-7 items-center gap-1 rounded-[5px] border px-2 text-[11px] font-medium transition-colors cursor-pointer',
                  showGuides
                    ? 'border-[var(--foreground)] bg-[var(--foreground)] text-[var(--background)]'
                    : 'border-[var(--border)] bg-[var(--card)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                )}
              >
                <Crosshair className="h-3 w-3" />
                <span>Guides</span>
              </button>

              <button
                type="button"
                aria-pressed={compareOriginal}
                onClick={() => setCompareOriginal((prev) => !prev)}
                className={cn(
                  'inline-flex h-7 items-center gap-1 rounded-[5px] border px-2 text-[11px] font-medium transition-colors cursor-pointer',
                  compareOriginal
                    ? 'border-[var(--foreground)] bg-[var(--foreground)] text-[var(--background)]'
                    : 'border-[var(--border)] bg-[var(--card)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                )}
              >
                <Eye className="h-3 w-3" />
                <span>{compareOriginal ? 'Original' : 'Compare'}</span>
              </button>
            </div>
          </div>

          <div className="relative mx-auto flex aspect-square w-full max-w-[440px] items-center justify-center overflow-hidden rounded-[10px] border border-[var(--border)] bg-[var(--card)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={displaySrc}
              alt={productName || 'Aligned product preview'}
              referrerPolicy="no-referrer"
              className="h-full w-full object-contain"
            />

            {/* Safe-zone & Center Crosshair Overlay */}
            {showGuides ? (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0"
              >
                {/* Center Axes */}
                <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 border-l border-dashed border-[#0070f3]/65" />
                <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 border-t border-dashed border-[#0070f3]/65" />

                {/* Target Fill Safe-Zone Frame */}
                <div
                  className="absolute rounded-[2px] border border-dashed border-emerald-500/80"
                  style={{
                    top: `${safeMarginPct}%`,
                    bottom: `${safeMarginPct}%`,
                    left: `${safeMarginPct}%`,
                    right: `${safeMarginPct}%`,
                  }}
                >
                  <span className="absolute -top-4 left-0 rounded-[3px] bg-emerald-500/90 px-1 py-0.5 font-mono text-[9px] font-medium text-white">
                    {targetFillPercent}% SAFE FRAME
                  </span>
                </div>
              </div>
            ) : null}

            {isComputing ? (
              <div className="absolute bottom-2.5 right-2.5 rounded-[5px] border border-[var(--border)] bg-[var(--card)]/90 px-2 py-1 font-mono text-[10px] text-[var(--foreground)] backdrop-blur-sm">
                Centering...
              </div>
            ) : null}
          </div>

          {activeError ? (
            <p className="text-[11px] text-red-500">{activeError}</p>
          ) : (
            <p className="text-[11px] text-[var(--muted-foreground)]">
              {compareOriginal
                ? 'Viewing uncropped original image.'
                : `Auto-detected product bounds centered cleanly within ${targetFillPercent}% target zone.`}
            </p>
          )}
        </div>

        {/* Right: Marketplace Standards & Fine Controls */}
        <div className="flex flex-col justify-between gap-5 p-5 pr-12 lg:pr-5">
          <div className="space-y-4">
            <div className="space-y-1">
              <h3 className="text-[15px] font-semibold tracking-[-0.02em] text-[var(--foreground)]">
                Auto-Crop &amp; Center
              </h3>
              <p className="text-[12px] text-[var(--muted-foreground)]">
                Align product geometry and margins for Amazon, Shopify, and catalog feeds.
              </p>
            </div>

            {/* Marketplace Presets */}
            <div className="space-y-1.5">
              <Label>Marketplace standard</Label>
              <div className="grid grid-cols-1 gap-1.5">
                {MARKETPLACE_ALIGN_PRESETS.map((preset) => {
                  const active = presetId === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => selectPreset(preset.id)}
                      className={cn(
                        'flex flex-col rounded-[8px] border px-3 py-2 text-left transition-colors cursor-pointer',
                        active
                          ? 'border-[var(--foreground)] bg-[var(--surface)]'
                          : 'border-[var(--border)] bg-[var(--card)] hover:border-[var(--border-hover)]'
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[12px] font-semibold text-[var(--foreground)]">
                          {preset.label}
                        </span>
                        <span className="font-mono text-[10px] text-[var(--muted-foreground)]">
                          {preset.shortLabel}
                        </span>
                      </div>
                      <span className="mt-0.5 text-[11px] text-[var(--muted-foreground)]">
                        {preset.description}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Frame Fill Slider */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="align-fill-slider">Target frame fill</Label>
                <span className="font-mono text-[11px] tabular-nums text-[var(--foreground)]">
                  {targetFillPercent}%
                </span>
              </div>
              <input
                id="align-fill-slider"
                type="range"
                min={65}
                max={92}
                step={1}
                value={targetFillPercent}
                onChange={(e) => {
                  setPresetId('custom');
                  setTargetFillPercent(Number(e.target.value));
                  setCompareOriginal(false);
                }}
                className="w-full accent-[var(--foreground)] cursor-pointer"
              />
              <div className="flex justify-between font-mono text-[10px] text-[var(--muted-foreground)]">
                <span>65% roomy</span>
                <span>80–85% standard</span>
                <span>92% tight</span>
              </div>
            </div>

            {/* Canvas & Backdrop Toggles */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <Label>Canvas</Label>
                <div className="grid grid-cols-2 rounded-[6px] border border-[var(--border)] bg-[var(--surface)] p-0.5">
                  {(
                    [
                      { id: 'square', label: '1:1' },
                      { id: 'keep-aspect', label: 'Match' },
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setPresetId('custom');
                        setCanvasMode(item.id);
                        setCompareOriginal(false);
                      }}
                      className={cn(
                        'h-7 rounded-[5px] text-[11px] font-medium transition-colors cursor-pointer',
                        canvasMode === item.id
                          ? 'bg-[var(--foreground)] text-[var(--background)]'
                          : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                      )}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <Label>Backdrop</Label>
                <div className="grid grid-cols-2 rounded-[6px] border border-[var(--border)] bg-[var(--surface)] p-0.5">
                  {(
                    [
                      { id: 'pure-white', label: '#FFF' },
                      { id: 'edge-sample', label: 'Edge' },
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setPresetId('custom');
                        setBackdropMode(item.id);
                        setCompareOriginal(false);
                      }}
                      className={cn(
                        'h-7 rounded-[5px] font-mono text-[11px] font-medium transition-colors cursor-pointer',
                        backdropMode === item.id
                          ? 'bg-[var(--foreground)] text-[var(--background)]'
                          : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                      )}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Live Compliance Check Readout */}
            {displayCheck ? (
              <div className="space-y-1.5 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] p-2.5 text-[11px]">
                <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">
                  {compareOriginal ? 'Original metrics' : 'Aligned compliance'}
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-[var(--muted-foreground)]">
                    {displayCheck.borderPureWhitePass ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-amber-500" />
                    )}
                    {formatPackshotBackgroundLabel(displayCheck)}
                  </span>
                  <span className="font-mono tabular-nums text-[var(--foreground)]">
                    {displayCheck.borderWhitePercent}%
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-[var(--muted-foreground)]">
                    {displayCheck.frameFillPass ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-amber-500" />
                    )}
                    Product fills {displayCheck.frameFillPercent}% of frame
                  </span>
                  <span className="font-mono tabular-nums text-[var(--foreground)]">
                    80–90%
                  </span>
                </div>
              </div>
            ) : null}
          </div>

          <div className="space-y-2 border-t border-[var(--border)] pt-4">
            <div className="flex items-center justify-end gap-2">
              {image.originalDataUrl ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    onRevertOriginal();
                    onOpenChange(false);
                  }}
                  className="mr-auto"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Revert</span>
                </Button>
              ) : null}

              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="default"
                size="sm"
                disabled={isComputing || !activeResult}
                onClick={() => {
                  if (!activeResult) return;
                  onApplyAlignment({
                    dataUrl: activeResult.dataUrl,
                    mediaType: activeResult.mediaType,
                    packshotCheck: activeResult.packshotCheck,
                    alignedLabel: appliedLabel,
                  });
                  onOpenChange(false);
                }}
              >
                Apply Alignment
              </Button>
            </div>
          </div>
        </div>
      </div>
    </StudioModal>
  );
}
