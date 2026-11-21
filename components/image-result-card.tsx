'use client';

import React, { useState } from 'react';
import {
  CheckCircle2,
  Copy,
  Crop,
  Download,
  Heart,
  ImagePlus,
  Info,
  Layers,
  Maximize2,
  RefreshCw,
  RotateCcw,
  Shuffle,
  SlidersHorizontal,
  Trash2,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { REFINE_CHIPS } from '@/lib/presets';
import {
  downloadImageAs,
  isSvgMedia,
  type GeneratedImageItem,
} from '@/lib/db';
import { formatUsdCompact } from '@/lib/models';
import { formatPackshotBackgroundLabel } from '@/lib/packshot-check';
import { cn } from '@/lib/utils';

const DEGRADED_LABELS: Record<string, string> = {
  aspect_ratio: 'Aspect ratio',
  resolution: 'Resolution',
  quality: 'Quality',
  background: 'Background',
  output_format: 'Output format',
  seed: 'Seed',
  image_config: 'Color palette config',
};

function formatDegradedSummary(degraded?: string[]): string | null {
  if (!degraded || degraded.length === 0) return null;
  if (degraded.length === 1) {
    const label = DEGRADED_LABELS[degraded[0]] ?? degraded[0];
    return `${label} not applied by this model`;
  }
  const hasAspect = degraded.includes('aspect_ratio');
  const others = degraded
    .filter((k) => k !== 'aspect_ratio')
    .map((k) => DEGRADED_LABELS[k] ?? k);
  if (hasAspect) {
    return `Aspect ratio not applied by this model (${others.join(', ')} also dropped)`;
  }
  return `${others.join(', ')} not applied by this model`;
}

interface ImageResultCardProps {
  image: GeneratedImageItem;
  productName: string;
  isWhiteBackgroundShot: boolean;
  showComplianceGuides?: boolean;
  targetFillPercent?: number;
  alignPresetLabel?: string;
  isAligning?: boolean;
  onOpenLightbox: () => void;
  onToggleFavorite: () => void;
  onDelete: () => void;
  onRemix: () => void;
  onRefine: (chipId: string) => void;
  onRegenerateFailedCheck: () => void;
  onAutoCenter?: () => void;
  onOpenAlignModal?: () => void;
  onRevertAlignment?: () => void;
  onUseAsReference?: () => void;
  onCreateMultiView?: () => void;
  isGenerating: boolean;
}

export function ImageResultCard({
  image,
  productName,
  isWhiteBackgroundShot,
  showComplianceGuides = false,
  targetFillPercent = 85,
  alignPresetLabel = 'Amazon 85%',
  isAligning = false,
  onOpenLightbox,
  onToggleFavorite,
  onDelete,
  onRemix,
  onRefine,
  onRegenerateFailedCheck,
  onAutoCenter,
  onOpenAlignModal,
  onRevertAlignment,
  onUseAsReference,
  onCreateMultiView,
  isGenerating,
}: ImageResultCardProps) {
  const [downloadingFormat, setDownloadingFormat] = useState<
    'png' | 'webp' | 'jpeg' | 'svg' | null
  >(null);

  const isSvg = isSvgMedia(image.mediaType, image.dataUrl);

  const safeSlug =
    productName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'packshot';

  const handleDownload = async (format: 'png' | 'webp' | 'jpeg' | 'svg') => {
    try {
      setDownloadingFormat(format);
      await downloadImageAs(
        image.dataUrl,
        `${safeSlug}-${image.seed ?? image.id.slice(0, 6)}`,
        format
      );
      toast.success(`Exported ${format.toUpperCase()}`);
    } catch {
      toast.error('Failed to export image');
    } finally {
      setDownloadingFormat(null);
    }
  };

  const handleCopy = async () => {
    try {
      const res = await fetch(image.dataUrl);
      const blob = await res.blob();
      if (navigator.clipboard && typeof ClipboardItem !== 'undefined' && !isSvg) {
        await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
        toast.success('Image copied to clipboard');
      } else {
        const text = isSvg ? await blob.text() : image.dataUrl;
        await navigator.clipboard.writeText(text);
        toast.success(isSvg ? 'SVG markup copied' : 'Image data URL copied');
      }
    } catch {
      toast.error('Clipboard write blocked by browser');
    }
  };

  const check = image.packshotCheck;
  const checkFailed = !isSvg && isWhiteBackgroundShot && check && !check.overallPass;
  const safeMarginPct = Math.max(3, (100 - targetFillPercent) / 2);

  const downloadFormats: ('svg' | 'png' | 'webp' | 'jpeg')[] = isSvg
    ? ['svg', 'png', 'webp', 'jpeg']
    : ['png', 'webp', 'jpeg'];

  return (
    <article className="group flex flex-col overflow-hidden rounded-[12px] border border-[var(--border)] bg-[var(--card)] transition-colors duration-150 hover:border-[var(--border-hover)]">
      {/* Image Viewport */}
      <div className="relative aspect-square w-full overflow-hidden bg-[var(--surface)] border-b border-[var(--border)]">
        <button
          type="button"
          onClick={onOpenLightbox}
          aria-label={`Open ${productName} preview in lightbox`}
          className="block h-full w-full cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070f3] focus-visible:ring-inset"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image.dataUrl}
            alt={productName || 'Generated ecommerce product photograph'}
            referrerPolicy="no-referrer"
            className="h-full w-full object-contain"
          />
        </button>

        {/* Optional Marketplace Compliance Safe-Zone & Center Crosshairs */}
        {showComplianceGuides && !isSvg ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
          >
            <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 border-l border-dashed border-[#0070f3]/65" />
            <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 border-t border-dashed border-[#0070f3]/65" />
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
                {targetFillPercent}% SAFE
              </span>
            </div>
          </div>
        ) : null}

        {/* Top-left Aligned Badge */}
        {image.alignedLabel ? (
          <div className="pointer-events-none absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-[5px] border border-[var(--border)] bg-[var(--card)]/90 px-2 py-0.5 font-mono text-[10px] font-medium text-[var(--foreground)] backdrop-blur-sm">
            <Crop className="h-2.5 w-2.5 text-emerald-500" />
            <span>{image.alignedLabel}</span>
          </div>
        ) : null}

        {/* Top-right Quick Overlay Actions */}
        <div className="absolute right-2.5 top-2.5 flex items-center gap-1.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100 transition-opacity duration-150">
          {!isSvg && onOpenAlignModal ? (
            <button
              type="button"
              onClick={onOpenAlignModal}
              aria-label="Open auto-crop and centering editor"
              title="Auto-crop & center settings"
              className="inline-flex h-8 w-8 items-center justify-center rounded-[6px] border border-[var(--border)] bg-[var(--card)]/90 text-[var(--foreground)] backdrop-blur-sm transition-colors hover:border-[var(--border-hover)] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070f3]"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={onToggleFavorite}
            aria-label={image.favorite ? 'Remove from favorites' : 'Mark as favorite'}
            className={cn(
              'inline-flex h-8 w-8 items-center justify-center rounded-[6px] border border-[var(--border)] bg-[var(--card)]/90 backdrop-blur-sm transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070f3]',
              image.favorite ? 'text-red-500' : 'text-[var(--foreground)] hover:border-[var(--border-hover)]'
            )}
          >
            <Heart className={cn('h-3.5 w-3.5', image.favorite && 'fill-current')} />
          </button>
          <button
            type="button"
            onClick={onOpenLightbox}
            aria-label="Zoom image"
            className="inline-flex h-8 w-8 items-center justify-center rounded-[6px] border border-[var(--border)] bg-[var(--card)]/90 text-[var(--foreground)] backdrop-blur-sm transition-colors hover:border-[var(--border-hover)] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070f3]"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Card Body */}
      <div className="flex flex-1 flex-col gap-3 p-3.5">
        {(() => {
          const degradedNote = formatDegradedSummary(image.degraded);
          return degradedNote ? (
            <div className="flex items-center gap-1.5 rounded-[6px] border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-500">
              <Info className="h-3.5 w-3.5 shrink-0" />
              <span>{degradedNote}</span>
            </div>
          ) : null;
        })()}

        {image.alignmentNote ? (
          <div className="flex items-center gap-1.5 rounded-[6px] border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-500">
            <Info className="h-3.5 w-3.5 shrink-0" />
            <span>{image.alignmentNote}</span>
          </div>
        ) : null}

        {/* Packshot Checker Badges (white-background shots) or SVG skip note */}
        {isWhiteBackgroundShot && isSvg ? (
          <div className="flex items-center gap-1.5 border-b border-[var(--border)] pb-2.5 text-[11px] text-[var(--muted-foreground)]">
            <Info className="h-3.5 w-3.5 shrink-0" />
            <span>SVG output — canvas packshot check skipped</span>
          </div>
        ) : isWhiteBackgroundShot && check ? (
          <div className="space-y-1.5 border-b border-[var(--border)] pb-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <span
                  title={
                    check.backgroundHex
                      ? `Sampled border median: ${check.backgroundHex} (${check.borderWhitePercent}% pure white)`
                      : undefined
                  }
                  className={cn(
                    'inline-flex items-center gap-1 rounded-[6px] border px-2 py-0.5 font-medium',
                    check.borderPureWhitePass
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500'
                      : 'border-amber-500/30 bg-amber-500/10 text-amber-500'
                  )}
                >
                  {check.borderPureWhitePass ? (
                    <CheckCircle2 className="h-3 w-3 shrink-0" />
                  ) : (
                    <XCircle className="h-3 w-3 shrink-0" />
                  )}
                  <span>{formatPackshotBackgroundLabel(check)}</span>
                  <span className="font-mono tabular-nums opacity-80">
                    {check.borderWhitePercent}%
                  </span>
                </span>

                <span
                  title="Target product occupancy: 80–90% of frame"
                  className={cn(
                    'inline-flex items-center gap-1 rounded-[6px] border px-2 py-0.5 font-medium',
                    check.frameFillPass
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500'
                      : 'border-amber-500/30 bg-amber-500/10 text-amber-500'
                  )}
                >
                  {check.frameFillPass ? (
                    <CheckCircle2 className="h-3 w-3 shrink-0" />
                  ) : (
                    <XCircle className="h-3 w-3 shrink-0" />
                  )}
                  <span>Product fills {check.frameFillPercent}% of frame</span>
                </span>
              </div>

              {checkFailed ? (
                <div className="flex items-center gap-1.5">
                  {onAutoCenter ? (
                    <button
                      type="button"
                      disabled={isGenerating || isAligning}
                      onClick={onAutoCenter}
                      title={`Auto-crop, whiten light background, and center to ${alignPresetLabel}`}
                      className="inline-flex h-7 items-center gap-1.5 rounded-[6px] border border-[var(--foreground)] bg-[var(--foreground)] px-2.5 text-[11px] font-medium text-[var(--background)] hover:opacity-90 disabled:opacity-40 cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <Crop className="h-3 w-3" />
                      <span>{isAligning ? 'Aligning...' : 'Auto-Center'}</span>
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={isGenerating}
                    onClick={onRegenerateFailedCheck}
                    className="inline-flex h-7 items-center gap-1.5 rounded-[6px] border border-[var(--border)] bg-[var(--surface)] px-2.5 text-[11px] font-medium text-[var(--foreground)] hover:border-[var(--border-hover)] disabled:opacity-40 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <RefreshCw className="h-3 w-3" />
                    <span>Regenerate</span>
                  </button>
                </div>
              ) : null}
            </div>

            {!check.borderPureWhitePass ? (
              <p className="text-[11px] text-[var(--muted-foreground)]">
                Auto-Center will whiten the background
              </p>
            ) : null}
          </div>
        ) : null}

        {/* Marketplace Auto-Crop & Reference Utility Row */}
        {(!isSvg && (onAutoCenter || onOpenAlignModal)) ||
        onUseAsReference ||
        onCreateMultiView ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] border border-[var(--border)] bg-[var(--surface)]/70 px-2.5 py-1.5">
            <span className="text-[11px] text-[var(--muted-foreground)]">
              {!isSvg && image.alignedLabel ? (
                <>
                  Aligned:{' '}
                  <span className="font-mono text-[var(--foreground)]">
                    {image.alignedLabel}
                  </span>
                </>
              ) : isSvg ? (
                'Shot utilities'
              ) : (
                'Marketplace alignment'
              )}
            </span>

            <div className="flex flex-wrap items-center gap-1.5">
              {!isSvg && onAutoCenter ? (
                <button
                  type="button"
                  disabled={isGenerating || isAligning}
                  onClick={onAutoCenter}
                  className="inline-flex h-6 items-center gap-1 rounded-[5px] border border-[var(--border)] bg-[var(--card)] px-2 text-[11px] font-medium text-[var(--foreground)] transition-colors hover:border-[var(--border-hover)] disabled:opacity-40 cursor-pointer whitespace-nowrap"
                >
                  <Crop className="h-3 w-3" />
                  <span>
                    {isAligning ? 'Centering...' : `Center (${alignPresetLabel})`}
                  </span>
                </button>
              ) : null}

              {!isSvg && onOpenAlignModal ? (
                <button
                  type="button"
                  disabled={isGenerating || isAligning}
                  onClick={onOpenAlignModal}
                  className="inline-flex h-6 items-center gap-1 rounded-[5px] border border-[var(--border)] bg-[var(--card)] px-2 text-[11px] text-[var(--muted-foreground)] transition-colors hover:border-[var(--border-hover)] hover:text-[var(--foreground)] disabled:opacity-40 cursor-pointer whitespace-nowrap"
                >
                  <SlidersHorizontal className="h-3 w-3" />
                  <span>Crop &amp; fit</span>
                </button>
              ) : null}

              {!isSvg && image.originalDataUrl && onRevertAlignment ? (
                <button
                  type="button"
                  disabled={isAligning}
                  onClick={onRevertAlignment}
                  title="Revert to original uncropped image"
                  aria-label="Revert alignment to original"
                  className="inline-flex h-6 items-center gap-1 rounded-[5px] border border-[var(--border)] bg-[var(--card)] px-1.5 text-[11px] text-[var(--muted-foreground)] transition-colors hover:border-[var(--border-hover)] hover:text-[var(--foreground)] disabled:opacity-40 cursor-pointer"
                >
                  <RotateCcw className="h-3 w-3" />
                </button>
              ) : null}

              {onUseAsReference ? (
                <button
                  type="button"
                  disabled={isGenerating}
                  onClick={onUseAsReference}
                  className="inline-flex h-6 items-center gap-1 rounded-[5px] border border-[var(--border)] bg-[var(--card)] px-2 text-[11px] font-medium text-[var(--foreground)] transition-colors hover:border-[var(--border-hover)] disabled:opacity-40 cursor-pointer whitespace-nowrap"
                >
                  <ImagePlus className="h-3 w-3" />
                  <span>Use as reference</span>
                </button>
              ) : null}

              {onCreateMultiView ? (
                <span
                  title={
                    isSvg
                      ? 'Multi-view is not available for SVG results — use a PNG or JPEG image.'
                      : 'Create consistent views of this product from other angles'
                  }
                >
                  <button
                    type="button"
                    disabled={isGenerating || isSvg}
                    onClick={onCreateMultiView}
                    className="inline-flex h-6 items-center gap-1 rounded-[5px] border border-[var(--border)] bg-[var(--card)] px-2 text-[11px] font-medium text-[var(--foreground)] transition-colors hover:border-[var(--border-hover)] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
                  >
                    <Layers className="h-3 w-3" />
                    <span>Create multi-view</span>
                  </button>
                </span>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* Refine Chips */}
        <div className="flex flex-wrap items-center gap-1.5">
          {REFINE_CHIPS.map((chip) => (
            <button
              key={chip.id}
              type="button"
              disabled={isGenerating}
              onClick={() => onRefine(chip.id)}
              className="inline-flex h-7 items-center rounded-[6px] border border-[var(--border)] bg-[var(--surface)] px-2 text-[11px] text-[var(--muted-foreground)] transition-colors duration-150 hover:border-[var(--border-hover)] hover:text-[var(--foreground)] disabled:opacity-40 cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070f3]"
            >
              + {chip.label}
            </button>
          ))}
        </div>

        {/* Mono Telemetry + Actions Row */}
        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="flex items-center gap-1.5 font-mono text-[11px] tabular-nums text-[var(--muted-foreground)]">
            <span>{image.cost !== null ? formatUsdCompact(image.cost) : 'usage n/a'}</span>
            <span aria-hidden="true">·</span>
            <span>{(image.durationMs / 1000).toFixed(1)}s</span>
            {typeof image.seed === 'number' ? (
              <>
                <span aria-hidden="true">·</span>
                <span>seed {image.seed}</span>
              </>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-1">
            {downloadFormats.map((fmt) => (
              <button
                key={fmt}
                type="button"
                disabled={downloadingFormat !== null}
                onClick={() => handleDownload(fmt)}
                title={`Download ${fmt.toUpperCase()}`}
                className="inline-flex h-7 items-center gap-1 rounded-[6px] border border-[var(--border)] bg-transparent px-2 font-mono text-[11px] uppercase text-[var(--muted-foreground)] transition-colors hover:border-[var(--border-hover)] hover:text-[var(--foreground)] cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070f3]"
              >
                <Download className="h-3 w-3" />
                <span>{fmt}</span>
              </button>
            ))}

            <button
              type="button"
              onClick={handleCopy}
              aria-label="Copy image"
              title="Copy image"
              className="inline-flex h-7 w-7 items-center justify-center rounded-[6px] border border-[var(--border)] text-[var(--muted-foreground)] transition-colors hover:border-[var(--border-hover)] hover:text-[var(--foreground)] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070f3]"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>

            <button
              type="button"
              onClick={onRemix}
              aria-label="Remix brief and settings"
              title="Remix"
              className="inline-flex h-7 w-7 items-center justify-center rounded-[6px] border border-[var(--border)] text-[var(--muted-foreground)] transition-colors hover:border-[var(--border-hover)] hover:text-[var(--foreground)] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070f3]"
            >
              <Shuffle className="h-3.5 w-3.5" />
            </button>

            <button
              type="button"
              onClick={onDelete}
              aria-label="Delete image"
              title="Delete"
              className="inline-flex h-7 w-7 items-center justify-center rounded-[6px] border border-[var(--border)] text-[var(--muted-foreground)] transition-colors hover:border-red-500/40 hover:text-red-500 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070f3]"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
