'use client';

import React, { useState } from 'react';
import {
  CheckCircle2,
  Copy,
  Download,
  Heart,
  Maximize2,
  RefreshCw,
  Shuffle,
  Trash2,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { REFINE_CHIPS } from '@/lib/presets';
import { downloadImageAs, type GeneratedImageItem } from '@/lib/db';
import { cn } from '@/lib/utils';

interface ImageResultCardProps {
  image: GeneratedImageItem;
  productName: string;
  isWhiteBackgroundShot: boolean;
  onOpenLightbox: () => void;
  onToggleFavorite: () => void;
  onDelete: () => void;
  onRemix: () => void;
  onRefine: (chipId: string) => void;
  onRegenerateFailedCheck: () => void;
  isGenerating: boolean;
}

export function ImageResultCard({
  image,
  productName,
  isWhiteBackgroundShot,
  onOpenLightbox,
  onToggleFavorite,
  onDelete,
  onRemix,
  onRefine,
  onRegenerateFailedCheck,
  isGenerating,
}: ImageResultCardProps) {
  const [downloadingFormat, setDownloadingFormat] = useState<'png' | 'webp' | 'jpeg' | null>(null);

  const safeSlug =
    productName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'packshot';

  const handleDownload = async (format: 'png' | 'webp' | 'jpeg') => {
    try {
      setDownloadingFormat(format);
      await downloadImageAs(image.dataUrl, `${safeSlug}-${image.seed ?? image.id.slice(0, 6)}`, format);
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
      if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
        await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
        toast.success('Image copied to clipboard');
      } else {
        await navigator.clipboard.writeText(image.dataUrl);
        toast.success('Image data URL copied');
      }
    } catch {
      toast.error('Clipboard write blocked by browser');
    }
  };

  const check = image.packshotCheck;
  const checkFailed = isWhiteBackgroundShot && check && !check.overallPass;

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

        {/* Top-right Quick Overlay Actions */}
        <div className="absolute right-2.5 top-2.5 flex items-center gap-1.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100 transition-opacity duration-150">
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
        {/* Packshot Checker Badges (white-background shots only) */}
        {isWhiteBackgroundShot && check ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] pb-2.5">
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <span
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
                <span>Background pure white</span>
                <span className="font-mono tabular-nums opacity-80">
                  {check.borderWhitePercent}%
                </span>
              </span>

              <span
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
                <span>Product fills 80-90% of frame</span>
                <span className="font-mono tabular-nums opacity-80">
                  {check.frameFillPercent}%
                </span>
              </span>
            </div>

            {checkFailed ? (
              <button
                type="button"
                disabled={isGenerating}
                onClick={onRegenerateFailedCheck}
                className="inline-flex h-7 items-center gap-1.5 rounded-[6px] border border-[var(--border)] bg-[var(--surface)] px-2.5 text-[11px] font-medium text-[var(--foreground)] hover:border-[var(--border-hover)] disabled:opacity-40 cursor-pointer whitespace-nowrap shrink-0"
              >
                <RefreshCw className="h-3 w-3" />
                <span>Regenerate</span>
              </button>
            ) : null}
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
            <span>{image.cost !== null ? `$${image.cost.toFixed(3)}` : 'Free'}</span>
            <span aria-hidden="true">·</span>
            <span>{(image.durationMs / 1000).toFixed(1)}s</span>
            {typeof image.seed === 'number' ? (
              <>
                <span aria-hidden="true">·</span>
                <span>seed {image.seed}</span>
              </>
            ) : null}
          </div>

          <div className="flex items-center gap-1">
            {(['png', 'webp', 'jpeg'] as const).map((fmt) => (
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
