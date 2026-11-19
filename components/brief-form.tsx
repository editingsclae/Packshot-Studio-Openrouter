'use client';

import React, { useRef } from 'react';
import { ImagePlus, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { PRODUCT_CATEGORIES, type ProductCategoryId } from '@/lib/presets';
import {
  getDetailsToLockPlaceholder,
  type ProductBrief,
} from '@/lib/prompt-engine';
import type { NormalizedImageModel } from '@/lib/models';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface BriefFormProps {
  brief: ProductBrief;
  onChange: (next: ProductBrief) => void;
  selectedModel: NormalizedImageModel;
  inputMode: 'text' | 'photo';
  onInputModeChange: (mode: 'text' | 'photo') => void;
  inputReferences: string[];
  onInputReferencesChange: (refs: string[]) => void;
  isWhiteBackgroundPreset: boolean;
  variations: number;
}

export function BriefForm({
  brief,
  onChange,
  selectedModel,
  inputMode,
  onInputModeChange,
  inputReferences,
  onInputReferencesChange,
  isWhiteBackgroundPreset,
  variations,
}: BriefFormProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const maxAllowedRefs =
    selectedModel.supportsReference && selectedModel.maxReferences > 0
      ? selectedModel.maxReferences
      : 10;

  const updateField = <K extends keyof ProductBrief>(key: K, value: ProductBrief[K]) => {
    onChange({ ...brief, [key]: value });
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

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;

    const remainingSlots = Math.max(0, maxAllowedRefs - inputReferences.length);
    if (remainingSlots === 0) {
      toast.error(`Maximum of ${maxAllowedRefs} reference photos reached.`);
      return;
    }

    const accepted = files.slice(0, remainingSlots);
    if (files.length > remainingSlots) {
      toast.info(`Added ${accepted.length} photos (limit: ${maxAllowedRefs}).`);
    }

    const readPromises = accepted.map(
      (file) =>
        new Promise<string | null>((resolve) => {
          const reader = new FileReader();
          reader.onload = () =>
            resolve(typeof reader.result === 'string' ? reader.result : null);
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(file);
        })
    );

    const results = (await Promise.all(readPromises)).filter(
      (x): x is string => Boolean(x)
    );

    if (results.length > 0) {
      onInputReferencesChange([...inputReferences, ...results]);
      if (inputMode !== 'photo') {
        onInputModeChange('photo');
      }
    }
  };

  const removeReferenceAt = (index: number) => {
    onInputReferencesChange(inputReferences.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-4">
      {/* Input Mode Toggle (Text vs Photo) */}
      <div className="flex items-center justify-between gap-2">
        <Label>Input mode</Label>
        <div
          role="tablist"
          aria-label="Input mode"
          className="grid w-44 grid-cols-2 rounded-[6px] border border-[var(--border)] bg-[var(--surface)] p-0.5"
        >
          {(['text', 'photo'] as const).map((mode) => {
            const active = inputMode === mode;
            return (
              <button
                key={mode}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onInputModeChange(mode)}
                className={cn(
                  'h-7 rounded-[5px] px-2.5 text-[12px] font-medium capitalize transition-colors cursor-pointer whitespace-nowrap',
                  active
                    ? 'bg-[var(--foreground)] text-[var(--background)]'
                    : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                )}
              >
                {mode === 'text' ? 'Text' : 'Photo'}
              </button>
            );
          })}
        </div>
      </div>

      {/* Reference Photos Uploader — shown in Photo mode or when model supports references */}
      {inputMode === 'photo' || selectedModel.supportsReference ? (
        <div className="space-y-2 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] p-3">
          <div className="flex items-center justify-between gap-2">
            <Label>
              Reference photos ({inputReferences.length}/{maxAllowedRefs})
            </Label>
            <span className="font-mono text-[11px] text-[var(--muted-foreground)]">
              {selectedModel.supportsReference
                ? `up to ${selectedModel.maxReferences} photos`
                : 'Select reference model below'}
            </span>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            multiple={maxAllowedRefs > 1}
            accept="image/png,image/jpeg,image/webp"
            onChange={handleFileSelect}
            className="hidden"
          />

          {inputReferences.length > 0 ? (
            <div className="grid grid-cols-4 gap-2">
              {inputReferences.map((src, idx) => (
                <div
                  key={idx}
                  className="group relative aspect-square overflow-hidden rounded-[6px] border border-[var(--border)] bg-[var(--card)]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt={`Reference ${idx + 1}`}
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover"
                  />
                  <button
                    type="button"
                    aria-label={`Remove reference ${idx + 1}`}
                    onClick={() => removeReferenceAt(idx)}
                    className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-[4px] border border-[var(--border)] bg-[var(--card)]/90 text-[var(--foreground)] hover:text-red-500 cursor-pointer"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}

              {inputReferences.length < maxAllowedRefs ? (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  aria-label="Add another reference photo"
                  className="flex aspect-square items-center justify-center rounded-[6px] border border-dashed border-[var(--border)] bg-[var(--card)] text-[var(--muted-foreground)] hover:border-[var(--border-hover)] hover:text-[var(--foreground)] cursor-pointer"
                >
                  <Plus className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-[6px] border border-dashed border-[var(--border)] bg-[var(--card)] px-3 text-[12px] text-[var(--muted-foreground)] transition-colors hover:border-[var(--border-hover)] hover:text-[var(--foreground)] cursor-pointer"
            >
              <ImagePlus className="h-4 w-4 shrink-0" />
              <span>
                Upload product photo{maxAllowedRefs > 1 ? `s (up to ${maxAllowedRefs})` : ''}
              </span>
            </button>
          )}
        </div>
      ) : null}

      {/* Product Name / Type */}
      <div className="space-y-1.5">
        <Label htmlFor="product-name">Product name or type</Label>
        <Input
          id="product-name"
          value={brief.name}
          onChange={(e) => updateField('name', e.target.value)}
          placeholder="e.g. Matte Ceramic Pour-Over Kettle"
          maxLength={140}
        />
      </div>

      {/* Category */}
      <div className="space-y-1.5">
        <Label htmlFor="product-category">Category realism module</Label>
        <Select
          value={brief.category}
          onValueChange={(val) => updateField('category', val as ProductCategoryId)}
        >
          <SelectTrigger id="product-category">
            <SelectValue placeholder="Select category" />
          </SelectTrigger>
          <SelectContent>
            {PRODUCT_CATEGORIES.map((cat) => (
              <SelectItem key={cat.id} value={cat.id}>
                {cat.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Material & Finish */}
      <div className="space-y-1.5">
        <Label htmlFor="material-finish">Material and finish</Label>
        <Input
          id="material-finish"
          value={brief.materialFinish}
          onChange={(e) => updateField('materialFinish', e.target.value)}
          placeholder="e.g. brushed anodized aluminum, matte glass"
          maxLength={200}
        />
      </div>

      {/* Color Pickers (up to 5) + Optional Background Color */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Product palette ({brief.colors.length}/5)</Label>
          {brief.colors.length < 5 ? (
            <button
              type="button"
              onClick={addColor}
              className="inline-flex items-center gap-1 text-[12px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer transition-colors"
            >
              <Plus className="h-3 w-3" />
              <span>Add color</span>
            </button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {brief.colors.map((hex, index) => (
            <div
              key={index}
              className="flex h-8 items-center gap-1.5 rounded-[6px] border border-[var(--border)] bg-[var(--surface)] pl-1.5 pr-1"
            >
              <input
                type="color"
                aria-label={`Product color ${index + 1}`}
                title="Click to pick color"
                value={/^#[0-9a-fA-F]{6}$/.test(hex) ? hex : '#1C1C1E'}
                onChange={(e) => handleColorChange(index, e.target.value)}
                className="h-5 w-5 cursor-pointer rounded-[4px] border-0 bg-transparent p-0"
              />
              <span className="font-mono text-[11px] text-[var(--foreground)] tabular-nums">
                {hex.toUpperCase()}
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

        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2">
            <Switch
              id="custom-bg-switch"
              checked={brief.useBackgroundColor}
              disabled={isWhiteBackgroundPreset}
              onCheckedChange={(checked) => updateField('useBackgroundColor', checked)}
            />
            <Label htmlFor="custom-bg-switch" className="cursor-pointer">
              Custom background color
            </Label>
          </div>

          {isWhiteBackgroundPreset ? (
            <span className="font-mono text-[11px] text-[var(--muted-foreground)]">
              Locked #FFFFFF
            </span>
          ) : brief.useBackgroundColor ? (
            <div className="flex h-8 items-center gap-1.5 rounded-[6px] border border-[var(--border)] bg-[var(--surface)] px-2">
              <input
                type="color"
                aria-label="Custom background color"
                value={
                  /^#[0-9a-fA-F]{6}$/.test(brief.backgroundColor)
                    ? brief.backgroundColor
                    : '#EAE6DF'
                }
                onChange={(e) => updateField('backgroundColor', e.target.value.toUpperCase())}
                className="h-4 w-4 cursor-pointer rounded-[3px] border-0 bg-transparent p-0"
              />
              <span className="font-mono text-[11px] tabular-nums">
                {brief.backgroundColor.toUpperCase()}
              </span>
            </div>
          ) : null}
        </div>
      </div>

      {/* Key Features */}
      <div className="space-y-1.5">
        <Label htmlFor="key-features">Key features</Label>
        <Textarea
          id="key-features"
          value={brief.keyFeatures}
          onChange={(e) => updateField('keyFeatures', e.target.value)}
          placeholder="Concise physical details: spout geometry, stitch lines, cap proportions"
          className="min-h-[68px] resize-y"
          maxLength={280}
        />
      </div>

      {/* Details to Lock (Exact) */}
      <div className="space-y-1.5">
        <Label htmlFor="details-to-lock">Details to lock (exact)</Label>
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

      {/* Exact On-Product Text (max 2 short strings) */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label>Exact on-product text ({brief.onProductTexts.length}/2)</Label>
          {brief.onProductTexts.length < 2 ? (
            <button
              type="button"
              onClick={addTextLine}
              className="inline-flex items-center gap-1 text-[12px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer transition-colors"
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
                  className="font-mono text-[12px]"
                />
                <button
                  type="button"
                  aria-label={`Remove text line ${idx + 1}`}
                  onClick={() => removeTextLine(idx)}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[6px] border border-[var(--border)] text-[var(--muted-foreground)] hover:border-[var(--border-hover)] hover:text-[var(--foreground)] cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[12px] text-[var(--muted-foreground)]">
            Optional. Leave empty for clean unbranded surfaces.
          </p>
        )}
      </div>
    </div>
  );
}
