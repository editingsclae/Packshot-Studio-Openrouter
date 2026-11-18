'use client';

import React, { useMemo, useState } from 'react';
import {
  Check,
  CheckSquare,
  Copy,
  Download,
  FileArchive,
  Heart,
  Maximize2,
  Search,
  Shuffle,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  downloadImageAs,
  downloadSelectedAsZip,
  type GeneratedImageItem,
  type GenerationRecord,
} from '@/lib/db';
import { getModelSpec } from '@/lib/models';
import {
  getCategorySpec,
  getShotPreset,
  PRODUCT_CATEGORIES,
  SHOT_PRESETS,
} from '@/lib/presets';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface LibraryViewProps {
  records: GenerationRecord[];
  onRemixRecord: (record: GenerationRecord) => void;
  onToggleFavorite: (recordId: string, imageId: string) => void;
  onDeleteImage: (recordId: string, imageId: string) => void;
  onClearLibrary: () => void;
  onOpenLightbox: (record: GenerationRecord, imageIndex: number) => void;
  onGoToGenerate: () => void;
}

function makeItemKey(recordId: string, imageId: string) {
  return `${recordId}::${imageId}`;
}

function slugifyProduct(name: string) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'packshot'
  );
}

export function LibraryView({
  records,
  onRemixRecord,
  onToggleFavorite,
  onDeleteImage,
  onClearLibrary,
  onOpenLightbox,
  onGoToGenerate,
}: LibraryViewProps) {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [shotFilter, setShotFilter] = useState<string>('all');
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  // Bulk-selection state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
  const [isZipping, setIsZipping] = useState(false);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    const list: Array<{
      key: string;
      record: GenerationRecord;
      image: GeneratedImageItem;
      imageIndex: number;
    }> = [];

    for (const record of records) {
      if (categoryFilter !== 'all' && record.brief.category !== categoryFilter) {
        continue;
      }
      if (shotFilter !== 'all' && record.shotId !== shotFilter) {
        continue;
      }
      if (query) {
        const hay = [
          record.brief.name,
          record.brief.materialFinish,
          record.brief.keyFeatures,
          record.prompt,
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(query)) continue;
      }

      record.images.forEach((image, idx) => {
        if (favoritesOnly && !image.favorite) return;
        list.push({
          key: makeItemKey(record.id, image.id),
          record,
          image,
          imageIndex: idx,
        });
      });
    }

    return list;
  }, [records, search, categoryFilter, shotFilter, favoritesOnly]);

  // All valid items across records matching selectedKeys
  const selectedEntries = useMemo(() => {
    const entries: Array<{
      key: string;
      record: GenerationRecord;
      image: GeneratedImageItem;
    }> = [];
    for (const record of records) {
      for (const image of record.images) {
        const key = makeItemKey(record.id, image.id);
        if (selectedKeys.has(key)) {
          entries.push({ key, record, image });
        }
      }
    }
    return entries;
  }, [records, selectedKeys]);

  const activeSelectionCount = selectedEntries.length;
  const isSelecting = selectionMode || activeSelectionCount > 0;

  const toggleItemSelection = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleSelectAllFiltered = () => {
    setSelectionMode(true);
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      for (const item of filteredItems) {
        next.add(item.key);
      }
      return next;
    });
  };

  const handleClearSelection = () => {
    setSelectedKeys(new Set());
    setSelectionMode(false);
  };

  const handleDownloadSelectedZip = async () => {
    if (selectedEntries.length === 0 || isZipping) return;
    try {
      setIsZipping(true);
      const zipEntries = selectedEntries.map(({ record, image }) => ({
        dataUrl: image.dataUrl,
        mediaType: image.mediaType,
        filenameBase: `${slugifyProduct(record.brief.name)}-${record.shotId}-${image.seed ?? image.id.slice(0, 6)}`,
      }));
      const count = await downloadSelectedAsZip(zipEntries);
      toast.success(`Downloaded ${count} ${count === 1 ? 'image' : 'images'} as ZIP`);
    } catch {
      toast.error('Failed to archive selected images');
    } finally {
      setIsZipping(false);
    }
  };

  const handleDownload = async (
    record: GenerationRecord,
    image: GeneratedImageItem,
    fmt: 'png' | 'webp' | 'jpeg'
  ) => {
    try {
      await downloadImageAs(
        image.dataUrl,
        `${slugifyProduct(record.brief.name)}-${image.seed ?? image.id.slice(0, 6)}`,
        fmt
      );
      toast.success(`Exported ${fmt.toUpperCase()}`);
    } catch {
      toast.error('Export failed');
    }
  };

  const handleCopy = async (dataUrl: string) => {
    try {
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
        await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
        toast.success('Image copied to clipboard');
      }
    } catch {
      toast.error('Clipboard copy blocked');
    }
  };

  const allFilteredSelected =
    filteredItems.length > 0 &&
    filteredItems.every((item) => selectedKeys.has(item.key));

  return (
    <div className="mx-auto max-w-[1440px] px-4 sm:px-6 py-6 space-y-5">
      {/* Header & Filter Bar */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between border-b border-[var(--border)] pb-5">
        <div>
          <h1 className="text-[20px] font-semibold tracking-[-0.02em] text-[var(--foreground)]">
            Local Library
          </h1>
          <p className="mt-0.5 text-[13px] text-[var(--muted-foreground)]">
            Saved in IndexedDB on this browser. Select shots to archive as ZIP or remix any brief.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-52">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--muted-foreground)]" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products or prompts..."
              className="pl-8"
            />
          </div>

          <div className="w-40">
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger aria-label="Filter by category">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {PRODUCT_CATEGORIES.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="w-40">
            <Select value={shotFilter} onValueChange={setShotFilter}>
              <SelectTrigger aria-label="Filter by shot preset">
                <SelectValue placeholder="Shot type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All shots</SelectItem>
                {SHOT_PRESETS.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            variant={favoritesOnly ? 'default' : 'secondary'}
            size="default"
            onClick={() => setFavoritesOnly((prev) => !prev)}
          >
            <Heart className={cn('h-3.5 w-3.5', favoritesOnly && 'fill-current')} />
            <span>Favorites</span>
          </Button>

          {filteredItems.length > 0 ? (
            <Button
              variant={isSelecting ? 'default' : 'secondary'}
              size="default"
              onClick={() => {
                if (isSelecting) {
                  handleClearSelection();
                } else {
                  setSelectionMode(true);
                }
              }}
            >
              <CheckSquare className="h-3.5 w-3.5" />
              <span>{isSelecting ? 'Done selecting' : 'Select'}</span>
            </Button>
          ) : null}

          {records.length > 0 ? (
            <Button variant="ghost" size="default" onClick={onClearLibrary}>
              Clear all
            </Button>
          ) : null}
        </div>
      </div>

      {/* Bulk Selection Action Bar */}
      {isSelecting && filteredItems.length > 0 ? (
        <div
          role="region"
          aria-label="Bulk selection actions"
          className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5"
        >
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-[12px] font-medium tabular-nums text-[var(--foreground)]">
              {activeSelectionCount} selected
            </span>

            <span className="text-[var(--border-hover)]" aria-hidden="true">
              ·
            </span>

            <button
              type="button"
              onClick={
                allFilteredSelected
                  ? handleClearSelection
                  : handleSelectAllFiltered
              }
              className="text-[12px] font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer transition-colors"
            >
              {allFilteredSelected
                ? 'Deselect all'
                : `Select all (${filteredItems.length})`}
            </button>

            {activeSelectionCount > 0 ? (
              <button
                type="button"
                onClick={() => setSelectedKeys(new Set())}
                className="text-[12px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer transition-colors"
              >
                Clear selection
              </button>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="default"
              size="sm"
              disabled={activeSelectionCount === 0 || isZipping}
              onClick={() => void handleDownloadSelectedZip()}
            >
              <FileArchive className="h-3.5 w-3.5" />
              <span>
                {isZipping
                  ? 'Archiving ZIP...'
                  : activeSelectionCount > 0
                    ? `Download Selected (${activeSelectionCount})`
                    : 'Download Selected'}
              </span>
            </Button>

            <button
              type="button"
              onClick={handleClearSelection}
              aria-label="Exit selection mode"
              className="inline-flex h-8 w-8 items-center justify-center rounded-[6px] border border-[var(--border)] bg-transparent text-[var(--muted-foreground)] hover:border-[var(--border-hover)] hover:text-[var(--foreground)] cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ) : null}

      {/* Content Grid / Empty State */}
      {filteredItems.length === 0 ? (
        <div className="flex min-h-[360px] flex-col items-center justify-center rounded-[12px] border border-[var(--border)] bg-[var(--card)] p-8 text-center">
          <p className="text-[15px] font-medium text-[var(--foreground)]">
            {records.length === 0 ? 'No saved generations yet' : 'No matching shots found'}
          </p>
          <p className="mt-1 max-w-md text-[13px] text-[var(--muted-foreground)]">
            {records.length === 0
              ? 'Every image you generate in Packshot Studio is stored locally in IndexedDB for instant remixing and export.'
              : 'Adjust your search query or clear filters to inspect all saved product shots.'}
          </p>
          <div className="mt-5">
            {records.length === 0 ? (
              <Button onClick={onGoToGenerate}>Create first generation</Button>
            ) : (
              <Button
                variant="secondary"
                onClick={() => {
                  setSearch('');
                  setCategoryFilter('all');
                  setShotFilter('all');
                  setFavoritesOnly(false);
                }}
              >
                Reset filters
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredItems.map(({ key, record, image, imageIndex }) => {
            const shot = getShotPreset(record.shotId);
            const category = getCategorySpec(record.brief.category);
            const model = getModelSpec(record.modelId);
            const isSelected = selectedKeys.has(key);

            return (
              <article
                key={key}
                className={cn(
                  'group flex flex-col overflow-hidden rounded-[12px] border bg-[var(--card)] transition-colors duration-150',
                  isSelected
                    ? 'border-[var(--foreground)] ring-1 ring-[var(--foreground)]'
                    : 'border-[var(--border)] hover:border-[var(--border-hover)]'
                )}
              >
                <div className="relative aspect-square w-full overflow-hidden border-b border-[var(--border)] bg-[var(--surface)]">
                  <button
                    type="button"
                    onClick={() => {
                      if (selectionMode) {
                        toggleItemSelection(key);
                      } else {
                        onOpenLightbox(record, imageIndex);
                      }
                    }}
                    aria-label={
                      selectionMode
                        ? `${isSelected ? 'Deselect' : 'Select'} ${record.brief.name}`
                        : `Inspect ${record.brief.name}`
                    }
                    className={cn(
                      'block h-full w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070f3] focus-visible:ring-inset',
                      selectionMode ? 'cursor-pointer' : 'cursor-zoom-in'
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={image.dataUrl}
                      alt={record.brief.name}
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-contain"
                    />
                  </button>

                  {/* Top-left Selection Checkbox */}
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={isSelected}
                    aria-label={`Select ${record.brief.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleItemSelection(key);
                    }}
                    className={cn(
                      'absolute left-2.5 top-2.5 inline-flex h-7 w-7 items-center justify-center rounded-[6px] border transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070f3]',
                      isSelected
                        ? 'border-[var(--foreground)] bg-[var(--foreground)] text-[var(--background)] opacity-100'
                        : isSelecting
                          ? 'border-[var(--border-hover)] bg-[var(--card)]/90 text-transparent opacity-100 hover:border-[var(--foreground)]'
                          : 'border-[var(--border-hover)] bg-[var(--card)]/90 text-transparent opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100 hover:border-[var(--foreground)]'
                    )}
                  >
                    <Check className="h-3.5 w-3.5 stroke-[2.5]" />
                  </button>

                  {/* Top-right Quick Actions */}
                  <div className="absolute right-2.5 top-2.5 flex items-center gap-1.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-150">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleFavorite(record.id, image.id);
                      }}
                      aria-label="Toggle favorite"
                      className={cn(
                        'inline-flex h-8 w-8 items-center justify-center rounded-[6px] border border-[var(--border)] bg-[var(--card)]/90 backdrop-blur-sm cursor-pointer',
                        image.favorite ? 'text-red-500' : 'text-[var(--foreground)]'
                      )}
                    >
                      <Heart className={cn('h-3.5 w-3.5', image.favorite && 'fill-current')} />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenLightbox(record, imageIndex);
                      }}
                      aria-label="Open lightbox"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-[6px] border border-[var(--border)] bg-[var(--card)]/90 text-[var(--foreground)] backdrop-blur-sm cursor-pointer"
                    >
                      <Maximize2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <div className="flex flex-1 flex-col gap-2.5 p-3.5">
                  <div>
                    <h2 className="truncate text-[14px] font-semibold tracking-[-0.01em] text-[var(--foreground)]">
                      {record.brief.name}
                    </h2>
                    <p className="mt-0.5 truncate text-[12px] text-[var(--muted-foreground)]">
                      {shot.name} · {category.label} · {model.shortName}
                    </p>
                  </div>

                  <div className="font-mono text-[11px] tabular-nums text-[var(--muted-foreground)]">
                    {image.cost !== null ? `$${image.cost.toFixed(3)}` : 'Free'} ·{' '}
                    {(image.durationMs / 1000).toFixed(1)}s · {record.aspectRatio}
                  </div>

                  <div className="mt-auto flex items-center justify-between gap-1.5 border-t border-[var(--border)] pt-2.5">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleDownload(record, image, 'png')}
                        className="inline-flex h-7 items-center gap-1 rounded-[6px] border border-[var(--border)] px-2 font-mono text-[11px] text-[var(--muted-foreground)] hover:border-[var(--border-hover)] hover:text-[var(--foreground)] cursor-pointer"
                      >
                        <Download className="h-3 w-3" />
                        PNG
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCopy(image.dataUrl)}
                        aria-label="Copy image"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-[6px] border border-[var(--border)] text-[var(--muted-foreground)] hover:border-[var(--border-hover)] hover:text-[var(--foreground)] cursor-pointer"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedKeys((prev) => {
                            if (!prev.has(key)) return prev;
                            const next = new Set(prev);
                            next.delete(key);
                            return next;
                          });
                          onDeleteImage(record.id, image.id);
                        }}
                        aria-label="Delete image"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-[6px] border border-[var(--border)] text-[var(--muted-foreground)] hover:border-red-500/40 hover:text-red-500 cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => onRemixRecord(record)}
                      className="h-7 px-2.5 text-[12px]"
                    >
                      <Shuffle className="h-3 w-3" />
                      Remix
                    </Button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
