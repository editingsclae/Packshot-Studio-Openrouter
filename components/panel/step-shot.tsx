'use client';

import React, { useState } from 'react';
import { Check, Layers, SlidersHorizontal } from 'lucide-react';
import { ASPECT_RATIOS, type AspectRatio } from '@/lib/models';
import {
  getShotPreset,
  SHOT_PRESETS,
  type ShotPresetId,
} from '@/lib/presets';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

const SHOT_SET_PRESET_IDS: readonly ShotPresetId[] = [
  'marketplace-packshot',
  'lifestyle-scene',
  'macro-detail',
  'flat-lay',
  'studio-hero',
];

/**
 * Geometric framing diagrams for shot presets (pure layout/framing diagrams, zero external assets).
 */
function ShotFramingDiagram({
  shotId,
  active,
}: {
  shotId: ShotPresetId;
  active: boolean;
}) {
  const stroke = 'currentColor';
  const fillBg = active ? 'rgba(0, 112, 243, 0.08)' : 'transparent';

  switch (shotId) {
    case 'marketplace-packshot':
      // Isolated centered 85% product fill on pure white with subtle floor shadow
      return (
        <svg viewBox="0 0 64 40" className="h-9 w-14 shrink-0" aria-hidden="true">
          <rect x="1" y="1" width="62" height="38" rx="4" fill={fillBg} stroke={stroke} strokeOpacity="0.22" strokeWidth="1" />
          <rect x="6" y="5" width="52" height="30" rx="2" fill="none" stroke={stroke} strokeOpacity="0.2" strokeDasharray="2 2" strokeWidth="0.9" />
          <ellipse cx="32" cy="31" rx="11" ry="2.2" fill={stroke} fillOpacity="0.16" />
          <rect x="23" y="9" width="18" height="21" rx="3" fill={stroke} fillOpacity="0.14" stroke={stroke} strokeWidth="1.2" />
        </svg>
      );
    case 'lifestyle-scene':
      // Rule of thirds placement beside window light rays & background table plane
      return (
        <svg viewBox="0 0 64 40" className="h-9 w-14 shrink-0" aria-hidden="true">
          <rect x="1" y="1" width="62" height="38" rx="4" fill={fillBg} stroke={stroke} strokeOpacity="0.22" strokeWidth="1" />
          <line x1="2" y1="26" x2="62" y2="26" stroke={stroke} strokeOpacity="0.25" strokeWidth="1" />
          <rect x="40" y="6" width="16" height="16" rx="1.5" fill="none" stroke={stroke} strokeOpacity="0.22" strokeWidth="0.9" />
          <line x1="40" y1="14" x2="56" y2="14" stroke={stroke} strokeOpacity="0.18" strokeWidth="0.8" />
          <rect x="15" y="13" width="13" height="18" rx="2.5" fill={stroke} fillOpacity="0.14" stroke={stroke} strokeWidth="1.2" />
        </svg>
      );
    case 'macro-detail':
      // Tight close-up corner crop showing bevel / weave surface lines
      return (
        <svg viewBox="0 0 64 40" className="h-9 w-14 shrink-0" aria-hidden="true">
          <rect x="1" y="1" width="62" height="38" rx="4" fill={fillBg} stroke={stroke} strokeOpacity="0.22" strokeWidth="1" />
          <circle cx="32" cy="20" r="14" fill="none" stroke={stroke} strokeOpacity="0.3" strokeDasharray="3 2" strokeWidth="1" />
          <path d="M22 36 C22 19, 34 11, 52 11 L52 36 Z" fill={stroke} fillOpacity="0.14" stroke={stroke} strokeWidth="1.2" />
          <line x1="28" y1="22" x2="45" y2="17" stroke={stroke} strokeOpacity="0.45" strokeWidth="0.9" />
          <line x1="28" y1="27" x2="46" y2="22" stroke={stroke} strokeOpacity="0.3" strokeWidth="0.9" />
        </svg>
      );
    case 'flat-lay':
      // 90-degree overhead bird's-eye grid with main silhouette + small corner props
      return (
        <svg viewBox="0 0 64 40" className="h-9 w-14 shrink-0" aria-hidden="true">
          <rect x="1" y="1" width="62" height="38" rx="4" fill={fillBg} stroke={stroke} strokeOpacity="0.22" strokeWidth="1" />
          <circle cx="32" cy="20" r="10.5" fill={stroke} fillOpacity="0.14" stroke={stroke} strokeWidth="1.2" />
          <rect x="9" y="8" width="8" height="12" rx="1.5" fill="none" stroke={stroke} strokeOpacity="0.35" strokeWidth="1" />
          <circle cx="51" cy="29" r="3.5" fill="none" stroke={stroke} strokeOpacity="0.35" strokeWidth="1" />
        </svg>
      );
    case 'packaging-mockup':
      // Orthographic box front + clean label bounding zone
      return (
        <svg viewBox="0 0 64 40" className="h-9 w-14 shrink-0" aria-hidden="true">
          <rect x="1" y="1" width="62" height="38" rx="4" fill={fillBg} stroke={stroke} strokeOpacity="0.22" strokeWidth="1" />
          <rect x="21" y="7" width="22" height="26" rx="1.5" fill={stroke} fillOpacity="0.14" stroke={stroke} strokeWidth="1.2" />
          <rect x="25" y="13" width="14" height="9" rx="1" fill="none" stroke={stroke} strokeOpacity="0.5" strokeWidth="0.9" />
          <line x1="12" y1="33" x2="52" y2="33" stroke={stroke} strokeOpacity="0.25" strokeWidth="1" />
        </svg>
      );
    case 'studio-hero':
    default:
      // Sculptural low-angle hero silhouette with overhead softbox arc & rim highlight
      return (
        <svg viewBox="0 0 64 40" className="h-9 w-14 shrink-0" aria-hidden="true">
          <rect x="1" y="1" width="62" height="38" rx="4" fill={fillBg} stroke={stroke} strokeOpacity="0.22" strokeWidth="1" />
          <path d="M12 10 Q32 4 52 10" fill="none" stroke={stroke} strokeOpacity="0.35" strokeWidth="1" />
          <ellipse cx="32" cy="32" rx="14" ry="2.5" fill={stroke} fillOpacity="0.15" />
          <rect x="24" y="11" width="16" height="20" rx="3" fill={stroke} fillOpacity="0.14" stroke={stroke} strokeWidth="1.2" />
        </svg>
      );
  }
}

interface StepShotProps {
  shotId: ShotPresetId;
  onSelectShot: (shotId: ShotPresetId) => void;
  inputMode: 'text' | 'photo';
  photoShotSetEnabled: boolean;
  onPhotoShotSetChange: (enabled: boolean) => void;
  shotSetPresetIds: ShotPresetId[];
  onShotSetPresetsChange: (next: ShotPresetId[]) => void;
  variations: number;
  aspectRatio: AspectRatio;
  ratioOverrideActive: boolean;
  supportedAspectRatios?: string[];
  supportsAspectRatioParam: boolean;
  clampedRatioNote: string | null;
  onSelectAspectRatio: (ratio: AspectRatio) => void;
}

export function StepShot({
  shotId,
  onSelectShot,
  inputMode,
  photoShotSetEnabled,
  onPhotoShotSetChange,
  shotSetPresetIds,
  onShotSetPresetsChange,
  variations,
  aspectRatio,
  ratioOverrideActive,
  supportedAspectRatios,
  supportsAspectRatioParam,
  clampedRatioNote,
  onSelectAspectRatio,
}: StepShotProps) {
  const [ratioExpanded, setRatioExpanded] = useState(ratioOverrideActive);

  const isShotSetActive =
    inputMode === 'photo' && photoShotSetEnabled && shotSetPresetIds.length > 0;
  const totalPlannedShots = isShotSetActive
    ? shotSetPresetIds.length * variations
    : variations;

  const activePreset = getShotPreset(shotId);

  return (
    <div className="space-y-3">
      {/* Photo mode Shot Set switch */}
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
              Create multiple angles from one photo
            </p>
          </div>
          <Switch
            id="photo-shot-set-switch"
            checked={photoShotSetEnabled}
            onCheckedChange={onPhotoShotSetChange}
          />
        </div>
      ) : null}

      {isShotSetActive ? (
        <div className="space-y-2.5">
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
                    if (shotSetPresetIds.includes(presetId)) {
                      if (shotSetPresetIds.length <= 1) return;
                      onShotSetPresetsChange(
                        shotSetPresetIds.filter((id) => id !== presetId)
                      );
                    } else {
                      onShotSetPresetsChange([...shotSetPresetIds, presetId]);
                    }
                  }}
                  className={cn(
                    'flex flex-col items-start gap-2 rounded-[8px] border p-2.5 text-left transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070f3]',
                    active
                      ? 'border-[var(--foreground)] bg-[var(--surface)]'
                      : 'border-[var(--border)] bg-[var(--background)] hover:border-[var(--border-hover)] opacity-75'
                  )}
                >
                  <span className="flex w-full items-start justify-between gap-1.5">
                    <ShotFramingDiagram shotId={preset.id} active={active} />
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
                  </span>

                  <span className="block w-full space-y-0.5">
                    <span className="flex items-center justify-between gap-1">
                      <span className="truncate text-[12px] font-semibold text-[var(--foreground)]">
                        {preset.name}
                      </span>
                      <span className="shrink-0 font-mono text-[10px] text-[var(--muted-foreground)]">
                        {preset.defaultAspectRatio}
                      </span>
                    </span>
                    <span className="block line-clamp-1 text-[10px] text-[var(--muted-foreground)]">
                      {preset.bestFor}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between text-[11px] text-[var(--muted-foreground)]">
            <span className="font-mono tabular-nums">
              {shotSetPresetIds.length} presets × {variations} var ={' '}
              {totalPlannedShots} shots
            </span>
            <button
              type="button"
              onClick={() => onShotSetPresetsChange([...SHOT_SET_PRESET_IDS])}
              className="text-[11px] font-medium text-[var(--foreground)] hover:underline cursor-pointer"
            >
              Select all 5
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {/* 2-Column Visual Shot Preset Cards */}
          <div className="grid grid-cols-2 gap-2">
            {SHOT_PRESETS.map((preset) => {
              const active = shotId === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onSelectShot(preset.id)}
                  className={cn(
                    'flex flex-col items-start gap-2 rounded-[8px] border p-2.5 text-left transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070f3]',
                    active
                      ? 'border-[var(--foreground)] bg-[var(--surface)]'
                      : 'border-[var(--border)] bg-[var(--background)] hover:border-[var(--border-hover)]'
                  )}
                >
                  <span className="flex w-full items-start justify-between gap-1.5 text-[var(--foreground)]">
                    <ShotFramingDiagram shotId={preset.id} active={active} />
                    <span className="rounded-[4px] border border-[var(--border)] bg-[var(--card)] px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-[var(--muted-foreground)]">
                      {preset.defaultAspectRatio}
                    </span>
                  </span>

                  <span className="block w-full space-y-0.5">
                    <span className="flex items-center justify-between gap-1">
                      <span className="truncate text-[12px] font-semibold text-[var(--foreground)]">
                        {preset.name}
                      </span>
                      {active ? (
                        <Check className="h-3.5 w-3.5 shrink-0 text-[var(--foreground)]" />
                      ) : null}
                    </span>
                    <span className="block line-clamp-1 text-[10px] text-[var(--muted-foreground)]">
                      {preset.bestFor}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          {/* Aspect ratio summary + Custom ratio toggle */}
          {supportsAspectRatioParam ? (
            <div className="space-y-2 border-t border-[var(--border)] pt-2.5">
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="text-[var(--muted-foreground)]">
                  Aspect ratio:{' '}
                  <span className="font-mono font-medium text-[var(--foreground)]">
                    {aspectRatio}
                  </span>{' '}
                  <span className="text-[10px]">
                    ({ratioOverrideActive ? 'custom override' : `from ${activePreset.name}`})
                  </span>
                </span>
                <button
                  type="button"
                  aria-expanded={ratioExpanded}
                  onClick={() => setRatioExpanded((prev) => !prev)}
                  className="inline-flex items-center gap-1 font-medium text-[#0070f3] hover:underline cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070f3] rounded-[3px]"
                >
                  <SlidersHorizontal className="h-3 w-3" />
                  <span>{ratioExpanded ? 'Hide ratios' : 'Custom ratio'}</span>
                </button>
              </div>

              {(ratioExpanded || ratioOverrideActive) ? (
                <div className="space-y-1.5">
                  <div className="grid grid-cols-5 gap-1.5">
                    {ASPECT_RATIOS.map((ar) => {
                      const isSupported =
                        !supportedAspectRatios ||
                        supportedAspectRatios.includes(ar.value);
                      const active = aspectRatio === ar.value;
                      return (
                        <button
                          key={ar.value}
                          type="button"
                          onClick={() => onSelectAspectRatio(ar.value)}
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
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
