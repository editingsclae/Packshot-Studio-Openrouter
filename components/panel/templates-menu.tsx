'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
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
  formatBatchEstimate,
  isUsageOrUnknownPriced,
  type AspectRatio,
  type ModelTier,
  type NormalizedImageModel,
} from '@/lib/models';
import type { ShotPresetId } from '@/lib/presets';
import {
  USER_PRESET_CATEGORIES,
  type ModelCostStatsMap,
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

interface TemplatesMenuProps {
  presets: UserPreset[];
  activePresetId: string | null;
  models: NormalizedImageModel[];
  costStats?: ModelCostStatsMap;
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

function isHighResolutionValue(resolution: string): boolean {
  const norm = resolution.trim().toLowerCase();
  if (!norm || norm === 'auto' || norm === '1k' || norm === '1024') return false;
  if (/^(?:[2-9]|\d{2,})k$/.test(norm)) return true;
  if (norm.includes('2k') || norm.includes('4k') || norm.includes('8k')) return true;
  const num = parseInt(norm, 10);
  return Number.isFinite(num) && num >= 2000;
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

export function TemplatesMenu({
  presets,
  activePresetId,
  models,
  costStats,
  currentSnapshot,
  onSavePreset,
  onEditPreset,
  onApplyPreset,
  onUpdatePreset,
  onDeletePreset,
}: TemplatesMenuProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
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

  const containerRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const activePreset = useMemo(
    () =>
      activePresetId
        ? presets.find((p) => p.id === activePresetId) ?? null
        : null,
    [presets, activePresetId]
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

  useEffect(() => {
    if (!dropdownOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !modalOpen) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    window.addEventListener('keydown', handleEsc);
    const t = setTimeout(() => searchInputRef.current?.focus(), 20);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [dropdownOpen, modalOpen]);

  const openSaveModal = () => {
    const suggestedCat = currentSnapshot.suggestedCategory || 'Catalog';
    setDropdownOpen(false);
    setEditingPresetId(null);
    setDraftName(currentSnapshot.suggestedName);
    setDraftCategory(suggestedCat);
    setCustomCategoryMode(!modalQuickCategories.includes(suggestedCat));
    setDraftPrompt(currentSnapshot.promptText);
    setModalOpen(true);
  };

  const openEditModal = (preset: UserPreset) => {
    const cat = preset.category || 'Catalog';
    setDropdownOpen(false);
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
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-expanded={dropdownOpen}
        aria-haspopup="menu"
        onClick={() => setDropdownOpen((prev) => !prev)}
        className={cn(
          'inline-flex h-8 items-center gap-1.5 rounded-[6px] border px-2.5 text-[12px] font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070f3]',
          dropdownOpen || activePreset
            ? 'border-[var(--border-hover)] bg-[var(--surface)] text-[var(--foreground)]'
            : 'border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] hover:border-[var(--border-hover)]'
        )}
      >
        <Bookmark className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
        <span className="truncate max-w-[140px]">
          {activePreset ? activePreset.name : 'Templates'}
        </span>
        {presets.length > 0 ? (
          <span className="rounded-[4px] border border-[var(--border)] bg-[var(--card)] px-1 font-mono text-[10px] tabular-nums text-[var(--muted-foreground)]">
            {presets.length}
          </span>
        ) : null}
        <ChevronDown
          className={cn(
            'h-3 w-3 text-[var(--muted-foreground)] transition-transform duration-150',
            dropdownOpen && 'rotate-180'
          )}
        />
      </button>

      {dropdownOpen ? (
        <div
          role="menu"
          aria-label="Saved templates"
          className="absolute left-0 z-50 mt-1.5 w-[356px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-[8px] border border-[var(--border)] bg-[var(--card)]"
        >
          {/* Header with quick Save current setup action */}
          <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--surface)]/60 px-2.5 py-2">
            <span className="font-mono text-[10px] font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
              Saved templates ({presets.length})
            </span>
            <button
              type="button"
              onClick={openSaveModal}
              className="inline-flex h-6 items-center gap-1 rounded-[5px] border border-[var(--foreground)] bg-[var(--foreground)] px-2 text-[11px] font-medium text-[var(--background)] hover:opacity-90 cursor-pointer transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070f3]"
            >
              <Plus className="h-3 w-3" />
              <span>Save current setup</span>
            </button>
          </div>

          {presets.length === 0 ? (
            <div className="p-4 text-center space-y-2">
              <p className="text-[12px] text-[var(--muted-foreground)]">
                Save your shot, prompt, and model settings as a reusable template.
              </p>
              <button
                type="button"
                onClick={openSaveModal}
                className="inline-flex h-7 items-center gap-1.5 rounded-[6px] border border-[var(--border)] bg-[var(--surface)] px-2.5 text-[11px] font-medium text-[var(--foreground)] hover:border-[var(--border-hover)] cursor-pointer"
              >
                <Plus className="h-3 w-3" />
                <span>Save current setup</span>
              </button>
            </div>
          ) : (
            <>
              {(presets.length > 2 || availableFilterCategories.length > 1) ? (
                <div className="border-b border-[var(--border)] p-2 space-y-2">
                  {presets.length > 2 ? (
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--muted-foreground)]" />
                      <Input
                        ref={searchInputRef}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Filter templates by name, category, model..."
                        className="h-8 pl-8 text-[12px]"
                      />
                    </div>
                  ) : null}

                  {availableFilterCategories.length > 1 ? (
                    <div
                      role="tablist"
                      aria-label="Filter templates by category"
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
                  ) : null}
                </div>
              ) : null}

              <div className="studio-scrollbar max-h-72 overflow-y-auto p-1.5 space-y-2">
                {groupedPresets.length === 0 ? (
                  <p className="py-5 text-center text-[12px] text-[var(--muted-foreground)]">
                    No matching templates.
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
                            className="flex w-full items-center justify-between rounded-[5px] px-2 py-1 text-left font-mono text-[10px] font-medium uppercase tracking-wider text-[var(--muted-foreground)] hover:bg-[var(--surface)] hover:text-[var(--foreground)] cursor-pointer transition-colors"
                          >
                            <span className="flex items-center gap-1">
                              {isCollapsed ? (
                                <ChevronRight className="h-3 w-3" />
                              ) : (
                                <ChevronDown className="h-3 w-3" />
                              )}
                              <span>{group.category}</span>
                            </span>
                            <span className="tabular-nums">
                              {group.items.length}
                            </span>
                          </button>
                        ) : null}

                        {!isCollapsed ? (
                          <div className="space-y-1">
                            {group.items.map((preset) => {
                              const isActive = activePresetId === preset.id;
                              const presetModel = findModelById(
                                models,
                                preset.modelId
                              );
                              const modelName =
                                presetModel?.name ?? preset.modelId;
                              const presetEstimate = presetModel
                                ? formatBatchEstimate(
                                    presetModel,
                                    Math.max(1, preset.variations || 1),
                                    costStats?.[presetModel.id]
                                  )
                                : null;
                              const costDisplayLabel = !presetEstimate
                                ? 'unknown cost'
                                : presetModel?.tier === 'free'
                                  ? 'Free'
                                  : presetEstimate.exactTotalUsd !== null
                                    ? presetEstimate.label
                                    : 'unknown cost';

                              const isUsageOrUnknownModel =
                                !presetModel || isUsageOrUnknownPriced(presetModel);
                              const showHighCostWarning =
                                isUsageOrUnknownModel &&
                                (isHighResolutionValue(preset.resolution) ||
                                  (preset.variations || 1) >= 3);

                              return (
                                <div
                                  key={preset.id}
                                  className={cn(
                                    'group flex items-start justify-between gap-2 rounded-[6px] px-2 py-2 transition-colors',
                                    isActive
                                      ? 'bg-[var(--surface)]'
                                      : 'hover:bg-[var(--surface)]/70'
                                  )}
                                >
                                  <button
                                    type="button"
                                    onClick={() => {
                                      onApplyPreset(preset);
                                      setDropdownOpen(false);
                                      setSearch('');
                                    }}
                                    className="min-w-0 flex-1 text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070f3] rounded-[4px]"
                                  >
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      {isActive ? (
                                        <Check className="h-3.5 w-3.5 shrink-0 text-[var(--foreground)]" />
                                      ) : null}
                                      <span className="truncate text-[12px] font-semibold text-[var(--foreground)]">
                                        {preset.name}
                                      </span>
                                      {!showGroupHeader ? (
                                        <span className="shrink-0 rounded-[4px] border border-[var(--border)] bg-[var(--background)] px-1.5 py-0.2 font-mono text-[9px] uppercase tracking-wider text-[var(--muted-foreground)]">
                                          {preset.category || 'Catalog'}
                                        </span>
                                      ) : null}
                                      <span className="shrink-0 rounded-[4px] border border-[var(--border)] bg-[var(--background)] px-1.5 py-0.2 font-mono text-[9px] tabular-nums text-[var(--muted-foreground)]">
                                        {costDisplayLabel}
                                      </span>
                                      {showHighCostWarning ? (
                                        <span
                                          title="2K+ resolution or 3+ variations on a usage-based or unknown-price model — verify before generating"
                                          className="inline-flex shrink-0 items-center gap-1 rounded-[4px] border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.2 font-mono text-[9px] font-medium text-amber-500"
                                        >
                                          <AlertTriangle className="h-2.5 w-2.5" />
                                          <span>High cost risk</span>
                                        </span>
                                      ) : null}
                                    </div>

                                    <div className="mt-0.5 flex flex-wrap items-center gap-1 font-mono text-[10px] tabular-nums text-[var(--muted-foreground)]">
                                      <span className="max-w-[130px] truncate text-[var(--foreground)]">
                                        {modelName}
                                      </span>
                                      <span>·</span>
                                      <span>{preset.aspectRatio}</span>
                                      <span>·</span>
                                      <span>
                                        {preset.variations}{' '}
                                        {preset.variations === 1 ? 'var' : 'vars'}
                                      </span>
                                    </div>

                                    <p className="mt-0.5 truncate text-[11px] text-[var(--muted-foreground)]">
                                      {preset.promptText}
                                    </p>
                                  </button>

                                  <div className="flex items-center gap-1 shrink-0 pt-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 transition-opacity">
                                    <button
                                      type="button"
                                      title="Edit template name, category & prompt"
                                      aria-label={`Edit ${preset.name}`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openEditModal(preset);
                                      }}
                                      className="inline-flex h-6 w-6 items-center justify-center rounded-[5px] border border-[var(--border)] bg-[var(--background)] text-[var(--muted-foreground)] hover:border-[var(--border-hover)] hover:text-[var(--foreground)] cursor-pointer"
                                    >
                                      <Pencil className="h-3 w-3" />
                                    </button>
                                    <button
                                      type="button"
                                      title="Update template with current settings"
                                      aria-label={`Update ${preset.name} with current settings`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onUpdatePreset(preset.id);
                                      }}
                                      className="inline-flex h-6 w-6 items-center justify-center rounded-[5px] border border-[var(--border)] bg-[var(--background)] text-[var(--muted-foreground)] hover:border-[var(--border-hover)] hover:text-[var(--foreground)] cursor-pointer"
                                    >
                                      <RotateCw className="h-3 w-3" />
                                    </button>
                                    <button
                                      type="button"
                                      title="Delete template"
                                      aria-label={`Delete ${preset.name}`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onDeletePreset(preset.id);
                                      }}
                                      className="inline-flex h-6 w-6 items-center justify-center rounded-[5px] border border-[var(--border)] bg-[var(--background)] text-[var(--muted-foreground)] hover:border-red-500/40 hover:text-red-500 cursor-pointer"
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
            </>
          )}
        </div>
      ) : null}

      {/* Save / Edit Template Dialog */}
      <StudioModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        title={editingPresetId ? 'Edit template' : 'Save template'}
        className="max-w-lg p-5"
      >
        <form onSubmit={handleSubmitModal} className="space-y-4">
          <div className="space-y-1 pr-6">
            <h2 className="text-[16px] font-semibold tracking-[-0.02em] text-[var(--foreground)]">
              {editingPresetId ? 'Edit Template' : 'Save Template'}
            </h2>
            <p className="text-[12px] text-[var(--muted-foreground)]">
              {editingPresetId
                ? 'Organize this template by renaming it, reassigning its category, or refining its prompt.'
                : 'Capture your current prompt, aspect ratio, resolution, and model settings for instant reuse.'}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="template-name-input">Template name</Label>
            <Input
              id="template-name-input"
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
              <Label htmlFor="template-category-custom">Category</Label>
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
                id="template-category-custom"
                value={draftCategory}
                onChange={(e) => setDraftCategory(e.target.value)}
                placeholder="Enter custom category (e.g. Holiday, Amazon, Social)..."
                maxLength={28}
                required
              />
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="template-prompt-input">Prompt template</Label>
            <Textarea
              id="template-prompt-input"
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
              {editingPresetId ? 'Save changes' : 'Save template'}
            </Button>
          </div>
        </form>
      </StudioModal>
    </div>
  );
}
