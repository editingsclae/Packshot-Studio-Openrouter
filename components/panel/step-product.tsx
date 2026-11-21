'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  HelpCircle,
  ImagePlus,
  Loader2,
  Palette,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  detectCategoryFromName,
  getCategorySpec,
  PRODUCT_CATEGORIES,
  type ProductCategoryId,
} from '@/lib/presets';
import {
  describeHexColor,
  getDetailsToLockPlaceholder,
  SAMPLE_BRIEFS,
  type ProductBrief,
  type SampleBriefPreset,
} from '@/lib/prompt-engine';
import {
  downscaleImageToMaxDim,
  extractDominantColorsFromImage,
} from '@/lib/packshot-crop';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface StepProductProps {
  brief: ProductBrief;
  onChange: (next: ProductBrief) => void;
  categoryManuallyOverridden: boolean;
  onManualCategoryChange: (category: ProductCategoryId) => void;
  onResetCategoryAutoDetect: () => void;
  inputMode: 'text' | 'photo';
  inputReferences: string[];
  onInputReferencesChange: (refs: string[]) => void;
  maxAllowedRefs: number;
  selectedModelSupportsRef: boolean;
  isWhiteBackgroundPreset: boolean;
  variations: number;
  onLoadSample: (sample: SampleBriefPreset) => void;
}

function FieldHelpTooltip({ label, text }: { label: string; text: string }) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={`Help: ${label}`}
            className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-help focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070f3]"
          >
            <HelpCircle className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-[240px] text-[11px] leading-snug">
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function AutoGrowTextarea({
  value,
  className,
  onChange,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const innerRef = useRef<HTMLTextAreaElement | null>(null);

  const syncHeight = () => {
    const el = innerRef.current;
    if (!el || typeof window === 'undefined') return;
    const cs = window.getComputedStyle(el);
    const lineHeight = parseFloat(cs.lineHeight) || 18;
    const padTop = parseFloat(cs.paddingTop) || 8;
    const padBottom = parseFloat(cs.paddingBottom) || 8;
    const borderTop = parseFloat(cs.borderTopWidth) || 1;
    const borderBottom = parseFloat(cs.borderBottomWidth) || 1;
    const minHeight = Math.ceil(
      lineHeight * 2 + padTop + padBottom + borderTop + borderBottom
    );
    const maxHeight = Math.ceil(
      lineHeight * 5 + padTop + padBottom + borderTop + borderBottom
    );
    el.style.height = 'auto';
    const contentHeight = el.scrollHeight + borderTop + borderBottom;
    const nextHeight = Math.min(maxHeight, Math.max(minHeight, contentHeight));
    el.style.height = `${nextHeight}px`;
    el.style.overflowY = contentHeight > maxHeight ? 'auto' : 'hidden';
  };

  useEffect(() => {
    syncHeight();
  }, [value]);

  return (
    <Textarea
      ref={innerRef}
      rows={2}
      value={value}
      onChange={(e) => {
        onChange?.(e);
        syncHeight();
      }}
      className={cn(
        'min-h-0 resize-none text-[12px] leading-[1.45] overflow-y-hidden',
        className
      )}
      {...props}
    />
  );
}

export function StepProduct({
  brief,
  onChange,
  categoryManuallyOverridden,
  onManualCategoryChange,
  onResetCategoryAutoDetect,
  inputMode,
  inputReferences,
  onInputReferencesChange,
  maxAllowedRefs,
  selectedModelSupportsRef,
  isWhiteBackgroundPreset,
  variations,
  onLoadSample,
}: StepProductProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const replaceInputRef = useRef<HTMLInputElement | null>(null);
  const categoryPopoverRef = useRef<HTMLDivElement | null>(null);

  const hasOptionalData = Boolean(
    brief.materialFinish.trim() ||
      brief.colors.length > 0 ||
      brief.keyFeatures.trim() ||
      (brief.detailsToLock ?? '').trim() ||
      brief.onProductTexts.some((t) => t.trim()) ||
      brief.useBackgroundColor
  );

  const [moreOpen, setMoreOpen] = useState<boolean>(hasOptionalData);
  const prevHasOptionalRef = useRef<boolean>(hasOptionalData);
  const [categoryPopoverOpen, setCategoryPopoverOpen] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [isExtractingColors, setIsExtractingColors] = useState(false);

  // Auto-open "More details (optional)" whenever optional fields become populated (e.g., sample/preset/extract)
  useEffect(() => {
    if (hasOptionalData && !prevHasOptionalRef.current) {
      setMoreOpen(true);
    }
    prevHasOptionalRef.current = hasOptionalData;
  }, [hasOptionalData]);

  useEffect(() => {
    if (!categoryPopoverOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (
        categoryPopoverRef.current &&
        !categoryPopoverRef.current.contains(e.target as Node)
      ) {
        setCategoryPopoverOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCategoryPopoverOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    window.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [categoryPopoverOpen]);

  const isFormEmpty =
    !brief.name.trim() &&
    !brief.materialFinish.trim() &&
    brief.colors.length === 0 &&
    !brief.keyFeatures.trim() &&
    !(brief.detailsToLock ?? '').trim() &&
    brief.onProductTexts.every((t) => !t.trim()) &&
    inputReferences.length === 0;

  const detectedKeywordCategory = useMemo(
    () => detectCategoryFromName(brief.name),
    [brief.name]
  );

  const categoryLabel = useMemo(
    () => getCategorySpec(brief.category).label,
    [brief.category]
  );

  const updateField = <K extends keyof ProductBrief>(
    key: K,
    value: ProductBrief[K]
  ) => {
    onChange({ ...brief, [key]: value });
  };

  const handleNameChange = (nextName: string) => {
    if (!categoryManuallyOverridden) {
      const detected = detectCategoryFromName(nextName);
      if (detected && detected !== brief.category) {
        onChange({ ...brief, name: nextName, category: detected });
        return;
      }
    }
    onChange({ ...brief, name: nextName });
  };

  const handleColorChange = (index: number, hex: string) => {
    const next = [...brief.colors];
    next[index] = hex.toUpperCase();
    updateField('colors', next);
  };

  const addColor = () => {
    if (brief.colors.length >= 5) return;
    updateField('colors', [...brief.colors, '#D4D4D8']);
  };

  const removeColor = (index: number) => {
    updateField(
      'colors',
      brief.colors.filter((_, i) => i !== index)
    );
  };

  const handleTextChange = (index: number, value: string) => {
    const next = [...brief.onProductTexts];
    next[index] = value;
    updateField('onProductTexts', next);
  };

  const addTextLine = () => {
    if (brief.onProductTexts.length >= 2) return;
    updateField('onProductTexts', [...brief.onProductTexts, '']);
  };

  const removeTextLine = (index: number) => {
    updateField(
      'onProductTexts',
      brief.onProductTexts.filter((_, i) => i !== index)
    );
  };

  const readFilesToReferences = async (
    files: File[],
    replaceFirst = false
  ) => {
    if (files.length === 0) return;

    const imageFiles = files.filter((f) => f.type.startsWith('image/'));
    if (imageFiles.length === 0) {
      toast.error('Please upload PNG, JPEG, or WebP images.');
      return;
    }

    if (replaceFirst) {
      const file = imageFiles[0];
      const rawUrl = await new Promise<string | null>((resolve) => {
        const reader = new FileReader();
        reader.onload = () =>
          resolve(typeof reader.result === 'string' ? reader.result : null);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
      });
      if (!rawUrl) {
        toast.error('Failed to read image file.');
        return;
      }
      try {
        const optimized = await downscaleImageToMaxDim(rawUrl, 2048);
        const nextRefs =
          inputReferences.length > 0
            ? [optimized, ...inputReferences.slice(1)]
            : [optimized];
        onInputReferencesChange(nextRefs.slice(0, maxAllowedRefs));
      } catch {
        onInputReferencesChange([rawUrl, ...inputReferences.slice(1)].slice(0, maxAllowedRefs));
      }
      return;
    }

    const remainingSlots = Math.max(0, maxAllowedRefs - inputReferences.length);
    if (remainingSlots === 0) {
      toast.error(`Maximum of ${maxAllowedRefs} reference photos reached.`);
      return;
    }

    const accepted = imageFiles.slice(0, remainingSlots);
    if (imageFiles.length > remainingSlots) {
      toast.info(`Added ${accepted.length} photos (limit: ${maxAllowedRefs}).`);
    }

    const results = (
      await Promise.all(
        accepted.map(
          (file) =>
            new Promise<string | null>((resolve) => {
              const reader = new FileReader();
              reader.onload = async () => {
                if (typeof reader.result !== 'string') {
                  resolve(null);
                  return;
                }
                try {
                  const optimized = await downscaleImageToMaxDim(reader.result, 2048);
                  resolve(optimized);
                } catch {
                  resolve(reader.result);
                }
              };
              reader.onerror = () => resolve(null);
              reader.readAsDataURL(file);
            })
        )
      )
    ).filter((x): x is string => Boolean(x));

    if (results.length > 0) {
      onInputReferencesChange(
        [...inputReferences, ...results].slice(0, maxAllowedRefs)
      );
    }
  };

  const handleExtractColors = async () => {
    const primary = inputReferences[0];
    if (!primary || isExtractingColors) return;
    setIsExtractingColors(true);
    try {
      const extracted = await extractDominantColorsFromImage(primary, 4);
      if (extracted.length === 0) {
        toast.info('Could not isolate distinct foreground colors from this photo.');
        return;
      }
      updateField('colors', extracted);
      setMoreOpen(true);
      const names = Array.from(new Set(extracted.map(describeHexColor))).join(', ');
      toast.success(`Extracted ${extracted.length} colors (${names})`);
    } catch {
      toast.error('Failed to analyze image colors.');
    } finally {
      setIsExtractingColors(false);
    }
  };

  // Completeness meter: 4 meaningful criteria for high-accuracy prompts
  const hasMaterial = Boolean(brief.materialFinish.trim());
  const hasColors = brief.colors.length > 0;
  const hasFeatures = Boolean(brief.keyFeatures.trim());
  const hasLockDetails = Boolean((brief.detailsToLock ?? '').trim());
  const completedCount =
    (hasMaterial ? 1 : 0) +
    (hasColors ? 1 : 0) +
    (hasFeatures ? 1 : 0) +
    (hasLockDetails ? 1 : 0);
  const completenessPct = Math.round((completedCount / 4) * 100);

  return (
    <div className="space-y-3.5">
      {/* Photo mode first element: Large drag-and-drop reference uploader */}
      {inputMode === 'photo' ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label>
              Product photo{maxAllowedRefs > 1 ? `s (${inputReferences.length}/${maxAllowedRefs})` : ''}
            </Label>
            <span className="font-mono text-[10px] text-[var(--muted-foreground)]">
              {selectedModelSupportsRef
                ? `Model limit: ${maxAllowedRefs} photo${maxAllowedRefs === 1 ? '' : 's'}`
                : 'Reference model needed'}
            </span>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            multiple={maxAllowedRefs > 1}
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = '';
              void readFilesToReferences(files, false);
            }}
            className="hidden"
          />
          <input
            ref={replaceInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = '';
              void readFilesToReferences(files, true);
            }}
            className="hidden"
          />

          {inputReferences.length === 0 ? (
            <div
              role="button"
              tabIndex={0}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDraggingOver(true);
              }}
              onDragLeave={() => setIsDraggingOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDraggingOver(false);
                const files = Array.from(e.dataTransfer.files ?? []);
                void readFilesToReferences(files, false);
              }}
              className={cn(
                'flex flex-col items-center justify-center gap-2 rounded-[8px] border border-dashed px-4 py-6 text-center transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070f3]',
                isDraggingOver
                  ? 'border-[#0070f3] bg-[#0070f3]/10'
                  : 'border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border-hover)]'
              )}
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-[8px] border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)]">
                <Upload className="h-4 w-4" />
              </div>
              <div className="space-y-0.5">
                <p className="text-[12px] font-medium text-[var(--foreground)]">
                  Drop your product photo here, or click to browse
                </p>
                <p className="text-[11px] text-[var(--muted-foreground)]">
                  PNG, JPG, or WebP · automatically resized to fit 2048px
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-2 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] p-2.5">
              {/* Primary Reference Card with Replace & Remove */}
              <div className="flex items-center gap-3">
                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-[6px] border border-[var(--border)] bg-[var(--card)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={inputReferences[0]}
                    alt="Primary product reference"
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-contain"
                  />
                </div>

                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="text-[12px] font-medium text-[var(--foreground)]">
                    Primary reference photo
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => replaceInputRef.current?.click()}
                      className="inline-flex h-7 items-center gap-1 rounded-[5px] border border-[var(--border)] bg-[var(--card)] px-2 text-[11px] font-medium text-[var(--foreground)] hover:border-[var(--border-hover)] cursor-pointer"
                    >
                      <RefreshCw className="h-3 w-3" />
                      <span>Replace</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onInputReferencesChange(inputReferences.slice(1))}
                      className="inline-flex h-7 items-center gap-1 rounded-[5px] border border-[var(--border)] bg-[var(--card)] px-2 text-[11px] text-[var(--muted-foreground)] hover:border-red-500/40 hover:text-red-500 cursor-pointer"
                    >
                      <Trash2 className="h-3 w-3" />
                      <span>Remove</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Additional thumbnails + Extract colors from photo action */}
              {maxAllowedRefs > 1 && inputReferences.length > 1 ? (
                <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-[var(--border)]">
                  {inputReferences.slice(1).map((src, idx) => (
                    <div
                      key={idx + 1}
                      className="relative h-11 w-11 overflow-hidden rounded-[5px] border border-[var(--border)] bg-[var(--card)]"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={src}
                        alt={`Reference ${idx + 2}`}
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-cover"
                      />
                      <button
                        type="button"
                        aria-label={`Remove reference ${idx + 2}`}
                        onClick={() =>
                          onInputReferencesChange(
                            inputReferences.filter((_, i) => i !== idx + 1)
                          )
                        }
                        className="absolute right-0.5 top-0.5 inline-flex h-4 w-4 items-center justify-center rounded-[3px] bg-[var(--card)]/90 text-[var(--foreground)] hover:text-red-500 cursor-pointer"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </div>
                  ))}
                  {inputReferences.length < maxAllowedRefs ? (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex h-11 w-11 items-center justify-center rounded-[5px] border border-dashed border-[var(--border)] bg-[var(--card)] text-[var(--muted-foreground)] hover:border-[var(--border-hover)] hover:text-[var(--foreground)] cursor-pointer"
                      aria-label="Add another photo"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>
              ) : maxAllowedRefs > 1 ? (
                <div className="flex items-center justify-between gap-2 pt-1 border-t border-[var(--border)]">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1 text-[11px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer"
                  >
                    <ImagePlus className="h-3 w-3" />
                    <span>Add extra angle ({maxAllowedRefs - inputReferences.length} left)</span>
                  </button>
                </div>
              ) : null}

              <button
                type="button"
                disabled={isExtractingColors}
                onClick={() => void handleExtractColors()}
                className="flex h-8 w-full items-center justify-center gap-1.5 rounded-[6px] border border-[var(--border)] bg-[var(--card)] px-2.5 text-[11px] font-medium text-[var(--foreground)] hover:border-[var(--border-hover)] disabled:opacity-50 cursor-pointer transition-colors"
              >
                {isExtractingColors ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Palette className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
                )}
                <span>
                  {isExtractingColors
                    ? 'Extracting product colors...'
                    : 'Extract colors from photo'}
                </span>
              </button>
            </div>
          )}
        </div>
      ) : null}

      {/* Always visible: Product Name + Detected Category Chip */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="product-name">Product name</Label>
          <span className="text-[10px] text-[var(--muted-foreground)]">
            Required
          </span>
        </div>
        <Input
          id="product-name"
          value={brief.name}
          onChange={(e) => handleNameChange(e.target.value)}
          placeholder="e.g. Brushed titanium field watch"
          maxLength={140}
        />

        {/* Auto-detected category chip with override popover */}
        <div ref={categoryPopoverRef} className="relative flex items-center justify-between gap-2 pt-0.5">
          <div className="inline-flex items-center gap-1 rounded-[5px] border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[11px]">
            <span className="text-[var(--muted-foreground)]">
              {categoryManuallyOverridden || !detectedKeywordCategory
                ? 'Category:'
                : 'Detected:'}
            </span>
            <span className="font-medium text-[var(--foreground)]">
              {categoryLabel}
            </span>
            <span className="text-[var(--muted-foreground)]">·</span>
            <button
              type="button"
              aria-expanded={categoryPopoverOpen}
              onClick={() => setCategoryPopoverOpen((prev) => !prev)}
              className="font-medium text-[#0070f3] hover:underline cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070f3] rounded-[3px]"
            >
              change
            </button>
          </div>

          <FieldHelpTooltip
            label="Category realism module"
            text="Automatically adds material & optics cues tailored to this product type (e.g. sapphire glass contrast for watches, textile weave for apparel)."
          />

          {categoryPopoverOpen ? (
            <div
              role="dialog"
              aria-label="Choose product category"
              className="absolute left-0 top-full z-40 mt-1 w-64 overflow-hidden rounded-[8px] border border-[var(--border)] bg-[var(--card)] p-1.5"
            >
              <div className="flex items-center justify-between px-2 py-1 border-b border-[var(--border)] mb-1">
                <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">
                  Override category
                </span>
                {categoryManuallyOverridden ? (
                  <button
                    type="button"
                    onClick={() => {
                      onResetCategoryAutoDetect();
                      setCategoryPopoverOpen(false);
                    }}
                    className="text-[10px] font-medium text-[#0070f3] hover:underline cursor-pointer"
                  >
                    Auto-detect
                  </button>
                ) : null}
              </div>
              <div className="studio-scrollbar max-h-56 overflow-y-auto space-y-0.5">
                {PRODUCT_CATEGORIES.map((cat) => {
                  const active = brief.category === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => {
                        onManualCategoryChange(cat.id);
                        setCategoryPopoverOpen(false);
                      }}
                      className={cn(
                        'flex w-full items-center justify-between rounded-[5px] px-2 py-1.5 text-left text-[12px] transition-colors cursor-pointer',
                        active
                          ? 'bg-[var(--foreground)] text-[var(--background)] font-medium'
                          : 'text-[var(--foreground)] hover:bg-[var(--surface)]'
                      )}
                    >
                      <span>{cat.label}</span>
                      {active ? (
                        <span className="font-mono text-[10px]">Selected</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* "Try an example" chips shown ONLY when the form is empty */}
      {isFormEmpty ? (
        <div className="space-y-1.5 rounded-[8px] border border-[var(--border)] bg-[var(--surface)]/60 p-2.5">
          <div className="flex items-center gap-1.5 text-[11px] text-[var(--muted-foreground)]">
            <Sparkles className="h-3 w-3 shrink-0" />
            <span>Try an example</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {SAMPLE_BRIEFS.map((sample) => (
              <button
                key={sample.id}
                type="button"
                onClick={() => onLoadSample(sample)}
                className="h-7 rounded-[6px] border border-[var(--border)] bg-[var(--card)] px-2.5 text-[11px] font-medium text-[var(--foreground)] hover:border-[var(--border-hover)] cursor-pointer transition-colors"
              >
                {sample.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* "More details (optional)" collapsible + completeness meter */}
      <div className="border-t border-[var(--border)] pt-2.5">
        <button
          type="button"
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen((prev) => !prev)}
          className="flex w-full items-center justify-between gap-2 py-1 text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070f3] rounded-[4px]"
        >
          <span className="block min-w-0 flex-1 space-y-1">
            <span className="flex items-center justify-between gap-2">
              <span className="text-[12px] font-medium text-[var(--foreground)]">
                More details (optional)
              </span>
              <span className="font-mono text-[10px] tabular-nums text-[var(--muted-foreground)]">
                {completedCount}/4
              </span>
            </span>

            <span className="block h-1 w-full overflow-hidden rounded-full bg-[var(--border)]">
              <span
                className={cn(
                  'block h-full transition-all duration-150',
                  hasMaterial && hasColors ? 'bg-emerald-500' : 'bg-[var(--foreground)]'
                )}
                style={{ width: `${Math.max(8, completenessPct)}%` }}
              />
            </span>

            {(!hasMaterial || !hasColors) ? (
              <span className="block text-[10px] text-[var(--muted-foreground)]">
                Add material and colors for more accurate results
              </span>
            ) : null}
          </span>

          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 text-[var(--muted-foreground)] transition-transform duration-150',
              moreOpen && 'rotate-180'
            )}
          />
        </button>

        <div
          className={cn(
            'grid transition-[grid-template-rows] duration-150 ease-out',
            moreOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
          )}
        >
          <div className="overflow-hidden">
            <div className="pt-3 space-y-3.5">
              {/* Material & Finish */}
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="material-finish">Material and finish</Label>
                  <FieldHelpTooltip
                    label="Material and finish"
                    text="Specifies surface luster (matte, brushed, frosted glass) so lighting highlights look physically real."
                  />
                </div>
                <AutoGrowTextarea
                  id="material-finish"
                  value={brief.materialFinish}
                  onChange={(e) => updateField('materialFinish', e.target.value)}
                  placeholder="e.g. brushed anodized aluminum, matte glass"
                  maxLength={200}
                />
              </div>

              {/* Product Color Palette */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <Label>Product palette ({brief.colors.length}/5)</Label>
                    <FieldHelpTooltip
                      label="Product palette"
                      text="Translated into natural color names in the prompt and sent as RGB parameters where supported."
                    />
                  </div>
                  {brief.colors.length < 5 ? (
                    <button
                      type="button"
                      onClick={addColor}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--foreground)] hover:underline cursor-pointer"
                    >
                      <Plus className="h-3 w-3" />
                      <span>Add color</span>
                    </button>
                  ) : null}
                </div>

                {brief.colors.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {brief.colors.map((hex, index) => (
                      <div
                        key={index}
                        title={hex.toUpperCase()}
                        className="flex h-8 items-center gap-1.5 rounded-[6px] border border-[var(--border)] bg-[var(--card)] pl-1.5 pr-1"
                      >
                        <input
                          type="color"
                          aria-label={`Product color ${index + 1}`}
                          title={`Pick color (${hex.toUpperCase()})`}
                          value={/^#[0-9a-fA-F]{6}$/.test(hex) ? hex : '#1C1C1E'}
                          onChange={(e) => handleColorChange(index, e.target.value)}
                          className="h-5 w-5 cursor-pointer rounded-[4px] border-0 bg-transparent p-0"
                        />
                        <span className="max-w-[92px] truncate text-[11px] text-[var(--foreground)]">
                          {describeHexColor(hex)}
                        </span>
                        <button
                          type="button"
                          aria-label={`Remove color ${index + 1}`}
                          onClick={() => removeColor(index)}
                          className="inline-flex h-5 w-5 items-center justify-center rounded-[4px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-[var(--muted-foreground)]">
                    No swatches yet. Add colors or extract them from a photo.
                  </p>
                )}
              </div>

              {/* Key Features */}
              <div className="space-y-1">
                <Label htmlFor="key-features">Key features</Label>
                <AutoGrowTextarea
                  id="key-features"
                  value={brief.keyFeatures}
                  onChange={(e) => updateField('keyFeatures', e.target.value)}
                  placeholder="Concise physical details: spout geometry, stitch lines, cap proportions"
                  maxLength={280}
                />
              </div>

              {/* Details to Lock (Exact) */}
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="details-to-lock">Details to lock (exact)</Label>
                  <FieldHelpTooltip
                    label="Details to lock"
                    text="Placed immediately after the product subject to keep dial, strap, trim, and color zones consistent across variations."
                  />
                </div>
                <Input
                  id="details-to-lock"
                  value={brief.detailsToLock ?? ''}
                  onChange={(e) => updateField('detailsToLock', e.target.value)}
                  placeholder={getDetailsToLockPlaceholder(brief.category)}
                  maxLength={240}
                />
                {variations > 1 && !(brief.detailsToLock ?? '').trim() ? (
                  <p className="text-[11px] leading-snug text-amber-500">
                    Generating {variations} variations with this empty — color placement, trim, or secondary details may differ across shots.
                  </p>
                ) : null}
              </div>

              {/* Exact On-Product Text */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <Label>Exact on-product text ({brief.onProductTexts.length}/2)</Label>
                    <FieldHelpTooltip
                      label="Exact on-product text"
                      text="Locks up to two short strings printed on the product. Leave empty for clean unbranded surfaces."
                    />
                  </div>
                  {brief.onProductTexts.length < 2 ? (
                    <button
                      type="button"
                      onClick={addTextLine}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--foreground)] hover:underline cursor-pointer"
                    >
                      <Plus className="h-3 w-3" />
                      <span>Add label text</span>
                    </button>
                  ) : null}
                </div>

                {brief.onProductTexts.length > 0 ? (
                  <div className="space-y-1.5">
                    {brief.onProductTexts.map((txt, idx) => (
                      <div key={idx} className="flex items-center gap-1.5">
                        <Input
                          value={txt}
                          onChange={(e) => handleTextChange(idx, e.target.value)}
                          placeholder={`Exact text string ${idx + 1} (e.g. SOLIS 15%)`}
                          maxLength={32}
                          className="h-8 font-mono text-[12px]"
                        />
                        <button
                          type="button"
                          aria-label={`Remove text line ${idx + 1}`}
                          onClick={() => removeTextLine(idx)}
                          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] border border-[var(--border)] text-[var(--muted-foreground)] hover:border-[var(--border-hover)] hover:text-[var(--foreground)] cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-[var(--muted-foreground)]">
                    Leave empty for clean unbranded surfaces.
                  </p>
                )}
              </div>

              {/* Custom Background Color */}
              <div className="flex items-center justify-between gap-2 pt-1 border-t border-[var(--border)]">
                <div className="flex items-center gap-2">
                  <Switch
                    id="custom-bg-switch"
                    checked={brief.useBackgroundColor}
                    disabled={isWhiteBackgroundPreset}
                    onCheckedChange={(checked) =>
                      updateField('useBackgroundColor', checked)
                    }
                  />
                  <Label htmlFor="custom-bg-switch" className="text-[12px] cursor-pointer">
                    Custom background
                  </Label>
                </div>

                {isWhiteBackgroundPreset ? (
                  <span className="font-mono text-[10px] text-[var(--muted-foreground)]">
                    Locked #FFFFFF
                  </span>
                ) : brief.useBackgroundColor ? (
                  <div className="flex h-7 items-center gap-1.5 rounded-[5px] border border-[var(--border)] bg-[var(--card)] px-1.5">
                    <input
                      type="color"
                      aria-label="Custom background color"
                      value={
                        /^#[0-9a-fA-F]{6}$/.test(brief.backgroundColor)
                          ? brief.backgroundColor
                          : '#EAE6DF'
                      }
                      onChange={(e) =>
                        updateField('backgroundColor', e.target.value.toUpperCase())
                      }
                      className="h-4 w-4 cursor-pointer rounded-[3px] border-0 bg-transparent p-0"
                    />
                    <span className="font-mono text-[10px] tabular-nums">
                      {brief.backgroundColor.toUpperCase()}
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
