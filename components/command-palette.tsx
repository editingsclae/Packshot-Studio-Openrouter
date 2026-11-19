'use client';

import React from 'react';
import { Command } from 'cmdk';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import {
  BarChart3,
  Camera,
  FolderOpen,
  Moon,
  Search,
  Settings,
  Sparkles,
  Sun,
  Wand2,
} from 'lucide-react';
import { SHOT_PRESETS, type ShotPresetId } from '@/lib/presets';
import { SAMPLE_BRIEFS, type SampleBriefPreset } from '@/lib/prompt-engine';
import type { StudioTab } from './top-bar';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSwitchTab: (tab: StudioTab) => void;
  onSelectPreset: (presetId: ShotPresetId) => void;
  onLoadSample: (sample: SampleBriefPreset) => void;
  onToggleTheme: () => void;
  onToggleEnhance: () => void;
  theme: 'dark' | 'light';
  enhanceEnabled: boolean;
}

export function CommandPalette({
  open,
  onOpenChange,
  onSwitchTab,
  onSelectPreset,
  onLoadSample,
  onToggleTheme,
  onToggleEnhance,
  theme,
  enhanceEnabled,
}: CommandPaletteProps) {
  const runAndClose = (fn: () => void) => {
    fn();
    onOpenChange(false);
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-[2px]" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-[18%] z-50 w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 overflow-hidden rounded-[12px] border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] outline-none"
        >
          <DialogPrimitive.Title className="sr-only">
            Studio Command Palette
          </DialogPrimitive.Title>

          <Command className="w-full" label="Packshot Studio commands">
            <div className="flex items-center gap-2.5 border-b border-[var(--border)] px-3.5">
              <Search className="h-4 w-4 shrink-0 text-[var(--muted-foreground)]" />
              <Command.Input
                placeholder="Jump to tab, shot preset, or sample brief..."
                className="h-11 w-full bg-transparent text-[13px] text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] outline-none"
              />
              <kbd className="font-mono text-[11px] text-[var(--muted-foreground)] shrink-0">
                ESC
              </kbd>
            </div>

            <Command.List className="studio-scrollbar max-h-[340px] overflow-y-auto p-1.5">
              <Command.Empty className="py-8 text-center text-[13px] text-[var(--muted-foreground)]">
                No matching studio commands.
              </Command.Empty>

              <Command.Group
                heading="Navigation"
                className="px-2 py-1 text-[11px] font-medium text-[var(--muted-foreground)]"
              >
                <Command.Item
                  value="Generate studio workspace"
                  onSelect={() => runAndClose(() => onSwitchTab('generate'))}
                  className="flex cursor-pointer items-center gap-2.5 rounded-[6px] px-2.5 py-2 text-[13px] text-[var(--foreground)] aria-selected:bg-[var(--muted)]"
                >
                  <Camera className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
                  <span>Go to Generate</span>
                </Command.Item>
                <Command.Item
                  value="Library history saved images"
                  onSelect={() => runAndClose(() => onSwitchTab('library'))}
                  className="flex cursor-pointer items-center gap-2.5 rounded-[6px] px-2.5 py-2 text-[13px] text-[var(--foreground)] aria-selected:bg-[var(--muted)]"
                >
                  <FolderOpen className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
                  <span>Go to Library</span>
                </Command.Item>
                <Command.Item
                  value="Usage history spending cost analytics chart"
                  onSelect={() => runAndClose(() => onSwitchTab('usage'))}
                  className="flex cursor-pointer items-center gap-2.5 rounded-[6px] px-2.5 py-2 text-[13px] text-[var(--foreground)] aria-selected:bg-[var(--muted)]"
                >
                  <BarChart3 className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
                  <span>Go to Usage History</span>
                </Command.Item>
                <Command.Item
                  value="Settings defaults preferences"
                  onSelect={() => runAndClose(() => onSwitchTab('settings'))}
                  className="flex cursor-pointer items-center gap-2.5 rounded-[6px] px-2.5 py-2 text-[13px] text-[var(--foreground)] aria-selected:bg-[var(--muted)]"
                >
                  <Settings className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
                  <span>Go to Settings</span>
                </Command.Item>
              </Command.Group>

              <Command.Group
                heading="Shot Presets"
                className="mt-1 px-2 py-1 text-[11px] font-medium text-[var(--muted-foreground)]"
              >
                {SHOT_PRESETS.map((preset) => (
                  <Command.Item
                    key={preset.id}
                    value={`Shot preset ${preset.name} ${preset.shortDescription}`}
                    onSelect={() =>
                      runAndClose(() => {
                        onSwitchTab('generate');
                        onSelectPreset(preset.id);
                      })
                    }
                    className="flex cursor-pointer items-center justify-between gap-3 rounded-[6px] px-2.5 py-2 text-[13px] text-[var(--foreground)] aria-selected:bg-[var(--muted)]"
                  >
                    <span className="truncate">{preset.name}</span>
                    <span className="font-mono text-[11px] text-[var(--muted-foreground)] shrink-0">
                      {preset.defaultAspectRatio}
                    </span>
                  </Command.Item>
                ))}
              </Command.Group>

              <Command.Group
                heading="Load Sample Brief"
                className="mt-1 px-2 py-1 text-[11px] font-medium text-[var(--muted-foreground)]"
              >
                {SAMPLE_BRIEFS.map((sample) => (
                  <Command.Item
                    key={sample.id}
                    value={`Sample ${sample.label} ${sample.brief.name}`}
                    onSelect={() =>
                      runAndClose(() => {
                        onSwitchTab('generate');
                        onLoadSample(sample);
                      })
                    }
                    className="flex cursor-pointer items-center gap-2.5 rounded-[6px] px-2.5 py-2 text-[13px] text-[var(--foreground)] aria-selected:bg-[var(--muted)]"
                  >
                    <Sparkles className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
                    <span className="truncate">{sample.brief.name}</span>
                  </Command.Item>
                ))}
              </Command.Group>

              <Command.Group
                heading="Preferences"
                className="mt-1 px-2 py-1 text-[11px] font-medium text-[var(--muted-foreground)]"
              >
                <Command.Item
                  value="Toggle Enhance with AI prompt rewriter"
                  onSelect={() => runAndClose(onToggleEnhance)}
                  className="flex cursor-pointer items-center justify-between gap-2.5 rounded-[6px] px-2.5 py-2 text-[13px] text-[var(--foreground)] aria-selected:bg-[var(--muted)]"
                >
                  <span className="flex items-center gap-2.5">
                    <Wand2 className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
                    <span>Toggle Enhance with AI</span>
                  </span>
                  <span className="font-mono text-[11px] text-[var(--muted-foreground)]">
                    {enhanceEnabled ? 'ON' : 'OFF'}
                  </span>
                </Command.Item>
                <Command.Item
                  value="Toggle light dark theme"
                  onSelect={() => runAndClose(onToggleTheme)}
                  className="flex cursor-pointer items-center justify-between gap-2.5 rounded-[6px] px-2.5 py-2 text-[13px] text-[var(--foreground)] aria-selected:bg-[var(--muted)]"
                >
                  <span className="flex items-center gap-2.5">
                    {theme === 'dark' ? (
                      <Sun className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
                    ) : (
                      <Moon className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
                    )}
                    <span>Switch to {theme === 'dark' ? 'Light' : 'Dark'} mode</span>
                  </span>
                </Command.Item>
              </Command.Group>
            </Command.List>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
