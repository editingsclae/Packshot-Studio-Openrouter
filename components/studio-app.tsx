'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Aperture,
  Check,
  RotateCcw,
  Sparkles,
  Wand2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  ASPECT_RATIOS,
  getModelSpec,
  MODEL_CATALOG,
  type AspectRatio,
  type ModelSpec,
} from '@/lib/models';
import {
  getShotPreset,
  SHOT_PRESETS,
  type ShotPresetId,
} from '@/lib/presets';
import {
  buildPrompt,
  DEFAULT_BRIEF,
  SAMPLE_BRIEFS,
  type ProductBrief,
  type SampleBriefPreset,
} from '@/lib/prompt-engine';
import { analyzePackshotImage } from '@/lib/packshot-check';
import {
  DEFAULT_SETTINGS,
  loadHistory,
  loadSettings,
  saveHistory,
  saveSettings,
  type GeneratedImageItem,
  type GenerationRecord,
  type StudioSettings,
} from '@/lib/db';
import { TopBar, type StudioTab } from '@/components/top-bar';
import { CommandPalette } from '@/components/command-palette';
import { BriefForm } from '@/components/brief-form';
import { ImageResultCard } from '@/components/image-result-card';
import { LightboxModal } from '@/components/lightbox-modal';
import { LibraryView } from '@/components/library-view';
import { SettingsView } from '@/components/settings-view';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

export function StudioApp() {
  const [activeTab, setActiveTab] = useState<StudioTab>('generate');
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  // Persistent settings & history (IndexedDB via idb-keyval)
  const [settings, setSettings] = useState<StudioSettings>(DEFAULT_SETTINGS);
  const [history, setHistory] = useState<GenerationRecord[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Live model discovery metadata from /api/models
  const [models, setModels] = useState<ModelSpec[]>(MODEL_CATALOG);
  const [serverStatus, setServerStatus] = useState<{
    hasApiKey: boolean;
    enhancerModel: string;
  } | null>(null);

  // Generation control state
  const [brief, setBrief] = useState<ProductBrief>(DEFAULT_BRIEF);
  const [shotId, setShotId] = useState<ShotPresetId>('marketplace-packshot');
  const [modelId, setModelId] = useState<string>(DEFAULT_SETTINGS.defaultModel);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(
    DEFAULT_SETTINGS.defaultAspectRatio
  );
  const [variations, setVariations] = useState<number>(2);
  const [enhanceEnabled, setEnhanceEnabled] = useState<boolean>(false);
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [activeRefineChips, setActiveRefineChips] = useState<string[]>([]);

  // Prompt inspector override state
  const [promptEditedManually, setPromptEditedManually] = useState(false);
  const [manualPromptText, setManualPromptText] = useState('');
  const [isEnhancingPreview, setIsEnhancingPreview] = useState(false);

  // Active generation & canvas state
  const [isGenerating, setIsGenerating] = useState(false);
  const [pendingSlots, setPendingSlots] = useState(0);
  const [currentRecord, setCurrentRecord] = useState<GenerationRecord | null>(null);
  const [generationErrors, setGenerationErrors] = useState<string[]>([]);
  const [unavailableModelBanner, setUnavailableModelBanner] = useState<string | null>(null);

  // Lightbox state
  const [lightboxState, setLightboxState] = useState<{
    open: boolean;
    record: GenerationRecord | null;
    index: number;
  }>({ open: false, record: null, index: 0 });

  // Hydrate settings & history from IndexedDB + discover models
  useEffect(() => {
    let active = true;
    (async () => {
      const [loadedSettings, loadedHistory] = await Promise.all([
        loadSettings(),
        loadHistory(),
      ]);
      if (!active) return;
      setSettings(loadedSettings);
      setModelId(loadedSettings.defaultModel);
      setAspectRatio(loadedSettings.defaultAspectRatio);
      setHistory(loadedHistory);
      if (loadedHistory.length > 0) {
        setCurrentRecord(loadedHistory[0]);
      }
      setHydrated(true);
    })();

    fetch('/api/models')
      .then((res) => (res.ok ? res.json() : null))
      .then(
        (
          data: {
            models?: ModelSpec[];
            hasApiKey?: boolean;
            enhancerModel?: string;
          } | null
        ) => {
          if (!active || !data) return;
          if (Array.isArray(data.models) && data.models.length > 0) {
            setModels(data.models);
          }
          setServerStatus({
            hasApiKey: Boolean(data.hasApiKey),
            enhancerModel: data.enhancerModel || 'openai/gpt-4o-mini',
          });
        }
      )
      .catch(() => {
        // Catalog fallback remains active
      });

    return () => {
      active = false;
    };
  }, []);

  // Sync HTML .dark class with settings.theme
  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [settings.theme]);

  const updateSettings = useCallback((patch: Partial<StudioSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      void saveSettings(next);
      return next;
    });
  }, []);

  const selectedModel = useMemo(
    () => models.find((m) => m.id === modelId) ?? getModelSpec(modelId),
    [models, modelId]
  );

  const selectedShot = useMemo(() => getShotPreset(shotId), [shotId]);

  const deterministicPrompt = useMemo(
    () =>
      buildPrompt(brief, shotId, {
        refineChipIds: activeRefineChips,
      }),
    [brief, shotId, activeRefineChips]
  );

  const activePrompt = promptEditedManually ? manualPromptText : deterministicPrompt;

  const handleSelectShotPreset = useCallback((nextShotId: ShotPresetId) => {
    const preset = getShotPreset(nextShotId);
    setShotId(nextShotId);
    setAspectRatio(preset.defaultAspectRatio);
    setActiveRefineChips([]);
    setPromptEditedManually(false);
  }, []);

  const handleLoadSample = useCallback((sample: SampleBriefPreset) => {
    const preset = getShotPreset(sample.shotId);
    setBrief(sample.brief);
    setShotId(sample.shotId);
    setAspectRatio(preset.defaultAspectRatio);
    setActiveRefineChips([]);
    setPromptEditedManually(false);
    toast.success(`Loaded "${sample.label}" brief`);
  }, []);

  const handlePreviewEnhance = useCallback(async () => {
    if (isEnhancingPreview) return;
    try {
      setIsEnhancingPreview(true);
      const res = await fetch('/api/enhance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: activePrompt }),
      });
      const json = (await res.json()) as { prompt?: string; enhanced?: boolean };
      if (json?.prompt) {
        setManualPromptText(json.prompt);
        setPromptEditedManually(true);
        if (json.enhanced) {
          toast.success('Prompt enhanced with AI');
        } else {
          toast.info('Enhancer unavailable — kept deterministic prompt');
        }
      }
    } catch {
      toast.info('Enhancer unavailable — kept deterministic prompt');
    } finally {
      setIsEnhancingPreview(false);
    }
  }, [activePrompt, isEnhancingPreview]);

  const runGeneration = useCallback(
    async (override?: {
      prompt?: string;
      promptEditedManually?: boolean;
      refineChipIds?: string[];
      enhance?: boolean;
    }) => {
      if (isGenerating) return;
      if (!brief.name.trim()) {
        toast.error('Please enter a product name or type first.');
        return;
      }

      const targetPrompt = override?.prompt ?? activePrompt;
      const targetEditedManually =
        override?.promptEditedManually ?? promptEditedManually;
      const targetRefineChips = override?.refineChipIds ?? activeRefineChips;
      const targetEnhance = override?.enhance ?? enhanceEnabled;

      setIsGenerating(true);
      setPendingSlots(variations);
      setGenerationErrors([]);
      setUnavailableModelBanner(null);

      try {
        const res = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: targetPrompt,
            model: modelId,
            aspectRatio,
            variations,
            enhance: targetEnhance,
            promptEditedManually: targetEditedManually,
            rgbColors: brief.colors,
            backgroundRgbColor: selectedShot.isWhiteBackground
              ? '#FFFFFF'
              : brief.useBackgroundColor
                ? brief.backgroundColor
                : undefined,
            inputReference:
              selectedModel.supportsReference && referenceImage
                ? referenceImage
                : undefined,
          }),
        });

        const payload = (await res.json()) as {
          error?: string;
          isModelUnavailable?: boolean;
          promptUsed?: string;
          enhanced?: boolean;
          images?: Array<{
            index: number;
            dataUrl: string;
            mediaType: string;
            seed?: number;
            cost: number | null;
            durationMs: number;
          }>;
          errors?: Array<{ message: string; isModelUnavailable?: boolean }>;
          totalCost?: number;
          totalDurationMs?: number;
        };

        if (!res.ok) {
          if (res.status === 404 || res.status === 410 || payload.isModelUnavailable) {
            setUnavailableModelBanner(
              payload.error ||
                `Model ${selectedModel.name} returned ${res.status}. Pick another model to continue.`
            );
          }
          toast.error(payload.error || 'Generation failed');
          return;
        }

        const rawImages = payload.images ?? [];
        const isWhiteBg =
          selectedShot.isWhiteBackground ||
          (brief.useBackgroundColor &&
            brief.backgroundColor.toUpperCase() === '#FFFFFF');

        // Run client-side Packshot Checker on white-background shots
        const processedImages: GeneratedImageItem[] = await Promise.all(
          rawImages.map(async (img) => {
            let packshotCheck = undefined;
            if (isWhiteBg) {
              try {
                packshotCheck = await analyzePackshotImage(img.dataUrl);
              } catch {
                packshotCheck = undefined;
              }
            }
            return {
              id: `${Date.now()}-${img.index}-${Math.random().toString(36).slice(2, 7)}`,
              dataUrl: img.dataUrl,
              mediaType: img.mediaType,
              seed: img.seed,
              cost: img.cost,
              durationMs: img.durationMs,
              packshotCheck,
              favorite: false,
            };
          })
        );

        const newRecord: GenerationRecord = {
          id: `gen-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          createdAt: Date.now(),
          brief: { ...brief },
          shotId,
          modelId,
          aspectRatio,
          prompt: payload.promptUsed || targetPrompt,
          enhanced: Boolean(payload.enhanced),
          refineChips: targetRefineChips,
          images: processedImages,
          totalCost: payload.totalCost ?? 0,
          totalDurationMs: payload.totalDurationMs ?? 0,
        };

        setCurrentRecord(newRecord);
        setHistory((prev) => {
          const next = [newRecord, ...prev].slice(0, 100);
          void saveHistory(next);
          return next;
        });

        if (payload.errors && payload.errors.length > 0) {
          setGenerationErrors(payload.errors.map((e) => e.message));
          toast.warning(
            `${processedImages.length} of ${variations} variations generated (${payload.errors.length} failed)`
          );
        } else {
          toast.success(
            `Generated ${processedImages.length} ${processedImages.length === 1 ? 'image' : 'images'}`
          );
        }
      } catch {
        toast.error('Network error reaching generation endpoint.');
      } finally {
        setIsGenerating(false);
        setPendingSlots(0);
      }
    },
    [
      isGenerating,
      brief,
      activePrompt,
      promptEditedManually,
      activeRefineChips,
      enhanceEnabled,
      variations,
      modelId,
      aspectRatio,
      selectedShot.isWhiteBackground,
      selectedModel.supportsReference,
      selectedModel.name,
      referenceImage,
      shotId,
    ]
  );

  const handleRefine = useCallback(
    (chipId: string) => {
      const nextChips = activeRefineChips.includes(chipId)
        ? activeRefineChips
        : [...activeRefineChips, chipId];
      setActiveRefineChips(nextChips);
      setPromptEditedManually(false);
      const nextPrompt = buildPrompt(brief, shotId, {
        refineChipIds: nextChips,
      });
      void runGeneration({
        prompt: nextPrompt,
        promptEditedManually: false,
        refineChipIds: nextChips,
      });
    },
    [activeRefineChips, brief, shotId, runGeneration]
  );

  const handleToggleFavorite = useCallback((recordId: string, imageId: string) => {
    setHistory((prev) => {
      const next = prev.map((rec) =>
        rec.id !== recordId
          ? rec
          : {
              ...rec,
              images: rec.images.map((img) =>
                img.id === imageId ? { ...img, favorite: !img.favorite } : img
              ),
            }
      );
      void saveHistory(next);
      return next;
    });
    setCurrentRecord((prev) =>
      prev && prev.id === recordId
        ? {
            ...prev,
            images: prev.images.map((img) =>
              img.id === imageId ? { ...img, favorite: !img.favorite } : img
            ),
          }
        : prev
    );
    setLightboxState((prev) =>
      prev.record && prev.record.id === recordId
        ? {
            ...prev,
            record: {
              ...prev.record,
              images: prev.record.images.map((img) =>
                img.id === imageId ? { ...img, favorite: !img.favorite } : img
              ),
            },
          }
        : prev
    );
  }, []);

  const handleDeleteImage = useCallback((recordId: string, imageId: string) => {
    setHistory((prev) => {
      const next = prev
        .map((rec) =>
          rec.id !== recordId
            ? rec
            : { ...rec, images: rec.images.filter((img) => img.id !== imageId) }
        )
        .filter((rec) => rec.images.length > 0);
      void saveHistory(next);
      return next;
    });
    setCurrentRecord((prev) => {
      if (!prev || prev.id !== recordId) return prev;
      const remaining = prev.images.filter((img) => img.id !== imageId);
      return remaining.length > 0 ? { ...prev, images: remaining } : null;
    });
    toast.success('Image removed');
  }, []);

  const handleRemixRecord = useCallback((record: GenerationRecord) => {
    setBrief(record.brief);
    setShotId(record.shotId);
    setModelId(record.modelId);
    setAspectRatio(record.aspectRatio);
    setActiveRefineChips(record.refineChips ?? []);
    setManualPromptText(record.prompt);
    setPromptEditedManually(true);
    setActiveTab('generate');
    toast.success(`Loaded "${record.brief.name}" into Studio`);
  }, []);

  const handleClearLibrary = useCallback(() => {
    setHistory([]);
    setCurrentRecord(null);
    void saveHistory([]);
    toast.success('Local library cleared');
  }, []);

  // Global keyboard shortcuts: Cmd/Ctrl+K (Palette), Cmd/Ctrl+Enter (Generate)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        if (activeTab === 'generate' && !commandPaletteOpen && !lightboxState.open) {
          e.preventDefault();
          void runGeneration();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeTab, commandPaletteOpen, lightboxState.open, runGeneration]);

  const totalSavedImages = useMemo(
    () => history.reduce((sum, r) => sum + r.images.length, 0),
    [history]
  );

  const isCurrentWhiteBg = useMemo(() => {
    if (!currentRecord) return false;
    const preset = getShotPreset(currentRecord.shotId);
    return (
      preset.isWhiteBackground ||
      (currentRecord.brief.useBackgroundColor &&
        currentRecord.brief.backgroundColor.toUpperCase() === '#FFFFFF')
    );
  }, [currentRecord]);

  return (
    <div className="min-h-screen flex flex-col bg-[var(--background)] text-[var(--foreground)]">
      <TopBar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        theme={settings.theme}
        onToggleTheme={() =>
          updateSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' })
        }
        onOpenCommandPalette={() => setCommandPaletteOpen(true)}
        libraryCount={totalSavedImages}
      />

      <main className="flex-1">
        {activeTab === 'generate' ? (
          <div className="mx-auto grid max-w-[1600px] grid-cols-1 lg:grid-cols-[410px_minmax(0,1fr)] min-h-[calc(100vh-56px)]">
            {/* Left Control Panel */}
            <aside className="studio-scrollbar border-b lg:border-b-0 lg:border-r border-[var(--border)] bg-[var(--background)] p-4 sm:p-5 pb-24 lg:pb-8 space-y-6 lg:max-h-[calc(100vh-56px)] lg:overflow-y-auto">
              {/* Section 1: Product Brief */}
              <section className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-[14px] font-semibold tracking-[-0.02em] text-[var(--foreground)]">
                    1. Product Brief
                  </h2>
                  <div className="flex items-center gap-1">
                    {SAMPLE_BRIEFS.slice(0, 2).map((sample) => (
                      <button
                        key={sample.id}
                        type="button"
                        onClick={() => handleLoadSample(sample)}
                        className="h-6 rounded-[6px] border border-[var(--border)] bg-[var(--surface)] px-2 text-[11px] text-[var(--muted-foreground)] hover:border-[var(--border-hover)] hover:text-[var(--foreground)] cursor-pointer transition-colors whitespace-nowrap"
                      >
                        {sample.label}
                      </button>
                    ))}
                  </div>
                </div>

                <BriefForm
                  brief={brief}
                  onChange={(next) => {
                    setBrief(next);
                    if (promptEditedManually) {
                      setPromptEditedManually(false);
                    }
                  }}
                  selectedModel={selectedModel}
                  referenceImage={referenceImage}
                  onReferenceImageChange={setReferenceImage}
                  isWhiteBackgroundPreset={selectedShot.isWhiteBackground}
                />
              </section>

              <hr className="border-[var(--border)]" />

              {/* Section 2: Shot Preset */}
              <section className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h2 className="text-[14px] font-semibold tracking-[-0.02em] text-[var(--foreground)]">
                    2. Shot Type
                  </h2>
                  <span className="font-mono text-[11px] text-[var(--muted-foreground)]">
                    {selectedShot.defaultAspectRatio} default
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {SHOT_PRESETS.map((preset) => {
                    const active = shotId === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => handleSelectShotPreset(preset.id)}
                        className={cn(
                          'flex flex-col items-start rounded-[8px] border p-2.5 text-left transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070f3]',
                          active
                            ? 'border-[var(--foreground)] bg-[var(--surface)]'
                            : 'border-[var(--border)] bg-[var(--card)] hover:border-[var(--border-hover)]'
                        )}
                      >
                        <div className="flex w-full items-center justify-between gap-1">
                          <span className="text-[12px] font-semibold text-[var(--foreground)] truncate">
                            {preset.name}
                          </span>
                          {active ? (
                            <Check className="h-3.5 w-3.5 shrink-0 text-[var(--foreground)]" />
                          ) : null}
                        </div>
                        <span className="mt-1 line-clamp-2 text-[11px] leading-snug text-[var(--muted-foreground)]">
                          {preset.shortDescription}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>

              <hr className="border-[var(--border)]" />

              {/* Section 3: Model, Aspect Ratio, Variations, Enhance */}
              <section className="space-y-4">
                <h2 className="text-[14px] font-semibold tracking-[-0.02em] text-[var(--foreground)]">
                  3. Model & Output
                </h2>

                <div className="space-y-1.5">
                  <Label htmlFor="model-select">Generation model</Label>
                  <Select
                    value={modelId}
                    onValueChange={(val) => {
                      setModelId(val);
                      setUnavailableModelBanner(null);
                    }}
                  >
                    <SelectTrigger id="model-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {models.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name} — {m.priceLabel}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <div className="rounded-[8px] border border-[var(--border)] bg-[var(--surface)] p-2.5 text-[12px]">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-[11px] text-[var(--foreground)] tabular-nums">
                        {selectedModel.priceLabel} · {selectedModel.maxResolution} ·{' '}
                        {selectedModel.latencyHint}
                      </span>
                      {selectedModel.badge ? (
                        <span className="rounded-[4px] border border-[var(--border)] bg-[var(--card)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--foreground)]">
                          {selectedModel.badge}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-[var(--muted-foreground)]">
                      {selectedModel.note}
                    </p>
                  </div>
                </div>

                {/* Aspect Ratio Chips */}
                <div className="space-y-1.5">
                  <Label>Aspect ratio</Label>
                  <div className="grid grid-cols-5 gap-1.5">
                    {ASPECT_RATIOS.map((ar) => {
                      const active = aspectRatio === ar.value;
                      return (
                        <button
                          key={ar.value}
                          type="button"
                          onClick={() => setAspectRatio(ar.value)}
                          title={ar.hint}
                          className={cn(
                            'h-8 rounded-[6px] border font-mono text-[12px] transition-colors duration-150 cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070f3]',
                            active
                              ? 'border-[var(--foreground)] bg-[var(--foreground)] text-[var(--background)] font-medium'
                              : 'border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] hover:border-[var(--border-hover)]'
                          )}
                        >
                          {ar.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Variations (1..4) & Enhance with AI switch */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Variations</Label>
                    <div className="grid grid-cols-4 gap-1">
                      {[1, 2, 3, 4].map((count) => {
                        const active = variations === count;
                        return (
                          <button
                            key={count}
                            type="button"
                            onClick={() => setVariations(count)}
                            className={cn(
                              'h-8 rounded-[6px] border font-mono text-[12px] tabular-nums transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070f3]',
                              active
                                ? 'border-[var(--foreground)] bg-[var(--foreground)] text-[var(--background)] font-medium'
                                : 'border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] hover:border-[var(--border-hover)]'
                            )}
                          >
                            {count}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="enhance-switch">Enhance with AI</Label>
                    <div className="flex h-8 items-center justify-between rounded-[6px] border border-[var(--border)] bg-[var(--surface)] px-2.5">
                      <span className="text-[12px] text-[var(--muted-foreground)]">
                        {enhanceEnabled ? 'Enabled' : 'Deterministic'}
                      </span>
                      <Switch
                        id="enhance-switch"
                        checked={enhanceEnabled}
                        onCheckedChange={setEnhanceEnabled}
                      />
                    </div>
                  </div>
                </div>

                {/* Prompt Inspector */}
                {settings.showPromptInspector ? (
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between gap-2">
                      <Label htmlFor="prompt-inspector">Prompt inspector</Label>
                      <div className="flex items-center gap-2">
                        {enhanceEnabled ? (
                          <button
                            type="button"
                            disabled={isEnhancingPreview}
                            onClick={handlePreviewEnhance}
                            className="inline-flex items-center gap-1 text-[11px] text-[#0070f3] hover:underline cursor-pointer disabled:opacity-50"
                          >
                            <Wand2 className="h-3 w-3" />
                            <span>{isEnhancingPreview ? 'Enhancing...' : 'Preview AI'}</span>
                          </button>
                        ) : null}
                        {promptEditedManually ? (
                          <button
                            type="button"
                            onClick={() => setPromptEditedManually(false)}
                            className="inline-flex items-center gap-1 text-[11px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer"
                          >
                            <RotateCcw className="h-3 w-3" />
                            <span>Reset to auto-built</span>
                          </button>
                        ) : null}
                      </div>
                    </div>

                    <Textarea
                      id="prompt-inspector"
                      value={activePrompt}
                      onChange={(e) => {
                        setManualPromptText(e.target.value);
                        setPromptEditedManually(true);
                      }}
                      className="min-h-[112px] font-mono text-[11px] leading-relaxed"
                      maxLength={2000}
                    />
                    <div className="flex items-center justify-between font-mono text-[11px] text-[var(--muted-foreground)] tabular-nums">
                      <span>
                        {promptEditedManually ? 'Manual override active' : 'Auto-built Realism Engine'}
                      </span>
                      <span>{activePrompt.length}/2000</span>
                    </div>
                  </div>
                ) : null}
              </section>

              {/* Desktop Generate CTA */}
              <div className="hidden lg:block pt-2">
                <Button
                  type="button"
                  size="lg"
                  disabled={isGenerating}
                  onClick={() => void runGeneration()}
                  className="w-full justify-between"
                >
                  <span>
                    {isGenerating
                      ? `Generating ${pendingSlots} ${pendingSlots === 1 ? 'shot' : 'shots'}...`
                      : `Generate ${variations} ${variations === 1 ? 'shot' : 'shots'}`}
                  </span>
                  <kbd className="font-mono text-[11px] opacity-75">⌘↵</kbd>
                </Button>
              </div>
            </aside>

            {/* Right Studio Canvas */}
            <section className="studio-dot-grid relative flex flex-col p-4 sm:p-6 pb-24 lg:pb-8 min-w-0">
              {/* Unavailable Model (404 / 410) Banner */}
              {unavailableModelBanner ? (
                <div
                  role="alert"
                  className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-amber-500/40 bg-[var(--card)] px-4 py-3 text-[13px]"
                >
                  <div className="flex items-center gap-2.5 text-[var(--foreground)]">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
                    <span>{unavailableModelBanner}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setModelId('recraft/recraft-v4.1-flash');
                        setUnavailableModelBanner(null);
                      }}
                    >
                      Switch to v4.1 Flash
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setUnavailableModelBanner(null)}
                    >
                      Dismiss
                    </Button>
                  </div>
                </div>
              ) : null}

              {/* Canvas Header Bar */}
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  {isGenerating ? (
                    <span className="inline-flex items-center gap-2 rounded-[6px] border border-[var(--border)] bg-[var(--card)] px-2.5 py-1 text-[12px] text-[var(--foreground)]">
                      <span className="h-2 w-2 rounded-full bg-[#0070f3]" />
                      <span>Generating {pendingSlots}</span>
                    </span>
                  ) : currentRecord ? (
                    <span className="inline-flex items-center gap-2 rounded-[6px] border border-[var(--border)] bg-[var(--card)] px-2.5 py-1 text-[12px] text-[var(--foreground)]">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      <span>Complete</span>
                    </span>
                  ) : null}

                  {currentRecord && !isGenerating ? (
                    <span className="font-mono text-[12px] tabular-nums text-[var(--muted-foreground)]">
                      {currentRecord.totalCost > 0
                        ? `$${currentRecord.totalCost.toFixed(3)}`
                        : 'Free'}{' '}
                      · {(currentRecord.totalDurationMs / 1000).toFixed(1)}s total ·{' '}
                      {getModelSpec(currentRecord.modelId).shortName}
                    </span>
                  ) : null}
                </div>

                {currentRecord && currentRecord.enhanced ? (
                  <span className="font-mono text-[11px] text-[var(--muted-foreground)]">
                    AI-enhanced prompt applied
                  </span>
                ) : null}
              </div>

              {/* Partial Failure Notice */}
              {generationErrors.length > 0 ? (
                <div className="mb-4 rounded-[8px] border border-amber-500/30 bg-[var(--card)] px-3.5 py-2.5 text-[12px] text-[var(--muted-foreground)]">
                  Partial batch warning: {generationErrors[0]}
                </div>
              ) : null}

              {/* Results Grid / Skeletons / Empty State */}
              {isGenerating ? (
                <div
                  className={cn(
                    'grid gap-4',
                    pendingSlots === 1
                      ? 'grid-cols-1 max-w-xl'
                      : 'grid-cols-1 md:grid-cols-2'
                  )}
                >
                  {Array.from({ length: pendingSlots }).map((_, idx) => (
                    <div
                      key={idx}
                      className="overflow-hidden rounded-[12px] border border-[var(--border)] bg-[var(--card)]"
                    >
                      <div className="skeleton-shimmer relative aspect-square w-full bg-[var(--surface)] border-b border-[var(--border)] flex items-center justify-center">
                        <span className="font-mono text-[12px] text-[var(--muted-foreground)]">
                          Rendering variation {idx + 1}...
                        </span>
                      </div>
                      <div className="p-3.5 space-y-2.5">
                        <div className="h-4 w-2/3 rounded-[4px] bg-[var(--surface)]" />
                        <div className="h-3 w-1/3 rounded-[4px] bg-[var(--surface)]" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : currentRecord ? (
                <div
                  className={cn(
                    'grid gap-4',
                    currentRecord.images.length === 1
                      ? 'grid-cols-1 max-w-xl'
                      : 'grid-cols-1 md:grid-cols-2'
                  )}
                >
                  {currentRecord.images.map((image, idx) => (
                    <ImageResultCard
                      key={image.id}
                      image={image}
                      productName={currentRecord.brief.name}
                      isWhiteBackgroundShot={isCurrentWhiteBg}
                      isGenerating={isGenerating}
                      onOpenLightbox={() =>
                        setLightboxState({
                          open: true,
                          record: currentRecord,
                          index: idx,
                        })
                      }
                      onToggleFavorite={() =>
                        handleToggleFavorite(currentRecord.id, image.id)
                      }
                      onDelete={() => handleDeleteImage(currentRecord.id, image.id)}
                      onRemix={() => handleRemixRecord(currentRecord)}
                      onRefine={handleRefine}
                      onRegenerateFailedCheck={() => void runGeneration()}
                    />
                  ))}
                </div>
              ) : (
                <div className="relative flex flex-1 min-h-[460px] flex-col items-center justify-center overflow-hidden rounded-[12px] border border-[var(--border)] bg-[var(--card)]/90 p-8 text-center">
                  {/* Faint radial glow permitted on empty state */}
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0"
                    style={{
                      background:
                        'radial-gradient(circle at 50% 42%, rgba(255,255,255,0.045), transparent 62%)',
                    }}
                  />
                  <div className="relative z-10 max-w-md space-y-4">
                    <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-[10px] border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)]">
                      <Aperture className="h-5 w-5" />
                    </div>
                    <div className="space-y-1.5">
                      <h1 className="text-[18px] font-semibold tracking-[-0.02em] text-[var(--foreground)]">
                        {hydrated
                          ? 'Ready for your first packshot'
                          : 'Loading studio workspace...'}
                      </h1>
                      <p className="text-[13px] leading-relaxed text-[var(--muted-foreground)]">
                        Describe your product on the left, choose a commercial shot preset, and
                        generate marketplace-ready photography.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                      {SAMPLE_BRIEFS.map((sample) => (
                        <button
                          key={sample.id}
                          type="button"
                          onClick={() => handleLoadSample(sample)}
                          className="inline-flex h-8 items-center gap-1.5 rounded-[6px] border border-[var(--border)] bg-[var(--surface)] px-3 text-[12px] text-[var(--foreground)] transition-colors hover:border-[var(--border-hover)] cursor-pointer whitespace-nowrap"
                        >
                          <Sparkles className="h-3 w-3 text-[var(--muted-foreground)]" />
                          <span>{sample.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </section>

            {/* Mobile Sticky Generate Bar */}
            <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--border)] bg-[var(--background)]/95 p-3 backdrop-blur-sm lg:hidden">
              <Button
                type="button"
                size="lg"
                disabled={isGenerating}
                onClick={() => void runGeneration()}
                className="w-full"
              >
                {isGenerating
                  ? `Generating ${pendingSlots} ${pendingSlots === 1 ? 'shot' : 'shots'}...`
                  : `Generate ${variations} ${variations === 1 ? 'shot' : 'shots'}`}
              </Button>
            </div>
          </div>
        ) : activeTab === 'library' ? (
          <LibraryView
            records={history}
            onRemixRecord={handleRemixRecord}
            onToggleFavorite={handleToggleFavorite}
            onDeleteImage={handleDeleteImage}
            onClearLibrary={handleClearLibrary}
            onOpenLightbox={(rec, idx) =>
              setLightboxState({ open: true, record: rec, index: idx })
            }
            onGoToGenerate={() => setActiveTab('generate')}
          />
        ) : (
          <SettingsView
            settings={settings}
            onUpdateSettings={updateSettings}
            models={models}
            serverStatus={serverStatus}
          />
        )}
      </main>

      {/* Lightbox Modal */}
      {lightboxState.record ? (
        <LightboxModal
          open={lightboxState.open}
          onOpenChange={(open) => setLightboxState((prev) => ({ ...prev, open }))}
          images={lightboxState.record.images}
          activeIndex={lightboxState.index}
          onIndexChange={(index) => setLightboxState((prev) => ({ ...prev, index }))}
          productName={lightboxState.record.brief.name}
          prompt={lightboxState.record.prompt}
          modelName={getModelSpec(lightboxState.record.modelId).name}
          isWhiteBackgroundShot={
            getShotPreset(lightboxState.record.shotId).isWhiteBackground ||
            (lightboxState.record.brief.useBackgroundColor &&
              lightboxState.record.brief.backgroundColor.toUpperCase() === '#FFFFFF')
          }
          onToggleFavorite={(imageId) =>
            handleToggleFavorite(lightboxState.record!.id, imageId)
          }
          onRemix={() => handleRemixRecord(lightboxState.record!)}
        />
      ) : null}

      {/* Command Palette (Cmd/Ctrl + K) */}
      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        onSwitchTab={setActiveTab}
        onSelectPreset={handleSelectShotPreset}
        onLoadSample={handleLoadSample}
        onToggleTheme={() =>
          updateSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' })
        }
        onToggleEnhance={() => setEnhanceEnabled((prev) => !prev)}
        theme={settings.theme}
        enhanceEnabled={enhanceEnabled}
      />
    </div>
  );
}
