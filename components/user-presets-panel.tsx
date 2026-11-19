'use client';

import React, { useMemo, useState } from 'react';
import {
  Bookmark,
  Check,
  ChevronDown,
  ChevronRight,
  Pencil,
  Plus,
  RotateCw,
  Search,
  Tag,
  Trash2,
} from 'lucide-react';
import {
  findModelById,
  type AspectRatio,
  type ModelTier,
  type NormalizedImageModel,
} from '@/lib/models';
import type { ShotPresetId } from '@/lib/presets';
import {
  USER_PRESET_CATEGORIES,
  type UserPreset,
} from '@/lib/db';
import { StudioModal } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

export interface PresetDraftSnapshot {
  suggestedName: string;
  suggestedCategory: string;
  promptText: string;
  promptEditedManually: boolean;
  shotId: ShotPresetId;
  refineChips: string[];
  enhanceEnabled: boolean;
  modelId: string;
  modelName: string;
  modelTier: ModelTier;
  aspectRatio: AspectRatio;
  resolution: string;
  quality: string;
  backgroundMode: 'auto' | 'opaque' | 'transparent';
  outputFormat: 'auto' | 'png' | 'webp' | 'jpeg' | 'svg';
  variations: number;
  customSeed: string;
}

interface UserPresetsPanelProps {
  presets: UserPreset[];
  activePresetId: string | null;
  models: NormalizedImageModel[];
  currentSnapshot: PresetDraftSnapshot;
  onSavePreset: (name: string, category: string, promptText: string) => void;
  onEditPreset: (
    presetId: string,
    patch: { name: string; category: string; promptText: string }
  ) => void;
  onApplyPreset: (preset: UserPreset) => void;
  onUpdatePreset: (presetId: string) => void;
  onDeletePreset: (presetId: string) => void;
}

function sortCategoryNames(categories: Iterable<string>): string[] {
  const order = USER_PRESET_CATEGORIES as readonly string[];
  return Array.from(new Set(categories)).sort((a, b) => {
    const idxA = order.indexOf(a);
    const idxB = order.indexOf(b);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return a.localeCompare(b);
  });
}

export function UserPresetsPanel({
  presets,
  activePresetId,
  models,
  currentSnapshot,
  onSavePreset,
  onEditPreset,
  onApplyPreset,
  onUpdatePreset,
  onDeletePreset,
}: UserPresetsPanelProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftCategory, setDraftCategory] = useState('Catalog');
  const [customCategoryMode, setCustomCategoryMode] = useState(false);
  const [draftPrompt, setDraftPrompt] = useState('');

  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(
    () => new Set()
  );

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of presets) {
      const cat = p.category || 'Catalog';
      counts.set(cat, (counts.get(cat) ?? 0) + 1);
    }
    return counts;
  }, [presets]);

  const availableFilterCategories = useMemo(
    () => sortCategoryNames(categoryCounts.keys()),
    [categoryCounts]
  );

  const modalQuickCategories = useMemo(() => {
    const allCats = new Set<string>([...USER_PRESET_CATEGORIES]);
    for (const cat of categoryCounts.keys()) {
      allCats.add(cat);
    }
    return sortCategoryNames(allCats);
  }, [categoryCounts]);

  const activeCategoryFilter =
    selectedCategory === 'all' || categoryCounts.has(selectedCategory)
      ? selectedCategory
      : 'all';

  const openSaveModal = () => {
    const suggestedCat = currentSnapshot.suggestedCategory || 'Catalog';
    setEditingPresetId(null);
    setDraftName(currentSnapshot.suggestedName);
    setDraftCategory(suggestedCat);
    setCustomCategoryMode(
      !modalQuickCategories.includes(suggestedCat)
    );
    setDraftPrompt(currentSnapshot.promptText);
    setModalOpen(true);
  };

  const openEditModal = (preset: UserPreset) => {
    const cat = preset.category || 'Catalog';
    setEditingPresetId(preset.id);
    setDraftName(preset.name);
    setDraftCategory(cat);
    setCustomCategoryMode(!modalQuickCategories.includes(cat));
    setDraftPrompt(preset.promptText);
    setModalOpen(true);
  };

  const handleSubmitModal = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = draftName.trim();
    const cleanPrompt = draftPrompt.trim();
    const cleanCategory = draftCategory.trim() || 'Catalog';
    if (!cleanName || !cleanPrompt) return;

    if (editingPresetId) {
      onEditPreset(editingPresetId, {
        name: cleanName,
        category: cleanCategory,
        promptText: cleanPrompt,
      });
    } else {
      onSavePreset(cleanName, cleanCategory, cleanPrompt);
    }
    setModalOpen(false);
  };

  const filteredPresets = useMemo(() => {
    const q = search.trim().toLowerCase();
    return presets.filter((p) => {
      const cat = p.category || 'Catalog';
      if (activeCategoryFilter !== 'all' && cat !== activeCategoryFilter) {
        return false;
      }
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        cat.toLowerCase().includes(q) ||
        p.modelId.toLowerCase().includes(q) ||
        p.promptText.toLowerCase().includes(q) ||
        p.aspectRatio.toLowerCase().includes(q)
      );
    });
  }, [presets, activeCategoryFilter, search]);

  const groupedPresets = useMemo(() => {
    const map = new Map<string, UserPreset[]>();
    for (const p of filteredPresets) {
      const cat = p.category || 'Catalog';
      const list = map.get(cat) ?? [];
      list.push(p);
      map.set(cat, list);
    }
    return sortCategoryNames(map.keys()).map((cat) => ({
      category: cat,
      items: map.get(cat) ?? [],
    }));
  }, [filteredPresets]);

  const toggleCategoryCollapse = (cat: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) {
        next.delete(cat);
      } else {
        next.add(cat);
      }
      return next;
    });
  };

  const editingPreset = editingPresetId
    ? presets.find((p) => p.id === editingPresetId)
    : undefined;

  return (
    <section className="space-y-2.5" aria-labelledby="user-presets-heading">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Bookmark className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
          <h2
            id="user-presets-heading"
            className="text-[14px] font-semibold tracking-[-0.02em] text-[var(--foreground)]"
          >
            Presets
          </h2>
          {presets.length > 0 ? (
            <span className="font-mono text-[11px] tabular-nums text-[var(--muted-foreground)]">
              {presets.length}
            </span>
          ) : null}
        </div>

        <button
          type="button"
          onClick={openSaveModal}
          className="inline-flex h-6 items-center gap-1 rounded-[6px] border border-[var(--border)] bg-[var(--surface)] px-2 text-[11px] font-medium text-[var(--foreground)] transition-colors hover:border-[var(--border-hover)] cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070f3]"
        >
          <Plus className="h-3 w-3" />
          <span>Save current</span>
        </button>
      </div>

      {presets.length === 0 ? (
        <div className="flex items-center justify-between gap-3 rounded-[8px] border border-dashed border-[var(--border)] bg-[var(--surface)]/60 px-3 py-2.5">
          <p className="text-[11px] leading-snug text-[var(--muted-foreground)]">
            Save prompt, aspect ratio, resolution &amp; model settings into organized categories.
          </p>
          <button
            type="button"
            onClick={openSaveModal}
            className="shrink-0 text-[11px] font-medium text-[var(--foreground)] hover:underline cursor-pointer"
          >
            Save template
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Category Filter Chips */}
          <div
            role="tablist"
            aria-label="Filter presets by category"
            className="flex flex-wrap items-center gap-1"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeCategoryFilter === 'all'}
              onClick={() => setSelectedCategory('all')}
              className={cn(
                'inline-flex h-6 items-center gap-1 rounded-[5px] border px-2 text-[11px] font-medium transition-colors cursor-pointer',
                activeCategoryFilter === 'all'
                  ? 'border-[var(--foreground)] bg-[var(--foreground)] text-[var(--background)]'
                  : 'border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)] hover:border-[var(--border-hover)] hover:text-[var(--foreground)]'
              )}
            >
              <span>All</span>
              <span className="font-mono text-[10px] opacity-75 tabular-nums">
                {presets.length}
              </span>
            </button>

            {availableFilterCategories.map((cat) => {
              const active = activeCategoryFilter === cat;
              const count = categoryCounts.get(cat) ?? 0;
              return (
                <button
                  key={cat}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setSelectedCategory(cat)}
                  className={cn(
                    'inline-flex h-6 items-center gap-1 rounded-[5px] border px-2 text-[11px] font-medium transition-colors cursor-pointer',
                    active
                      ? 'border-[var(--foreground)] bg-[var(--foreground)] text-[var(--background)]'
                      : 'border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)] hover:border-[var(--border-hover)] hover:text-[var(--foreground)]'
                  )}
                >
                  <span>{cat}</span>
                  <span className="font-mono text-[10px] opacity-75 tabular-nums">
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {presets.length > 4 ? (
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-[var(--muted-foreground)]" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter presets by name, category, model..."
                className="h-7 pl-7 text-[11px]"
              />
            </div>
          ) : null}

          <div className="studio-scrollbar max-h-56 overflow-y-auto space-y-2 pr-0.5">
            {groupedPresets.length === 0 ? (
              <p className="py-3 text-center text-[11px] text-[var(--muted-foreground)]">
                No matching presets.
              </p>
            ) : (
              groupedPresets.map((group) => {
                const showGroupHeader =
                  activeCategoryFilter === 'all' &&
                  availableFilterCategories.length > 1;
                const isCollapsed =
                  showGroupHeader &&
                  !search.trim() &&
                  collapsedCategories.has(group.category);

                return (
                  <div key={group.category} className="space-y-1">
                    {showGroupHeader ? (
                      <button
                        type="button"
                        onClick={() => toggleCategoryCollapse(group.category)}
                        className="flex w-full items-center justify-between rounded-[5px] px-1.5 py-1 text-left font-mono text-[10px] font-medium uppercase tracking-wider text-[var(--muted-foreground)] hover:bg-[var(--surface)] hover:text-[var(--foreground)] cursor-pointer transition-colors"
                      >
                        <span className="flex items-center gap-1">
                          {isCollapsed ? (
                            <ChevronRight className="h-3 w-3" />
                          ) : (
                            <ChevronDown className="h-3 w-3" />
                          )}
                          <span>{group.category}</span>
                        </span>
                        <span className="tabular-nums">{group.items.length}</span>
                      </button>
                    ) : null}

                    {!isCollapsed ? (
                      <div className="space-y-1.5">
                        {group.items.map((preset) => {
                          const isActive = activePresetId === preset.id;
                          const modelName =
                            findModelById(models, preset.modelId)?.name ??
                            preset.modelId;

                          return (
                            <div
                              key={preset.id}
                              className={cn(
                                'group flex items-start justify-between gap-2 rounded-[8px] border p-2.5 transition-colors duration-150',
                                isActive
                                  ? 'border-[var(--foreground)] bg-[var(--surface)]'
                                  : 'border-[var(--border)] bg-[var(--card)] hover:border-[var(--border-hover)]'
                              )}
                            >
                              <button
                                type="button"
                                onClick={() => onApplyPreset(preset)}
                                className="min-w-0 flex-1 text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070f3] rounded-[4px]"
                              >
                                <div className="flex items-center gap-1.5">
                                  {isActive ? (
                                    <Check className="h-3 w-3 shrink-0 text-[var(--foreground)]" />
                                  ) : null}
                                  <span className="truncate text-[12px] font-semibold text-[var(--foreground)]">
                                    {preset.name}
                                  </span>
                                  {!showGroupHeader ? (
                                    <span className="shrink-0 rounded-[4px] border border-[var(--border)] bg-[var(--surface)] px-1.5 py-0.2 font-mono text-[9px] uppercase tracking-wider text-[var(--muted-foreground)]">
                                      {preset.category || 'Catalog'}
                                    </span>
                                  ) : null}
                                </div>

                                <div className="mt-1 flex flex-wrap items-center gap-1 font-mono text-[10px] tabular-nums text-[var(--muted-foreground)]">
                                  <span className="max-w-[130px] truncate text-[var(--foreground)]">
                                    {modelName}
                                  </span>
                                  <span>·</span>
                                  <span>{preset.aspectRatio}</span>
                                  <span>·</span>
                                  <span>
                                    {preset.resolution === 'auto'
                                      ? 'Auto res'
                                      : preset.resolution}
                                  </span>
                                  {preset.quality !== 'auto' ? (
                                    <>
                                      <span>·</span>
                                      <span>{preset.quality}</span>
                                    </>
                                  ) : null}
                                  {preset.variations > 1 ? (
                                    <>
                                      <span>·</span>
                                      <span>{preset.variations}x</span>
                                    </>
                                  ) : null}
                                </div>

                                <p className="mt-1 truncate text-[11px] text-[var(--muted-foreground)]">
                                  {preset.promptText}
                                </p>
                              </button>

                              <div className="flex items-center gap-1 shrink-0 pt-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 transition-opacity">
                                <button
                                  type="button"
                                  title="Edit preset name, category & prompt"
                                  aria-label={`Edit ${preset.name}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openEditModal(preset);
                                  }}
                                  className="inline-flex h-6 w-6 items-center justify-center rounded-[5px] border border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)] hover:border-[var(--border-hover)] hover:text-[var(--foreground)] cursor-pointer"
                                >
                                  <Pencil className="h-3 w-3" />
                                </button>
                                <button
                                  type="button"
                                  title="Update preset with current settings"
                                  aria-label={`Update ${preset.name} with current settings`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onUpdatePreset(preset.id);
                                  }}
                                  className="inline-flex h-6 w-6 items-center justify-center rounded-[5px] border border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)] hover:border-[var(--border-hover)] hover:text-[var(--foreground)] cursor-pointer"
                                >
                                  <RotateCw className="h-3 w-3" />
                                </button>
                                <button
                                  type="button"
                                  title="Delete preset"
                                  aria-label={`Delete ${preset.name}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onDeletePreset(preset.id);
                                  }}
                                  className="inline-flex h-6 w-6 items-center justify-center rounded-[5px] border border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)] hover:border-red-500/40 hover:text-red-500 cursor-pointer"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Save / Edit Preset Dialog */}
      <StudioModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        title={editingPresetId ? 'Edit preset' : 'Save generation preset'}
        className="max-w-lg p-5"
      >
        <form onSubmit={handleSubmitModal} className="space-y-4">
          <div className="space-y-1 pr-6">
            <h2 className="text-[16px] font-semibold tracking-[-0.02em] text-[var(--foreground)]">
              {editingPresetId ? 'Edit Preset' : 'Save Preset'}
            </h2>
            <p className="text-[12px] text-[var(--muted-foreground)]">
              {editingPresetId
                ? 'Organize this template by renaming it, reassigning its category, or refining its prompt.'
                : 'Capture your current prompt, aspect ratio, resolution, and model settings for instant reuse.'}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="preset-name-input">Preset name</Label>
            <Input
              id="preset-name-input"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              placeholder="e.g. Amazon White Packshot 1:1"
              maxLength={64}
              autoFocus
              required
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="preset-category-custom">Category</Label>
              <span className="flex items-center gap-1 font-mono text-[10px] text-[var(--muted-foreground)]">
                <Tag className="h-3 w-3" />
                <span>{draftCategory.trim() || 'Catalog'}</span>
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {modalQuickCategories.map((cat) => {
                const active = !customCategoryMode && draftCategory === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => {
                      setCustomCategoryMode(false);
                      setDraftCategory(cat);
                    }}
                    className={cn(
                      'inline-flex h-7 items-center rounded-[5px] border px-2.5 text-[11px] font-medium transition-colors cursor-pointer',
                      active
                        ? 'border-[var(--foreground)] bg-[var(--foreground)] text-[var(--background)]'
                        : 'border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)] hover:border-[var(--border-hover)] hover:text-[var(--foreground)]'
                    )}
                  >
                    {cat}
                  </button>
                );
              })}

              <button
                type="button"
                onClick={() => {
                  setCustomCategoryMode(true);
                  if (modalQuickCategories.includes(draftCategory)) {
                    setDraftCategory('');
                  }
                }}
                className={cn(
                  'inline-flex h-7 items-center rounded-[5px] border px-2.5 text-[11px] font-medium transition-colors cursor-pointer',
                  customCategoryMode
                    ? 'border-[var(--foreground)] bg-[var(--foreground)] text-[var(--background)]'
                    : 'border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)] hover:border-[var(--border-hover)] hover:text-[var(--foreground)]'
                )}
              >
                + Custom
              </button>
            </div>

            {customCategoryMode ? (
              <Input
                id="preset-category-custom"
                value={draftCategory}
                onChange={(e) => setDraftCategory(e.target.value)}
                placeholder="Enter custom category (e.g. Holiday, Amazon, Social)..."
                maxLength={28}
                required
              />
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="preset-prompt-input">Prompt template</Label>
            <Textarea
              id="preset-prompt-input"
              value={draftPrompt}
              onChange={(e) => setDraftPrompt(e.target.value)}
              className="min-h-[96px] font-mono text-[11px] leading-relaxed"
              maxLength={2000}
              required
            />
          </div>

          {!editingPreset ? (
            <div className="rounded-[8px] border border-[var(--border)] bg-[var(--surface)] p-3 space-y-1.5">
              <span className="block font-mono text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">
                Captured model &amp; output settings
              </span>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[11px] tabular-nums">
                <div className="truncate text-[var(--muted-foreground)]">
                  Model:{' '}
                  <span className="text-[var(--foreground)]">
                    {currentSnapshot.modelName}
                  </span>
                </div>
                <div className="text-[var(--muted-foreground)]">
                  Ratio:{' '}
                  <span className="text-[var(--foreground)]">
                    {currentSnapshot.aspectRatio}
                  </span>
                </div>
                <div className="text-[var(--muted-foreground)]">
                  Resolution:{' '}
                  <span className="text-[var(--foreground)]">
                    {currentSnapshot.resolution === 'auto'
                      ? 'Auto'
                      : currentSnapshot.resolution}
                  </span>
                </div>
                <div className="text-[var(--muted-foreground)]">
                  Quality:{' '}
                  <span className="text-[var(--foreground)]">
                    {currentSnapshot.quality === 'auto'
                      ? 'Auto'
                      : currentSnapshot.quality}
                  </span>
                </div>
                <div className="text-[var(--muted-foreground)]">
                  Variations:{' '}
                  <span className="text-[var(--foreground)]">
                    {currentSnapshot.variations}
                  </span>
                </div>
                <div className="text-[var(--muted-foreground)]">
                  Format:{' '}
                  <span className="text-[var(--foreground)]">
                    {currentSnapshot.outputFormat === 'auto'
                      ? 'Auto'
                      : currentSnapshot.outputFormat.toUpperCase()}
                  </span>
                </div>
              </div>
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] pt-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                !draftName.trim() ||
                !draftPrompt.trim() ||
                (customCategoryMode && !draftCategory.trim())
              }
            >
              {editingPresetId ? 'Save changes' : 'Save preset'}
            </Button>
          </div>
        </form>
      </StudioModal>
    </section>
  );
}
