'use client';

import React, { useMemo } from 'react';
import {
  Aperture,
  ChevronLeft,
  ChevronRight,
  Eraser,
  Package,
  Play,
  SlidersHorizontal,
} from 'lucide-react';
import {
  detectQualityModeForModel,
  formatPerImageShortPrice,
  formatShortModelName,
  QUALITY_MODE_CONFIGS,
  type AspectRatio,
  type BatchEstimateResult,
  type ModelTier,
  type NormalizedImageModel,
  type QualityModeId,
} from '@/lib/models';
import {
  getCategorySpec,
  getShotPreset,
  type ProductCategoryId,
  type ShotPresetId,
} from '@/lib/presets';
import { describeHexColor, type ProductBrief, type SampleBriefPreset } from '@/lib/prompt-engine';
import type { ModelCostStatsMap, UserPreset } from '@/lib/db';
import type { DiscoveryStatus } from '@/components/model-selector';
import { AccordionStep } from '@/components/panel/accordion-step';
import {
  TemplatesMenu,
  type PresetDraftSnapshot,
} from '@/components/panel/templates-menu';
import { StepProduct } from '@/components/panel/step-product';
import { StepShot } from '@/components/panel/step-shot';
import { StepOutput } from '@/components/panel/step-output';
import { StickyGenerateBar } from '@/components/panel/sticky-generate-bar';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export type AccordionStepNumber = 1 | 2 | 3;

interface LeftControlPanelProps {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  openSteps: Record<AccordionStepNumber, boolean>;
  onToggleStep: (step: AccordionStepNumber) => void;
  onExpandAndOpenStep: (step: AccordionStepNumber) => void;

  // Templates & Clear
  userPresets: UserPreset[];
  activePresetId: string | null;
  presetDraftSnapshot: PresetDraftSnapshot;
  onSavePreset: (name: string, category: string, promptText: string) => void;
  onEditPreset: (
    presetId: string,
    patch: { name: string; category: string; promptText: string }
  ) => void;
  onApplyPreset: (preset: UserPreset) => void;
  onUpdatePreset: (presetId: string) => void;
  onDeletePreset: (presetId: string) => void;
  onClearForm: () => void;

  // Mode Switch
  inputMode: 'text' | 'photo';
  onInputModeChange: (mode: 'text' | 'photo') => void;
  onSwitchToReferenceModelAndPhotoMode: () => void;
  hasAnyReferenceCapableModel: boolean;

  // Step 1: Product
  brief: ProductBrief;
  onBriefChange: (next: ProductBrief) => void;
  categoryManuallyOverridden: boolean;
  onManualCategoryChange: (category: ProductCategoryId) => void;
  onResetCategoryAutoDetect: () => void;
  inputReferences: string[];
  onInputReferencesChange: (refs: string[]) => void;
  onLoadSample: (sample: SampleBriefPreset) => void;

  // Step 2: Shot
  shotId: ShotPresetId;
  onSelectShot: (shotId: ShotPresetId) => void;
  photoShotSetEnabled: boolean;
  onPhotoShotSetChange: (enabled: boolean) => void;
  shotSetPresetIds: ShotPresetId[];
  onShotSetPresetsChange: (next: ShotPresetId[]) => void;
  aspectRatio: AspectRatio;
  ratioOverrideActive: boolean;
  clampedRatioNote: string | null;
  onSelectAspectRatio: (ratio: AspectRatio) => void;

  // Step 3: Output
  models: NormalizedImageModel[];
  tier: ModelTier;
  onTierChange: (tier: ModelTier) => void;
  selectedModel: NormalizedImageModel;
  onSelectModel: (modelId: string) => void;
  onSelectQualityMode: (modeId: QualityModeId, resolvedModel: NormalizedImageModel) => void;
  discoveryStatus: DiscoveryStatus;
  isLoadingModels: boolean;
  onRetryDiscovery: () => void;
  costStats: ModelCostStatsMap;
  variations: number;
  onVariationsChange: (count: number) => void;
  enhanceEnabled: boolean;
  onEnhanceChange: (enabled: boolean) => void;
  enhancerModel: string;
  resolution: string;
  onResolutionChange: (res: string) => void;
  effectiveQuality: string;
  onQualityChange: (quality: string) => void;
  backgroundMode: 'auto' | 'opaque' | 'transparent';
  onBackgroundModeChange: (bg: 'auto' | 'opaque' | 'transparent') => void;
  outputFormat: 'auto' | 'png' | 'webp' | 'jpeg' | 'svg';
  onOutputFormatChange: (fmt: 'auto' | 'png' | 'webp' | 'jpeg' | 'svg') => void;
  customSeed: string;
  onCustomSeedChange: (seed: string) => void;

  // Sticky Generate Bar
  isGenerating: boolean;
  doneCount: number;
  pendingSlots: number;
  elapsedMs: number;
  batchEstimate: BatchEstimateResult;
  spendLimitNotice: string | null;
  promptEditedManually: boolean;
  showPromptInspector: boolean;
  showSlowModelHint: boolean;
  onGenerate: () => void;
  onOpenPromptDrawer: () => void;
  onGoToSettings: () => void;
}

export function LeftControlPanel({
  collapsed,
  onToggleCollapsed,
  openSteps,
  onToggleStep,
  onExpandAndOpenStep,
  userPresets,
  activePresetId,
  presetDraftSnapshot,
  onSavePreset,
  onEditPreset,
  onApplyPreset,
  onUpdatePreset,
  onDeletePreset,
  onClearForm,
  inputMode,
  onInputModeChange,
  onSwitchToReferenceModelAndPhotoMode,
  hasAnyReferenceCapableModel,
  brief,
  onBriefChange,
  categoryManuallyOverridden,
  onManualCategoryChange,
  onResetCategoryAutoDetect,
  inputReferences,
  onInputReferencesChange,
  onLoadSample,
  shotId,
  onSelectShot,
  photoShotSetEnabled,
  onPhotoShotSetChange,
  shotSetPresetIds,
  onShotSetPresetsChange,
  aspectRatio,
  ratioOverrideActive,
  clampedRatioNote,
  onSelectAspectRatio,
  models,
  tier,
  onTierChange,
  selectedModel,
  onSelectModel,
  onSelectQualityMode,
  discoveryStatus,
  isLoadingModels,
  onRetryDiscovery,
  costStats,
  variations,
  onVariationsChange,
  enhanceEnabled,
  onEnhanceChange,
  enhancerModel,
  resolution,
  onResolutionChange,
  effectiveQuality,
  onQualityChange,
  backgroundMode,
  onBackgroundModeChange,
  outputFormat,
  onOutputFormatChange,
  customSeed,
  onCustomSeedChange,
  isGenerating,
  doneCount,
  pendingSlots,
  elapsedMs,
  batchEstimate,
  spendLimitNotice,
  promptEditedManually,
  showPromptInspector,
  showSlowModelHint,
  onGenerate,
  onOpenPromptDrawer,
  onGoToSettings,
}: LeftControlPanelProps) {
  const isShotSetActive =
    inputMode === 'photo' && photoShotSetEnabled && shotSetPresetIds.length > 0;
  const totalPlannedShots = isShotSetActive
    ? shotSetPresetIds.length * variations
    : variations;

  const selectedShot = useMemo(() => getShotPreset(shotId), [shotId]);

  const maxAllowedRefs =
    selectedModel.supportsReference && selectedModel.maxReferences > 0
      ? Math.min(4, selectedModel.maxReferences)
      : 4;

  // Step validity
  const step1Valid =
    Boolean(brief.name.trim()) &&
    (inputMode === 'text' || inputReferences.length > 0);
  const step2Valid = isShotSetActive ? shotSetPresetIds.length > 0 : Boolean(shotId);
  const step3Valid =
    Boolean(selectedModel?.id) &&
    selectedModel.allowed !== false &&
    (inputMode === 'text' || selectedModel.supportsReference);

  // One-line summaries for collapsed steps
  const step1Summary = useMemo(() => {
    const trimmedName = brief.name.trim();
    if (!trimmedName) {
      if (inputMode === 'photo' && inputReferences.length > 0) {
        return `${inputReferences.length} photo${inputReferences.length > 1 ? 's' : ''}`;
      }
      return 'Describe product to start';
    }

    const parts: string[] = [trimmedName, getCategorySpec(brief.category).label];
    const colorNames = Array.from(
      new Set(
        brief.colors
          .filter((c) => /^#[0-9a-fA-F]{6}$/.test(c.trim()))
          .slice(0, 3)
          .map(describeHexColor)
      )
    );
    if (colorNames.length > 0) {
      parts.push(colorNames.join(', '));
    }

    const fullSummary = parts.join(' · ');
    // Drop category (and extra metadata) when it would truncate in the step header; show product name only
    if (fullSummary.length > 36) {
      return trimmedName;
    }
    return fullSummary;
  }, [brief.name, brief.category, brief.colors, inputMode, inputReferences.length]);

  const step2Summary = useMemo(() => {
    if (isShotSetActive) {
      return `Shot set (${shotSetPresetIds.length} presets) · ${totalPlannedShots} shots`;
    }
    return `${selectedShot.name} · ${aspectRatio}`;
  }, [isShotSetActive, shotSetPresetIds.length, totalPlannedShots, selectedShot.name, aspectRatio]);

  const step3Summary = useMemo(() => {
    const qModeId = detectQualityModeForModel(selectedModel.id, models, inputMode);
    const qLabel = qModeId
      ? QUALITY_MODE_CONFIGS.find((c) => c.id === qModeId)?.label ??
        formatShortModelName(selectedModel)
      : formatShortModelName(selectedModel);
    const priceLabel = formatPerImageShortPrice(
      selectedModel,
      costStats[selectedModel.id]
    );
    return `${qLabel} · ${variations} ${variations === 1 ? 'var' : 'vars'} · ${priceLabel}`;
  }, [selectedModel, models, inputMode, costStats, variations]);

  // Pre-submit block reason for StickyGenerateBar
  const blockReason = useMemo(() => {
    if (!brief.name.trim()) {
      return 'Add a product name';
    }
    if (inputMode === 'photo' && inputReferences.length === 0) {
      return 'Upload a photo for photo mode';
    }
    if ((inputMode === 'photo' || isShotSetActive) && !selectedModel.supportsReference) {
      return 'Current model does not support reference photos';
    }
    if (selectedModel.requiresReference && inputReferences.length === 0) {
      return `${selectedModel.name} requires a reference photo`;
    }
    if (spendLimitNotice) {
      return spendLimitNotice;
    }
    return null;
  }, [
    brief.name,
    inputMode,
    inputReferences.length,
    isShotSetActive,
    selectedModel.supportsReference,
    selectedModel.requiresReference,
    selectedModel.name,
    spendLimitNotice,
  ]);

  const photoModeDisabled = !selectedModel.supportsReference;
  const isWhiteBackgroundPreset = isShotSetActive
    ? shotSetPresetIds.includes('marketplace-packshot')
    : selectedShot.isWhiteBackground;

  // Desktop collapsed icon rail view
  if (collapsed) {
    return (
      <aside
        aria-label="Collapsed studio controls"
        className="hidden lg:flex lg:w-[52px] flex-col items-center justify-between border-r border-[var(--border)] bg-[var(--background)] py-3"
      >
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label="Expand control panel"
            title="Expand control panel"
            className="inline-flex h-8 w-8 items-center justify-center rounded-[6px] border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] hover:border-[var(--border-hover)] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070f3]"
          >
            <ChevronRight className="h-4 w-4" />
          </button>

          <div className="my-1 h-px w-6 bg-[var(--border)]" />

          <button
            type="button"
            onClick={() => onExpandAndOpenStep(1)}
            aria-label="Step 1: Product"
            title={`Step 1: Product (${step1Summary})`}
            className={cn(
              'relative inline-flex h-8 w-8 items-center justify-center rounded-[6px] border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070f3]',
              openSteps[1]
                ? 'border-[var(--foreground)] bg-[var(--surface)] text-[var(--foreground)]'
                : 'border-[var(--border)] bg-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
            )}
          >
            <Package className="h-4 w-4" />
            {step1Valid ? (
              <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-emerald-500" />
            ) : null}
          </button>

          <button
            type="button"
            onClick={() => onExpandAndOpenStep(2)}
            aria-label="Step 2: Shot"
            title={`Step 2: Shot (${step2Summary})`}
            className={cn(
              'relative inline-flex h-8 w-8 items-center justify-center rounded-[6px] border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070f3]',
              openSteps[2]
                ? 'border-[var(--foreground)] bg-[var(--surface)] text-[var(--foreground)]'
                : 'border-[var(--border)] bg-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
            )}
          >
            <Aperture className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => onExpandAndOpenStep(3)}
            aria-label="Step 3: Output"
            title={`Step 3: Output (${step3Summary})`}
            className={cn(
              'relative inline-flex h-8 w-8 items-center justify-center rounded-[6px] border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070f3]',
              openSteps[3]
                ? 'border-[var(--foreground)] bg-[var(--surface)] text-[var(--foreground)]'
                : 'border-[var(--border)] bg-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
            )}
          >
            <SlidersHorizontal className="h-4 w-4" />
          </button>
        </div>

        <button
          type="button"
          disabled={isGenerating || Boolean(blockReason)}
          onClick={onGenerate}
          aria-label="Generate shots"
          title={blockReason ? blockReason : `Generate ${totalPlannedShots} shots`}
          className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-[var(--foreground)] bg-[var(--foreground)] text-[var(--background)] hover:opacity-90 disabled:opacity-40 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070f3]"
        >
          <Play className="h-4 w-4 fill-current" />
        </button>
      </aside>
    );
  }

  return (
    <aside
      aria-label="Studio brief and generation controls"
      className="flex flex-col border-b lg:border-b-0 lg:border-r border-[var(--border)] bg-[var(--background)] lg:w-[400px] lg:h-[calc(100vh-56px)]"
    >
      {/* Top Panel Header: TemplatesMenu + Clear form + Collapse chevron */}
      <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-3.5 py-2.5 shrink-0">
        <TemplatesMenu
          presets={userPresets}
          activePresetId={activePresetId}
          models={models}
          costStats={costStats}
          currentSnapshot={presetDraftSnapshot}
          onSavePreset={onSavePreset}
          onEditPreset={onEditPreset}
          onApplyPreset={onApplyPreset}
          onUpdatePreset={onUpdatePreset}
          onDeletePreset={onDeletePreset}
        />

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onClearForm}
            aria-label="Clear form"
            title="Clear form"
            className="inline-flex h-8 w-8 items-center justify-center rounded-[6px] border border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)] hover:border-[var(--border-hover)] hover:text-[var(--foreground)] cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070f3]"
          >
            <Eraser className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label="Collapse control panel"
            title="Collapse control panel"
            className="hidden lg:inline-flex h-8 w-8 items-center justify-center rounded-[6px] border border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)] hover:border-[var(--border-hover)] hover:text-[var(--foreground)] cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070f3]"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Scrollable Body: Mode Switch + Three Accordion Steps */}
      <div className="studio-scrollbar flex-1 overflow-y-auto px-3.5 py-3.5 space-y-3">
        {/* Top Mode Switch: "From text | From photo" */}
        <div className="space-y-1.5">
          <div
            role="tablist"
            aria-label="Generation mode"
            className="grid grid-cols-2 gap-1.5 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-1"
          >
            <button
              type="button"
              role="tab"
              aria-selected={inputMode === 'text'}
              onClick={() => onInputModeChange('text')}
              className={cn(
                'flex flex-col items-start rounded-[7px] px-2.5 py-2 text-left transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070f3]',
                inputMode === 'text'
                  ? 'bg-[var(--foreground)] text-[var(--background)]'
                  : 'text-[var(--foreground)] hover:bg-[var(--card)]'
              )}
            >
              <span className="text-[12px] font-semibold leading-tight">
                From text
              </span>
              <span
                className={cn(
                  'mt-0.5 text-[10px] leading-tight',
                  inputMode === 'text'
                    ? 'opacity-80'
                    : 'text-[var(--muted-foreground)]'
                )}
              >
                Describe a product
              </span>
            </button>

            {photoModeDisabled ? (
              <TooltipProvider delayDuration={150}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      className="flex cursor-not-allowed"
                      title={
                        hasAnyReferenceCapableModel
                          ? `${selectedModel.name} has no reference support. Switch to a model that does.`
                          : `${selectedModel.name} has no reference support.`
                      }
                    >
                      <button
                        type="button"
                        role="tab"
                        aria-selected={inputMode === 'photo'}
                        disabled={true}
                        className="pointer-events-none flex w-full flex-col items-start rounded-[7px] px-2.5 py-2 text-left text-[var(--muted-foreground)] opacity-45"
                      >
                        <span className="text-[12px] font-semibold leading-tight">
                          From photo
                        </span>
                        <span className="mt-0.5 text-[10px] leading-tight text-[var(--muted-foreground)]">
                          Upload your product photo
                        </span>
                      </button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="space-y-1.5 text-[11px]">
                    <p className="text-[var(--muted-foreground)]">
                      {selectedModel.name} has no reference support
                    </p>
                    {hasAnyReferenceCapableModel ? (
                      <button
                        type="button"
                        onClick={onSwitchToReferenceModelAndPhotoMode}
                        className="font-medium text-[#0070f3] hover:underline cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070f3] rounded-[3px]"
                      >
                        Switch to a model that does
                      </button>
                    ) : null}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              <button
                type="button"
                role="tab"
                aria-selected={inputMode === 'photo'}
                onClick={() => onInputModeChange('photo')}
                className={cn(
                  'flex flex-col items-start rounded-[7px] px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070f3]',
                  inputMode === 'photo'
                    ? 'bg-[var(--foreground)] text-[var(--background)] cursor-pointer'
                    : 'text-[var(--foreground)] hover:bg-[var(--card)] cursor-pointer'
                )}
              >
                <span className="text-[12px] font-semibold leading-tight">
                  From photo
                </span>
                <span
                  className={cn(
                    'mt-0.5 text-[10px] leading-tight',
                    inputMode === 'photo'
                      ? 'opacity-80'
                      : 'text-[var(--muted-foreground)]'
                  )}
                >
                  Upload your product photo
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Step 1: Product */}
        <AccordionStep
          stepNumber={1}
          title="Product"
          summary={step1Summary}
          isValid={step1Valid}
          open={openSteps[1]}
          onToggle={() => onToggleStep(1)}
        >
          <StepProduct
            brief={brief}
            onChange={onBriefChange}
            categoryManuallyOverridden={categoryManuallyOverridden}
            onManualCategoryChange={onManualCategoryChange}
            onResetCategoryAutoDetect={onResetCategoryAutoDetect}
            inputMode={inputMode}
            inputReferences={inputReferences}
            onInputReferencesChange={onInputReferencesChange}
            maxAllowedRefs={maxAllowedRefs}
            selectedModelSupportsRef={selectedModel.supportsReference}
            isWhiteBackgroundPreset={isWhiteBackgroundPreset}
            variations={variations}
            onLoadSample={onLoadSample}
          />
        </AccordionStep>

        {/* Step 2: Shot */}
        <AccordionStep
          stepNumber={2}
          title="Shot"
          summary={step2Summary}
          isValid={step2Valid}
          open={openSteps[2]}
          onToggle={() => onToggleStep(2)}
        >
          <StepShot
            shotId={shotId}
            onSelectShot={onSelectShot}
            inputMode={inputMode}
            photoShotSetEnabled={photoShotSetEnabled}
            onPhotoShotSetChange={onPhotoShotSetChange}
            shotSetPresetIds={shotSetPresetIds}
            onShotSetPresetsChange={onShotSetPresetsChange}
            variations={variations}
            aspectRatio={aspectRatio}
            ratioOverrideActive={ratioOverrideActive}
            supportedAspectRatios={selectedModel.supportedAspectRatios}
            supportsAspectRatioParam={selectedModel.supportedParams.includes('aspect_ratio')}
            clampedRatioNote={clampedRatioNote}
            onSelectAspectRatio={onSelectAspectRatio}
          />
        </AccordionStep>

        {/* Step 3: Output */}
        <AccordionStep
          stepNumber={3}
          title="Output"
          summary={step3Summary}
          isValid={step3Valid}
          open={openSteps[3]}
          onToggle={() => onToggleStep(3)}
        >
          <StepOutput
            models={models}
            tier={tier}
            onTierChange={onTierChange}
            selectedModel={selectedModel}
            onSelectModel={onSelectModel}
            onSelectQualityMode={onSelectQualityMode}
            inputMode={inputMode}
            discoveryStatus={discoveryStatus}
            isLoadingModels={isLoadingModels}
            onRetryDiscovery={onRetryDiscovery}
            costStats={costStats}
            variations={variations}
            onVariationsChange={onVariationsChange}
            enhanceEnabled={enhanceEnabled}
            onEnhanceChange={onEnhanceChange}
            enhancerModel={enhancerModel}
            resolution={resolution}
            onResolutionChange={onResolutionChange}
            effectiveQuality={effectiveQuality}
            onQualityChange={onQualityChange}
            backgroundMode={backgroundMode}
            onBackgroundModeChange={onBackgroundModeChange}
            outputFormat={outputFormat}
            onOutputFormatChange={onOutputFormatChange}
            customSeed={customSeed}
            onCustomSeedChange={onCustomSeedChange}
          />
        </AccordionStep>
      </div>

      {/* Bottom Sticky Generate Bar */}
      <StickyGenerateBar
        isGenerating={isGenerating}
        isShotSetActive={isShotSetActive}
        totalPlannedShots={totalPlannedShots}
        variations={variations}
        doneCount={doneCount}
        pendingSlots={pendingSlots}
        elapsedMs={elapsedMs}
        modelName={selectedModel.name}
        modelProviderLabel={selectedModel.providerLabel}
        estimateLabel={batchEstimate.label}
        perImageNote={
          selectedModel.tier === 'paid' ? batchEstimate.perImageNote : null
        }
        blockReason={blockReason}
        promptEditedManually={promptEditedManually}
        showPromptInspector={showPromptInspector}
        showSlowModelHint={showSlowModelHint}
        onGenerate={onGenerate}
        onOpenPromptDrawer={onOpenPromptDrawer}
        onGoToSettings={onGoToSettings}
        isSpendLimitNotice={Boolean(
          spendLimitNotice && blockReason === spendLimitNotice
        )}
      />
    </aside>
  );
}
