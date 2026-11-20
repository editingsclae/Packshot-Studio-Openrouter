'use client';

import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Columns2,
  Crop,
  Download,
  FileArchive,
  Grid2x2,
  ImagePlus,
  Layers,
  MessageSquarePlus,
  RefreshCw,
  RotateCw,
  ShieldAlert,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  downloadImageAs,
  downloadSelectedAsZip,
  isSvgMedia,
  type GeneratedImageItem,
  type GenerationRecord,
  type ModelCostStatsMap,
  type MultiViewId,
  type MultiViewSetMeta,
} from '@/lib/db';
import {
  ASPECT_RATIOS,
  formatBatchEstimate,
  formatModelPrice,
  type AspectRatio,
  type NormalizedImageModel,
} from '@/lib/models';
import {
  ALL_MULTIVIEW_SPECS,
  alignMultiViewSet,
  analyzeMultiViewConsistency,
  buildMultiViewPrompt,
  compressHiddenSidePhoto,
  downloadMultiViewContactSheet,
  getMultiViewSpec,
  MULTIVIEW_PRESETS,
  pickNearestCompletedViews,
  pickWaveOneView,
  prepareMultiViewReferences,
  sortViewsCanonical,
  SOURCE_VIEW_OPTIONS,
} from '@/lib/multiview';
import { analyzePackshotImage } from '@/lib/packshot-check';
import { getShotPreset, SHOT_PRESETS, type ShotPresetId } from '@/lib/presets';
import { DEFAULT_BRIEF, type ProductBrief } from '@/lib/prompt-engine';
import { StudioModal } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

export interface MultiViewInitialSession {
  sessionKey: string;
  anchorImage: GeneratedImageItem;
  productName: string;
  brief?: ProductBrief;
  initialAspectRatio: AspectRatio;
  existingRecord?: GenerationRecord;
}

interface ViewSlotState {
  status: 'idle' | 'queued' | 'generating' | 'done' | 'error';
  error?: string;
  item?: GeneratedImageItem;
}

interface MultiViewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: MultiViewInitialSession;
  models: NormalizedImageModel[];
  initialModelId: string;
  costStats: ModelCostStatsMap;
  onSwitchModel: (modelId: string) => void;
  onAuthorizePaidBatch: (params: {
    model: NormalizedImageModel;
    shotCount: number;
    description: string;
    onConfirm: () => void;
  }) => boolean;
  onChargeActualSpend: (
    modelId: string,
    totalActualSpend: number,
    perImageSamples: number[]
  ) => void;
  onReportApiFailure: (status: number, message: string, isModelUnavailable?: boolean) => void;
  onSaveMultiViewRecord: (record: GenerationRecord) => void;
  onOpenCompareLightbox: (record: GenerationRecord, index: number, anchorUrl: string) => void;
}

function slugifyProduct(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'product'
  );
}

export function MultiViewModal({
  open,
  onOpenChange,
  session,
  models,
  initialModelId,
  costStats,
  onSwitchModel,
  onAuthorizePaidBatch,
  onChargeActualSpend,
  onReportApiFailure,
  onSaveMultiViewRecord,
  onOpenCompareLightbox,
}: MultiViewModalProps) {
  const existingMeta = session.existingRecord?.multiViewSet;

  const refCapableModels = useMemo(
    () => models.filter((m) => m.supportsReference),
    [models]
  );

  const allowedRefCapableModels = useMemo(
    () => refCapableModels.filter((m) => m.allowed !== false),
    [refCapableModels]
  );

  const [selectedModelId, setSelectedModelId] = useState<string>(() => {
    const candidate = models.find((m) => m.id === initialModelId);
    if (candidate?.supportsReference && candidate.allowed !== false) return candidate.id;
    return allowedRefCapableModels[0]?.id ?? refCapableModels[0]?.id ?? initialModelId;
  });

  const activeModel = useMemo(() => {
    return (
      allowedRefCapableModels.find((m) => m.id === selectedModelId) ??
      allowedRefCapableModels[0] ??
      refCapableModels.find((m) => m.id === selectedModelId) ??
      refCapableModels[0] ??
      models[0]
    );
  }, [allowedRefCapableModels, refCapableModels, selectedModelId, models]);

  const maxRefs = Math.min(4, Math.max(0, activeModel?.maxReferences ?? 0));
  const supportsMultiRef = maxRefs >= 2;
  const supportsSeed = Boolean(activeModel?.supportedParams.includes('seed'));
  const supportsResolution1K = Boolean(
    activeModel?.supportedParams.includes('resolution') &&
      (!activeModel.supportedResolutions ||
        activeModel.supportedResolutions.includes('1K'))
  );

  // Setup state initialized cleanly from session (fresh or Remix)
  const [sourceViewId, setSourceViewId] = useState<MultiViewId>(
    existingMeta?.sourceViewId ?? 'front'
  );
  const [selectedViewIds, setSelectedViewIds] = useState<MultiViewId[]>(() =>
    existingMeta?.selectedViewIds
      ? sortViewsCanonical(existingMeta.selectedViewIds)
      : [...MULTIVIEW_PRESETS[0].views]
  );
  const [shotStyleId, setShotStyleId] = useState<ShotPresetId>(
    existingMeta?.shotStyleId ?? 'marketplace-packshot'
  );
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(() => {
    const desired = session.existingRecord?.aspectRatio ?? session.initialAspectRatio;
    const supported = activeModel?.supportedAspectRatios;
    if (supported && supported.length > 0 && !supported.includes(desired)) {
      return ASPECT_RATIOS.find((a) => supported.includes(a.value))?.value ?? '1:1';
    }
    return desired;
  });
  const [useSameSeed, setUseSameSeed] = useState<boolean>(
    existingMeta?.useSameSeed ?? true
  );
  const [consistencyBoost, setConsistencyBoost] = useState<boolean>(() =>
    existingMeta ? Boolean(existingMeta.consistencyBoost && supportsMultiRef) : false
  );
  const [hiddenSidesExpanded, setHiddenSidesExpanded] = useState(false);
  const [hiddenSidesNotes, setHiddenSidesNotes] = useState<Record<string, string>>(
    () => ({ ...(existingMeta?.hiddenSidesNotes ?? {}) })
  );
  const [hiddenSidesPhotos, setHiddenSidesPhotos] = useState<Record<string, string>>(
    () => ({ ...(existingMeta?.hiddenSidesPhotos ?? {}) })
  );
  const [extraRefViewIds, setExtraRefViewIds] = useState<MultiViewId[]>(
    () => [...(existingMeta?.extraReferenceViewIds ?? [])]
  );

  // Results & running state
  const [savedRecordId] = useState<string>(
    () => session.existingRecord?.id ?? `mv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  );
  const [setId] = useState<string>(
    () => existingMeta?.setId ?? `set-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  );
  const [viewStates, setViewStates] = useState<Record<string, ViewSlotState>>(() => {
    const initial: Record<string, ViewSlotState> = {};
    if (session.existingRecord) {
      for (const img of session.existingRecord.images) {
        if (img.viewId) {
          initial[img.viewId] = { status: 'done', item: img };
        }
      }
    }
    if (!initial[existingMeta?.sourceViewId ?? 'front']) {
      const sView = existingMeta?.sourceViewId ?? 'front';
      initial[sView] = {
        status: 'done',
        item: {
          ...session.anchorImage,
          id: `${session.anchorImage.id}-src`,
          viewId: sView,
          viewLabel: getMultiViewSpec(sView).label,
          isSourceView: true,
          approved: true,
        },
      };
    }
    return initial;
  });

  const [isRunningBatch, setIsRunningBatch] = useState(false);
  const [isAligningSet, setIsAligningSet] = useState(false);
  const [isExportingZip, setIsExportingZip] = useState(false);
  const [isExportingSheet, setIsExportingSheet] = useState(false);
  const [showContactLabels, setShowContactLabels] = useState(true);
  const [correctionOpenView, setCorrectionOpenView] = useState<MultiViewId | null>(null);
  const [correctionDraft, setCorrectionDraft] = useState('');
  const [turntableIndex, setTurntableIndex] = useState(0);
  const dragStartXRef = useRef<number | null>(null);

  const orderedViews = useMemo(() => {
    const withSource = selectedViewIds.includes(sourceViewId)
      ? selectedViewIds
      : [sourceViewId, ...selectedViewIds];
    return sortViewsCanonical(Array.from(new Set(withSource)));
  }, [selectedViewIds, sourceViewId]);

  const viewsToGenerate = useMemo(
    () => orderedViews.filter((v) => v !== sourceViewId),
    [orderedViews, sourceViewId]
  );

  const activePresetMatch = useMemo(() => {
    const currentSet = new Set(selectedViewIds);
    return MULTIVIEW_PRESETS.find(
      (p) =>
        p.views.length === selectedViewIds.length &&
        p.views.every((v) => currentSet.has(v))
    );
  }, [selectedViewIds]);

  const activeShotPreset = useMemo(() => getShotPreset(shotStyleId), [shotStyleId]);

  const effectiveAspectRatio = useMemo(() => {
    const supported = activeModel?.supportedAspectRatios;
    if (supported && supported.length > 0 && !supported.includes(aspectRatio)) {
      return ASPECT_RATIOS.find((a) => supported.includes(a.value))?.value ?? '1:1';
    }
    return aspectRatio;
  }, [activeModel, aspectRatio]);

  const effectiveConsistencyBoost = supportsMultiRef && consistencyBoost;

  const batchEstimate = useMemo(() => {
    if (!activeModel || viewsToGenerate.length === 0) {
      return {
        label: '$0.000',
        perImageNote: null,
        exactTotalUsd: 0,
        isUsageOrUnknown: false,
        needsFirstRunConfirm: false,
      };
    }
    return formatBatchEstimate(
      activeModel,
      viewsToGenerate.length,
      costStats[activeModel.id]
    );
  }, [activeModel, viewsToGenerate.length, costStats]);

  const sourceItem = useMemo<GeneratedImageItem>(() => {
    const existingSource = Object.values(viewStates).find((s) => s.item?.isSourceView)?.item;
    return {
      ...(existingSource ?? session.anchorImage),
      id: existingSource?.id ?? `${session.anchorImage.id}-src`,
      dataUrl: existingSource?.dataUrl ?? session.anchorImage.dataUrl,
      mediaType: existingSource?.mediaType ?? session.anchorImage.mediaType,
      viewId: sourceViewId,
      viewLabel: getMultiViewSpec(sourceViewId).label,
      isSourceView: true,
      approved: true,
    };
  }, [viewStates, session.anchorImage, sourceViewId]);

  const buildRecordSnapshot = (
    nextViewStates: Record<string, ViewSlotState>,
    opts?: {
      sharedSeed?: number;
      overrideMeta?: Partial<MultiViewSetMeta>;
      durationMs?: number;
    }
  ): GenerationRecord => {
    const existingSourceInNext = Object.values(nextViewStates).find(
      (s) => s.item?.isSourceView
    )?.item;
    const currentSource: GeneratedImageItem = {
      ...(existingSourceInNext ?? sourceItem),
      viewId: sourceViewId,
      viewLabel: getMultiViewSpec(sourceViewId).label,
      isSourceView: true,
    };

    const items: GeneratedImageItem[] = [];
    for (const vid of orderedViews) {
      if (vid === sourceViewId) {
        items.push(currentSource);
        continue;
      }
      const slotItem = nextViewStates[vid]?.item;
      if (slotItem) {
        items.push({
          ...slotItem,
          viewId: vid,
          viewLabel: getMultiViewSpec(vid).label,
          isSourceView: false,
        });
      }
    }

    const generatedItems = items.filter((i) => !i.isSourceView);
    const numericCosts = generatedItems
      .map((i) => i.cost)
      .filter((c): c is number => typeof c === 'number' && Number.isFinite(c));
    const hasActual = numericCosts.length > 0;
    const totalActual = numericCosts.reduce((sum, c) => sum + c, 0);

    const briefForRecord: ProductBrief = session.brief
      ? { ...session.brief, name: session.productName || session.brief.name }
      : { ...DEFAULT_BRIEF, name: session.productName || 'Product' };

    return {
      id: savedRecordId,
      createdAt: session.existingRecord?.createdAt ?? Date.now(),
      brief: briefForRecord,
      shotId: shotStyleId,
      modelId: activeModel.id,
      modelTier: activeModel.tier,
      aspectRatio: effectiveAspectRatio,
      prompt: buildMultiViewPrompt(viewsToGenerate[0] ?? 'back', {
        shotStyleId,
      }),
      enhanced: false,
      refineChips: [],
      images: items,
      totalCost:
        activeModel.tier === 'free'
          ? 0
          : hasActual
            ? totalActual
            : (activeModel.priceUsd ?? 0) * generatedItems.length,
      actualCost: hasActual ? totalActual : null,
      totalDurationMs:
        opts?.durationMs ??
        generatedItems.reduce((sum, i) => sum + i.durationMs, 0),
      multiViewSet: {
        setId,
        sourceImageId: session.anchorImage.id,
        sourceImageDataUrl: session.anchorImage.dataUrl,
        sourceViewId,
        selectedViewIds: orderedViews,
        shotStyleId,
        hiddenSidesNotes: { ...hiddenSidesNotes },
        hiddenSidesPhotos: { ...hiddenSidesPhotos },
        useSameSeed: supportsSeed && useSameSeed,
        sharedSeed: opts?.sharedSeed ?? existingMeta?.sharedSeed,
        consistencyBoost: effectiveConsistencyBoost,
        extraReferenceViewIds: [...extraRefViewIds],
        ...opts?.overrideMeta,
      },
    };
  };

  const persistIfHasGenerated = (nextViewStates: Record<string, ViewSlotState>, sharedSeed?: number, durationMs?: number) => {
    const hasGen = orderedViews.some(
      (vid) => vid !== sourceViewId && nextViewStates[vid]?.status === 'done' && nextViewStates[vid]?.item
    );
    if (!hasGen) return;
    const rec = buildRecordSnapshot(nextViewStates, { sharedSeed, durationMs });
    onSaveMultiViewRecord(rec);
  };

  const generateSingleView = async (params: {
    viewId: MultiViewId;
    model: NormalizedImageModel;
    completedSoFar: Array<{ viewId: MultiViewId; dataUrl: string }>;
    sharedSeed?: number;
    correctionNote?: string;
    boostEnabled: boolean;
  }): Promise<{ item: GeneratedImageItem; actualCost: number | null }> => {
    const {
      viewId,
      model,
      completedSoFar,
      sharedSeed,
      correctionNote,
      boostEnabled,
    } = params;

    const rawRefs: string[] = [session.anchorImage.dataUrl];
    const sidePhoto = hiddenSidesPhotos[viewId];
    if (sidePhoto && model.maxReferences >= 2) {
      rawRefs.push(sidePhoto);
    }

    // Extra user-pinned views from the grid (e.g. "Use as extra reference")
    for (const extraVid of extraRefViewIds) {
      if (extraVid === viewId || extraVid === sourceViewId) continue;
      const found = completedSoFar.find((c) => c.viewId === extraVid);
      if (found && !rawRefs.includes(found.dataUrl)) {
        rawRefs.push(found.dataUrl);
      }
    }

    // Consistency boost: attach up to 2 nearest completed views by angle
    if (boostEnabled && model.maxReferences >= 2) {
      const nearest = pickNearestCompletedViews(viewId, completedSoFar, 2);
      for (const n of nearest) {
        if (!rawRefs.includes(n)) {
          rawRefs.push(n);
        }
      }
    }

    const preparedRefs = await prepareMultiViewReferences(
      rawRefs,
      model.maxReferences
    );

    const prompt = buildMultiViewPrompt(viewId, {
      shotStyleId,
      hiddenSideNote: hiddenSidesNotes[viewId],
      correctionNote,
    });

    const seedToSend =
      model.supportedParams.includes('seed') && sharedSeed
        ? sharedSeed
        : undefined;

    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        model: model.id,
        aspectRatio: effectiveAspectRatio,
        resolution:
          model.supportedParams.includes('resolution') &&
          (!model.supportedResolutions || model.supportedResolutions.includes('1K'))
            ? '1K'
            : undefined,
        variations: 1,
        enhance: false,
        promptEditedManually: true,
        inputReferences: preparedRefs,
        baseSeed: seedToSend,
      }),
    });

    const payload = (await res.json().catch(() => ({}))) as {
      error?: string;
      isModelUnavailable?: boolean;
      actualCost?: number | null;
      degraded?: string[];
      images?: Array<{
        dataUrl: string;
        mediaType: string;
        seed?: number;
        cost: number | null;
        durationMs: number;
        degraded?: string[];
      }>;
    };

    if (!res.ok) {
      const msg = payload.error || `Request failed (${res.status})`;
      onReportApiFailure(res.status, msg, payload.isModelUnavailable);
      throw new Error(msg);
    }

    const rawImg = payload.images?.[0];
    if (!rawImg) {
      throw new Error(payload.error || 'No image returned by model');
    }

    const isWhite = activeShotPreset.isWhiteBackground;
    let packshotCheck = undefined;
    let consistency = undefined;

    if (!isSvgMedia(rawImg.mediaType, rawImg.dataUrl)) {
      if (isWhite) {
        try {
          packshotCheck = await analyzePackshotImage(rawImg.dataUrl);
        } catch {
          packshotCheck = undefined;
        }
      }
      try {
        consistency = await analyzeMultiViewConsistency(
          session.anchorImage.dataUrl,
          rawImg.dataUrl
        );
      } catch {
        consistency = undefined;
      }
    }

    const actualCost =
      typeof rawImg.cost === 'number' && Number.isFinite(rawImg.cost)
        ? rawImg.cost
        : typeof payload.actualCost === 'number' && Number.isFinite(payload.actualCost)
          ? payload.actualCost
          : null;

    const item: GeneratedImageItem = {
      id: `mv-${viewId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      dataUrl: rawImg.dataUrl,
      mediaType: rawImg.mediaType,
      seed: rawImg.seed ?? seedToSend,
      cost: actualCost,
      durationMs: rawImg.durationMs,
      packshotCheck,
      degraded:
        rawImg.degraded && rawImg.degraded.length > 0
          ? rawImg.degraded
          : payload.degraded && payload.degraded.length > 0
            ? payload.degraded
            : undefined,
      viewId,
      viewLabel: getMultiViewSpec(viewId).label,
      isSourceView: false,
      approved: false,
      extraNote: correctionNote,
      consistency,
    };

    return { item, actualCost };
  };

  const executeFullMultiViewBatch = async () => {
    if (!activeModel || viewsToGenerate.length === 0 || isRunningBatch) return;

    const batchStart = Date.now();
    const sharedSeed =
      supportsSeed && useSameSeed
        ? existingMeta?.sharedSeed ?? Math.floor(100_000 + Math.random() * 899_999_000)
        : undefined;

    setIsRunningBatch(true);

    // Prepare clean initial state with source view intact and target views queued
    const workingStates: Record<string, ViewSlotState> = {
      [sourceViewId]: {
        status: 'done',
        item: sourceItem,
      },
    };
    for (const vid of viewsToGenerate) {
      workingStates[vid] = { status: 'queued' };
    }
    setViewStates({ ...workingStates });

    const completedPool: Array<{ viewId: MultiViewId; dataUrl: string }> = [
      { viewId: sourceViewId, dataUrl: session.anchorImage.dataUrl },
    ];
    const costSamples: number[] = [];
    let totalActualSpend = 0;
    let successCount = 0;
    let failCount = 0;

    const runOne = async (vid: MultiViewId) => {
      setViewStates((prev) => ({
        ...prev,
        [vid]: { ...prev[vid], status: 'generating', error: undefined },
      }));

      try {
        const { item, actualCost } = await generateSingleView({
          viewId: vid,
          model: activeModel,
          completedSoFar: [...completedPool],
          sharedSeed,
          boostEnabled: effectiveConsistencyBoost,
        });
        completedPool.push({ viewId: vid, dataUrl: item.dataUrl });
        if (typeof actualCost === 'number' && Number.isFinite(actualCost)) {
          totalActualSpend += actualCost;
          costSamples.push(actualCost);
        }
        successCount++;
        workingStates[vid] = { status: 'done', item };
        setViewStates((prev) => ({
          ...prev,
          [vid]: { status: 'done', item },
        }));
      } catch (err) {
        failCount++;
        const msg = err instanceof Error ? err.message : 'Generation failed';
        workingStates[vid] = { status: 'error', error: msg };
        setViewStates((prev) => ({
          ...prev,
          [vid]: { status: 'error', error: msg },
        }));
      }
    };

    try {
      const remaining = [...viewsToGenerate];

      // Wave 1 (Consistency Boost): generate one 3/4 view first
      if (effectiveConsistencyBoost && remaining.length > 1) {
        const wave1View = pickWaveOneView(remaining);
        if (wave1View) {
          const idx = remaining.indexOf(wave1View);
          if (idx !== -1) remaining.splice(idx, 1);
          await runOne(wave1View);
        }
      }

      // Parallel worker pool (concurrency 4) for remaining views
      const CONCURRENCY = 4;
      let cursor = 0;
      const worker = async () => {
        while (true) {
          const idx = cursor++;
          if (idx >= remaining.length) return;
          await runOne(remaining[idx]);
        }
      };

      await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, remaining.length) }, () => worker())
      );

      if (totalActualSpend > 0 || costSamples.length > 0) {
        onChargeActualSpend(activeModel.id, totalActualSpend, costSamples);
      }

      const elapsed = Date.now() - batchStart;
      if (successCount > 0) {
        persistIfHasGenerated(workingStates, sharedSeed, elapsed);
      }

      if (failCount > 0 && successCount > 0) {
        toast.warning(
          `Multi-view set: ${successCount} generated, ${failCount} failed`
        );
      } else if (failCount > 0 && successCount === 0) {
        toast.error('Multi-view generation failed');
      } else {
        toast.success(`Generated ${successCount} multi-view angles`);
      }
    } finally {
      setIsRunningBatch(false);
    }
  };

  const handleStartBatchClick = () => {
    if (!activeModel) {
      toast.error('No reference-capable model available.');
      return;
    }
    if (viewsToGenerate.length === 0) {
      toast.error('Select at least 1 view other than the source angle.');
      return;
    }
    const allowed = onAuthorizePaidBatch({
      model: activeModel,
      shotCount: viewsToGenerate.length,
      description: `${viewsToGenerate.length} multi-view angles`,
      onConfirm: () => {
        void executeFullMultiViewBatch();
      },
    });
    if (allowed) {
      void executeFullMultiViewBatch();
    }
  };

  const executeSingleViewRegenerate = async (
    vid: MultiViewId,
    correctionNote?: string
  ) => {
    if (!activeModel || vid === sourceViewId || isRunningBatch) return;

    const completedSoFar: Array<{ viewId: MultiViewId; dataUrl: string }> = [
      { viewId: sourceViewId, dataUrl: session.anchorImage.dataUrl },
    ];
    for (const [k, slot] of Object.entries(viewStates)) {
      if (k !== vid && slot.status === 'done' && slot.item) {
        completedSoFar.push({ viewId: k as MultiViewId, dataUrl: slot.item.dataUrl });
      }
    }

    setCorrectionOpenView(null);
    setCorrectionDraft('');
    setViewStates((prev) => ({
      ...prev,
      [vid]: { ...prev[vid], status: 'generating', error: undefined },
    }));

    try {
      const sharedSeed =
        supportsSeed && useSameSeed ? existingMeta?.sharedSeed : undefined;
      const { item, actualCost } = await generateSingleView({
        viewId: vid,
        model: activeModel,
        completedSoFar,
        sharedSeed,
        correctionNote,
        boostEnabled: effectiveConsistencyBoost || extraRefViewIds.length > 0,
      });

      if (typeof actualCost === 'number' && Number.isFinite(actualCost)) {
        onChargeActualSpend(activeModel.id, actualCost, [actualCost]);
      }

      const nextStates: Record<string, ViewSlotState> = {
        ...viewStates,
        [vid]: { status: 'done', item },
      };
      setViewStates(nextStates);
      persistIfHasGenerated(nextStates, sharedSeed);
      toast.success(`Regenerated ${getMultiViewSpec(vid).label}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Regeneration failed';
      setViewStates((prev) => ({
        ...prev,
        [vid]: { ...prev[vid], status: 'error', error: msg },
      }));
      toast.error(msg);
    }
  };

  const handleRegenerateView = (vid: MultiViewId, correctionNote?: string) => {
    if (!activeModel) return;
    const allowed = onAuthorizePaidBatch({
      model: activeModel,
      shotCount: 1,
      description: `Regenerate ${getMultiViewSpec(vid).label} view`,
      onConfirm: () => {
        void executeSingleViewRegenerate(vid, correctionNote);
      },
    });
    if (allowed) {
      void executeSingleViewRegenerate(vid, correctionNote);
    }
  };

  const handleToggleApprove = (vid: MultiViewId) => {
    const slot = viewStates[vid];
    if (!slot?.item) return;
    const updated: GeneratedImageItem = {
      ...slot.item,
      approved: !slot.item.approved,
    };
    const nextStates: Record<string, ViewSlotState> = {
      ...viewStates,
      [vid]: { ...slot, item: updated },
    };
    setViewStates(nextStates);
    persistIfHasGenerated(nextStates);
  };

  const handleToggleExtraRef = (vid: MultiViewId) => {
    if (vid === sourceViewId) return;
    if (!supportsMultiRef) {
      toast.info(
        `${activeModel?.name ?? 'Current model'} only accepts 1 reference image (used by the anchor).`
      );
      return;
    }
    setExtraRefViewIds((prev) => {
      if (prev.includes(vid)) {
        return prev.filter((x) => x !== vid);
      }
      const next = [...prev, vid].slice(-(Math.max(1, maxRefs - 1)));
      toast.success(
        `Added ${getMultiViewSpec(vid).label} as extra reference for view regenerations`
      );
      return next;
    });
  };

  const handleAlignSet = async () => {
    const completedItems: Array<{
      vid: MultiViewId;
      id: string;
      dataUrl: string;
      isSource: boolean;
    }> = [];

    for (const vid of orderedViews) {
      if (vid === sourceViewId) {
        completedItems.push({
          vid,
          id: sourceItem.id,
          dataUrl: sourceItem.dataUrl,
          isSource: true,
        });
      } else if (viewStates[vid]?.item && !isSvgMedia(viewStates[vid].item!.mediaType, viewStates[vid].item!.dataUrl)) {
        const item = viewStates[vid].item!;
        completedItems.push({
          vid,
          id: item.id,
          dataUrl: item.dataUrl,
          isSource: false,
        });
      }
    }

    if (completedItems.length < 2) {
      toast.info('Generate at least 1 other view before aligning the set.');
      return;
    }

    setIsAligningSet(true);
    try {
      const aligned = await alignMultiViewSet(
        session.anchorImage.dataUrl,
        completedItems,
        {
          isWhiteBackground: activeShotPreset.isWhiteBackground,
          aspectRatio: effectiveAspectRatio,
        }
      );

      const alignedById = new Map(aligned.map((a) => [a.id, a]));
      const nextStates: Record<string, ViewSlotState> = { ...viewStates };

      for (const entry of completedItems) {
        const res = alignedById.get(entry.id);
        if (!res) continue;
        const prevSlot = nextStates[entry.vid];
        const baseItem =
          entry.isSource ? sourceItem : prevSlot?.item;
        if (!baseItem) continue;
        nextStates[entry.vid] = {
          status: 'done',
          item: {
            ...baseItem,
            originalDataUrl: baseItem.originalDataUrl ?? baseItem.dataUrl,
            dataUrl: res.dataUrl,
            mediaType: 'image/png',
            packshotCheck: res.packshotCheck,
            consistency: res.consistency,
            alignedLabel: 'Aligned set',
          },
        };
      }

      setViewStates(nextStates);
      persistIfHasGenerated(nextStates);
      toast.success(`Aligned ${aligned.length} views to matching scale & canvas`);
    } catch {
      toast.error('Failed to align multi-view set');
    } finally {
      setIsAligningSet(false);
    }
  };

  const completedExportList = useMemo(() => {
    const list: Array<{
      vid: MultiViewId;
      label: string;
      slug: string;
      isSource: boolean;
      item: GeneratedImageItem;
    }> = [];
    for (const vid of orderedViews) {
      if (vid === sourceViewId) {
        list.push({
          vid,
          label: getMultiViewSpec(vid).label,
          slug: getMultiViewSpec(vid).slug,
          isSource: true,
          item: sourceItem,
        });
      } else if (viewStates[vid]?.status === 'done' && viewStates[vid].item) {
        list.push({
          vid,
          label: getMultiViewSpec(vid).label,
          slug: getMultiViewSpec(vid).slug,
          isSource: false,
          item: viewStates[vid].item!,
        });
      }
    }
    return list;
  }, [orderedViews, sourceViewId, viewStates, sourceItem]);

  const handleExportZip = async () => {
    if (completedExportList.length === 0 || isExportingZip) return;
    setIsExportingZip(true);
    try {
      const productSlug = slugifyProduct(session.productName);
      const count = await downloadSelectedAsZip(
        completedExportList.map((entry) => ({
          dataUrl: entry.item.dataUrl,
          mediaType: entry.item.mediaType,
          filenameBase: `${productSlug}_${entry.slug}`,
        })),
        `${productSlug}_multiview-set.zip`
      );
      toast.success(`Exported ${count} views as ZIP`);
    } catch {
      toast.error('Failed to create ZIP archive');
    } finally {
      setIsExportingZip(false);
    }
  };

  const handleExportContactSheet = async () => {
    if (completedExportList.length === 0 || isExportingSheet) return;
    setIsExportingSheet(true);
    try {
      await downloadMultiViewContactSheet(
        completedExportList.map((e) => ({
          label: e.label,
          isSource: e.isSource,
          dataUrl: e.item.dataUrl,
        })),
        {
          productName: session.productName || 'Product',
          showLabels: showContactLabels,
        }
      );
      toast.success('Downloaded Contact Sheet PNG');
    } catch {
      toast.error('Failed to render Contact Sheet PNG');
    } finally {
      setIsExportingSheet(false);
    }
  };

  // Turntable 8 interactive scrubber frames (available when >= 4 horizontal orbit completed frames)
  const turntableFrames = useMemo(
    () =>
      completedExportList.filter((e) => getMultiViewSpec(e.vid).isTurnable),
    [completedExportList]
  );
  const showTurntableScrubber =
    turntableFrames.length >= 4 &&
    (activePresetMatch?.id === 'turntable-8' || turntableFrames.length >= 6);
  const safeTurntableIdx =
    turntableFrames.length > 0 ? turntableIndex % turntableFrames.length : 0;
  const activeTurntableFrame = turntableFrames[safeTurntableIdx];

  const handleSidePhotoUpload = async (
    vid: MultiViewId,
    file: File | undefined
  ) => {
    if (!file) return;
    try {
      const reader = new FileReader();
      const rawUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Read error'));
        reader.readAsDataURL(file);
      });
      const compressed = await compressHiddenSidePhoto(rawUrl);
      setHiddenSidesPhotos((prev) => ({ ...prev, [vid]: compressed }));
      toast.success(`Loaded photo for ${getMultiViewSpec(vid).label}`);
    } catch {
      toast.error('Failed to load side reference photo');
    }
  };

  const toggleViewSelection = (vid: MultiViewId) => {
    if (vid === sourceViewId) return; // Source view is always included
    setSelectedViewIds((prev) => {
      if (prev.includes(vid)) {
        return prev.filter((v) => v !== vid);
      }
      return sortViewsCanonical([...prev, vid]);
    });
  };

  const applyPreset = (presetId: 'standard-4' | 'marketplace-6' | 'turntable-8') => {
    const found = MULTIVIEW_PRESETS.find((p) => p.id === presetId);
    if (!found) return;
    setSelectedViewIds(sortViewsCanonical([...found.views]));
  };

  const handleSourceViewChange = (nextSource: MultiViewId) => {
    const prevSource = sourceViewId;
    setSourceViewId(nextSource);
    setSelectedViewIds((prev) =>
      sortViewsCanonical(
        Array.from(new Set(prev.includes(nextSource) ? prev : [nextSource, ...prev]))
      )
    );
    setViewStates((prev) => {
      const copy = { ...prev };
      const existingSrc = copy[prevSource]?.item;
      if (existingSrc?.isSourceView) {
        delete copy[prevSource];
      }
      copy[nextSource] = {
        status: 'done',
        item: {
          ...(existingSrc ?? session.anchorImage),
          id: existingSrc?.id ?? `${session.anchorImage.id}-src`,
          viewId: nextSource,
          viewLabel: getMultiViewSpec(nextSource).label,
          isSourceView: true,
          approved: true,
        },
      };
      return copy;
    });
  };

  const doneViewsCount = viewsToGenerate.filter(
    (v) => viewStates[v]?.status === 'done'
  ).length;
  const activeGeneratingCount = viewsToGenerate.filter(
    (v) => viewStates[v]?.status === 'generating'
  ).length;

  return (
    <StudioModal
      open={open}
      onOpenChange={onOpenChange}
      title="Multi-view set"
      className="max-w-6xl max-h-[92vh] overflow-hidden p-0 flex flex-col"
    >
      {/* Modal Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--card)] px-5 py-3.5 pr-14">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-[8px] border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)]">
            <Layers className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-[16px] font-semibold tracking-[-0.02em] text-[var(--foreground)]">
              Multi-view set
            </h2>
            <p className="text-[12px] text-[var(--muted-foreground)]">
              Generate consistent camera angles around a fixed upright product ({session.productName || 'Product'})
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {activeModel ? (
            <span className="rounded-[6px] border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 font-mono text-[11px] text-[var(--muted-foreground)]">
              Max refs: <span className="text-[var(--foreground)] font-medium">{activeModel.maxReferences}</span>
            </span>
          ) : null}
          {activeModel && activeModel.tier === 'paid' && viewsToGenerate.length > 0 ? (
            <span className="rounded-[6px] border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 font-mono text-[11px] tabular-nums text-[var(--foreground)]">
              Est: {batchEstimate.label} ({viewsToGenerate.length} views)
            </span>
          ) : null}
        </div>
      </div>

      {/* Mandatory Honesty Warning */}
      <div className="flex items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-5 py-2 text-[12px] text-amber-500">
        <ShieldAlert className="h-4 w-4 shrink-0" />
        <span>
          Hidden sides are inferred by AI. For real products, upload a real photo of the back or sides.
        </span>
      </div>

      {/* Main Split Workspace */}
      <div className="grid flex-1 min-h-0 grid-cols-1 lg:grid-cols-[360px_1fr] overflow-hidden">
        {/* Left Setup Column */}
        <aside className="studio-scrollbar overflow-y-auto border-b lg:border-b-0 lg:border-r border-[var(--border)] bg-[var(--card)] p-4 sm:p-5 space-y-4">
          {/* Anchor Preview + Source View Selector */}
          <div className="space-y-2.5">
            <div className="flex items-center gap-3 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={session.anchorImage.dataUrl}
                alt="Anchor reference"
                className="h-14 w-14 shrink-0 rounded-[6px] border border-[var(--border)] bg-[#FFFFFF] object-contain"
              />
              <div className="min-w-0 flex-1">
                <div className="text-[12px] font-medium text-[var(--foreground)]">
                  Anchor reference (kept as-is)
                </div>
                <div className="mt-0.5 text-[11px] text-[var(--muted-foreground)]">
                  Included untouched as <span className="text-[var(--foreground)] font-medium">{getMultiViewSpec(sourceViewId).label}</span>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>This image shows:</Label>
              <div className="flex flex-wrap gap-1.5">
                {SOURCE_VIEW_OPTIONS.map((vid) => {
                  const active = sourceViewId === vid;
                  return (
                    <button
                      key={vid}
                      type="button"
                      disabled={isRunningBatch}
                      onClick={() => handleSourceViewChange(vid)}
                      className={cn(
                        'h-7 rounded-[6px] border px-2 text-[11px] font-medium transition-colors cursor-pointer disabled:opacity-50',
                        active
                          ? 'border-[var(--foreground)] bg-[var(--foreground)] text-[var(--background)]'
                          : 'border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)] hover:border-[var(--border-hover)] hover:text-[var(--foreground)]'
                      )}
                    >
                      {getMultiViewSpec(vid).label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* View Picker Presets + Multi-select Chips */}
          <div className="space-y-2 border-t border-[var(--border)] pt-3.5">
            <div className="flex items-center justify-between gap-2">
              <Label>Views ({orderedViews.length} total · {viewsToGenerate.length} to generate)</Label>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              {MULTIVIEW_PRESETS.map((preset) => {
                const isActive = activePresetMatch?.id === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    disabled={isRunningBatch}
                    onClick={() => applyPreset(preset.id)}
                    className={cn(
                      'h-8 rounded-[6px] border px-2 text-[11px] font-medium transition-colors cursor-pointer disabled:opacity-50',
                      isActive
                        ? 'border-[var(--foreground)] bg-[var(--foreground)] text-[var(--background)]'
                        : 'border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] hover:border-[var(--border-hover)]'
                    )}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {ALL_MULTIVIEW_SPECS.map((spec) => {
                const isSource = spec.id === sourceViewId;
                const isSelected = orderedViews.includes(spec.id);
                return (
                  <button
                    key={spec.id}
                    type="button"
                    disabled={isSource || isRunningBatch}
                    title={isSource ? 'Source anchor view is always included' : undefined}
                    onClick={() => toggleViewSelection(spec.id)}
                    className={cn(
                      'inline-flex h-7 items-center gap-1 rounded-[6px] border px-2 text-[11px] transition-colors cursor-pointer disabled:cursor-default',
                      isSource
                        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500 font-medium'
                        : isSelected
                          ? 'border-[var(--foreground)] bg-[var(--surface)] text-[var(--foreground)] font-medium'
                          : 'border-[var(--border)] bg-transparent text-[var(--muted-foreground)] hover:border-[var(--border-hover)] hover:text-[var(--foreground)]'
                    )}
                  >
                    <span>{spec.label}</span>
                    {isSource ? (
                      <span className="font-mono text-[9px] uppercase">Source</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Collapsible Hidden Sides Section */}
          <div className="rounded-[10px] border border-[var(--border)] bg-[var(--surface)]/70">
            <button
              type="button"
              onClick={() => setHiddenSidesExpanded((prev) => !prev)}
              aria-expanded={hiddenSidesExpanded}
              className="flex w-full items-center justify-between px-3 py-2.5 text-left text-[12px] font-medium text-[var(--foreground)] cursor-pointer"
            >
              <span>Hidden sides ({viewsToGenerate.length})</span>
              {hiddenSidesExpanded ? (
                <ChevronDown className="h-4 w-4 text-[var(--muted-foreground)]" />
              ) : (
                <ChevronRight className="h-4 w-4 text-[var(--muted-foreground)]" />
              )}
            </button>

            {hiddenSidesExpanded ? (
              <div className="space-y-3 border-t border-[var(--border)] p-3">
                {viewsToGenerate.length === 0 ? (
                  <p className="text-[11px] text-[var(--muted-foreground)]">
                    Select non-source views above to describe hidden sides or attach real photos.
                  </p>
                ) : (
                  viewsToGenerate.map((vid) => {
                    const spec = getMultiViewSpec(vid);
                    const hasPhoto = Boolean(hiddenSidesPhotos[vid]);
                    return (
                      <div
                        key={vid}
                        className="space-y-1.5 rounded-[8px] border border-[var(--border)] bg-[var(--card)] p-2.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-semibold text-[var(--foreground)]">
                            {spec.label}
                          </span>
                          <div className="flex items-center gap-1.5">
                            {hasPhoto ? (
                              <>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={hiddenSidesPhotos[vid]}
                                  alt={`${spec.label} photo`}
                                  className="h-6 w-6 rounded-[4px] border border-[var(--border)] object-cover"
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    setHiddenSidesPhotos((prev) => {
                                      const next = { ...prev };
                                      delete next[vid];
                                      return next;
                                    })
                                  }
                                  title="Remove side photo"
                                  className="text-[11px] text-red-500 hover:underline cursor-pointer"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </>
                            ) : (
                              <label
                                title={
                                  !supportsMultiRef
                                    ? `${activeModel?.name ?? 'This model'} only supports 1 reference image (used by the anchor)`
                                    : 'Upload a real photo of this side'
                                }
                                className={cn(
                                  'inline-flex h-6 items-center gap-1 rounded-[5px] border border-[var(--border)] bg-[var(--surface)] px-2 text-[10px] font-medium transition-colors',
                                  supportsMultiRef
                                    ? 'text-[var(--foreground)] hover:border-[var(--border-hover)] cursor-pointer'
                                    : 'opacity-45 cursor-not-allowed text-[var(--muted-foreground)]'
                                )}
                              >
                                <Upload className="h-2.5 w-2.5" />
                                <span>Real photo of this side</span>
                                <input
                                  type="file"
                                  accept="image/*"
                                  disabled={!supportsMultiRef || isRunningBatch}
                                  className="sr-only"
                                  onChange={(e) => {
                                    void handleSidePhotoUpload(vid, e.target.files?.[0]);
                                    e.target.value = '';
                                  }}
                                />
                              </label>
                            )}
                          </div>
                        </div>
                        <Input
                          value={hiddenSidesNotes[vid] ?? ''}
                          disabled={isRunningBatch}
                          onChange={(e) =>
                            setHiddenSidesNotes((prev) => ({
                              ...prev,
                              [vid]: e.target.value,
                            }))
                          }
                          placeholder="What is on this side? (e.g. plain matte back, barcode sticker)"
                          className="h-7 text-[11px]"
                        />
                      </div>
                    );
                  })
                )}
              </div>
            ) : null}
          </div>

          {/* Model & Options */}
          <div className="space-y-3 border-t border-[var(--border)] pt-3.5">
            <div className="space-y-1">
              <Label htmlFor="mv-model-select">Reference-capable model</Label>
              <Select
                value={activeModel?.id ?? ''}
                disabled={isRunningBatch || refCapableModels.length === 0}
                onValueChange={(nextId) => {
                  setSelectedModelId(nextId);
                  onSwitchModel(nextId);
                }}
              >
                <SelectTrigger id="mv-model-select" className="h-8 text-[12px]">
                  <SelectValue placeholder="Select model" />
                </SelectTrigger>
                <SelectContent>
                  {refCapableModels.map((m) => {
                    const notAllowed = m.allowed === false;
                    return (
                      <SelectItem
                        key={m.id}
                        value={m.id}
                        disabled={notAllowed}
                        className={notAllowed ? 'opacity-45' : undefined}
                      >
                        {m.name} ({formatModelPrice(m, costStats[m.id])} · max {m.maxReferences} refs
                        {notAllowed ? ' · Not enabled on this server' : ''})
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <Label htmlFor="mv-shot-style">Shot style</Label>
                <Select
                  value={shotStyleId}
                  disabled={isRunningBatch}
                  onValueChange={(v) => setShotStyleId(v as ShotPresetId)}
                >
                  <SelectTrigger id="mv-shot-style" className="h-8 text-[12px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SHOT_PRESETS.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="mv-aspect-ratio">Aspect ratio</Label>
                <Select
                  value={effectiveAspectRatio}
                  disabled={isRunningBatch}
                  onValueChange={(v) => setAspectRatio(v as AspectRatio)}
                >
                  <SelectTrigger id="mv-aspect-ratio" className="h-8 text-[12px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ASPECT_RATIOS.filter(
                      (ar) =>
                        !activeModel?.supportedAspectRatios?.length ||
                        activeModel.supportedAspectRatios.includes(ar.value)
                    ).map((ar) => (
                      <SelectItem key={ar.value} value={ar.value}>
                        {ar.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] text-[var(--muted-foreground)] font-mono">
              <span>Resolution: {supportsResolution1K ? '1K' : 'Model default'}</span>
              <span>Max refs: {maxRefs}</span>
            </div>

            {supportsSeed ? (
              <div className="flex items-center justify-between rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
                <div>
                  <div className="text-[12px] font-medium text-[var(--foreground)]">
                    Use same seed for all views
                  </div>
                  <div className="text-[10px] text-[var(--muted-foreground)]">
                    Helps preserve surface &amp; lighting mood
                  </div>
                </div>
                <Switch
                  checked={useSameSeed}
                  disabled={isRunningBatch}
                  onCheckedChange={setUseSameSeed}
                />
              </div>
            ) : null}

            <div
              title={
                !supportsMultiRef
                  ? `${activeModel?.name ?? 'This model'} only supports 1 reference image. Switch to a 2+ reference model to enable Consistency boost.`
                  : 'Wave 1 renders a 3/4 anchor view first, then passes nearest completed views as extra references.'
              }
              className={cn(
                'flex items-center justify-between rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2',
                !supportsMultiRef && 'opacity-60'
              )}
            >
              <div>
                <div className="text-[12px] font-medium text-[var(--foreground)]">
                  Consistency boost
                </div>
                <div className="text-[10px] text-[var(--muted-foreground)]">
                  {supportsMultiRef
                    ? '2-wave generation using 3/4 view + nearest angles'
                    : `Requires 2+ refs (model max: ${maxRefs})`}
                </div>
              </div>
              <Switch
                checked={effectiveConsistencyBoost}
                disabled={!supportsMultiRef || isRunningBatch}
                onCheckedChange={setConsistencyBoost}
              />
            </div>
          </div>

          {/* Primary Generate Set Button */}
          <div className="space-y-2 border-t border-[var(--border)] pt-3">
            <Button
              type="button"
              size="lg"
              disabled={isRunningBatch || viewsToGenerate.length === 0 || !activeModel}
              onClick={handleStartBatchClick}
              className="w-full justify-between"
            >
              <span className="flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                <span>
                  {isRunningBatch
                    ? `Generating (${doneViewsCount}/${viewsToGenerate.length})...`
                    : `Generate ${viewsToGenerate.length} views`}
                </span>
              </span>
              {activeModel?.tier === 'paid' && viewsToGenerate.length > 0 ? (
                <span className="font-mono text-[11px] opacity-80">
                  {batchEstimate.label}
                </span>
              ) : null}
            </Button>
            {activeModel?.tier === 'paid' && batchEstimate.perImageNote ? (
              <p className="font-mono text-[10px] text-[var(--muted-foreground)]">
                {batchEstimate.perImageNote}
              </p>
            ) : null}
          </div>
        </aside>

        {/* Right Results Stage */}
        <section className="studio-scrollbar flex-1 overflow-y-auto bg-[var(--surface)]/40 p-4 sm:p-5 space-y-4">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-[10px] border border-[var(--border)] bg-[var(--card)] px-3.5 py-2.5">
            <div className="flex items-center gap-2.5 text-[12px]">
              {isRunningBatch ? (
                <span className="font-mono text-[var(--foreground)]">
                  Generating {doneViewsCount}/{viewsToGenerate.length}
                  {activeGeneratingCount > 0 ? ` · ${activeGeneratingCount} active` : ''}
                </span>
              ) : (
                <span className="font-medium text-[var(--foreground)]">
                  {completedExportList.length} of {orderedViews.length} views ready
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={isRunningBatch || isAligningSet || completedExportList.length < 2}
                onClick={() => void handleAlignSet()}
              >
                <Crop className="h-3.5 w-3.5" />
                <span>{isAligningSet ? 'Aligning...' : 'Align set'}</span>
              </Button>

              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={isRunningBatch || isExportingZip || completedExportList.length === 0}
                onClick={() => void handleExportZip()}
              >
                <FileArchive className="h-3.5 w-3.5" />
                <span>{isExportingZip ? 'Zipping...' : 'Export ZIP'}</span>
              </Button>

              <div className="flex items-center gap-1.5 rounded-[6px] border border-[var(--border)] bg-[var(--surface)] px-2 py-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={isRunningBatch || isExportingSheet || completedExportList.length === 0}
                  onClick={() => void handleExportContactSheet()}
                  className="h-6 px-1.5 text-[11px]"
                >
                  <Grid2x2 className="h-3.5 w-3.5" />
                  <span>{isExportingSheet ? 'Rendering...' : 'Contact Sheet PNG'}</span>
                </Button>
                <label className="flex items-center gap-1 border-l border-[var(--border)] pl-2 text-[10px] text-[var(--muted-foreground)] cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={showContactLabels}
                    onChange={(e) => setShowContactLabels(e.target.checked)}
                    className="accent-[var(--foreground)]"
                  />
                  <span>Labels</span>
                </label>
              </div>
            </div>
          </div>

          {/* Interactive Turntable 8 Frame Scrubber */}
          {showTurntableScrubber && activeTurntableFrame ? (
            <div className="rounded-[12px] border border-[var(--border)] bg-[var(--card)] p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <RotateCw className="h-4 w-4 text-[var(--foreground)]" />
                  <span className="text-[13px] font-semibold text-[var(--foreground)]">
                    Turntable Preview · {activeTurntableFrame.label}
                  </span>
                </div>
                <span className="rounded-[5px] border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-500">
                  Approximate: 8 AI-generated frames, not a true 360
                </span>
              </div>

              <div
                onPointerDown={(e) => {
                  dragStartXRef.current = e.clientX;
                }}
                onPointerMove={(e) => {
                  if (dragStartXRef.current === null) return;
                  const delta = e.clientX - dragStartXRef.current;
                  if (Math.abs(delta) >= 28) {
                    const step = delta > 0 ? 1 : -1;
                    setTurntableIndex(
                      (prev) =>
                        (prev + step + turntableFrames.length) % turntableFrames.length
                    );
                    dragStartXRef.current = e.clientX;
                  }
                }}
                onPointerUp={() => {
                  dragStartXRef.current = null;
                }}
                onPointerLeave={() => {
                  dragStartXRef.current = null;
                }}
                className="relative mx-auto flex h-64 max-w-md cursor-ew-resize select-none items-center justify-center rounded-[10px] border border-[var(--border)] bg-[#FFFFFF] p-3"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={activeTurntableFrame.item.dataUrl}
                  alt={activeTurntableFrame.label}
                  draggable={false}
                  className="max-h-full w-auto object-contain"
                />
                <span className="pointer-events-none absolute bottom-2 right-2 rounded-[5px] bg-black/70 px-2 py-0.5 font-mono text-[10px] text-white">
                  Drag to rotate · {safeTurntableIdx + 1}/{turntableFrames.length}
                </span>
              </div>

              <input
                type="range"
                min={0}
                max={turntableFrames.length - 1}
                value={safeTurntableIdx}
                onChange={(e) => setTurntableIndex(Number(e.target.value))}
                aria-label="Turntable frame scrubber"
                className="w-full accent-[var(--foreground)] cursor-pointer"
              />
            </div>
          ) : null}

          {/* View Grid */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {orderedViews.map((vid) => {
              const spec = getMultiViewSpec(vid);
              const isSource = vid === sourceViewId;
              const slot = isSource
                ? { status: 'done' as const, item: sourceItem }
                : viewStates[vid] ?? { status: 'idle' as const };
              const item = slot.item;
              const isExtraRef = extraRefViewIds.includes(vid);

              return (
                <article
                  key={vid}
                  className="flex flex-col overflow-hidden rounded-[12px] border border-[var(--border)] bg-[var(--card)]"
                >
                  {/* Header Row */}
                  <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2">
                    <div className="flex items-center gap-2">
                      {item?.approved ? (
                        <span
                          title="Approved"
                          className="h-2.5 w-2.5 rounded-full bg-emerald-500 shrink-0"
                        />
                      ) : null}
                      <span className="text-[12px] font-semibold text-[var(--foreground)]">
                        {spec.label}
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      {isSource ? (
                        <span className="rounded-[4px] border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-emerald-500">
                          Source
                        </span>
                      ) : null}
                      {isExtraRef ? (
                        <span className="rounded-[4px] border border-[#0070f3]/40 bg-[#0070f3]/10 px-1.5 py-0.5 font-mono text-[10px] text-[#0070f3]">
                          Extra ref
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {/* Image Viewport */}
                  <div className="relative aspect-square w-full border-b border-[var(--border)] bg-[var(--surface)]">
                    {slot.status === 'done' && item ? (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={item.dataUrl}
                          alt={`${session.productName} ${spec.label}`}
                          className="h-full w-full object-contain"
                        />
                        {!isSource ? (
                          <button
                            type="button"
                            onClick={() => {
                              const rec = buildRecordSnapshot(viewStates);
                              const idx = rec.images.findIndex((i) => i.id === item.id);
                              onOpenCompareLightbox(
                                rec,
                                idx >= 0 ? idx : 0,
                                session.anchorImage.dataUrl
                              );
                            }}
                            title="Inspect & compare vs Anchor"
                            className="absolute right-2 top-2 inline-flex h-7 items-center gap-1 rounded-[6px] border border-[var(--border)] bg-[var(--card)]/90 px-2 text-[10px] font-medium text-[var(--foreground)] backdrop-blur-sm hover:border-[var(--border-hover)] cursor-pointer"
                          >
                            <Columns2 className="h-3 w-3" />
                            <span>Compare</span>
                          </button>
                        ) : null}
                      </>
                    ) : slot.status === 'generating' ? (
                      <div className="skeleton-shimmer flex h-full w-full flex-col items-center justify-center gap-1.5 px-4 text-center">
                        <span className="font-mono text-[11px] text-[var(--foreground)]">
                          Rendering {spec.shortLabel}...
                        </span>
                      </div>
                    ) : slot.status === 'queued' ? (
                      <div className="flex h-full w-full items-center justify-center px-4 text-center">
                        <span className="font-mono text-[11px] text-[var(--muted-foreground)]">
                          Queued ({spec.shortLabel})
                        </span>
                      </div>
                    ) : slot.status === 'error' ? (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-4 text-center">
                        <AlertTriangle className="h-5 w-5 text-amber-500" />
                        <span className="text-[11px] text-[var(--muted-foreground)] line-clamp-3">
                          {slot.error || 'Failed'}
                        </span>
                      </div>
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-1 px-4 text-center">
                        <span className="font-mono text-[11px] text-[var(--muted-foreground)]">
                          Ready to generate
                        </span>
                        <span className="text-[10px] text-[var(--muted-foreground)]/80">
                          {spec.label}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Badges & Per-View Actions */}
                  <div className="flex flex-1 flex-col gap-2 p-2.5">
                    {/* Consistency + Packshot Checks */}
                    {item && !isSource ? (
                      <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                        {item.consistency?.hasColorDrift ? (
                          <span
                            title={`Dominant foreground color drift score: ${item.consistency.colorDriftScore}/100`}
                            className="inline-flex items-center gap-1 rounded-[5px] border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 font-medium text-amber-500"
                          >
                            Color drift
                          </span>
                        ) : null}
                        {item.consistency?.hasSizeMismatch ? (
                          <span
                            title={`Subject height differs by ${item.consistency.heightRatioDiffPct}% vs anchor`}
                            className="inline-flex items-center gap-1 rounded-[5px] border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 font-medium text-amber-500"
                          >
                            Size mismatch ({item.consistency.heightRatioDiffPct}%)
                          </span>
                        ) : null}
                        {activeShotPreset.isWhiteBackground && item.packshotCheck ? (
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 rounded-[5px] border px-1.5 py-0.5 font-mono',
                              item.packshotCheck.overallPass
                                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500'
                                : 'border-amber-500/30 bg-amber-500/10 text-amber-500'
                            )}
                          >
                            {item.packshotCheck.overallPass
                              ? `Packshot ${item.packshotCheck.frameFillPercent}%`
                              : `White ${item.packshotCheck.borderWhitePercent}% · Fill ${item.packshotCheck.frameFillPercent}%`}
                          </span>
                        ) : null}
                        {item.degraded && item.degraded.length > 0 ? (
                          <span className="rounded-[5px] border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-amber-500">
                            Dropped: {item.degraded.join(', ')}
                          </span>
                        ) : null}
                      </div>
                    ) : null}

                    {/* Inline "Regenerate with note" form */}
                    {correctionOpenView === vid ? (
                      <div className="flex items-center gap-1.5 pt-0.5">
                        <Input
                          value={correctionDraft}
                          onChange={(e) => setCorrectionDraft(e.target.value)}
                          placeholder="e.g. label should be centered"
                          className="h-7 flex-1 text-[11px]"
                        />
                        <Button
                          type="button"
                          size="sm"
                          disabled={isRunningBatch}
                          onClick={() =>
                            handleRegenerateView(vid, correctionDraft.trim() || undefined)
                          }
                          className="h-7 px-2 text-[11px]"
                        >
                          Apply
                        </Button>
                      </div>
                    ) : null}

                    {/* Footer Controls */}
                    <div className="mt-auto flex flex-wrap items-center justify-between gap-1 pt-1 border-t border-[var(--border)]">
                      <div className="flex flex-wrap items-center gap-1">
                        {!isSource ? (
                          <>
                            <button
                              type="button"
                              disabled={isRunningBatch || slot.status === 'generating'}
                              onClick={() => handleRegenerateView(vid)}
                              title="Regenerate this view"
                              className="inline-flex h-6 items-center gap-1 rounded-[5px] border border-[var(--border)] bg-[var(--surface)] px-1.5 text-[10px] text-[var(--foreground)] hover:border-[var(--border-hover)] disabled:opacity-40 cursor-pointer"
                            >
                              <RefreshCw className="h-3 w-3" />
                              <span>Regenerate</span>
                            </button>
                            <button
                              type="button"
                              disabled={isRunningBatch || slot.status === 'generating'}
                              onClick={() => {
                                if (correctionOpenView === vid) {
                                  setCorrectionOpenView(null);
                                } else {
                                  setCorrectionOpenView(vid);
                                  setCorrectionDraft(item?.extraNote ?? '');
                                }
                              }}
                              title="Regenerate with correction note"
                              className="inline-flex h-6 items-center gap-1 rounded-[5px] border border-[var(--border)] bg-[var(--surface)] px-1.5 text-[10px] text-[var(--muted-foreground)] hover:border-[var(--border-hover)] hover:text-[var(--foreground)] disabled:opacity-40 cursor-pointer"
                            >
                              <MessageSquarePlus className="h-3 w-3" />
                              <span>With note</span>
                            </button>
                          </>
                        ) : (
                          <span className="font-mono text-[10px] text-[var(--muted-foreground)]">
                            Anchor kept as-is
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        {item && !isSource ? (
                          <button
                            type="button"
                            onClick={() => handleToggleApprove(vid)}
                            title={item.approved ? 'Unapprove' : 'Approve view'}
                            aria-label={item.approved ? 'Unapprove' : 'Approve'}
                            className={cn(
                              'inline-flex h-6 items-center gap-1 rounded-[5px] border px-1.5 text-[10px] cursor-pointer',
                              item.approved
                                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500 font-medium'
                                : 'border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                            )}
                          >
                            <Check className="h-3 w-3" />
                            <span>{item.approved ? 'Approved' : 'Approve'}</span>
                          </button>
                        ) : null}

                        {item && !isSource ? (
                          <button
                            type="button"
                            onClick={() => handleToggleExtraRef(vid)}
                            title={
                              supportsMultiRef
                                ? 'Use as extra reference when regenerating other views'
                                : 'Model supports only 1 reference image'
                            }
                            aria-label="Use as extra reference"
                            className={cn(
                              'inline-flex h-6 w-6 items-center justify-center rounded-[5px] border cursor-pointer',
                              isExtraRef
                                ? 'border-[#0070f3] bg-[#0070f3]/15 text-[#0070f3]'
                                : 'border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                            )}
                          >
                            <ImagePlus className="h-3 w-3" />
                          </button>
                        ) : null}

                        {item ? (
                          <button
                            type="button"
                            onClick={() =>
                              void downloadImageAs(
                                item.dataUrl,
                                `${slugifyProduct(session.productName)}_${spec.slug}`,
                                'png'
                              )
                            }
                            title={`Download ${spec.label} PNG`}
                            aria-label={`Download ${spec.label}`}
                            className="inline-flex h-6 w-6 items-center justify-center rounded-[5px] border border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)] hover:border-[var(--border-hover)] hover:text-[var(--foreground)] cursor-pointer"
                          >
                            <Download className="h-3 w-3" />
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </StudioModal>
  );
}
