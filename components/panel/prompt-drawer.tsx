'use client';

import React, { useEffect, useMemo } from 'react';
import { RotateCcw, Wand2, X } from 'lucide-react';
import { computePromptDiff } from '@/lib/prompt-diff';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

interface PromptDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  autoPrompt: string;
  activePrompt: string;
  promptEditedManually: boolean;
  onEditPrompt: (nextText: string) => void;
  onResetPrompt: () => void;
  enhanceEnabled: boolean;
  isEnhancingPreview: boolean;
  onPreviewEnhance: () => void;
  canEnhance: boolean;
}

export function PromptDrawer({
  open,
  onOpenChange,
  autoPrompt,
  activePrompt,
  promptEditedManually,
  onEditPrompt,
  onResetPrompt,
  enhanceEnabled,
  isEnhancingPreview,
  onPreviewEnhance,
  canEnhance,
}: PromptDrawerProps) {
  useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onOpenChange(false);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [open, onOpenChange]);

  const diffSegments = useMemo(() => {
    if (!promptEditedManually || activePrompt === autoPrompt) {
      return null;
    }
    return computePromptDiff(autoPrompt, activePrompt);
  }, [promptEditedManually, activePrompt, autoPrompt]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-labelledby="prompt-drawer-title"
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close prompt inspector"
        onClick={() => onOpenChange(false)}
        className="fixed inset-0 bg-black/50 backdrop-blur-[1px] cursor-default"
      />

      {/* Slide-over panel */}
      <aside className="relative z-10 flex h-full w-full max-w-lg flex-col border-l border-[var(--border)] bg-[var(--card)]">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-3.5">
          <div>
            <h2
              id="prompt-drawer-title"
              className="text-[15px] font-semibold tracking-[-0.02em] text-[var(--foreground)]"
            >
              Prompt inspector
            </h2>
            <p className="text-[11px] text-[var(--muted-foreground)]">
              {promptEditedManually
                ? 'Manual edits active · changes highlighted below'
                : 'Auto-built from your product brief and shot preset'}
            </p>
          </div>

          <button
            type="button"
            aria-label="Close prompt drawer"
            onClick={() => onOpenChange(false)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-[6px] border border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)] hover:border-[var(--border-hover)] hover:text-[var(--foreground)] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070f3]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="studio-scrollbar flex-1 overflow-y-auto p-5 space-y-4">
          {/* Action Controls */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-mono text-[11px] tabular-nums text-[var(--muted-foreground)]">
              {activePrompt.length}/2000 characters
            </span>

            <div className="flex items-center gap-2">
              {enhanceEnabled ? (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={isEnhancingPreview || !canEnhance}
                  onClick={onPreviewEnhance}
                >
                  <Wand2 className="h-3.5 w-3.5 text-[#0070f3]" />
                  <span>{isEnhancingPreview ? 'Enhancing...' : 'Preview AI'}</span>
                </Button>
              ) : null}

              {promptEditedManually ? (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={onResetPrompt}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Reset to auto-built</span>
                </Button>
              ) : null}
            </div>
          </div>

          {/* Editable Prompt Box */}
          <div className="space-y-1.5">
            <Textarea
              aria-label="Editable generation prompt"
              value={activePrompt}
              onChange={(e) => onEditPrompt(e.target.value)}
              maxLength={2000}
              className="min-h-[200px] font-mono text-[12px] leading-relaxed"
            />
          </div>

          {/* Diff Highlight when manual edits differ from auto-built */}
          {diffSegments ? (
            <div className="space-y-2 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[10px] font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
                  Manual edit diff vs auto-built
                </span>
                <div className="flex items-center gap-2 font-mono text-[10px]">
                  <span className="text-emerald-500">+ added</span>
                  <span className="text-red-500 line-through">- removed</span>
                </div>
              </div>

              <div className="font-mono text-[11px] leading-relaxed text-[var(--foreground)] whitespace-pre-wrap break-words">
                {diffSegments.map((seg, idx) => (
                  <span
                    key={idx}
                    className={cn(
                      seg.type === 'added' &&
                        'rounded-[2px] bg-emerald-500/15 px-0.5 text-emerald-500',
                      seg.type === 'removed' &&
                        'rounded-[2px] bg-red-500/15 px-0.5 text-red-500 line-through'
                    )}
                  >
                    {seg.text}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
