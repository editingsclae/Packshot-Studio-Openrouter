'use client';

import React, { useId } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AccordionStepProps {
  stepNumber: number;
  title: string;
  summary: string;
  isValid: boolean;
  open: boolean;
  onToggle: () => void;
  headerExtra?: React.ReactNode;
  children: React.ReactNode;
}

export function AccordionStep({
  stepNumber,
  title,
  summary,
  isValid,
  open,
  onToggle,
  headerExtra,
  children,
}: AccordionStepProps) {
  const uid = useId();
  const triggerId = `step-trigger-${stepNumber}-${uid}`;
  const contentId = `step-content-${stepNumber}-${uid}`;

  return (
    <section
      aria-labelledby={triggerId}
      className={cn(
        'rounded-[10px] border bg-[var(--card)] transition-colors duration-150',
        open ? 'border-[var(--border-hover)]' : 'border-[var(--border)]'
      )}
    >
      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
        <button
          id={triggerId}
          type="button"
          aria-expanded={open}
          aria-controls={contentId}
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-[6px] text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070f3]"
        >
          <span
            className={cn(
              'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border font-mono text-[11px] font-semibold tabular-nums transition-colors duration-150',
              isValid
                ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-500'
                : open
                  ? 'border-[var(--foreground)] bg-[var(--foreground)] text-[var(--background)]'
                  : 'border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)]'
            )}
          >
            {isValid ? <Check className="h-3.5 w-3.5" /> : stepNumber}
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">
                Step {stepNumber}
              </span>
              <span className="text-[13px] font-semibold tracking-[-0.015em] text-[var(--foreground)]">
                {title}
              </span>
            </div>
            {!open && summary ? (
              <p className="mt-0.5 truncate text-[11px] text-[var(--muted-foreground)]">
                {summary}
              </p>
            ) : null}
          </div>

          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 text-[var(--muted-foreground)] transition-transform duration-150',
              open && 'rotate-180'
            )}
          />
        </button>

        {headerExtra ? (
          <div className="shrink-0">{headerExtra}</div>
        ) : null}
      </div>

      <div
        id={contentId}
        role="region"
        aria-labelledby={triggerId}
        className={cn(
          'grid transition-[grid-template-rows] duration-150 ease-out',
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        )}
      >
        <div className="overflow-hidden">
          <div className="border-t border-[var(--border)] px-3 py-3 space-y-3.5">
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}
