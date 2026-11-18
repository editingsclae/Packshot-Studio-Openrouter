'use client';

import React from 'react';
import { Command, Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';

export type StudioTab = 'generate' | 'library' | 'settings';

interface TopBarProps {
  activeTab: StudioTab;
  onTabChange: (tab: StudioTab) => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onOpenCommandPalette: () => void;
  libraryCount: number;
}

const TAB_LABELS: { id: StudioTab; label: string; breadcrumb: string }[] = [
  { id: 'generate', label: 'Generate', breadcrumb: 'New generation' },
  { id: 'library', label: 'Library', breadcrumb: 'Library' },
  { id: 'settings', label: 'Settings', breadcrumb: 'Settings' },
];

export function TopBar({
  activeTab,
  onTabChange,
  theme,
  onToggleTheme,
  onOpenCommandPalette,
  libraryCount,
}: TopBarProps) {
  const currentBreadcrumb =
    TAB_LABELS.find((t) => t.id === activeTab)?.breadcrumb ?? 'New generation';

  return (
    <header className="sticky top-0 z-40 h-14 w-full border-b border-[var(--border)] bg-[var(--background)]/95 backdrop-blur-sm">
      <div className="mx-auto flex h-full max-w-[1600px] items-center justify-between gap-4 px-4 sm:px-6">
        {/* Left: Original geometric studio mark + wordmark + breadcrumb */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => onTabChange('generate')}
            className="flex items-center gap-2.5 text-[14px] font-semibold tracking-[-0.02em] text-[var(--foreground)] whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070f3] rounded-[6px] px-1 py-0.5"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              aria-hidden="true"
              className="shrink-0 text-[var(--foreground)]"
            >
              <rect
                x="2"
                y="2"
                width="16"
                height="16"
                rx="3"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <circle
                cx="10"
                cy="10"
                r="3.25"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <path
                d="M14.5 5.5H14.51"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
              />
            </svg>
            <span>Packshot Studio</span>
          </button>

          <span className="hidden sm:inline text-[var(--border-hover)] select-none" aria-hidden="true">
            /
          </span>

          <nav
            aria-label="Breadcrumb"
            className="hidden sm:flex items-center gap-1.5 text-[13px] text-[var(--muted-foreground)] whitespace-nowrap truncate"
          >
            <span>Studio</span>
            <span aria-hidden="true">/</span>
            <span className="text-[var(--foreground)] font-medium">{currentBreadcrumb}</span>
          </nav>
        </div>

        {/* Center: Underline tabs */}
        <nav aria-label="Primary sections" className="flex h-full items-center gap-1 sm:gap-2">
          {TAB_LABELS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onTabChange(tab.id)}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'relative flex h-full items-center gap-1.5 px-2.5 sm:px-3 text-[13px] font-medium whitespace-nowrap shrink-0 transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070f3] focus-visible:ring-inset',
                  isActive
                    ? 'text-[var(--foreground)]'
                    : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                )}
              >
                <span>{tab.label}</span>
                {tab.id === 'library' && libraryCount > 0 ? (
                  <span className="font-mono text-[11px] tabular-nums text-[var(--muted-foreground)]">
                    {libraryCount}
                  </span>
                ) : null}
                {isActive ? (
                  <span
                    aria-hidden="true"
                    className="absolute bottom-0 left-2 right-2 h-[2px] bg-[var(--foreground)]"
                  />
                ) : null}
              </button>
            );
          })}
        </nav>

        {/* Right: Command palette + Theme toggle */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onOpenCommandPalette}
            aria-label="Open command palette"
            className="hidden md:inline-flex h-8 items-center gap-2 rounded-[6px] border border-[var(--border)] bg-[var(--surface)] px-2.5 text-[12px] text-[var(--muted-foreground)] transition-colors duration-150 hover:border-[var(--border-hover)] hover:text-[var(--foreground)] cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070f3]"
          >
            <Command className="h-3.5 w-3.5" />
            <span>Menu</span>
            <kbd className="font-mono text-[11px] text-[var(--muted-foreground)]">⌘K</kbd>
          </button>

          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="inline-flex h-8 w-8 items-center justify-center rounded-[6px] border border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)] transition-colors duration-150 hover:border-[var(--border-hover)] hover:text-[var(--foreground)] cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070f3]"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </header>
  );
}
