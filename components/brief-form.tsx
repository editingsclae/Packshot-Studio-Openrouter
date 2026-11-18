'use client';

import React, { useRef } from 'react';
import { ImagePlus, Info, Plus, Trash2, X } from 'lucide-react';
import { PRODUCT_CATEGORIES, type ProductCategoryId } from '@/lib/presets';
import type { ProductBrief } from '@/lib/prompt-engine';
import type { ModelSpec } from '@/lib/models';
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface BriefFormProps {
  brief: ProductBrief;
  onChange: (next: ProductBrief) => void;
  selectedModel: ModelSpec;
  referenceImage: string | null;
  onReferenceImageChange: (dataUrl: string | null) => void;
  isWhiteBackgroundPreset: boolean;
}

export function BriefForm({
  brief,
  onChange,
  selectedModel,
  referenceImage,
  onReferenceImageChange,
  isWhiteBackgroundPreset,
}: BriefFormProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onReferenceImageChange(reader.result);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <div className="space-y-4">
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
              key={`${index}-${hex}`}
              className="flex h-8 items-center gap-1.5 rounded-[6px] border border-[var(--border)] bg-[var(--surface)] pl-1.5 pr-1"
            >
              <input
                type="color"
                aria-label={`Product color ${index + 1}`}
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

      {/* Reference Image Uploader — hidden when selected model doesn't support it, with tooltip explanation */}
      {selectedModel.supportsReference ? (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label>Reference image (1 max)</Label>
            <span className="font-mono text-[11px] text-[var(--muted-foreground)]">
              input_references
            </span>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={handleFileSelect}
            className="hidden"
          />

          {referenceImage ? (
            <div className="flex items-center justify-between gap-3 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] p-2">
              <div className="flex items-center gap-2.5 min-w-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={referenceImage}
                  alt="Product reference preview"
                  referrerPolicy="no-referrer"
                  className="h-11 w-11 rounded-[6px] border border-[var(--border)] object-cover shrink-0"
                />
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-medium text-[var(--foreground)]">
                    Reference attached
                  </p>
                  <p className="text-[11px] text-[var(--muted-foreground)]">
                    Sent to {selectedModel.shortName}
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Remove reference image"
                onClick={() => onReferenceImageChange(null)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-[6px] border border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex h-16 w-full items-center justify-center gap-2 rounded-[6px] border border-dashed border-[var(--border)] bg-[var(--surface)] px-3 text-[12px] text-[var(--muted-foreground)] transition-colors hover:border-[var(--border-hover)] hover:text-[var(--foreground)] cursor-pointer"
            >
              <ImagePlus className="h-4 w-4 shrink-0" />
              <span>Upload product reference photo (PNG, JPEG, WebP)</span>
            </button>
          )}
        </div>
      ) : (
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                tabIndex={0}
                className="flex items-center justify-between rounded-[6px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[12px] text-[var(--muted-foreground)] cursor-help focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070f3]"
              >
                <span>Reference upload unavailable for {selectedModel.shortName}</span>
                <Info className="h-3.5 w-3.5 shrink-0" />
              </div>
            </TooltipTrigger>
            <TooltipContent>
              {selectedModel.shortName} is text-to-image only. Switch to Recraft v4.1 Utility or
              Utility Pro to unlock single reference image guidance.
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}
