'use client';

import React from 'react';
import { Clock, Eye } from 'lucide-react';
import { formatShortModelName } from '@/lib/models';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface StickyGenerateBarProps {
  isGenerating: boolean;
  isShotSetActive: boolean;
  totalPlannedShots: number;
  variations: number;
  doneCount: number;
  pendingSlots: number;
  elapsedMs: number;
  modelName: string;
  modelProviderLabel?: string;
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
  modelProviderLabel,
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

  const shortModelName = formatShortModelName(modelName, modelProviderLabel);

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--border)] bg-[var(--background)]/95 px-3.5 pt-2.5 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur-sm lg:static lg:z-auto lg:shrink-0 lg:px-4 lg:py-3 space-y-2">
      {/* Single-line block reason above the Generate button */}
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
      ) : null}

      {/* Row 1: Full-width Generate button (no truncation) + shortcut hint */}
      <Button
        type="button"
        size="lg"
        disabled={buttonDisabled}
        onClick={onGenerate}
        className="w-full justify-between gap-2 px-4"
      >
        <span className="whitespace-nowrap">{primaryLabel}</span>
        <kbd className="font-mono text-[11px] opacity-75 shrink-0">
          ⌘↵
        </kbd>
      </Button>

      {/* Row 2: Shortened model chip + mono cost + ghost View prompt button */}
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <div className="flex min-w-0 items-center gap-2">
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  title={modelName}
                  className="inline-flex min-w-0 items-center rounded-[5px] border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 font-mono text-[10px] text-[var(--foreground)]"
                >
                  <span className="truncate max-w-[140px]">
                    {shortModelName}
                  </span>
                </span>
              </TooltipTrigger>
              <TooltipContent className="text-[11px]">
                {modelName}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <span
            title={perImageNote ?? undefined}
            className="font-mono text-[11px] tabular-nums text-[var(--muted-foreground)] shrink-0 whitespace-nowrap"
          >
            {estimateLabel}
          </span>
        </div>

        {showPromptInspector ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onOpenPromptDrawer}
            className="h-7 shrink-0 gap-1 px-2 text-[11px] font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          >
            <Eye className="h-3 w-3" />
            <span>View prompt</span>
            {promptEditedManually ? (
              <span
                title="Manual prompt edits active"
                className="h-1.5 w-1.5 rounded-full bg-[#0070f3]"
              />
            ) : null}
          </Button>
        ) : null}
      </div>

      {!blockReason && showSlowModelHint ? (
        <p className="flex items-center gap-1.5 text-[10px] text-[var(--muted-foreground)]">
          <Clock className="h-3 w-3 shrink-0" />
          <span className="truncate">This model can take over a minute</span>
        </p>
      ) : null}
    </div>
  );
}

