'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Aperture,
  Check,
  Clock,
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
  pickPreferredDefaultModel,
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
  buildPrompt,
  DEFAULT_BRIEF,
  SAMPLE_BRIEFS,
  type ProductBrief,
  type SampleBriefPreset,
} from '@/lib/prompt-engine';
import { analyzePackshotImage } from '@/lib/packshot-check';
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
import { LightboxModal } from '@/components/lightbox-modal';
import { LibraryView } from '@/components/library-view';
import { SettingsView } from '@/components/settings-view';
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

export function StudioApp() {
  const [activeTab, setActiveTab] = useState<StudioTab>('generate');
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

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
  const [resolution, setResolution] = useState<string>('auto');
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
  const [currentRecord, setCurrentRecord] = useState<GenerationRecord | null>(null);
  const [generationErrors, setGenerationErrors] = useState<string[]>([]);
  const [unavailableModelBanner, setUnavailableModelBanner] = useState<string | null>(null);

  // Cost guard confirmation dialog state (> $0.25 or first usage-based run)
  const [costConfirmState, setCostConfirmState] = useState<{
    open: boolean;
    title: string;
    message: string | null;
    estimateLabel: string;
    perImageNote?: string | null;
    modelName: string;
    targetModel?: NormalizedImageModel;
    override?: PendingGenerationOverride;
  }>({ open: false, title: 'Confirm batch cost', message: null, estimateLabel: '', modelName: '' });

  // Lightbox state
  const [lightboxState, setLightboxState] = useState<{
    open: boolean;
    record: GenerationRecord | null;
    index: number;
  }>({ open: false, record: null, index: 0 });

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
      setResolution('auto');
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
        pickPreferredDefaultModel(tierModels, { tier: nextTier, inputMode }) ??
        tierModels[0];

      const currentInTier = tierModels.some((m) => m.id === modelId);
      const defaultInTier = tierModels.some((m) => m.id === settings.defaultModel);

      const nextActiveModel = currentInTier ? modelId : preferredForTier.id;
      const nextDefaultModel = defaultInTier
        ? settings.defaultModel
        : preferredForTier.id;

      updateSettings({
        modelTier: nextTier,
        defaultModel: nextDefaultModel,
      });

      if (!currentInTier) {
        setModelId(preferredForTier.id);
        setUnavailableModelBanner(null);
        setSpendLimitNotice(null);
        setResolution('auto');
        setQualitySelection(null);
        setBackgroundMode('auto');
        setOutputFormat('auto');
        applyAspectRatioWithClamp(aspectRatio, preferredForTier);
        toast.info(`Switched to ${preferredForTier.name} (${nextTier} tier)`);
      } else if (nextActiveModel !== modelId) {
        setModelId(nextActiveModel);
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

  const deterministicPrompt = useMemo(
    () =>
      buildPrompt(brief, shotId, {
        refineChipIds: activeRefineChips,
      }),
    [brief, shotId, activeRefineChips]
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

  const executeGeneration = useCallback(
    async (
      targetModel: NormalizedImageModel,
      override?: PendingGenerationOverride
    ) => {
      if (isGenerating) return;

      const targetPrompt = override?.prompt ?? activePrompt;
      const targetEditedManually =
        override?.promptEditedManually ?? promptEditedManually;
      const targetRefineChips = override?.refineChipIds ?? activeRefineChips;
      const targetEnhance = override?.enhance ?? enhanceEnabled;

      const parsedSeed =
        customSeed.trim() && /^\d+$/.test(customSeed.trim())
          ? Math.min(2_147_483_647, Math.max(1, parseInt(customSeed.trim(), 10)))
          : undefined;

      setIsGenerating(true);
      setElapsedMs(0);
      setPendingSlots(variations);
      setGenerationErrors([]);
      setUnavailableModelBanner(null);

      try {
        const res = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: targetPrompt,
            model: targetModel.id,
            aspectRatio,
            resolution: resolution !== 'auto' ? resolution : undefined,
            quality: effectiveQuality !== 'auto' ? effectiveQuality : undefined,
            background: backgroundMode !== 'auto' ? backgroundMode : undefined,
            outputFormat: outputFormat !== 'auto' ? outputFormat : undefined,
            variations,
            enhance: targetEnhance,
            promptEditedManually: targetEditedManually,
            rgbColors: brief.colors,
            backgroundRgbColor: selectedShot.isWhiteBackground
              ? '#FFFFFF'
              : brief.useBackgroundColor
                ? brief.backgroundColor
                : undefined,
            inputReferences:
              targetModel.supportsReference && inputReferences.length > 0
                ? inputReferences.slice(0, Math.max(1, targetModel.maxReferences))
                : undefined,
            baseSeed: parsedSeed,
          }),
        });

        const payload = (await res.json()) as {
          error?: string;
          isModelUnavailable?: boolean;
          promptUsed?: string;
          enhanced?: boolean;
          modelTier?: ModelTier;
          actualCost?: number | null;
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
                `Model ${targetModel.name} returned ${res.status}. Pick another model to continue.`
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

        const processedImages: GeneratedImageItem[] = await Promise.all(
          rawImages.map(async (img) => {
            let packshotCheck = undefined;
            if (isWhiteBg && !isSvgMedia(img.mediaType, img.dataUrl)) {
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
          modelId: targetModel.id,
          modelTier: payload.modelTier ?? targetModel.tier,
          aspectRatio,
          prompt: payload.promptUsed || targetPrompt,
          enhanced: Boolean(payload.enhanced),
          refineChips: targetRefineChips,
          images: processedImages,
          totalCost: payload.totalCost ?? 0,
          actualCost: payload.actualCost ?? null,
          totalDurationMs: payload.totalDurationMs ?? 0,
        };

        setCurrentRecord(newRecord);
        setHistory((prev) => {
          const next = [newRecord, ...prev].slice(0, 100);
          void saveHistory(next);
          return next;
        });

        // Record actualCost into session spend & per-model cost stats store
        if (
          typeof payload.actualCost === 'number' &&
          Number.isFinite(payload.actualCost)
        ) {
          const runActualCost = payload.actualCost;
          setSessionSpendUsd((prev) => prev + runActualCost);

          if (processedImages.length > 0) {
            const perImageCost = runActualCost / processedImages.length;
            setCostStats((prev) => {
              const next = recordModelCostSample(prev, targetModel.id, perImageCost);
              void saveModelCostStats(next);
              return next;
            });
          }
        }

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
        setElapsedMs(0);
        setPendingSlots(0);
      }
    },
    [
      isGenerating,
      activePrompt,
      promptEditedManually,
      activeRefineChips,
      enhanceEnabled,
      customSeed,
      variations,
      aspectRatio,
      resolution,
      effectiveQuality,
      backgroundMode,
      outputFormat,
      brief,
      selectedShot.isWhiteBackground,
      inputReferences,
      shotId,
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

      if (activeModel.requiresReference && inputReferences.length === 0) {
        toast.error(`${activeModel.name} requires at least 1 reference photo.`);
        setInputMode('photo');
        return;
      }

      const activeStats = costStats[activeModel.id];
      const estimate = formatBatchEstimate(activeModel, variations, activeStats);

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
            variations > 2
              ? `Usage-based pricing. Cost will be shown after generation. You selected ${variations} variations — consider starting with 1–2 shots first.`
              : 'Usage-based pricing. Cost will be shown after generation.',
          estimateLabel: estimate.label,
          perImageNote: null,
          modelName: activeModel.name,
          targetModel: activeModel,
          override,
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
          targetModel: activeModel,
          override,
        });
        return;
      }

      await executeGeneration(activeModel, override);
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
      variations,
      sessionSpendUsd,
      updateSettings,
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
      setActiveTab('generate');
      toast.success(`Loaded "${record.brief.name}" into Studio`);
    },
    [models, updateSettings]
  );

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
    () => formatBatchEstimate(selectedModel, variations, costStats[selectedModel.id]),
    [selectedModel, variations, costStats]
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
          resolvedModel.supportedParams.includes('resolution')
          ? preset.resolution
          : 'auto'
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
              {/* User-Defined Presets */}
              <UserPresetsPanel
                presets={userPresets}
                activePresetId={activePresetId}
                models={models}
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
                        ? `Generating ${pendingSlots} ${pendingSlots === 1 ? 'shot' : 'shots'}...`
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
                      onClick={() => setActiveTab('settings')}
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
                    <span className="inline-flex items-center gap-2 rounded-[6px] border border-[var(--border)] bg-[var(--card)] px-2.5 py-1 text-[12px] text-[var(--foreground)]">
                      <span className="h-2 w-2 rounded-full bg-[#0070f3]" />
                      <span className="font-mono tabular-nums">
                        Generating {pendingSlots} · {(elapsedMs / 1000).toFixed(1)}s
                      </span>
                    </span>
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
                      <div className="skeleton-shimmer relative aspect-square w-full bg-[var(--surface)] border-b border-[var(--border)] flex flex-col items-center justify-center gap-1.5 px-4 text-center">
                        <span className="font-mono text-[12px] tabular-nums text-[var(--foreground)]">
                          Rendering variation {idx + 1} · {(elapsedMs / 1000).toFixed(1)}s
                        </span>
                        {showSlowModelHint ? (
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
                    ? `Generating ${pendingSlots} (${(elapsedMs / 1000).toFixed(0)}s)...`
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
            onGoToGenerate={() => setActiveTab('generate')}
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
                <span className="font-mono text-[var(--foreground)]">{variations}</span>{' '}
                {variations === 1 ? 'variation' : 'variations'} with{' '}
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
                setCostConfirmState((prev) => ({ ...prev, open: false }));
                void executeGeneration(target, override);
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
