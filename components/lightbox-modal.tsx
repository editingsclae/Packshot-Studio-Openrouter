'use client';

import React, { useEffect } from 'react';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Crop,
  Download,
  Heart,
  ImagePlus,
  Info,
  Shuffle,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  downloadImageAs,
  isSvgMedia,
  type GeneratedImageItem,
} from '@/lib/db';
import type { ModelTier } from '@/lib/models';
import { StudioModal } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface LightboxModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  images: GeneratedImageItem[];
  activeIndex: number;
  onIndexChange: (nextIndex: number) => void;
  productName: string;
  prompt: string;
  modelId: string;
  modelName: string;
  modelTier?: ModelTier;
  isWhiteBackgroundShot: boolean;
  onToggleFavorite: (imageId: string) => void;
  onRemix: () => void;
  onOpenAlignModal?: (imageId: string) => void;
  onUseAsReference?: (image: GeneratedImageItem) => void;
}

export function LightboxModal({
  open,
  onOpenChange,
  images,
  activeIndex,
  onIndexChange,
  productName,
  prompt,
  modelId,
  modelName,
  modelTier,
  isWhiteBackgroundShot,
  onToggleFavorite,
  onRemix,
  onOpenAlignModal,
  onUseAsReference,
}: LightboxModalProps) {
  const image = images[activeIndex];

  useEffect(() => {
    if (!open || images.length <= 1) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        onIndexChange((activeIndex - 1 + images.length) % images.length);
      } else if (e.key === 'ArrowRight') {
        onIndexChange((activeIndex + 1) % images.length);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, activeIndex, images.length, onIndexChange]);

  if (!image) return null;

  const isSvg = isSvgMedia(image.mediaType, image.dataUrl);
  const downloadFormats: ('svg' | 'png' | 'webp' | 'jpeg')[] = isSvg
    ? ['svg', 'png', 'webp', 'jpeg']
    : ['png', 'webp', 'jpeg'];

  const safeSlug =
    productName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'packshot';

  const handleDownload = async (format: 'png' | 'webp' | 'jpeg' | 'svg') => {
    try {
      await downloadImageAs(
        image.dataUrl,
        `${safeSlug}-${image.seed ?? image.id.slice(0, 6)}`,
        format
      );
      toast.success(`Downloaded ${format.toUpperCase()}`);
    } catch {
      toast.error('Export failed');
    }
  };

  const handleCopy = async () => {
    try {
      const res = await fetch(image.dataUrl);
      const blob = await res.blob();
      if (navigator.clipboard && typeof ClipboardItem !== 'undefined' && !isSvg) {
        await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
        toast.success('Copied image to clipboard');
      } else {
        const text = isSvg ? await blob.text() : image.dataUrl;
        await navigator.clipboard.writeText(text);
        toast.success(isSvg ? 'SVG markup copied' : 'Copied data URL');
      }
    } catch {
      toast.error('Clipboard copy blocked');
    }
  };

  const resolvedTier = modelTier ?? (modelId.endsWith(':free') ? 'free' : 'paid');

  return (
    <StudioModal
      open={open}
      onOpenChange={onOpenChange}
      title={`${productName} lightbox preview`}
      className="max-w-5xl overflow-hidden p-0"
    >
      <div className="grid grid-cols-1 lg:grid-cols-[1.35fr_340px]">
        {/* Left: Full image canvas */}
        <div className="relative flex min-h-[340px] sm:min-h-[500px] items-center justify-center bg-[var(--surface)] border-b lg:border-b-0 lg:border-r border-[var(--border)] p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image.dataUrl}
            alt={productName}
            referrerPolicy="no-referrer"
            className="max-h-[72vh] w-auto object-contain rounded-[6px]"
          />

          {images.length > 1 ? (
            <>
              <button
                type="button"
                aria-label="Previous image"
                onClick={() => onIndexChange((activeIndex - 1 + images.length) % images.length)}
                className="absolute left-3 top-1/2 -translate-y-1/2 inline-flex h-9 w-9 items-center justify-center rounded-[6px] border border-[var(--border)] bg-[var(--card)]/90 text-[var(--foreground)] hover:border-[var(--border-hover)] cursor-pointer"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="Next image"
                onClick={() => onIndexChange((activeIndex + 1) % images.length)}
                className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex h-9 w-9 items-center justify-center rounded-[6px] border border-[var(--border)] bg-[var(--card)]/90 text-[var(--foreground)] hover:border-[var(--border-hover)] cursor-pointer"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </>
          ) : null}
        </div>

        {/* Right: Metadata & Export Inspector */}
        <div className="flex flex-col justify-between gap-5 p-5 pr-12 lg:pr-5">
          <div className="space-y-4">
            <div>
              <h3 className="text-[15px] font-semibold tracking-[-0.02em] text-[var(--foreground)]">
                {productName || 'Untitled Product'}
              </h3>
              <p className="mt-1 font-mono text-[11px] text-[var(--muted-foreground)] break-all">
                {modelName} · {modelId} · <span className="capitalize">{resolvedTier}</span>
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] p-2.5 font-mono text-[11px] tabular-nums">
              <div>
                <span className="block text-[var(--muted-foreground)]">Cost</span>
                <span className="text-[var(--foreground)]">
                  {image.cost !== null ? `$${image.cost.toFixed(4)}` : 'n/a'}
                </span>
              </div>
              <div>
                <span className="block text-[var(--muted-foreground)]">Time</span>
                <span className="text-[var(--foreground)]">
                  {(image.durationMs / 1000).toFixed(2)}s
                </span>
              </div>
              <div>
                <span className="block text-[var(--muted-foreground)]">Seed</span>
                <span className="text-[var(--foreground)]">{image.seed ?? '—'}</span>
              </div>
            </div>

            {isWhiteBackgroundShot && isSvg ? (
              <div className="flex items-center gap-2 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] p-3 text-[12px] text-[var(--muted-foreground)]">
                <Info className="h-4 w-4 shrink-0" />
                <span>SVG output — canvas packshot check skipped</span>
              </div>
            ) : isWhiteBackgroundShot && image.packshotCheck ? (
              <div className="space-y-1.5 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] p-3 text-[12px]">
                <div className="font-medium text-[var(--foreground)]">Packshot Quality Check</div>
                <div className="flex items-center justify-between text-[var(--muted-foreground)]">
                  <span className="flex items-center gap-1.5">
                    {image.packshotCheck.borderPureWhitePass ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-amber-500" />
                    )}
                    Background pure white
                  </span>
                  <span className="font-mono tabular-nums">
                    {image.packshotCheck.borderWhitePercent}%
                  </span>
                </div>
                <div className="flex items-center justify-between text-[var(--muted-foreground)]">
                  <span className="flex items-center gap-1.5">
                    {image.packshotCheck.frameFillPass ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-amber-500" />
                    )}
                    Product fills 80-90% of frame
                  </span>
                  <span className="font-mono tabular-nums">
                    {image.packshotCheck.frameFillPercent}%
                  </span>
                </div>
              </div>
            ) : null}

            <div className="space-y-1.5">
              <div className="text-[12px] font-medium text-[var(--muted-foreground)]">
                Prompt used
              </div>
              <p className="studio-scrollbar max-h-44 overflow-y-auto rounded-[8px] border border-[var(--border)] bg-[var(--surface)] p-2.5 font-mono text-[11px] leading-relaxed text-[var(--foreground)]">
                {prompt}
              </p>
            </div>
          </div>

          <div className="space-y-2.5 border-t border-[var(--border)] pt-4">
            <div
              className={cn(
                'grid gap-1.5',
                downloadFormats.length === 4 ? 'grid-cols-4' : 'grid-cols-3'
              )}
            >
              {downloadFormats.map((fmt) => (
                <Button
                  key={fmt}
                  variant="secondary"
                  size="sm"
                  onClick={() => handleDownload(fmt)}
                  className="font-mono uppercase text-[11px]"
                >
                  <Download className="h-3 w-3" />
                  {fmt}
                </Button>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              <Button variant="secondary" size="sm" onClick={handleCopy}>
                <Copy className="h-3.5 w-3.5" />
                Copy
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onToggleFavorite(image.id)}
              >
                <Heart
                  className={cn(
                    'h-3.5 w-3.5',
                    image.favorite && 'fill-red-500 text-red-500'
                  )}
                />
                {image.favorite ? 'Saved' : 'Save'}
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() => {
                  onOpenChange(false);
                  onRemix();
                }}
              >
                <Shuffle className="h-3.5 w-3.5" />
                Remix
              </Button>
            </div>

            {!isSvg && onOpenAlignModal ? (
              <Button
                variant="secondary"
                size="sm"
                className="w-full"
                onClick={() => {
                  onOpenChange(false);
                  onOpenAlignModal(image.id);
                }}
              >
                <Crop className="h-3.5 w-3.5" />
                <span>Auto-Crop &amp; Center Alignment</span>
              </Button>
            ) : null}

            {onUseAsReference ? (
              <Button
                variant="secondary"
                size="sm"
                className="w-full"
                onClick={() => {
                  onOpenChange(false);
                  onUseAsReference(image);
                }}
              >
                <ImagePlus className="h-3.5 w-3.5" />
                <span>Use as reference</span>
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </StudioModal>
  );
}
