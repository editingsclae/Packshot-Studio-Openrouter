'use client';

import React from 'react';
import { Clock, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface StickyGenerateBarProps {
  isGenerating: boolean;
  isShotSetActive: boolean;
  totalPlannedShots: number;
  variations: number;
  doneCount: number;
  pendingSlots: number;
  elapsedMs: number;
  modelName: string;
  estimateLabel: string;
  perImageNote: string | null;
  blockReason: string | null;
  promptEditedManually: boolean;
  showPromptInspector: boolean;
  showSlowModelHint: boolean;
  onGenerate: () => void;
  onOpenPromptDrawer: () => void;
  onGoToSettings?: () => void;
  isSpendLimitNotice?: boolean;
}

export function StickyGenerateBar({
  isGenerating,
  isShotSetActive,
  totalPlannedShots,
  variations,
  doneCount,
  pendingSlots,
  elapsedMs,
  modelName,
  estimateLabel,
  perImageNote,
  blockReason,
  promptEditedManually,
  showPromptInspector,
  showSlowModelHint,
  onGenerate,
  onOpenPromptDrawer,
  onGoToSettings,
  isSpendLimitNotice = false,
}: StickyGenerateBarProps) {
  const buttonDisabled = isGenerating || Boolean(blockReason);

  const primaryLabel = isGenerating
    ? `Generating ${doneCount}/${pendingSlots} (${(elapsedMs / 1000).toFixed(0)}s)...`
    : isShotSetActive
      ? `Generate shot set (${totalPlannedShots} shots)`
      : `Generate ${variations} ${variations === 1 ? 'shot' : 'shots'}`;

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--border)] bg-[var(--background)]/95 px-3.5 pt-2.5 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur-sm lg:static lg:z-auto lg:shrink-0 lg:px-4 lg:py-3 space-y-2">
      {/* Top context row: Active model chip + View prompt button */}
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="inline-flex min-w-0 items-center gap-1.5 rounded-[5px] border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 font-mono text-[10px] text-[var(--muted-foreground)]">
          <span className="truncate max-w-[190px] text-[var(--foreground)]">
            {modelName}
          </span>
        </span>

        {showPromptInspector ? (
          <button
            type="button"
            onClick={onOpenPromptDrawer}
            className="inline-flex shrink-0 items-center gap-1 rounded-[5px] border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 text-[11px] font-medium text-[var(--foreground)] hover:border-[var(--border-hover)] cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070f3]"
          >
            <Eye className="h-3 w-3 text-[var(--muted-foreground)]" />
            <span>View prompt</span>
            {promptEditedManually ? (
              <span
                title="Manual prompt edits active"
                className="h-1.5 w-1.5 rounded-full bg-[#0070f3]"
              />
            ) : null}
          </button>
        ) : null}
      </div>

      {/* Primary CTA + Estimated Cost */}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="lg"
          disabled={buttonDisabled}
          onClick={onGenerate}
          className="flex-1 min-w-0 justify-between"
        >
          <span className="truncate">{primaryLabel}</span>
          <kbd className="hidden sm:inline font-mono text-[11px] opacity-75">
            ⌘↵
          </kbd>
        </Button>

        <span className="inline-flex h-10 shrink-0 items-center rounded-[6px] border border-[var(--border)] bg-[var(--surface)] px-2.5 font-mono text-[11px] tabular-nums text-[var(--muted-foreground)] whitespace-nowrap">
          {estimateLabel}
        </span>
      </div>

      {/* 1-line block reason, spend limit notice, per-image note, or slow hint */}
      {blockReason ? (
        <div className="flex items-center justify-between gap-2 text-[11px] text-amber-500">
          <span className="truncate">{blockReason}</span>
          {isSpendLimitNotice && onGoToSettings ? (
            <button
              type="button"
              onClick={onGoToSettings}
              className="shrink-0 font-medium text-[var(--foreground)] underline cursor-pointer"
            >
              Settings
            </button>
          ) : null}
        </div>
      ) : perImageNote ? (
        <p className="font-mono text-[10px] tabular-nums text-[var(--muted-foreground)] truncate">
          {perImageNote}
        </p>
      ) : showSlowModelHint ? (
        <p className="flex items-center gap-1.5 text-[11px] text-[var(--muted-foreground)]">
          <Clock className="h-3 w-3 shrink-0" />
          <span>This model can take over a minute</span>
        </p>
      ) : null}
    </div>
  );
}
