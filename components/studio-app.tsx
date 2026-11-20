'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Aperture,
  Check,
  Clock,
  Crop,
  Crosshair,
  Layers,
  RotateCcw,
  Sparkles,
  Wand2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  ASPECT_RATIOS,
  DEFAULT_FREE_MODEL_ID,
  findModelById,
  formatBatchEstimate,
  formatModelPrice,
  getDefaultQualityForModel,
  OFFLINE_FALLBACK_MODELS,
  pickCheapestRecommendedReferenceModel,
  pickPreferredDefaultModel,
  pickTierSwitchModel,
  type AspectRatio,
  type DiscoverySource,
  type ModelTier,
  type NormalizedImageModel,
} from '@/lib/models';
import {
  getShotPreset,
  SHOT_PRESETS,
  type ShotPresetId,
} from '@/lib/presets';
import {
  buildPreservationPrompt,
  buildPrompt,
  DEFAULT_BRIEF,
  SAMPLE_BRIEFS,
  type ProductBrief,
  type SampleBriefPreset,
} from '@/lib/prompt-engine';
import { analyzePackshotImage, type PackshotCheckResult } from '@/lib/packshot-check';
import {
  autoCropAndCenterImage,
  downscaleImageToMaxDim,
  getMarketplaceAlignPreset,
  MARKETPLACE_ALIGN_PRESETS,
  type MarketplaceAlignPresetId,
} from '@/lib/packshot-crop';
import {
  DEFAULT_SETTINGS,
  inferPresetCategory,
  isSvgMedia,
  loadHistory,
  loadModelCostStats,
  loadSettings,
  loadUserPresets,
  recordModelCostSample,
  saveHistory,
  saveModelCostStats,
  saveSettings,
  saveUserPresets,
  seedModelCostStatsFromHistory,
  type GeneratedImageItem,
  type GenerationRecord,
  type ModelCostStatsMap,
  type StudioSettings,
  type UserPreset,
} from '@/lib/db';
import { TopBar, type StudioTab } from '@/components/top-bar';
import { CommandPalette } from '@/components/command-palette';
import { BriefForm } from '@/components/brief-form';
import {
  ModelSelector,
  type DiscoveryStatus,
} from '@/components/model-selector';
import {
  UserPresetsPanel,
  type PresetDraftSnapshot,
} from '@/components/user-presets-panel';
import { ImageResultCard } from '@/components/image-result-card';
import { AutoCropModal } from '@/components/auto-crop-modal';
import { LightboxModal } from '@/components/lightbox-modal';
import {
  MultiViewModal,
  type MultiViewInitialSession,
} from '@/components/multiview-modal';
import { LibraryView } from '@/components/library-view';
import { UsageView } from '@/components/usage-view';
import { SettingsView } from '@/components/settings-view';
import { detectNearestAspectRatio } from '@/lib/multiview';
import { StudioModal } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

interface PendingGenerationOverride {
  prompt?: string;
  promptEditedManually?: boolean;
  refineChipIds?: string[];
  enhance?: boolean;
}

interface PendingImageSlot {
  id: string;
  shotId: ShotPresetId;
  aspectRatio: AspectRatio;
  variationIndex: number;
  status: 'queued' | 'generating' | 'done' | 'error';
  error?: string;
  image?: GeneratedImageItem;
}

const SHOT_SET_PRESET_IDS: readonly ShotPresetId[] = [
  'marketplace-packshot',
  'lifestyle-scene',
  'macro-detail',
  'flat-lay',
  'studio-hero',
];

function getDefaultResolutionForModel(
  model?: NormalizedImageModel | null
): string {
  if (!model || !model.supportedParams.includes('resolution')) {
    return '1K';
  }
  const opts = model.supportedResolutions;
  if (!opts || opts.length === 0) {
    return '1K';
  }
  const oneK = opts.find((r) => r.trim().toLowerCase() === '1k');
  return oneK ?? 'auto';
}

function getSafeResolutionForRequest(
  resolution: string,
  model: NormalizedImageModel
): string | undefined {
  if (!model.supportedParams.includes('resolution')) return undefined;
  if (!resolution || resolution === 'auto') return undefined;
  if (
    model.supportedResolutions &&
    model.supportedResolutions.length > 0 &&
    !model.supportedResolutions.includes(resolution)
  ) {
    return undefined;
  }
  return resolution;
}

function resolveModelAspectRatio(
  desiredRatio: AspectRatio,
  model: NormalizedImageModel
): AspectRatio {
  const supported = model.supportedAspectRatios;
  if (supported && supported.length > 0 && !supported.includes(desiredRatio)) {
    return ASPECT_RATIOS.find((ar) => supported.includes(ar.value))?.value ?? '1:1';
  }
  return desiredRatio;
}

interface ShotSetGroup {
  shotId: ShotPresetId;
  record: GenerationRecord;
}

interface StudioAppProps {
  initialTab?: StudioTab;
}

export function StudioApp({ initialTab = 'generate' }: StudioAppProps) {
  const [activeTab, setActiveTab] = useState<StudioTab>(initialTab);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  const handleTabChange = useCallback((tab: StudioTab) => {
    setActiveTab(tab);
    if (typeof window !== 'undefined') {
      const targetPath = tab === 'usage' ? '/usage' : '/';
      if (window.location.pathname !== targetPath) {
        window.history.replaceState(null, '', targetPath);
      }
    }
  }, []);

  // Persistent settings & history (IndexedDB via idb-keyval)
  const [settings, setSettings] = useState<StudioSettings>(DEFAULT_SETTINGS);
  const [history, setHistory] = useState<GenerationRecord[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Dynamic OpenRouter image models
  const [models, setModels] = useState<NormalizedImageModel[]>(OFFLINE_FALLBACK_MODELS);
  const [discoveryStatus, setDiscoveryStatus] = useState<DiscoveryStatus>({
    source: 'cache',
    updatedAt: 0,
    failedCount: 0,
  });
  const [isLoadingModels, setIsLoadingModels] = useState(true);
  const [isRefreshingModels, setIsRefreshingModels] = useState(false);
  const [serverStatus, setServerStatus] = useState<{
    hasApiKey: boolean;
    enhancerModel: string;
  } | null>(null);

  // Generation control state
  const [brief, setBrief] = useState<ProductBrief>(DEFAULT_BRIEF);
  const [shotId, setShotId] = useState<ShotPresetId>('marketplace-packshot');
  const [modelId, setModelId] = useState<string>(DEFAULT_FREE_MODEL_ID);
  const [inputMode, setInputMode] = useState<'text' | 'photo'>('text');
  const [inputReferences, setInputReferences] = useState<string[]>([]);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(
    DEFAULT_SETTINGS.defaultAspectRatio
  );
  const [clampedRatioNote, setClampedRatioNote] = useState<string | null>(null);
  const [resolution, setResolution] = useState<string>('1K');
  const [qualitySelection, setQualitySelection] = useState<{
    modelId: string;
    value: string;
  } | null>(null);
  const [backgroundMode, setBackgroundMode] = useState<'auto' | 'opaque' | 'transparent'>('auto');
  const [outputFormat, setOutputFormat] = useState<'auto' | 'png' | 'webp' | 'jpeg' | 'svg'>('auto');
  const [customSeed, setCustomSeed] = useState<string>('');
  const [variations, setVariations] = useState<number>(2);
  const [enhanceEnabled, setEnhanceEnabled] = useState<boolean>(false);
  const [activeRefineChips, setActiveRefineChips] = useState<string[]>([]);

  // Photo-mode Shot Set state
  const [photoShotSetEnabled, setPhotoShotSetEnabled] = useState<boolean>(false);
  const [shotSetPresetIds, setShotSetPresetIds] = useState<ShotPresetId[]>([
    'marketplace-packshot',
    'lifestyle-scene',
    'macro-detail',
  ]);
  const [currentShotSet, setCurrentShotSet] = useState<ShotSetGroup[] | null>(null);
  const [generatingShotSetPresets, setGeneratingShotSetPresets] = useState<
    ShotPresetId[] | null
  >(null);

  // Prompt inspector override state
  const [promptEditedManually, setPromptEditedManually] = useState(false);
  const [manualPromptText, setManualPromptText] = useState('');
  const [isEnhancingPreview, setIsEnhancingPreview] = useState(false);

  // Cost learning stats, active session spend & user-defined presets
  const [costStats, setCostStats] = useState<ModelCostStatsMap>({});
  const [sessionSpendUsd, setSessionSpendUsd] = useState<number>(0);
  const [spendLimitNotice, setSpendLimitNotice] = useState<string | null>(null);
  const [userPresets, setUserPresets] = useState<UserPreset[]>([]);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);

  // Active generation & elapsed timer state
  const [isGenerating, setIsGenerating] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [pendingSlots, setPendingSlots] = useState(0);
  const [pendingImageSlots, setPendingImageSlots] = useState<PendingImageSlot[]>([]);
  const [currentRecord, setCurrentRecord] = useState<GenerationRecord | null>(null);
  const [generationErrors, setGenerationErrors] = useState<string[]>([]);
  const [unavailableModelBanner, setUnavailableModelBanner] = useState<string | null>(null);

  // Marketplace auto-crop & centering utility state
  const [alignPresetId, setAlignPresetId] =
    useState<MarketplaceAlignPresetId>('amazon');
  const [showComplianceGuides, setShowComplianceGuides] = useState(false);
  const [aligningImageIds, setAligningImageIds] = useState<Set<string>>(
    () => new Set()
  );
  const [alignModalState, setAlignModalState] = useState<{
    open: boolean;
    recordId: string;
    imageId: string;
  }>({ open: false, recordId: '', imageId: '' });

  // Cost guard confirmation dialog state (> $0.25 or first usage-based run)
  const [costConfirmState, setCostConfirmState] = useState<{
    open: boolean;
    title: string;
    message: string | null;
    estimateLabel: string;
    perImageNote?: string | null;
    modelName: string;
    plannedShots: number;
    targetModel?: NormalizedImageModel;
    override?: PendingGenerationOverride;
    shotSetPresets?: ShotPresetId[];
    onConfirmCustom?: () => void;
  }>({
    open: false,
    title: 'Confirm batch cost',
    message: null,
    estimateLabel: '',
    modelName: '',
    plannedShots: 1,
  });

  // Lightbox state
  const [lightboxState, setLightboxState] = useState<{
    open: boolean;
    record: GenerationRecord | null;
    index: number;
    anchorCompareDataUrl?: string;
  }>({ open: false, record: null, index: 0 });

  // Multi-view set modal state
  const [multiViewState, setMultiViewState] = useState<{
    open: boolean;
    session: MultiViewInitialSession | null;
  }>({ open: false, session: null });

  const applyDiscoveryResponse = useCallback(
    (data: {
      models?: NormalizedImageModel[];
      source?: DiscoverySource;
      updatedAt?: number;
      error?: string;
      failedCount?: number;
      hasApiKey?: boolean;
      enhancerModel?: string;
    }) => {
      if (Array.isArray(data.models) && data.models.length > 0) {
        const discovered = data.models;
        setModels(discovered);
        setModelId((currentId) => {
          if (findModelById(discovered, currentId)) {
            return currentId;
          }
          return pickPreferredDefaultModel(discovered)?.id ?? currentId;
        });
      }
      setDiscoveryStatus({
        source: data.source ?? 'live',
        updatedAt: data.updatedAt ?? Date.now(),
        error: data.error,
        failedCount: data.failedCount ?? 0,
      });
      setServerStatus({
        hasApiKey: Boolean(data.hasApiKey),
        enhancerModel: data.enhancerModel || 'openai/gpt-4o-mini',
      });
    },
    []
  );

  const handleRefreshModels = useCallback(async () => {
    setIsRefreshingModels(true);
    try {
      const res = await fetch('/api/models?refresh=1', { cache: 'no-store' });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = (await res.json()) as {
        models?: NormalizedImageModel[];
        source?: DiscoverySource;
        updatedAt?: number;
        error?: string;
        failedCount?: number;
        hasApiKey?: boolean;
        enhancerModel?: string;
      };
      applyDiscoveryResponse(data);
      toast.success(`Refreshed ${data.models?.length ?? 0} models`);
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'Network error';
      setDiscoveryStatus({
        source: 'offline',
        updatedAt: Date.now(),
        error: reason,
        failedCount: 0,
      });
      toast.error(`Model refresh failed: ${reason}`);
    } finally {
      setIsLoadingModels(false);
      setIsRefreshingModels(false);
    }
  }, [applyDiscoveryResponse]);

  // Hydrate settings, history & per-model cost stats from IndexedDB + discover models
  useEffect(() => {
    let active = true;
    (async () => {
      const [loadedSettings, loadedHistory, loadedCostStats, loadedUserPresets] =
        await Promise.all([
          loadSettings(),
          loadHistory(),
          loadModelCostStats(),
          loadUserPresets(),
        ]);
      if (!active) return;
      const seededStats = seedModelCostStatsFromHistory(loadedCostStats, loadedHistory);
      if (Object.keys(seededStats).length > Object.keys(loadedCostStats).length) {
        void saveModelCostStats(seededStats);
      }
      setCostStats(seededStats);
      setUserPresets(loadedUserPresets);
      setSettings(loadedSettings);
      setModelId(loadedSettings.defaultModel);
      setAspectRatio(loadedSettings.defaultAspectRatio);
      setHistory(loadedHistory);
      if (loadedHistory.length > 0) {
        setCurrentRecord(loadedHistory[0]);
      }
      setHydrated(true);
    })();

    (async () => {
      try {
        const res = await fetch('/api/models', { cache: 'no-store' });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = (await res.json()) as {
          models?: NormalizedImageModel[];
          source?: DiscoverySource;
          updatedAt?: number;
          error?: string;
          failedCount?: number;
          hasApiKey?: boolean;
          enhancerModel?: string;
        };
        if (!active) return;
        applyDiscoveryResponse(data);
      } catch (err) {
        if (!active) return;
        const reason = err instanceof Error ? err.message : 'Network error';
        setDiscoveryStatus({
          source: 'offline',
          updatedAt: Date.now(),
          error: reason,
          failedCount: 0,
        });
      } finally {
        if (active) {
          setIsLoadingModels(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [applyDiscoveryResponse]);

  // Sync HTML .dark class with settings.theme
  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [settings.theme]);

  // Live elapsed timer during active generation
  useEffect(() => {
    if (!isGenerating) return;
    const start = Date.now();
    const interval = setInterval(() => {
      setElapsedMs(Date.now() - start);
    }, 200);
    return () => clearInterval(interval);
  }, [isGenerating]);

  const updateSettings = useCallback((patch: Partial<StudioSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      void saveSettings(next);
      return next;
    });
  }, []);

  const selectedModel = useMemo(
    () =>
      findModelById(models, modelId) ??
      pickPreferredDefaultModel(models, { tier: settings.modelTier, inputMode }) ??
      OFFLINE_FALLBACK_MODELS[0],
    [models, modelId, settings.modelTier, inputMode]
  );

  const effectiveQuality = useMemo(() => {
    if (qualitySelection && qualitySelection.modelId === selectedModel.id) {
      return qualitySelection.value;
    }
    return getDefaultQualityForModel(selectedModel);
  }, [qualitySelection, selectedModel]);

  // Clamp aspect ratio if model specifies supportedAspectRatios
  const applyAspectRatioWithClamp = useCallback(
    (desiredRatio: AspectRatio, targetModel: NormalizedImageModel) => {
      const supported = targetModel.supportedAspectRatios;
      if (supported && supported.length > 0 && !supported.includes(desiredRatio)) {
        const clamped =
          ASPECT_RATIOS.find((ar) => supported.includes(ar.value))?.value ?? '1:1';
        setAspectRatio(clamped);
        setClampedRatioNote(
          `Ratio ${desiredRatio} is unsupported by ${targetModel.name}; clamped to ${clamped}.`
        );
      } else {
        setAspectRatio(desiredRatio);
        setClampedRatioNote(null);
      }
    },
    []
  );

  const handleSelectModel = useCallback(
    (nextModelId: string, syncDefault = false) => {
      const target = findModelById(models, nextModelId);
      setModelId(nextModelId);
      setUnavailableModelBanner(null);
      setSpendLimitNotice(null);
      setResolution(getDefaultResolutionForModel(target));
      setQualitySelection(null);
      setBackgroundMode('auto');
      setOutputFormat('auto');
      if (target) {
        applyAspectRatioWithClamp(aspectRatio, target);
        if (target.supportsReference && target.maxReferences > 0) {
          setInputReferences((prev) => prev.slice(0, target.maxReferences));
        }
      }
      if (syncDefault) {
        updateSettings({ defaultModel: nextModelId });
      }
    },
    [models, aspectRatio, applyAspectRatioWithClamp, updateSettings]
  );

  const handleInputModeChange = useCallback(
    (mode: 'text' | 'photo') => {
      setInputMode(mode);
      if (mode === 'text' && selectedModel.requiresReference) {
        const fallback = pickPreferredDefaultModel(models, {
          tier: settings.modelTier,
          inputMode: 'text',
        });
        if (fallback) {
          handleSelectModel(fallback.id, false);
          toast.info(
            `Switched to ${fallback.name} (${selectedModel.name} requires a reference image)`
          );
        }
      }
    },
    [selectedModel, models, settings.modelTier, handleSelectModel]
  );

  const handleTierChange = useCallback(
    (nextTier: ModelTier) => {
      const tierModels = models.filter(
        (m) => m.tier === nextTier && (inputMode === 'photo' || !m.requiresReference)
      );

      if (tierModels.length === 0) {
        updateSettings({ modelTier: nextTier });
        return;
      }

      const preferredForTier =
        pickTierSwitchModel(models, nextTier, inputMode) ?? tierModels[0];

      const currentInTier = tierModels.some((m) => m.id === modelId);
      const defaultInTier = tierModels.some((m) => m.id === settings.defaultModel);

      const nextDefaultModel = defaultInTier
        ? settings.defaultModel
        : preferredForTier.id;

      updateSettings({
        modelTier: nextTier,
        defaultModel: nextDefaultModel,
      });

      if (!currentInTier || !defaultInTier) {
        if (!currentInTier || modelId !== preferredForTier.id) {
          setModelId(preferredForTier.id);
          setUnavailableModelBanner(null);
          setSpendLimitNotice(null);
          setResolution(getDefaultResolutionForModel(preferredForTier));
          setQualitySelection(null);
          setBackgroundMode('auto');
          setOutputFormat('auto');
          applyAspectRatioWithClamp(aspectRatio, preferredForTier);
        }
        toast.info(
          `Switched to ${preferredForTier.name} (${nextTier} tier)`
        );
      }
    },
    [
      models,
      inputMode,
      modelId,
      settings.defaultModel,
      aspectRatio,
      applyAspectRatioWithClamp,
      updateSettings,
    ]
  );

  const selectedShot = useMemo(() => getShotPreset(shotId), [shotId]);

  const isShotSetActive =
    inputMode === 'photo' && photoShotSetEnabled && shotSetPresetIds.length > 0;

  const totalPlannedShots = isShotSetActive
    ? shotSetPresetIds.length * variations
    : variations;

  const deterministicPrompt = useMemo(
    () =>
      isShotSetActive
        ? buildPreservationPrompt(brief, shotSetPresetIds[0] ?? shotId, {
            refineChipIds: activeRefineChips,
          })
        : buildPrompt(brief, shotId, {
            refineChipIds: activeRefineChips,
          }),
    [isShotSetActive, brief, shotSetPresetIds, shotId, activeRefineChips]
  );

  const activePrompt = promptEditedManually ? manualPromptText : deterministicPrompt;

  const handleSelectShotPreset = useCallback(
    (nextShotId: ShotPresetId) => {
      const preset = getShotPreset(nextShotId);
      setShotId(nextShotId);
      applyAspectRatioWithClamp(preset.defaultAspectRatio, selectedModel);
      setActiveRefineChips([]);
      setPromptEditedManually(false);
    },
    [applyAspectRatioWithClamp, selectedModel]
  );

  const handleLoadSample = useCallback(
    (sample: SampleBriefPreset) => {
      const preset = getShotPreset(sample.shotId);
      setBrief(sample.brief);
      setShotId(sample.shotId);
      applyAspectRatioWithClamp(preset.defaultAspectRatio, selectedModel);
      setActiveRefineChips([]);
      setPromptEditedManually(false);
      toast.success(`Loaded "${sample.label}" brief`);
    },
    [applyAspectRatioWithClamp, selectedModel]
  );

  const handlePreviewEnhance = useCallback(async () => {
    if (isEnhancingPreview) return;
    try {
      setIsEnhancingPreview(true);
      const res = await fetch('/api/enhance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: activePrompt }),
      });
      const json = (await res.json()) as {
        prompt?: string;
        enhanced?: boolean;
        error?: string;
      };
      if (!res.ok) {
        if (res.status === 402 && json.error) {
          setSpendLimitNotice(json.error);
        }
        toast.error(json.error || 'Prompt enhancer failed');
        return;
      }
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

  const runPerImageBatch = useCallback(
    async (
      targetModel: NormalizedImageModel,
      tasks: Array<{
        id: string;
        shotId: ShotPresetId;
        aspectRatio: AspectRatio;
        variationIndex: number;
        prompt: string;
        promptEditedManually: boolean;
        enhance: boolean;
        refineChipIds: string[];
        isWhiteBg: boolean;
        seed?: number;
      }>,
      shotSetPresets: ShotPresetId[] | null
    ) => {
      if (isGenerating || tasks.length === 0) return;

      const batchStart = Date.now();
      const CONCURRENCY_CAP = 4;

      setIsGenerating(true);
      setElapsedMs(0);
      setPendingSlots(tasks.length);
      setGeneratingShotSetPresets(shotSetPresets);
      setGenerationErrors([]);
      setUnavailableModelBanner(null);
      setPendingImageSlots(
        tasks.map((t) => ({
          id: t.id,
          shotId: t.shotId,
          aspectRatio: t.aspectRatio,
          variationIndex: t.variationIndex,
          status: 'queued',
        }))
      );

      type TaskResult =
        | {
            status: 'done';
            task: (typeof tasks)[number];
            image: GeneratedImageItem;
            promptUsed: string;
            enhanced: boolean;
            modelTier: ModelTier;
            estimatedCostUsd: number;
            actualCostUsd: number | null;
            durationMs: number;
          }
        | {
            status: 'error';
            task: (typeof tasks)[number];
            error: string;
          };

      const results: Array<TaskResult | undefined> = new Array(tasks.length);
      let nextIndex = 0;
      let firstUnavailableBanner: string | null = null;
      let firstSpendLimitError: string | null = null;

      const refSlice =
        targetModel.supportsReference && inputReferences.length > 0
          ? inputReferences.slice(0, Math.min(4, Math.max(1, targetModel.maxReferences)))
          : undefined;

      const safeResolution = getSafeResolutionForRequest(resolution, targetModel);

      async function worker() {
        while (true) {
          const idx = nextIndex++;
          if (idx >= tasks.length) return;
          const task = tasks[idx];

          setPendingImageSlots((prev) =>
            prev.map((s) => (s.id === task.id ? { ...s, status: 'generating' } : s))
          );

          try {
            const res = await fetch('/api/generate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                prompt: task.prompt,
                model: targetModel.id,
                aspectRatio: task.aspectRatio,
                resolution: safeResolution,
                quality: effectiveQuality !== 'auto' ? effectiveQuality : undefined,
                background: backgroundMode !== 'auto' ? backgroundMode : undefined,
                outputFormat: outputFormat !== 'auto' ? outputFormat : undefined,
                variations: 1,
                enhance: task.enhance,
                promptEditedManually: task.promptEditedManually,
                rgbColors: brief.colors,
                backgroundRgbColor: task.isWhiteBg
                  ? '#FFFFFF'
                  : brief.useBackgroundColor
                    ? brief.backgroundColor
                    : undefined,
                inputReferences: refSlice,
                baseSeed: task.seed,
              }),
            });

            const payload = (await res.json().catch(() => ({}))) as {
              error?: string;
              isModelUnavailable?: boolean;
              promptUsed?: string;
              enhanced?: boolean;
              modelTier?: ModelTier;
              actualCost?: number | null;
              degraded?: string[];
              images?: Array<{
                index: number;
                dataUrl: string;
                mediaType: string;
                seed?: number;
                cost: number | null;
                durationMs: number;
                degraded?: string[];
              }>;
              errors?: Array<{ message: string; isModelUnavailable?: boolean }>;
              totalCost?: number;
              totalDurationMs?: number;
            };

            if (!res.ok) {
              const errMsg = payload.error || `Request failed (${res.status})`;
              if (res.status === 404 || res.status === 410 || payload.isModelUnavailable) {
                firstUnavailableBanner ??=
                  payload.error ||
                  `Model ${targetModel.name} returned ${res.status}. Pick another model to continue.`;
              }
              if (res.status === 402) {
                firstSpendLimitError ??= errMsg;
              }
              results[idx] = { status: 'error', task, error: errMsg };
              setPendingImageSlots((prev) =>
                prev.map((s) =>
                  s.id === task.id ? { ...s, status: 'error', error: errMsg } : s
                )
              );
              continue;
            }

            const rawImg = payload.images?.[0];
            if (!rawImg) {
              const errMsg =
                payload.errors?.[0]?.message ||
                payload.error ||
                'No image returned';
              if (payload.errors?.[0]?.isModelUnavailable) {
                firstUnavailableBanner ??= errMsg;
              }
              results[idx] = { status: 'error', task, error: errMsg };
              setPendingImageSlots((prev) =>
                prev.map((s) =>
                  s.id === task.id ? { ...s, status: 'error', error: errMsg } : s
                )
              );
              continue;
            }

            let packshotCheck = undefined;
            if (task.isWhiteBg && !isSvgMedia(rawImg.mediaType, rawImg.dataUrl)) {
              try {
                packshotCheck = await analyzePackshotImage(rawImg.dataUrl);
              } catch {
                packshotCheck = undefined;
              }
            }

            const degraded =
              rawImg.degraded && rawImg.degraded.length > 0
                ? rawImg.degraded
                : payload.degraded && payload.degraded.length > 0
                  ? payload.degraded
                  : undefined;

            const processedImage: GeneratedImageItem = {
              id: `${Date.now()}-${task.shotId}-${task.variationIndex}-${Math.random().toString(36).slice(2, 7)}`,
              dataUrl: rawImg.dataUrl,
              mediaType: rawImg.mediaType,
              seed: rawImg.seed,
              cost: rawImg.cost,
              durationMs: rawImg.durationMs,
              packshotCheck,
              favorite: false,
              degraded,
            };

            const slotActualCost =
              typeof rawImg.cost === 'number' && Number.isFinite(rawImg.cost)
                ? rawImg.cost
                : typeof payload.actualCost === 'number' &&
                    Number.isFinite(payload.actualCost)
                  ? payload.actualCost
                  : null;

            results[idx] = {
              status: 'done',
              task,
              image: processedImage,
              promptUsed: payload.promptUsed || task.prompt,
              enhanced: Boolean(payload.enhanced),
              modelTier: payload.modelTier ?? targetModel.tier,
              estimatedCostUsd: payload.totalCost ?? 0,
              actualCostUsd: slotActualCost,
              durationMs: rawImg.durationMs || payload.totalDurationMs || 0,
            };

            setPendingImageSlots((prev) =>
              prev.map((s) =>
                s.id === task.id
                  ? { ...s, status: 'done', image: processedImage }
                  : s
              )
            );
          } catch {
            const errMsg = 'Network error reaching generation endpoint.';
            results[idx] = { status: 'error', task, error: errMsg };
            setPendingImageSlots((prev) =>
              prev.map((s) =>
                s.id === task.id ? { ...s, status: 'error', error: errMsg } : s
              )
            );
          }
        }
      }

      try {
        await Promise.all(
          Array.from(
            { length: Math.min(CONCURRENCY_CAP, tasks.length) },
            () => worker()
          )
        );

        if (firstUnavailableBanner) {
          setUnavailableModelBanner(firstUnavailableBanner);
        }
        if (firstSpendLimitError) {
          setSpendLimitNotice(firstSpendLimitError);
        }

        const settled = results.filter(
          (r): r is TaskResult => Boolean(r)
        );
        const doneResults = settled.filter(
          (r): r is Extract<TaskResult, { status: 'done' }> =>
            r.status === 'done'
        );
        const errorResults = settled.filter(
          (r): r is Extract<TaskResult, { status: 'error' }> =>
            r.status === 'error'
        );

        let batchActualSpend = 0;
        const costSamples: number[] = [];
        for (const r of doneResults) {
          if (typeof r.actualCostUsd === 'number' && Number.isFinite(r.actualCostUsd)) {
            batchActualSpend += r.actualCostUsd;
            costSamples.push(r.actualCostUsd);
          }
        }

        if (batchActualSpend > 0) {
          setSessionSpendUsd((prev) => prev + batchActualSpend);
        }
        if (costSamples.length > 0) {
          setCostStats((prev) => {
            let next = prev;
            for (const sample of costSamples) {
              next = recordModelCostSample(next, targetModel.id, sample);
            }
            void saveModelCostStats(next);
            return next;
          });
        }

        const totalElapsed = Date.now() - batchStart;

        if (shotSetPresets && shotSetPresets.length > 0) {
          const completedGroups: ShotSetGroup[] = [];
          for (const presetId of shotSetPresets) {
            const groupDone = doneResults.filter(
              (r) => r.task.shotId === presetId
            );
            if (groupDone.length === 0) continue;

            const groupActual = groupDone.reduce(
              (sum, r) => sum + (r.actualCostUsd ?? 0),
              0
            );
            const hasGroupActual = groupDone.some(
              (r) => r.actualCostUsd !== null
            );
            const rec: GenerationRecord = {
              id: `gen-${Date.now()}-${presetId}-${Math.random().toString(36).slice(2, 7)}`,
              createdAt: Date.now(),
              brief: { ...brief },
              shotId: presetId,
              modelId: targetModel.id,
              modelTier: groupDone[0].modelTier,
              aspectRatio: groupDone[0].task.aspectRatio,
              prompt: groupDone[0].promptUsed,
              enhanced: groupDone.some((r) => r.enhanced),
              refineChips: groupDone[0].task.refineChipIds,
              images: groupDone.map((r) => r.image),
              totalCost: groupDone.reduce((s, r) => s + r.estimatedCostUsd, 0),
              actualCost: hasGroupActual ? groupActual : null,
              totalDurationMs: groupDone.reduce((max, r) => Math.max(max, r.durationMs), 0),
            };
            completedGroups.push({ shotId: presetId, record: rec });
          }

          if (completedGroups.length > 0) {
            const createdRecords = completedGroups.map((g) => g.record);
            setCurrentShotSet(completedGroups);
            setCurrentRecord(createdRecords[0]);
            setHistory((prev) => {
              const next = [...createdRecords, ...prev].slice(0, 100);
              void saveHistory(next);
              return next;
            });
          }

          const collectedErrors = errorResults.map((e) => {
            const presetName = getShotPreset(e.task.shotId).name;
            return `${presetName} (var ${e.task.variationIndex + 1}): ${e.error}`;
          });
          if (collectedErrors.length > 0) {
            setGenerationErrors(collectedErrors);
            if (doneResults.length > 0) {
              toast.warning(
                `Shot set finished: ${doneResults.length} of ${tasks.length} images generated (${collectedErrors.length} failed)`
              );
            } else {
              toast.error(collectedErrors[0] || 'Shot set generation failed');
            }
          } else {
            toast.success(
              `Generated shot set: ${completedGroups.length} presets (${doneResults.length} images)`
            );
          }
        } else {
          if (doneResults.length > 0) {
            const hasBatchActual = doneResults.some(
              (r) => r.actualCostUsd !== null
            );
            const newRecord: GenerationRecord = {
              id: `gen-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              createdAt: Date.now(),
              brief: { ...brief },
              shotId: doneResults[0].task.shotId,
              modelId: targetModel.id,
              modelTier: doneResults[0].modelTier,
              aspectRatio: doneResults[0].task.aspectRatio,
              prompt: doneResults[0].promptUsed,
              enhanced: doneResults.some((r) => r.enhanced),
              refineChips: doneResults[0].task.refineChipIds,
              images: doneResults.map((r) => r.image),
              totalCost: doneResults.reduce((s, r) => s + r.estimatedCostUsd, 0),
              actualCost: hasBatchActual ? batchActualSpend : null,
              totalDurationMs: totalElapsed,
            };

            setCurrentShotSet(null);
            setCurrentRecord(newRecord);
            setHistory((prev) => {
              const next = [newRecord, ...prev].slice(0, 100);
              void saveHistory(next);
              return next;
            });
          }

          const collectedErrors = errorResults.map(
            (e) => `Variation ${e.task.variationIndex + 1}: ${e.error}`
          );
          if (collectedErrors.length > 0) {
            setGenerationErrors(collectedErrors);
            if (doneResults.length > 0) {
              toast.warning(
                `${doneResults.length} of ${tasks.length} variations generated (${collectedErrors.length} failed)`
              );
            } else {
              toast.error(errorResults[0]?.error || 'Generation failed');
            }
          } else if (doneResults.length > 0) {
            toast.success(
              `Generated ${doneResults.length} ${doneResults.length === 1 ? 'image' : 'images'}`
            );
          }
        }
      } finally {
        setIsGenerating(false);
        setElapsedMs(0);
        setPendingSlots(0);
        setPendingImageSlots([]);
        setGeneratingShotSetPresets(null);
      }
    },
    [
      isGenerating,
      inputReferences,
      resolution,
      effectiveQuality,
      backgroundMode,
      outputFormat,
      brief,
    ]
  );

  const executeGeneration = useCallback(
    async (
      targetModel: NormalizedImageModel,
      override?: PendingGenerationOverride
    ) => {
      const targetPrompt = override?.prompt ?? activePrompt;
      const targetEditedManually =
        override?.promptEditedManually ?? promptEditedManually;
      const targetRefineChips = override?.refineChipIds ?? activeRefineChips;
      const targetEnhance = override?.enhance ?? enhanceEnabled;

      const parsedSeed =
        customSeed.trim() && /^\d+$/.test(customSeed.trim())
          ? Math.min(2_147_483_647, Math.max(1, parseInt(customSeed.trim(), 10)))
          : undefined;

      const isWhiteBg =
        selectedShot.isWhiteBackground ||
        (brief.useBackgroundColor &&
          brief.backgroundColor.toUpperCase() === '#FFFFFF');

      const tasks = Array.from({ length: variations }, (_, idx) => ({
        id: `${shotId}-var-${idx}-${Date.now()}`,
        shotId,
        aspectRatio,
        variationIndex: idx,
        prompt: targetPrompt,
        promptEditedManually: targetEditedManually,
        enhance: targetEnhance,
        refineChipIds: targetRefineChips,
        isWhiteBg,
        seed:
          parsedSeed !== undefined
            ? ((parsedSeed - 1 + idx) % 2_147_483_647) + 1
            : undefined,
      }));

      await runPerImageBatch(targetModel, tasks, null);
    },
    [
      activePrompt,
      promptEditedManually,
      activeRefineChips,
      enhanceEnabled,
      customSeed,
      selectedShot.isWhiteBackground,
      brief.useBackgroundColor,
      brief.backgroundColor,
      variations,
      shotId,
      aspectRatio,
      runPerImageBatch,
    ]
  );

  const executeShotSetGeneration = useCallback(
    async (
      targetModel: NormalizedImageModel,
      presetList: ShotPresetId[]
    ) => {
      if (presetList.length === 0) return;

      const parsedSeed =
        customSeed.trim() && /^\d+$/.test(customSeed.trim())
          ? Math.min(2_147_483_647, Math.max(1, parseInt(customSeed.trim(), 10)))
          : undefined;

      const tasks: Parameters<typeof runPerImageBatch>[1] = [];
      presetList.forEach((presetId, presetIdx) => {
        const presetSpec = getShotPreset(presetId);
        const presetRatio = resolveModelAspectRatio(
          presetSpec.defaultAspectRatio,
          targetModel
        );
        const presetPrompt = buildPreservationPrompt(brief, presetId, {
          refineChipIds: activeRefineChips,
        });
        const isWhiteBg =
          presetSpec.isWhiteBackground ||
          (brief.useBackgroundColor &&
            brief.backgroundColor.toUpperCase() === '#FFFFFF');

        for (let varIdx = 0; varIdx < variations; varIdx++) {
          tasks.push({
            id: `${presetId}-var-${varIdx}-${Date.now()}`,
            shotId: presetId,
            aspectRatio: presetRatio,
            variationIndex: varIdx,
            prompt: presetPrompt,
            promptEditedManually: false,
            enhance: enhanceEnabled,
            refineChipIds: activeRefineChips,
            isWhiteBg,
            seed:
              parsedSeed !== undefined
                ? ((parsedSeed - 1 + presetIdx * 31337 + varIdx) % 2_147_483_647) + 1
                : undefined,
          });
        }
      });

      await runPerImageBatch(targetModel, tasks, presetList);
    },
    [
      customSeed,
      brief,
      activeRefineChips,
      variations,
      enhanceEnabled,
      runPerImageBatch,
    ]
  );

  const runGeneration = useCallback(
    async (override?: PendingGenerationOverride) => {
      if (isGenerating) return;
      if (!brief.name.trim()) {
        toast.error('Please enter a product name or type first.');
        return;
      }

      setSpendLimitNotice(null);
      let activeModel = selectedModel;

      // If Free tier is selected and empty, auto-switch using preferred paid default order
      const freeModels = models.filter((m) => m.tier === 'free');
      if (settings.modelTier === 'free' && freeModels.length === 0) {
        const preferredPaid = pickPreferredDefaultModel(models, {
          tier: 'paid',
          inputMode,
        });
        if (!preferredPaid) {
          toast.error('No image models are currently available.');
          return;
        }
        activeModel = preferredPaid;
        setModelId(preferredPaid.id);
        setQualitySelection(null);
        updateSettings({
          modelTier: 'paid',
          defaultModel: preferredPaid.id,
        });
        toast.info(
          `No free models available — switched to ${preferredPaid.name} (${formatModelPrice(preferredPaid, costStats[preferredPaid.id])})`
        );
      }

      if (isShotSetActive && inputReferences.length === 0) {
        toast.error('Upload or pick at least 1 reference photo before generating a shot set.');
        return;
      }

      if (activeModel.requiresReference && inputReferences.length === 0) {
        toast.error(`${activeModel.name} requires at least 1 reference photo.`);
        setInputMode('photo');
        return;
      }

      const activeStats = costStats[activeModel.id];
      const shotCountForBatch = isShotSetActive ? totalPlannedShots : variations;
      const estimate = formatBatchEstimate(activeModel, shotCountForBatch, activeStats);

      // Optional session spend limit check
      if (
        settings.sessionSpendLimitUsd !== null &&
        settings.sessionSpendLimitUsd > 0 &&
        activeModel.tier === 'paid'
      ) {
        const projected =
          estimate.exactTotalUsd !== null
            ? sessionSpendUsd + estimate.exactTotalUsd
            : sessionSpendUsd;
        const limitExceeded =
          estimate.exactTotalUsd !== null
            ? projected > settings.sessionSpendLimitUsd
            : sessionSpendUsd >= settings.sessionSpendLimitUsd;

        if (limitExceeded) {
          const msg =
            estimate.exactTotalUsd !== null
              ? `Session spend limit reached: $${sessionSpendUsd.toFixed(4)} spent + ${estimate.label} estimate exceeds your $${settings.sessionSpendLimitUsd.toFixed(2)} limit.`
              : `Session spend limit reached: $${sessionSpendUsd.toFixed(4)} spent reaches your $${settings.sessionSpendLimitUsd.toFixed(2)} limit.`;
          setSpendLimitNotice(msg);
          toast.error(msg);
          return;
        }
      }

      // Confirmation for first run (and >2 variations) on usage-based / unknown-price models
      if (estimate.needsFirstRunConfirm) {
        setCostConfirmState({
          open: true,
          title: 'Confirm usage-based generation',
          message:
            shotCountForBatch > 2
              ? `Usage-based pricing. Cost will be shown after generation. You queued ${shotCountForBatch} shots — consider starting with 1–2 shots first.`
              : 'Usage-based pricing. Cost will be shown after generation.',
          estimateLabel: estimate.label,
          perImageNote: null,
          modelName: activeModel.name,
          plannedShots: shotCountForBatch,
          targetModel: activeModel,
          override,
          shotSetPresets: isShotSetActive ? [...shotSetPresetIds] : undefined,
        });
        return;
      }

      // Confirmation for batches > $0.25 (exact per-image or learned usage average)
      if (
        activeModel.tier === 'paid' &&
        estimate.exactTotalUsd !== null &&
        estimate.exactTotalUsd > 0.25
      ) {
        setCostConfirmState({
          open: true,
          title: 'Confirm batch cost',
          message: null,
          estimateLabel: estimate.label,
          perImageNote: estimate.perImageNote,
          modelName: activeModel.name,
          plannedShots: shotCountForBatch,
          targetModel: activeModel,
          override,
          shotSetPresets: isShotSetActive ? [...shotSetPresetIds] : undefined,
        });
        return;
      }

      if (isShotSetActive) {
        await executeShotSetGeneration(activeModel, shotSetPresetIds);
      } else {
        await executeGeneration(activeModel, override);
      }
    },
    [
      isGenerating,
      brief.name,
      selectedModel,
      models,
      settings.modelTier,
      settings.sessionSpendLimitUsd,
      inputMode,
      inputReferences.length,
      costStats,
      isShotSetActive,
      totalPlannedShots,
      variations,
      shotSetPresetIds,
      sessionSpendUsd,
      updateSettings,
      executeShotSetGeneration,
      executeGeneration,
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
    setCurrentShotSet((prev) =>
      prev
        ? prev.map((group) =>
            group.record.id !== recordId
              ? group
              : {
                  ...group,
                  record: {
                    ...group.record,
                    images: group.record.images.map((img) =>
                      img.id === imageId ? { ...img, favorite: !img.favorite } : img
                    ),
                  },
                }
          )
        : null
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
    setCurrentShotSet((prev) => {
      if (!prev) return prev;
      const next = prev
        .map((group) =>
          group.record.id !== recordId
            ? group
            : {
                ...group,
                record: {
                  ...group.record,
                  images: group.record.images.filter((img) => img.id !== imageId),
                },
              }
        )
        .filter((group) => group.record.images.length > 0);
      return next.length > 0 ? next : null;
    });
    toast.success('Image removed');
  }, []);

  const patchImageInStores = useCallback(
    (
      recordId: string,
      imageId: string,
      updater: (img: GeneratedImageItem) => GeneratedImageItem
    ) => {
      setHistory((prev) => {
        const next = prev.map((rec) =>
          rec.id !== recordId
            ? rec
            : {
                ...rec,
                images: rec.images.map((img) =>
                  img.id === imageId ? updater(img) : img
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
                img.id === imageId ? updater(img) : img
              ),
            }
          : prev
      );
      setCurrentShotSet((prev) =>
        prev
          ? prev.map((group) =>
              group.record.id !== recordId
                ? group
                : {
                    ...group,
                    record: {
                      ...group.record,
                      images: group.record.images.map((img) =>
                        img.id === imageId ? updater(img) : img
                      ),
                    },
                  }
            )
          : null
      );
      setLightboxState((prev) =>
        prev.record && prev.record.id === recordId
          ? {
              ...prev,
              record: {
                ...prev.record,
                images: prev.record.images.map((img) =>
                  img.id === imageId ? updater(img) : img
                ),
              },
            }
          : prev
      );
    },
    []
  );

  const handleApplyAlignment = useCallback(
    (
      recordId: string,
      imageId: string,
      patch: {
        dataUrl: string;
        mediaType: string;
        packshotCheck: PackshotCheckResult;
        alignedLabel: string;
      }
    ) => {
      patchImageInStores(recordId, imageId, (img) => ({
        ...img,
        originalDataUrl: img.originalDataUrl ?? img.dataUrl,
        dataUrl: patch.dataUrl,
        mediaType: patch.mediaType,
        packshotCheck: patch.packshotCheck,
        alignedLabel: patch.alignedLabel,
      }));
      toast.success(`Aligned (${patch.alignedLabel})`);
    },
    [patchImageInStores]
  );

  const handleRevertAlignment = useCallback(
    async (recordId: string, image: GeneratedImageItem) => {
      if (!image.originalDataUrl) return;
      const restoredUrl = image.originalDataUrl;
      let restoredCheck = image.packshotCheck;
      try {
        restoredCheck = await analyzePackshotImage(restoredUrl);
      } catch {
        // Keep existing check if analysis fails
      }
      patchImageInStores(recordId, image.id, (img) => {
        const next = { ...img, dataUrl: restoredUrl, packshotCheck: restoredCheck };
        delete next.originalDataUrl;
        delete next.alignedLabel;
        return next;
      });
      toast.success('Reverted to original uncropped image');
    },
    [patchImageInStores]
  );

  const handleAutoCenterImages = useCallback(
    async (record: GenerationRecord, targetImages: GeneratedImageItem[]) => {
      const rasterTargets = targetImages.filter(
        (img) => !isSvgMedia(img.mediaType, img.dataUrl)
      );
      if (rasterTargets.length === 0) return;

      const preset = getMarketplaceAlignPreset(alignPresetId);
      setAligningImageIds((prev) => {
        const next = new Set(prev);
        for (const img of rasterTargets) next.add(img.id);
        return next;
      });

      let successCount = 0;
      try {
        for (const img of rasterTargets) {
          const sourceUrl = img.originalDataUrl ?? img.dataUrl;
          const result = await autoCropAndCenterImage(sourceUrl, {
            targetFill: preset.targetFill,
            canvasMode: preset.canvasMode,
            backdropMode: preset.backdropMode,
          });
          patchImageInStores(record.id, img.id, (current) => ({
            ...current,
            originalDataUrl: current.originalDataUrl ?? current.dataUrl,
            dataUrl: result.dataUrl,
            mediaType: result.mediaType,
            packshotCheck: result.packshotCheck,
            alignedLabel: preset.shortLabel,
          }));
          successCount++;
        }
        if (successCount > 0) {
          toast.success(
            `Centered ${successCount} ${successCount === 1 ? 'shot' : 'shots'} (${preset.shortLabel})`
          );
        }
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : 'Auto-crop alignment failed'
        );
      } finally {
        setAligningImageIds((prev) => {
          const next = new Set(prev);
          for (const img of rasterTargets) next.delete(img.id);
          return next;
        });
      }
    },
    [alignPresetId, patchImageInStores]
  );

  const ensureReferenceCapableModel = useCallback(
    (preferredModel?: NormalizedImageModel): NormalizedImageModel | null => {
      const candidate = preferredModel ?? selectedModel;
      if (candidate.supportsReference) {
        return candidate;
      }
      const refModel = pickCheapestRecommendedReferenceModel(
        models,
        settings.modelTier
      );
      if (!refModel) return null;
      setModelId(refModel.id);
      setUnavailableModelBanner(null);
      setSpendLimitNotice(null);
      setResolution(getDefaultResolutionForModel(refModel));
      setQualitySelection(null);
      setBackgroundMode('auto');
      setOutputFormat('auto');
      applyAspectRatioWithClamp(aspectRatio, refModel);
      if (refModel.tier !== settings.modelTier) {
        updateSettings({
          modelTier: refModel.tier,
          defaultModel: refModel.id,
        });
      }
      toast.info(
        `Switched to ${refModel.name} (${formatModelPrice(refModel, costStats[refModel.id])}) for reference image support`
      );
      return refModel;
    },
    [
      selectedModel,
      models,
      settings.modelTier,
      aspectRatio,
      applyAspectRatioWithClamp,
      updateSettings,
      costStats,
    ]
  );

  const handleOpenMultiView = useCallback(
    async (record: GenerationRecord | null, image: GeneratedImageItem) => {
      if (isSvgMedia(image.mediaType, image.dataUrl)) {
        toast.info(
          'Multi-view is not available for SVG results — use a PNG or JPEG image.'
        );
        return;
      }

      const refModel = ensureReferenceCapableModel();
      if (!refModel) {
        toast.error('No reference-capable model is currently available.');
        return;
      }

      const detectedRatio = await detectNearestAspectRatio(
        image.dataUrl,
        record?.aspectRatio ?? aspectRatio
      );

      setMultiViewState({
        open: true,
        session: {
          sessionKey: `mv-open-${image.id}-${Date.now()}`,
          anchorImage: image,
          productName: record?.brief.name || brief.name || 'Product',
          brief: record?.brief ?? brief,
          initialAspectRatio: detectedRatio,
        },
      });
    },
    [ensureReferenceCapableModel, aspectRatio, brief]
  );

  const handleRemixRecord = useCallback(
    (record: GenerationRecord) => {
      const recModel = findModelById(models, record.modelId);
      const targetTier: ModelTier =
        record.modelTier ??
        recModel?.tier ??
        (record.modelId.endsWith(':free') ? 'free' : 'paid');

      setBrief(record.brief);
      setShotId(record.shotId);
      setModelId(record.modelId);
      setQualitySelection(null);
      updateSettings({ modelTier: targetTier });
      setAspectRatio(record.aspectRatio);
      setActiveRefineChips(record.refineChips ?? []);
      setManualPromptText(record.prompt);
      setPromptEditedManually(true);

      if (record.multiViewSet) {
        const refModel = ensureReferenceCapableModel(recModel);
        if (!refModel) {
          toast.error('No reference-capable model available for this multi-view set.');
          return;
        }
        const sourceImg =
          record.images.find((i) => i.isSourceView) ??
          record.images[0];
        if (!sourceImg) {
          toast.error('This multi-view record has no anchor image.');
          return;
        }
        setMultiViewState({
          open: true,
          session: {
            sessionKey: `mv-remix-${record.id}-${Date.now()}`,
            anchorImage: {
              ...sourceImg,
              dataUrl: record.multiViewSet.sourceImageDataUrl || sourceImg.dataUrl,
            },
            productName: record.brief.name || 'Product',
            brief: record.brief,
            initialAspectRatio: record.aspectRatio,
            existingRecord: record,
          },
        });
        toast.success(`Restored Multi-view setup for "${record.brief.name}"`);
        return;
      }

      handleTabChange('generate');
      toast.success(`Loaded "${record.brief.name}" into Studio`);
    },
    [models, updateSettings, handleTabChange, ensureReferenceCapableModel]
  );

  const handleUseAsReference = useCallback(
    async (sourceDataUrl: string) => {
      try {
        const scaledUrl = await downscaleImageToMaxDim(sourceDataUrl, 2048);
        setInputMode('photo');
        setInputReferences([scaledUrl]);
        setLightboxState((prev) => ({ ...prev, open: false }));
        handleTabChange('generate');

        if (!selectedModel.supportsReference) {
          const refModel = pickCheapestRecommendedReferenceModel(
            models,
            settings.modelTier
          );
          if (refModel) {
            setModelId(refModel.id);
            setUnavailableModelBanner(null);
            setSpendLimitNotice(null);
            setResolution(getDefaultResolutionForModel(refModel));
            setQualitySelection(null);
            setBackgroundMode('auto');
            setOutputFormat('auto');
            applyAspectRatioWithClamp(aspectRatio, refModel);
            if (refModel.tier !== settings.modelTier) {
              updateSettings({
                modelTier: refModel.tier,
                defaultModel: refModel.id,
              });
            }
            toast.info(
              `Loaded image as reference — switched to ${refModel.name} (${formatModelPrice(refModel, costStats[refModel.id])})`
            );
            return;
          }
        }

        toast.success('Loaded image as reference in Photo mode');
      } catch {
        toast.error('Failed to prepare reference image.');
      }
    },
    [
      selectedModel.supportsReference,
      models,
      settings.modelTier,
      aspectRatio,
      applyAspectRatioWithClamp,
      updateSettings,
      handleTabChange,
      costStats,
    ]
  );

  const handleDeleteRecord = useCallback((recordId: string) => {
    setHistory((prev) => {
      const next = prev.filter((rec) => rec.id !== recordId);
      void saveHistory(next);
      return next;
    });
    setCurrentRecord((prev) => (prev?.id === recordId ? null : prev));
    toast.success('Multi-view set deleted');
  }, []);

  const handleSaveMultiViewRecord = useCallback((record: GenerationRecord) => {
    setHistory((prev) => {
      const idx = prev.findIndex((r) => r.id === record.id);
      const next =
        idx >= 0
          ? prev.map((r, i) => (i === idx ? record : r))
          : [record, ...prev].slice(0, 100);
      void saveHistory(next);
      return next;
    });
  }, []);

  const handleAuthorizePaidBatch = useCallback(
    (params: {
      model: NormalizedImageModel;
      shotCount: number;
      description: string;
      onConfirm: () => void;
    }): boolean => {
      const { model, shotCount, onConfirm } = params;
      setSpendLimitNotice(null);
      const estimate = formatBatchEstimate(model, shotCount, costStats[model.id]);

      if (
        settings.sessionSpendLimitUsd !== null &&
        settings.sessionSpendLimitUsd > 0 &&
        model.tier === 'paid'
      ) {
        const projected =
          estimate.exactTotalUsd !== null
            ? sessionSpendUsd + estimate.exactTotalUsd
            : sessionSpendUsd;
        const limitExceeded =
          estimate.exactTotalUsd !== null
            ? projected > settings.sessionSpendLimitUsd
            : sessionSpendUsd >= settings.sessionSpendLimitUsd;

        if (limitExceeded) {
          const msg =
            estimate.exactTotalUsd !== null
              ? `Session spend limit reached: $${sessionSpendUsd.toFixed(4)} spent + ${estimate.label} estimate exceeds your $${settings.sessionSpendLimitUsd.toFixed(2)} limit.`
              : `Session spend limit reached: $${sessionSpendUsd.toFixed(4)} spent reaches your $${settings.sessionSpendLimitUsd.toFixed(2)} limit.`;
          setSpendLimitNotice(msg);
          toast.error(msg);
          return false;
        }
      }

      if (estimate.needsFirstRunConfirm) {
        setCostConfirmState({
          open: true,
          title: 'Confirm usage-based generation',
          message:
            shotCount > 2
              ? `Usage-based pricing. Cost will be shown after generation. You queued ${shotCount} views — consider starting with 1–2 views first.`
              : 'Usage-based pricing. Cost will be shown after generation.',
          estimateLabel: estimate.label,
          perImageNote: null,
          modelName: model.name,
          plannedShots: shotCount,
          targetModel: model,
          onConfirmCustom: onConfirm,
        });
        return false;
      }

      if (
        model.tier === 'paid' &&
        estimate.exactTotalUsd !== null &&
        estimate.exactTotalUsd > 0.25
      ) {
        setCostConfirmState({
          open: true,
          title: 'Confirm batch cost',
          message: null,
          estimateLabel: estimate.label,
          perImageNote: estimate.perImageNote,
          modelName: model.name,
          plannedShots: shotCount,
          targetModel: model,
          onConfirmCustom: onConfirm,
        });
        return false;
      }

      return true;
    },
    [costStats, settings.sessionSpendLimitUsd, sessionSpendUsd]
  );

  const handleChargeActualSpend = useCallback(
    (targetModelId: string, totalActualSpend: number, perImageSamples: number[]) => {
      if (totalActualSpend > 0) {
        setSessionSpendUsd((prev) => prev + totalActualSpend);
      }
      if (perImageSamples.length > 0) {
        setCostStats((prev) => {
          let next = prev;
          for (const sample of perImageSamples) {
            next = recordModelCostSample(next, targetModelId, sample);
          }
          void saveModelCostStats(next);
          return next;
        });
      }
    },
    []
  );

  const handleReportApiFailure = useCallback(
    (status: number, message: string, isModelUnavailable?: boolean) => {
      if (status === 404 || status === 410 || isModelUnavailable) {
        setUnavailableModelBanner(message);
      }
      if (status === 402) {
        setSpendLimitNotice(message);
      }
    },
    []
  );

  const latestRasterCandidate = useMemo<{
    record: GenerationRecord | null;
    image: GeneratedImageItem;
  } | null>(() => {
    if (currentRecord) {
      const img = currentRecord.images.find(
        (i) => !isSvgMedia(i.mediaType, i.dataUrl)
      );
      if (img) return { record: currentRecord, image: img };
    }
    for (const rec of history) {
      const img = rec.images.find((i) => !isSvgMedia(i.mediaType, i.dataUrl));
      if (img) return { record: rec, image: img };
    }
    return null;
  }, [currentRecord, history]);

  const handleClearLibrary = useCallback(() => {
    setHistory([]);
    setCurrentRecord(null);
    setCurrentShotSet(null);
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
        if (
          activeTab === 'generate' &&
          !commandPaletteOpen &&
          !lightboxState.open &&
          !costConfirmState.open
        ) {
          e.preventDefault();
          void runGeneration();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    activeTab,
    commandPaletteOpen,
    lightboxState.open,
    costConfirmState.open,
    runGeneration,
  ]);

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

  const hasExplicitParam = useCallback(
    (param: string) => selectedModel.supportedParams.includes(param),
    [selectedModel.supportedParams]
  );

  const batchEstimate = useMemo(
    () =>
      formatBatchEstimate(
        selectedModel,
        totalPlannedShots,
        costStats[selectedModel.id]
      ),
    [selectedModel, totalPlannedShots, costStats]
  );

  const showSlowModelHint =
    (selectedModel.priceUsd !== null && selectedModel.priceUsd > 0.1) ||
    (isGenerating && elapsedMs >= 20_000);

  const currentRecordModel = useMemo(
    () =>
      currentRecord ? findModelById(models, currentRecord.modelId) : undefined,
    [currentRecord, models]
  );

  const presetDraftSnapshot = useMemo<PresetDraftSnapshot>(() => {
    const productPart = brief.name.trim() || selectedShot.name;
    return {
      suggestedName: `${productPart} · ${aspectRatio}`,
      suggestedCategory: inferPresetCategory(shotId),
      promptText: activePrompt,
      promptEditedManually,
      shotId,
      refineChips: activeRefineChips,
      enhanceEnabled,
      modelId: selectedModel.id,
      modelName: selectedModel.name,
      modelTier: selectedModel.tier,
      aspectRatio,
      resolution,
      quality: effectiveQuality,
      backgroundMode,
      outputFormat,
      variations,
      customSeed,
    };
  }, [
    brief.name,
    selectedShot.name,
    activePrompt,
    promptEditedManually,
    shotId,
    activeRefineChips,
    enhanceEnabled,
    selectedModel.id,
    selectedModel.name,
    selectedModel.tier,
    aspectRatio,
    resolution,
    effectiveQuality,
    backgroundMode,
    outputFormat,
    variations,
    customSeed,
  ]);

  const handleSaveUserPreset = useCallback(
    (name: string, category: string, promptText: string) => {
      const now = Date.now();
      const created: UserPreset = {
        id: `preset-${now}-${Math.random().toString(36).slice(2, 6)}`,
        name,
        category: category.trim() || 'Catalog',
        createdAt: now,
        updatedAt: now,
        promptText,
        promptEditedManually: true,
        shotId,
        refineChips: [...activeRefineChips],
        enhanceEnabled,
        modelId: selectedModel.id,
        modelTier: selectedModel.tier,
        aspectRatio,
        resolution,
        quality: effectiveQuality,
        backgroundMode,
        outputFormat,
        variations,
        customSeed,
      };
      setUserPresets((prev) => {
        const next = [created, ...prev].slice(0, 50);
        void saveUserPresets(next);
        return next;
      });
      setActivePresetId(created.id);
      toast.success(`Saved preset "${name}" in ${created.category}`);
    },
    [
      shotId,
      activeRefineChips,
      enhanceEnabled,
      selectedModel.id,
      selectedModel.tier,
      aspectRatio,
      resolution,
      effectiveQuality,
      backgroundMode,
      outputFormat,
      variations,
      customSeed,
    ]
  );

  const handleEditUserPreset = useCallback(
    (
      presetId: string,
      patch: { name: string; category: string; promptText: string }
    ) => {
      const cleanCategory = patch.category.trim() || 'Catalog';
      setUserPresets((prev) => {
        const next = prev.map((p) =>
          p.id !== presetId
            ? p
            : {
                ...p,
                name: patch.name,
                category: cleanCategory,
                promptText: patch.promptText,
                updatedAt: Date.now(),
              }
        );
        void saveUserPresets(next);
        return next;
      });
      toast.success(`Updated "${patch.name}" (${cleanCategory})`);
    },
    []
  );

  const handleUpdateUserPreset = useCallback(
    (presetId: string) => {
      const existing = userPresets.find((p) => p.id === presetId);
      setUserPresets((prev) => {
        const next = prev.map((p) => {
          if (p.id !== presetId) return p;
          return {
            ...p,
            updatedAt: Date.now(),
            promptText: activePrompt,
            promptEditedManually: true,
            shotId,
            refineChips: [...activeRefineChips],
            enhanceEnabled,
            modelId: selectedModel.id,
            modelTier: selectedModel.tier,
            aspectRatio,
            resolution,
            quality: effectiveQuality,
            backgroundMode,
            outputFormat,
            variations,
            customSeed,
          };
        });
        void saveUserPresets(next);
        return next;
      });
      setActivePresetId(presetId);
      if (existing) {
        toast.success(`Updated preset "${existing.name}"`);
      }
    },
    [
      userPresets,
      activePrompt,
      shotId,
      activeRefineChips,
      enhanceEnabled,
      selectedModel.id,
      selectedModel.tier,
      aspectRatio,
      resolution,
      effectiveQuality,
      backgroundMode,
      outputFormat,
      variations,
      customSeed,
    ]
  );

  const handleDeleteUserPreset = useCallback(
    (presetId: string) => {
      setUserPresets((prev) => {
        const next = prev.filter((p) => p.id !== presetId);
        void saveUserPresets(next);
        return next;
      });
      if (activePresetId === presetId) {
        setActivePresetId(null);
      }
      toast.success('Preset removed');
    },
    [activePresetId]
  );

  const handleApplyUserPreset = useCallback(
    (preset: UserPreset) => {
      const exactModel = findModelById(models, preset.modelId);
      const resolvedModel =
        exactModel ??
        pickPreferredDefaultModel(models, { tier: preset.modelTier, inputMode }) ??
        selectedModel;

      setModelId(resolvedModel.id);
      updateSettings({ modelTier: resolvedModel.tier });
      setShotId(preset.shotId);
      setActiveRefineChips(preset.refineChips ?? []);
      setEnhanceEnabled(Boolean(preset.enhanceEnabled));
      setManualPromptText(preset.promptText);
      setPromptEditedManually(true);
      applyAspectRatioWithClamp(preset.aspectRatio, resolvedModel);

      setResolution(
        preset.resolution !== 'auto' &&
          resolvedModel.supportedParams.includes('resolution') &&
          (!resolvedModel.supportedResolutions ||
            resolvedModel.supportedResolutions.includes(preset.resolution))
          ? preset.resolution
          : getDefaultResolutionForModel(resolvedModel)
      );

      if (
        resolvedModel.supportedParams.includes('quality') &&
        preset.quality &&
        preset.quality !== 'auto'
      ) {
        setQualitySelection({ modelId: resolvedModel.id, value: preset.quality });
      } else {
        setQualitySelection(null);
      }

      setBackgroundMode(
        preset.backgroundMode !== 'auto' &&
          resolvedModel.supportedParams.includes('background')
          ? preset.backgroundMode
          : 'auto'
      );
      setOutputFormat(
        preset.outputFormat !== 'auto' &&
          resolvedModel.supportedParams.includes('output_format')
          ? preset.outputFormat
          : 'auto'
      );
      setVariations(Math.min(4, Math.max(1, preset.variations || 1)));
      setCustomSeed(preset.customSeed ?? '');
      setUnavailableModelBanner(null);
      setSpendLimitNotice(null);
      setActivePresetId(preset.id);

      if (resolvedModel.requiresReference && inputMode === 'text') {
        setInputMode('photo');
      }

      if (!exactModel) {
        toast.warning(
          `Saved model unavailable — applied "${preset.name}" with ${resolvedModel.name}`
        );
      } else {
        toast.success(`Applied preset "${preset.name}"`);
      }
    },
    [models, inputMode, selectedModel, updateSettings, applyAspectRatioWithClamp]
  );

  return (
    <div className="min-h-screen flex flex-col bg-[var(--background)] text-[var(--foreground)]">
      <TopBar
        activeTab={activeTab}
        onTabChange={handleTabChange}
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
              {/* User-Defined Presets */}
              <UserPresetsPanel
                presets={userPresets}
                activePresetId={activePresetId}
                models={models}
                costStats={costStats}
                currentSnapshot={presetDraftSnapshot}
                onSavePreset={handleSaveUserPreset}
                onEditPreset={handleEditUserPreset}
                onApplyPreset={handleApplyUserPreset}
                onUpdatePreset={handleUpdateUserPreset}
                onDeletePreset={handleDeleteUserPreset}
              />

              <hr className="border-[var(--border)]" />

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
                  inputMode={inputMode}
                  onInputModeChange={handleInputModeChange}
                  inputReferences={inputReferences}
                  onInputReferencesChange={setInputReferences}
                  isWhiteBackgroundPreset={
                    isShotSetActive
                      ? shotSetPresetIds.includes('marketplace-packshot')
                      : selectedShot.isWhiteBackground
                  }
                  variations={variations}
                />
              </section>

              <hr className="border-[var(--border)]" />

              {/* Section 2: Shot Preset / Shot Set */}
              <section className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-[14px] font-semibold tracking-[-0.02em] text-[var(--foreground)]">
                    2. Shot Type
                  </h2>
                  <span className="font-mono text-[11px] text-[var(--muted-foreground)]">
                    {isShotSetActive
                      ? `${shotSetPresetIds.length} presets selected`
                      : `${selectedShot.defaultAspectRatio} default`}
                  </span>
                </div>

                {inputMode === 'photo' ? (
                  <div className="flex items-center justify-between gap-2 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2">
                    <div className="min-w-0">
                      <Label
                        htmlFor="photo-shot-set-switch"
                        className="flex items-center gap-1.5 text-[12px] font-medium text-[var(--foreground)] cursor-pointer"
                      >
                        <Layers className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
                        <span>Generate shot set</span>
                      </Label>
                      <p className="text-[10px] text-[var(--muted-foreground)]">
                        Fires one reference-preserving request per selected preset
                      </p>
                    </div>
                    <Switch
                      id="photo-shot-set-switch"
                      checked={photoShotSetEnabled}
                      onCheckedChange={setPhotoShotSetEnabled}
                    />
                  </div>
                ) : null}

                {isShotSetActive ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      {SHOT_SET_PRESET_IDS.map((presetId) => {
                        const preset = getShotPreset(presetId);
                        const active = shotSetPresetIds.includes(presetId);
                        return (
                          <button
                            key={presetId}
                            type="button"
                            aria-pressed={active}
                            onClick={() => {
                              setShotSetPresetIds((prev) => {
                                if (prev.includes(presetId)) {
                                  if (prev.length <= 1) return prev;
                                  return prev.filter((id) => id !== presetId);
                                }
                                return [...prev, presetId];
                              });
                            }}
                            className={cn(
                              'flex flex-col items-start rounded-[8px] border p-2.5 text-left transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070f3]',
                              active
                                ? 'border-[var(--foreground)] bg-[var(--surface)]'
                                : 'border-[var(--border)] bg-[var(--card)] hover:border-[var(--border-hover)] opacity-75'
                            )}
                          >
                            <div className="flex w-full items-center justify-between gap-1">
                              <span className="text-[12px] font-semibold text-[var(--foreground)] truncate">
                                {preset.name}
                              </span>
                              <span
                                className={cn(
                                  'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border',
                                  active
                                    ? 'border-[var(--foreground)] bg-[var(--foreground)] text-[var(--background)]'
                                    : 'border-[var(--border)] bg-transparent'
                                )}
                              >
                                {active ? <Check className="h-3 w-3" /> : null}
                              </span>
                            </div>
                            <span className="mt-1 font-mono text-[10px] text-[var(--muted-foreground)]">
                              {preset.defaultAspectRatio} ·{' '}
                              {preset.id === 'marketplace-packshot'
                                ? 'White #FFFFFF'
                                : preset.shortDescription.split(',')[0]}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-[var(--muted-foreground)]">
                      <span className="font-mono tabular-nums">
                        {shotSetPresetIds.length} presets × {variations} var ={' '}
                        {totalPlannedShots} total shots
                      </span>
                      <button
                        type="button"
                        onClick={() => setShotSetPresetIds([...SHOT_SET_PRESET_IDS])}
                        className="text-[11px] font-medium text-[var(--foreground)] hover:underline cursor-pointer"
                      >
                        Select all 5
                      </button>
                    </div>
                  </div>
                ) : (
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
                )}
              </section>

              <hr className="border-[var(--border)]" />

              {/* Section 3: Model & Output (Dynamic Tier + Capability-Driven Controls) */}
              <section className="space-y-4">
                <h2 className="text-[14px] font-semibold tracking-[-0.02em] text-[var(--foreground)]">
                  3. Model &amp; Output
                </h2>

                <ModelSelector
                  models={models}
                  tier={settings.modelTier}
                  onTierChange={handleTierChange}
                  selectedModelId={selectedModel.id}
                  onSelectModel={(id) => handleSelectModel(id, false)}
                  inputMode={inputMode}
                  discoveryStatus={discoveryStatus}
                  isLoadingModels={isLoadingModels}
                  onRetryDiscovery={handleRefreshModels}
                  costStats={costStats}
                  compact
                />

                {/* Aspect Ratio Chips (only when supported_parameters includes aspect_ratio) */}
                {hasExplicitParam('aspect_ratio') ? (
                  <div className="space-y-1.5">
                    <Label>Aspect ratio</Label>
                    <div className="grid grid-cols-5 gap-1.5">
                      {ASPECT_RATIOS.map((ar) => {
                        const isSupported =
                          !selectedModel.supportedAspectRatios ||
                          selectedModel.supportedAspectRatios.includes(ar.value);
                        const active = aspectRatio === ar.value;
                        return (
                          <button
                            key={ar.value}
                            type="button"
                            onClick={() => applyAspectRatioWithClamp(ar.value, selectedModel)}
                            title={
                              isSupported
                                ? ar.hint
                                : `${ar.label} unsupported by model (clamps automatically)`
                            }
                            className={cn(
                              'h-8 rounded-[6px] border font-mono text-[12px] transition-colors duration-150 cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070f3]',
                              active
                                ? 'border-[var(--foreground)] bg-[var(--foreground)] text-[var(--background)] font-medium'
                                : isSupported
                                  ? 'border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] hover:border-[var(--border-hover)]'
                                  : 'border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)] opacity-55 hover:border-[var(--border-hover)]'
                            )}
                          >
                            {ar.label}
                          </button>
                        );
                      })}
                    </div>
                    {clampedRatioNote ? (
                      <p className="text-[11px] text-amber-500">{clampedRatioNote}</p>
                    ) : null}
                  </div>
                ) : null}

                {/* Dynamic Capability Controls: resolution, quality, background, output_format, seed */}
                {hasExplicitParam('resolution') ||
                hasExplicitParam('quality') ||
                hasExplicitParam('background') ||
                hasExplicitParam('output_format') ||
                hasExplicitParam('seed') ? (
                  <div className="grid grid-cols-2 gap-2.5">
                    {hasExplicitParam('resolution') ? (
                      <div className="space-y-1">
                        <Label htmlFor="resolution-select">Resolution</Label>
                        <Select value={resolution} onValueChange={setResolution}>
                          <SelectTrigger id="resolution-select" className="h-8 text-[12px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="auto">Auto</SelectItem>
                            {(selectedModel.supportedResolutions ?? ['1K', '2K']).map(
                              (resOpt) => (
                                <SelectItem key={resOpt} value={resOpt}>
                                  {resOpt}
                                </SelectItem>
                              )
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : null}

                    {hasExplicitParam('quality') ? (
                      <div className="space-y-1">
                        <Label htmlFor="quality-select">Quality</Label>
                        <Select
                          value={effectiveQuality}
                          onValueChange={(val) =>
                            setQualitySelection({
                              modelId: selectedModel.id,
                              value: val,
                            })
                          }
                        >
                          <SelectTrigger id="quality-select" className="h-8 text-[12px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="auto">Auto</SelectItem>
                            {(selectedModel.supportedQualities ?? ['low', 'medium', 'high']).map(
                              (qOpt) => (
                                <SelectItem key={qOpt} value={qOpt}>
                                  {qOpt}
                                </SelectItem>
                              )
                            )}
                          </SelectContent>
                        </Select>
                        <p className="text-[10px] leading-snug text-[var(--muted-foreground)]">
                          Defaulted to medium — &ldquo;high&rdquo; can cost several times more.
                        </p>
                      </div>
                    ) : null}

                    {hasExplicitParam('background') ? (
                      <div className="space-y-1">
                        <Label htmlFor="background-select">Background</Label>
                        <Select
                          value={backgroundMode}
                          onValueChange={(val) =>
                            setBackgroundMode(val as 'auto' | 'opaque' | 'transparent')
                          }
                        >
                          <SelectTrigger id="background-select" className="h-8 text-[12px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="auto">Auto</SelectItem>
                            {(selectedModel.supportedBackgrounds ?? ['opaque', 'transparent']).map(
                              (bgOpt) => (
                                <SelectItem key={bgOpt} value={bgOpt}>
                                  {bgOpt}
                                </SelectItem>
                              )
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : null}

                    {hasExplicitParam('output_format') ? (
                      <div className="space-y-1">
                        <Label htmlFor="output-format-select">Format</Label>
                        <Select
                          value={outputFormat}
                          onValueChange={(val) =>
                            setOutputFormat(
                              val as 'auto' | 'png' | 'webp' | 'jpeg' | 'svg'
                            )
                          }
                        >
                          <SelectTrigger id="output-format-select" className="h-8 text-[12px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="auto">Auto</SelectItem>
                            {(selectedModel.supportedOutputFormats ?? ['png', 'webp', 'jpeg'])
                              .filter((f) => ['png', 'webp', 'jpeg', 'svg'].includes(f.toLowerCase()))
                              .map((fmt) => (
                                <SelectItem key={fmt} value={fmt.toLowerCase()}>
                                  {fmt.toUpperCase()}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : null}

                    {hasExplicitParam('seed') ? (
                      <div className="space-y-1">
                        <Label htmlFor="seed-input">Seed (optional)</Label>
                        <Input
                          id="seed-input"
                          value={customSeed}
                          onChange={(e) =>
                            setCustomSeed(e.target.value.replace(/[^0-9]/g, '').slice(0, 9))
                          }
                          placeholder="Random"
                          className="h-8 font-mono text-[12px]"
                        />
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {selectedModel.supportedParams.length === 0 ? (
                  <p className="text-[11px] text-[var(--muted-foreground)]">
                    This model uses prompt-only generation (no extra parameters).
                  </p>
                ) : null}

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

              {/* Desktop Generate CTA + Cost Estimate & Slow Hint */}
              <div className="hidden lg:block space-y-2 pt-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="lg"
                    disabled={isGenerating}
                    onClick={() => void runGeneration()}
                    className="flex-1 min-w-[175px] justify-between"
                  >
                    <span>
                      {isGenerating
                        ? (() => {
                            const doneCount = pendingImageSlots.filter(
                              (s) => s.status === 'done' || s.status === 'error'
                            ).length;
                            return `Generating ${doneCount}/${pendingSlots} shots...`;
                          })()
                        : isShotSetActive
                          ? `Generate shot set (${totalPlannedShots} shots)`
                          : `Generate ${variations} ${variations === 1 ? 'shot' : 'shots'}`}
                    </span>
                    <kbd className="font-mono text-[11px] opacity-75">⌘↵</kbd>
                  </Button>

                  {selectedModel.tier === 'paid' ? (
                    <span className="inline-flex h-10 items-center rounded-[6px] border border-[var(--border)] bg-[var(--surface)] px-2.5 font-mono text-[11px] tabular-nums text-[var(--muted-foreground)] whitespace-nowrap shrink-0">
                      {batchEstimate.label}
                    </span>
                  ) : null}
                </div>

                {selectedModel.tier === 'paid' && batchEstimate.perImageNote ? (
                  <p className="font-mono text-[11px] tabular-nums text-[var(--muted-foreground)]">
                    {batchEstimate.perImageNote}
                  </p>
                ) : null}

                {spendLimitNotice ? (
                  <div
                    role="alert"
                    className="rounded-[8px] border border-red-500/40 bg-[var(--surface)] px-3 py-2 text-[11px] text-red-400 space-y-1.5"
                  >
                    <p>{spendLimitNotice}</p>
                    <button
                      type="button"
                      onClick={() => handleTabChange('settings')}
                      className="font-medium text-[var(--foreground)] underline cursor-pointer"
                    >
                      Adjust limit in Settings
                    </button>
                  </div>
                ) : null}

                {showSlowModelHint ? (
                  <p className="flex items-center gap-1.5 text-[11px] text-[var(--muted-foreground)]">
                    <Clock className="h-3 w-3 shrink-0" />
                    <span>This model can take over a minute</span>
                  </p>
                ) : null}
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
                        const fallback = pickPreferredDefaultModel(
                          models.filter((m) => m.id !== modelId),
                          { tier: settings.modelTier, inputMode }
                        );
                        if (fallback) {
                          updateSettings({ modelTier: fallback.tier });
                          handleSelectModel(fallback.id, true);
                        }
                        setUnavailableModelBanner(null);
                      }}
                    >
                      Pick another model
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
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] pb-3">
                <div className="flex flex-wrap items-center gap-2.5">
                  {isGenerating ? (
                    (() => {
                      const doneCount = pendingImageSlots.filter(
                        (s) => s.status === 'done'
                      ).length;
                      const runningCount = pendingImageSlots.filter(
                        (s) => s.status === 'generating'
                      ).length;
                      const errorCount = pendingImageSlots.filter(
                        (s) => s.status === 'error'
                      ).length;
                      return (
                        <span className="inline-flex items-center gap-2 rounded-[6px] border border-[var(--border)] bg-[var(--card)] px-2.5 py-1 text-[12px] text-[var(--foreground)]">
                          <span className="h-2 w-2 rounded-full bg-[#0070f3]" />
                          <span className="font-mono tabular-nums">
                            {doneCount}/{pendingSlots} ready
                            {runningCount > 0 ? ` · ${runningCount} active` : ''}
                            {errorCount > 0 ? ` · ${errorCount} failed` : ''} ·{' '}
                            {(elapsedMs / 1000).toFixed(1)}s
                          </span>
                        </span>
                      );
                    })()
                  ) : currentRecord ? (
                    <span className="inline-flex items-center gap-2 rounded-[6px] border border-[var(--border)] bg-[var(--card)] px-2.5 py-1 text-[12px] text-[var(--foreground)]">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      <span>Complete</span>
                    </span>
                  ) : (
                    <span className="font-mono text-[11px] uppercase tracking-wider text-[var(--muted-foreground)]">
                      Studio Canvas
                    </span>
                  )}

                  {currentRecord && !isGenerating ? (
                    <span className="font-mono text-[12px] tabular-nums text-[var(--muted-foreground)]">
                      {currentRecord.actualCost !== null &&
                      currentRecord.actualCost !== undefined
                        ? `$${currentRecord.actualCost.toFixed(4)}`
                        : currentRecord.totalCost > 0
                          ? `~$${currentRecord.totalCost.toFixed(3)}`
                          : 'Free'}{' '}
                      · {(currentRecord.totalDurationMs / 1000).toFixed(1)}s total ·{' '}
                      {currentRecordModel?.name ?? currentRecord.modelId}
                    </span>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {showSlowModelHint && isGenerating ? (
                    <span className="flex items-center gap-1.5 font-mono text-[11px] text-[var(--muted-foreground)]">
                      <Clock className="h-3 w-3 shrink-0" />
                      <span>This model can take over a minute</span>
                    </span>
                  ) : currentRecord && currentRecord.enhanced ? (
                    <span className="font-mono text-[11px] text-[var(--muted-foreground)]">
                      AI-enhanced prompt applied
                    </span>
                  ) : null}

                  <span className="rounded-[6px] border border-[var(--border)] bg-[var(--card)] px-2.5 py-1 font-mono text-[12px] tabular-nums text-[var(--muted-foreground)]">
                    Spent this session:{' '}
                    <span className="font-medium text-[var(--foreground)]">
                      ${sessionSpendUsd.toFixed(4)}
                    </span>
                    {settings.sessionSpendLimitUsd !== null ? (
                      <span> / ${settings.sessionSpendLimitUsd.toFixed(2)} limit</span>
                    ) : null}
                  </span>
                </div>
              </div>

              {/* Partial Failure Notice */}
              {generationErrors.length > 0 ? (
                <div className="mb-4 rounded-[8px] border border-amber-500/30 bg-[var(--card)] px-3.5 py-2.5 text-[12px] text-[var(--muted-foreground)] space-y-1">
                  <p className="font-medium text-[var(--foreground)]">
                    {generationErrors.length === 1
                      ? `Partial batch warning: ${generationErrors[0]}`
                      : `${generationErrors.length} images failed in batch:`}
                  </p>
                  {generationErrors.length > 1 ? (
                    <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
                      {generationErrors.slice(0, 4).map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}

              {/* Preview Marketplace Auto-Crop & Centering Toolbar */}
              {!isGenerating &&
              ((currentShotSet &&
                currentShotSet.some((g) =>
                  g.record.images.some(
                    (img) => !isSvgMedia(img.mediaType, img.dataUrl)
                  )
                )) ||
                (!currentShotSet &&
                  currentRecord &&
                  currentRecord.images.some(
                    (img) => !isSvgMedia(img.mediaType, img.dataUrl)
                  ))) ? (
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5 rounded-[10px] border border-[var(--border)] bg-[var(--card)] px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Crop className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
                    <span className="text-[12px] font-medium text-[var(--foreground)]">
                      Marketplace Alignment
                    </span>
                    <span className="hidden sm:inline text-[11px] text-[var(--muted-foreground)]">
                      Auto-crop &amp; center products
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="w-40">
                      <Select
                        value={alignPresetId}
                        onValueChange={(v) =>
                          setAlignPresetId(v as MarketplaceAlignPresetId)
                        }
                      >
                        <SelectTrigger
                          aria-label="Marketplace alignment standard"
                          className="h-7 text-[11px]"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {MARKETPLACE_ALIGN_PRESETS.map((preset) => (
                            <SelectItem key={preset.id} value={preset.id}>
                              {preset.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <button
                      type="button"
                      disabled={aligningImageIds.size > 0}
                      onClick={() => {
                        if (currentShotSet) {
                          void (async () => {
                            for (const group of currentShotSet) {
                              await handleAutoCenterImages(
                                group.record,
                                group.record.images
                              );
                            }
                          })();
                        } else if (currentRecord) {
                          void handleAutoCenterImages(
                            currentRecord,
                            currentRecord.images
                          );
                        }
                      }}
                      className="inline-flex h-7 items-center gap-1.5 rounded-[6px] border border-[var(--foreground)] bg-[var(--foreground)] px-2.5 text-[11px] font-medium text-[var(--background)] transition-opacity hover:opacity-90 disabled:opacity-40 cursor-pointer whitespace-nowrap"
                    >
                      <Crop className="h-3 w-3" />
                      <span>
                        {aligningImageIds.size > 0
                          ? 'Centering...'
                          : currentShotSet || (currentRecord && currentRecord.images.length > 1)
                            ? 'Center All'
                            : 'Center Shot'}
                      </span>
                    </button>

                    <button
                      type="button"
                      aria-pressed={showComplianceGuides}
                      onClick={() => setShowComplianceGuides((prev) => !prev)}
                      title="Toggle center crosshairs and safe-zone guides on preview cards"
                      className={cn(
                        'inline-flex h-7 items-center gap-1 rounded-[6px] border px-2 text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap',
                        showComplianceGuides
                          ? 'border-[var(--foreground)] bg-[var(--surface)] text-[var(--foreground)]'
                          : 'border-[var(--border)] bg-transparent text-[var(--muted-foreground)] hover:border-[var(--border-hover)] hover:text-[var(--foreground)]'
                      )}
                    >
                      <Crosshair className="h-3 w-3" />
                      <span>Guides</span>
                    </button>
                  </div>
                </div>
              ) : null}

              {/* Results Grid / Shot Set Groups / Skeletons / Empty State */}
              {isGenerating ? (
                generatingShotSetPresets && generatingShotSetPresets.length > 0 ? (
                  <div className="space-y-6">
                    {generatingShotSetPresets.map((presetId) => {
                      const presetSpec = getShotPreset(presetId);
                      const groupSlots = pendingImageSlots.filter(
                        (s) => s.shotId === presetId
                      );
                      const isGroupWhiteBg =
                        presetSpec.isWhiteBackground ||
                        (brief.useBackgroundColor &&
                          brief.backgroundColor.toUpperCase() === '#FFFFFF');
                      return (
                        <div key={presetId} className="space-y-2.5">
                          <div className="flex items-center justify-between border-b border-[var(--border)] pb-1.5">
                            <span className="text-[13px] font-semibold text-[var(--foreground)]">
                              {presetSpec.name}
                            </span>
                            <span className="font-mono text-[11px] text-[var(--muted-foreground)]">
                              {presetSpec.defaultAspectRatio}
                            </span>
                          </div>
                          <div
                            className={cn(
                              'grid gap-4',
                              groupSlots.length === 1
                                ? 'grid-cols-1 max-w-xl'
                                : 'grid-cols-1 md:grid-cols-2'
                            )}
                          >
                            {groupSlots.map((slot) =>
                              slot.status === 'done' && slot.image ? (
                                <ImageResultCard
                                  key={slot.id}
                                  image={slot.image}
                                  productName={brief.name}
                                  isWhiteBackgroundShot={isGroupWhiteBg}
                                  showComplianceGuides={showComplianceGuides}
                                  targetFillPercent={Math.round(
                                    getMarketplaceAlignPreset(alignPresetId).targetFill * 100
                                  )}
                                  alignPresetLabel={
                                    getMarketplaceAlignPreset(alignPresetId).shortLabel
                                  }
                                  isGenerating={isGenerating}
                                  onOpenLightbox={() => {}}
                                  onToggleFavorite={() => {}}
                                  onDelete={() => {}}
                                  onRemix={() => {}}
                                  onRefine={() => {}}
                                  onRegenerateFailedCheck={() => {}}
                                  onUseAsReference={() =>
                                    void handleUseAsReference(slot.image!.dataUrl)
                                  }
                                  onCreateMultiView={() =>
                                    void handleOpenMultiView(null, slot.image!)
                                  }
                                />
                              ) : slot.status === 'error' ? (
                                <div
                                  key={slot.id}
                                  className="overflow-hidden rounded-[12px] border border-amber-500/40 bg-[var(--card)]"
                                >
                                  <div className="aspect-square w-full bg-[var(--surface)] border-b border-[var(--border)] flex flex-col items-center justify-center gap-2 px-5 text-center">
                                    <AlertTriangle className="h-5 w-5 text-amber-500" />
                                    <span className="text-[12px] font-medium text-[var(--foreground)]">
                                      {presetSpec.name} · var {slot.variationIndex + 1} failed
                                    </span>
                                    <span className="text-[11px] text-[var(--muted-foreground)] line-clamp-3">
                                      {slot.error || 'Generation error'}
                                    </span>
                                  </div>
                                </div>
                              ) : (
                                <div
                                  key={slot.id}
                                  className="overflow-hidden rounded-[12px] border border-[var(--border)] bg-[var(--card)]"
                                >
                                  <div
                                    className={cn(
                                      'relative aspect-square w-full bg-[var(--surface)] border-b border-[var(--border)] flex flex-col items-center justify-center gap-1.5 px-4 text-center',
                                      slot.status === 'generating' && 'skeleton-shimmer'
                                    )}
                                  >
                                    <span className="font-mono text-[12px] tabular-nums text-[var(--foreground)]">
                                      {slot.status === 'queued'
                                        ? `${presetSpec.name} · var ${slot.variationIndex + 1} · Queued`
                                        : `${presetSpec.name} · var ${slot.variationIndex + 1} · ${(elapsedMs / 1000).toFixed(1)}s`}
                                    </span>
                                    {showSlowModelHint && slot.status === 'generating' ? (
                                      <span className="text-[11px] text-[var(--muted-foreground)]">
                                        This model can take over a minute
                                      </span>
                                    ) : null}
                                  </div>
                                  <div className="p-3.5 space-y-2.5">
                                    <div className="h-4 w-2/3 rounded-[4px] bg-[var(--surface)]" />
                                    <div className="h-3 w-1/3 rounded-[4px] bg-[var(--surface)]" />
                                  </div>
                                </div>
                              )
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div
                    className={cn(
                      'grid gap-4',
                      pendingImageSlots.length === 1
                        ? 'grid-cols-1 max-w-xl'
                        : 'grid-cols-1 md:grid-cols-2'
                    )}
                  >
                    {pendingImageSlots.map((slot) =>
                      slot.status === 'done' && slot.image ? (
                        <ImageResultCard
                          key={slot.id}
                          image={slot.image}
                          productName={brief.name}
                          isWhiteBackgroundShot={
                            selectedShot.isWhiteBackground ||
                            (brief.useBackgroundColor &&
                              brief.backgroundColor.toUpperCase() === '#FFFFFF')
                          }
                          showComplianceGuides={showComplianceGuides}
                          targetFillPercent={Math.round(
                            getMarketplaceAlignPreset(alignPresetId).targetFill * 100
                          )}
                          alignPresetLabel={
                            getMarketplaceAlignPreset(alignPresetId).shortLabel
                          }
                          isGenerating={isGenerating}
                          onOpenLightbox={() => {}}
                          onToggleFavorite={() => {}}
                          onDelete={() => {}}
                          onRemix={() => {}}
                          onRefine={() => {}}
                          onRegenerateFailedCheck={() => {}}
                          onUseAsReference={() =>
                            void handleUseAsReference(slot.image!.dataUrl)
                          }
                          onCreateMultiView={() =>
                            void handleOpenMultiView(null, slot.image!)
                          }
                        />
                      ) : slot.status === 'error' ? (
                        <div
                          key={slot.id}
                          className="overflow-hidden rounded-[12px] border border-amber-500/40 bg-[var(--card)]"
                        >
                          <div className="aspect-square w-full bg-[var(--surface)] border-b border-[var(--border)] flex flex-col items-center justify-center gap-2 px-5 text-center">
                            <AlertTriangle className="h-5 w-5 text-amber-500" />
                            <span className="text-[12px] font-medium text-[var(--foreground)]">
                              Variation {slot.variationIndex + 1} failed
                            </span>
                            <span className="text-[11px] text-[var(--muted-foreground)] line-clamp-3">
                              {slot.error || 'Generation error'}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div
                          key={slot.id}
                          className="overflow-hidden rounded-[12px] border border-[var(--border)] bg-[var(--card)]"
                        >
                          <div
                            className={cn(
                              'relative aspect-square w-full bg-[var(--surface)] border-b border-[var(--border)] flex flex-col items-center justify-center gap-1.5 px-4 text-center',
                              slot.status === 'generating' && 'skeleton-shimmer'
                            )}
                          >
                            <span className="font-mono text-[12px] tabular-nums text-[var(--foreground)]">
                              {slot.status === 'queued'
                                ? `Variation ${slot.variationIndex + 1} · Queued`
                                : `Rendering variation ${slot.variationIndex + 1} · ${(elapsedMs / 1000).toFixed(1)}s`}
                            </span>
                            {showSlowModelHint && slot.status === 'generating' ? (
                              <span className="text-[11px] text-[var(--muted-foreground)]">
                                This model can take over a minute
                              </span>
                            ) : null}
                          </div>
                          <div className="p-3.5 space-y-2.5">
                            <div className="h-4 w-2/3 rounded-[4px] bg-[var(--surface)]" />
                            <div className="h-3 w-1/3 rounded-[4px] bg-[var(--surface)]" />
                          </div>
                        </div>
                      )
                    )}
                  </div>
                )
              ) : currentShotSet && currentShotSet.length > 0 ? (
                <div className="space-y-6">
                  {currentShotSet.map((group) => {
                    const presetSpec = getShotPreset(group.shotId);
                    const isGroupWhiteBg =
                      presetSpec.isWhiteBackground ||
                      (group.record.brief.useBackgroundColor &&
                        group.record.brief.backgroundColor.toUpperCase() === '#FFFFFF');
                    return (
                      <div key={group.record.id} className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] pb-2">
                          <div className="flex items-center gap-2">
                            <Layers className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
                            <h3 className="text-[13px] font-semibold text-[var(--foreground)]">
                              {presetSpec.name}
                            </h3>
                            <span className="rounded-[4px] border border-[var(--border)] bg-[var(--surface)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--muted-foreground)]">
                              {group.record.aspectRatio}
                            </span>
                          </div>
                          <span className="font-mono text-[11px] tabular-nums text-[var(--muted-foreground)]">
                            {group.record.actualCost !== null &&
                            group.record.actualCost !== undefined
                              ? `$${group.record.actualCost.toFixed(4)}`
                              : group.record.totalCost > 0
                                ? `~$${group.record.totalCost.toFixed(3)}`
                                : 'Free'}{' '}
                            · {(group.record.totalDurationMs / 1000).toFixed(1)}s
                          </span>
                        </div>

                        <div
                          className={cn(
                            'grid gap-4',
                            group.record.images.length === 1
                              ? 'grid-cols-1 max-w-xl'
                              : 'grid-cols-1 md:grid-cols-2'
                          )}
                        >
                          {group.record.images.map((image, idx) => (
                            <ImageResultCard
                              key={image.id}
                              image={image}
                              productName={group.record.brief.name}
                              isWhiteBackgroundShot={isGroupWhiteBg}
                              showComplianceGuides={showComplianceGuides}
                              targetFillPercent={Math.round(
                                getMarketplaceAlignPreset(alignPresetId).targetFill * 100
                              )}
                              alignPresetLabel={
                                getMarketplaceAlignPreset(alignPresetId).shortLabel
                              }
                              isAligning={aligningImageIds.has(image.id)}
                              isGenerating={isGenerating}
                              onOpenLightbox={() =>
                                setLightboxState({
                                  open: true,
                                  record: group.record,
                                  index: idx,
                                })
                              }
                              onToggleFavorite={() =>
                                handleToggleFavorite(group.record.id, image.id)
                              }
                              onDelete={() =>
                                handleDeleteImage(group.record.id, image.id)
                              }
                              onRemix={() => handleRemixRecord(group.record)}
                              onRefine={handleRefine}
                              onRegenerateFailedCheck={() => void runGeneration()}
                              onAutoCenter={() =>
                                void handleAutoCenterImages(group.record, [image])
                              }
                              onOpenAlignModal={() =>
                                setAlignModalState({
                                  open: true,
                                  recordId: group.record.id,
                                  imageId: image.id,
                                })
                              }
                              onRevertAlignment={() =>
                                void handleRevertAlignment(group.record.id, image)
                              }
                              onUseAsReference={() =>
                                void handleUseAsReference(image.dataUrl)
                              }
                              onCreateMultiView={() =>
                                void handleOpenMultiView(group.record, image)
                              }
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
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
                      showComplianceGuides={showComplianceGuides}
                      targetFillPercent={Math.round(
                        getMarketplaceAlignPreset(alignPresetId).targetFill * 100
                      )}
                      alignPresetLabel={
                        getMarketplaceAlignPreset(alignPresetId).shortLabel
                      }
                      isAligning={aligningImageIds.has(image.id)}
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
                      onAutoCenter={() =>
                        void handleAutoCenterImages(currentRecord, [image])
                      }
                      onOpenAlignModal={() =>
                        setAlignModalState({
                          open: true,
                          recordId: currentRecord.id,
                          imageId: image.id,
                        })
                      }
                      onRevertAlignment={() =>
                        void handleRevertAlignment(currentRecord.id, image)
                      }
                      onUseAsReference={() => void handleUseAsReference(image.dataUrl)}
                      onCreateMultiView={() =>
                        void handleOpenMultiView(currentRecord, image)
                      }
                    />
                  ))}
                </div>
              ) : (
                <div className="relative flex flex-1 min-h-[460px] flex-col items-center justify-center overflow-hidden rounded-[12px] border border-[var(--border)] bg-[var(--card)]/90 p-8 text-center">
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
            <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--border)] bg-[var(--background)]/95 p-3 backdrop-blur-sm lg:hidden space-y-1.5">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="lg"
                  disabled={isGenerating}
                  onClick={() => void runGeneration()}
                  className="flex-1"
                >
                  {isGenerating
                    ? (() => {
                        const doneCount = pendingImageSlots.filter(
                          (s) => s.status === 'done' || s.status === 'error'
                        ).length;
                        return `Generating ${doneCount}/${pendingSlots} (${(elapsedMs / 1000).toFixed(0)}s)...`;
                      })()
                    : isShotSetActive
                      ? `Generate shot set (${totalPlannedShots} shots)`
                      : `Generate ${variations} ${variations === 1 ? 'shot' : 'shots'}`}
                </Button>
                {selectedModel.tier === 'paid' ? (
                  <span className="inline-flex h-10 items-center rounded-[6px] border border-[var(--border)] bg-[var(--surface)] px-2.5 font-mono text-[11px] tabular-nums text-[var(--muted-foreground)] whitespace-nowrap shrink-0">
                    {batchEstimate.label}
                  </span>
                ) : null}
              </div>
              {selectedModel.tier === 'paid' && batchEstimate.perImageNote ? (
                <p className="font-mono text-[10px] tabular-nums text-[var(--muted-foreground)]">
                  {batchEstimate.perImageNote}
                </p>
              ) : null}
            </div>
          </div>
        ) : activeTab === 'library' ? (
          <LibraryView
            records={history}
            models={models}
            onRemixRecord={handleRemixRecord}
            onToggleFavorite={handleToggleFavorite}
            onDeleteImage={handleDeleteImage}
            onClearLibrary={handleClearLibrary}
            onOpenLightbox={(rec, idx) =>
              setLightboxState({ open: true, record: rec, index: idx })
            }
            onGoToGenerate={() => handleTabChange('generate')}
            onUseAsReference={(img) => void handleUseAsReference(img.dataUrl)}
            onCreateMultiView={(rec, img) => void handleOpenMultiView(rec, img)}
            onDeleteRecord={handleDeleteRecord}
          />
        ) : activeTab === 'usage' ? (
          <UsageView
            records={history}
            models={models}
            costStats={costStats}
            sessionSpendUsd={sessionSpendUsd}
            sessionSpendLimitUsd={settings.sessionSpendLimitUsd}
            onGoToGenerate={() => handleTabChange('generate')}
            onGoToLibrary={() => handleTabChange('library')}
            onGoToSettings={() => handleTabChange('settings')}
          />
        ) : (
          <SettingsView
            settings={settings}
            onUpdateSettings={updateSettings}
            models={models}
            costStats={costStats}
            sessionSpendUsd={sessionSpendUsd}
            onTierChange={handleTierChange}
            onSelectDefaultModel={(id) => handleSelectModel(id, true)}
            inputMode={inputMode}
            discoveryStatus={discoveryStatus}
            isLoadingModels={isLoadingModels}
            isRefreshingModels={isRefreshingModels}
            onRefreshModels={handleRefreshModels}
            serverStatus={serverStatus}
          />
        )}
      </main>

      {/* Cost Guard Confirmation Dialog (> $0.25 or first usage-based run) */}
      <StudioModal
        open={costConfirmState.open}
        onOpenChange={(open) =>
          setCostConfirmState((prev) => ({ ...prev, open }))
        }
        title={costConfirmState.title}
        className="max-w-md p-5"
      >
        <div className="space-y-4">
          <div className="space-y-1.5 pr-6">
            <h2 className="text-[16px] font-semibold tracking-[-0.02em] text-[var(--foreground)]">
              {costConfirmState.title}
            </h2>
            {costConfirmState.message ? (
              <p className="text-[13px] leading-relaxed text-[var(--muted-foreground)]">
                <span className="font-medium text-[var(--foreground)]">
                  {costConfirmState.modelName}
                </span>
                : {costConfirmState.message}
              </p>
            ) : (
              <p className="text-[13px] leading-relaxed text-[var(--muted-foreground)]">
                Generating{' '}
                <span className="font-mono text-[var(--foreground)]">
                  {costConfirmState.plannedShots}
                </span>{' '}
                {costConfirmState.shotSetPresets &&
                costConfirmState.shotSetPresets.length > 0
                  ? `shot-set images (${costConfirmState.shotSetPresets.length} presets)`
                  : costConfirmState.plannedShots === 1
                    ? 'variation'
                    : 'variations'}{' '}
                with{' '}
                <span className="font-medium text-[var(--foreground)]">
                  {costConfirmState.modelName}
                </span>{' '}
                is estimated at{' '}
                <span className="font-mono font-medium text-[var(--foreground)]">
                  {costConfirmState.estimateLabel}
                </span>
                .
                {costConfirmState.perImageNote ? (
                  <span className="mt-1 block font-mono text-[11px] text-[var(--muted-foreground)]">
                    {costConfirmState.perImageNote}
                  </span>
                ) : null}
              </p>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] pt-3">
            <Button
              variant="secondary"
              onClick={() =>
                setCostConfirmState((prev) => ({ ...prev, open: false }))
              }
            >
              Cancel
            </Button>
            <Button
              variant="default"
              onClick={() => {
                const override = costConfirmState.override;
                const target = costConfirmState.targetModel ?? selectedModel;
                const shotSetPresets = costConfirmState.shotSetPresets;
                const onConfirmCustom = costConfirmState.onConfirmCustom;
                setCostConfirmState((prev) => ({
                  ...prev,
                  open: false,
                  onConfirmCustom: undefined,
                }));
                if (onConfirmCustom) {
                  onConfirmCustom();
                } else if (shotSetPresets && shotSetPresets.length > 0) {
                  void executeShotSetGeneration(target, shotSetPresets);
                } else {
                  void executeGeneration(target, override);
                }
              }}
            >
              Confirm &amp; Generate
            </Button>
          </div>
        </div>
      </StudioModal>

      {/* Lightbox Modal */}
      {lightboxState.record ? (
        <LightboxModal
          key={lightboxState.record.id}
          open={lightboxState.open}
          onOpenChange={(open) => setLightboxState((prev) => ({ ...prev, open }))}
          images={lightboxState.record.images}
          activeIndex={lightboxState.index}
          onIndexChange={(index) => setLightboxState((prev) => ({ ...prev, index }))}
          productName={lightboxState.record.brief.name}
          prompt={lightboxState.record.prompt}
          modelId={lightboxState.record.modelId}
          modelName={
            findModelById(models, lightboxState.record.modelId)?.name ??
            lightboxState.record.modelId
          }
          modelTier={lightboxState.record.modelTier}
          isWhiteBackgroundShot={
            getShotPreset(lightboxState.record.shotId).isWhiteBackground ||
            (lightboxState.record.brief.useBackgroundColor &&
              lightboxState.record.brief.backgroundColor.toUpperCase() === '#FFFFFF')
          }
          onToggleFavorite={(imageId) =>
            handleToggleFavorite(lightboxState.record!.id, imageId)
          }
          onRemix={() => handleRemixRecord(lightboxState.record!)}
          onOpenAlignModal={(imageId) =>
            setAlignModalState({
              open: true,
              recordId: lightboxState.record!.id,
              imageId,
            })
          }
          onUseAsReference={(img) => void handleUseAsReference(img.dataUrl)}
          onCreateMultiView={(img) =>
            void handleOpenMultiView(lightboxState.record, img)
          }
          anchorCompareDataUrl={
            lightboxState.anchorCompareDataUrl ??
            lightboxState.record.multiViewSet?.sourceImageDataUrl
          }
        />
      ) : null}

      {/* Multi-view set Panel */}
      {multiViewState.session ? (
        <MultiViewModal
          key={multiViewState.session.sessionKey}
          open={multiViewState.open}
          onOpenChange={(open) =>
            setMultiViewState((prev) => ({ ...prev, open }))
          }
          session={multiViewState.session}
          models={models}
          initialModelId={selectedModel.id}
          costStats={costStats}
          onSwitchModel={(nextId) => handleSelectModel(nextId, false)}
          onAuthorizePaidBatch={handleAuthorizePaidBatch}
          onChargeActualSpend={handleChargeActualSpend}
          onReportApiFailure={handleReportApiFailure}
          onSaveMultiViewRecord={handleSaveMultiViewRecord}
          onOpenCompareLightbox={(rec, idx, anchorUrl) =>
            setLightboxState({
              open: true,
              record: rec,
              index: idx,
              anchorCompareDataUrl: anchorUrl,
            })
          }
        />
      ) : null}

      {/* Auto-Crop & Marketplace Centering Modal */}
      {(() => {
        const targetRecord =
          (alignModalState.recordId &&
            (currentRecord?.id === alignModalState.recordId
              ? currentRecord
              : history.find((r) => r.id === alignModalState.recordId))) ||
          null;
        const targetImage =
          targetRecord?.images.find((i) => i.id === alignModalState.imageId) ??
          null;

        return (
          <AutoCropModal
            key={`${alignModalState.recordId}::${alignModalState.imageId}::${alignPresetId}`}
            open={alignModalState.open && Boolean(targetImage)}
            onOpenChange={(open) =>
              setAlignModalState((prev) => ({ ...prev, open }))
            }
            image={targetImage}
            productName={targetRecord?.brief.name ?? ''}
            initialPresetId={alignPresetId}
            onApplyAlignment={(patch) => {
              if (!targetRecord || !targetImage) return;
              handleApplyAlignment(targetRecord.id, targetImage.id, patch);
            }}
            onRevertOriginal={() => {
              if (!targetRecord || !targetImage) return;
              void handleRevertAlignment(targetRecord.id, targetImage);
            }}
          />
        );
      })()}

      {/* Command Palette (Cmd/Ctrl + K) */}
      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        onSwitchTab={handleTabChange}
        onSelectPreset={handleSelectShotPreset}
        onLoadSample={handleLoadSample}
        onToggleTheme={() =>
          updateSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' })
        }
        onToggleEnhance={() => setEnhanceEnabled((prev) => !prev)}
        onCreateMultiView={() => {
          if (latestRasterCandidate) {
            void handleOpenMultiView(
              latestRasterCandidate.record,
              latestRasterCandidate.image
            );
          }
        }}
        hasMultiViewCandidate={Boolean(latestRasterCandidate)}
        theme={settings.theme}
        enhanceEnabled={enhanceEnabled}
      />
    </div>
  );
}
