'use client';

import React from 'react';
import { ASPECT_RATIOS, type AspectRatio, type ModelSpec } from '@/lib/models';
import type { StudioSettings } from '@/lib/db';
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

interface SettingsViewProps {
  settings: StudioSettings;
  onUpdateSettings: (patch: Partial<StudioSettings>) => void;
  models: ModelSpec[];
  serverStatus: {
    hasApiKey: boolean;
    enhancerModel: string;
  } | null;
}

export function SettingsView({
  settings,
  onUpdateSettings,
  models,
  serverStatus,
}: SettingsViewProps) {
  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 py-8 space-y-8">
      <div className="border-b border-[var(--border)] pb-5">
        <h1 className="text-[20px] font-semibold tracking-[-0.02em] text-[var(--foreground)]">
          Studio Settings
        </h1>
        <p className="mt-1 text-[13px] text-[var(--muted-foreground)]">
          Defaults are persisted locally in IndexedDB. API credentials stay strictly server-side in environment variables.
        </p>
      </div>

      {/* Default Generation Preferences */}
      <section className="space-y-5 rounded-[12px] border border-[var(--border)] bg-[var(--card)] p-5">
        <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-[var(--foreground)]">
          Generation Defaults
        </h2>

        <div className="space-y-1.5">
          <Label htmlFor="default-model">Default model</Label>
          <Select
            value={settings.defaultModel}
            onValueChange={(val) => onUpdateSettings({ defaultModel: val })}
          >
            <SelectTrigger id="default-model">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {models.map((model) => (
                <SelectItem key={model.id} value={model.id}>
                  {model.name} ({model.priceLabel})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Default aspect ratio</Label>
          <div className="flex flex-wrap gap-2">
            {ASPECT_RATIOS.map((ar) => {
              const active = settings.defaultAspectRatio === ar.value;
              return (
                <button
                  key={ar.value}
                  type="button"
                  onClick={() =>
                    onUpdateSettings({ defaultAspectRatio: ar.value as AspectRatio })
                  }
                  className={cn(
                    'inline-flex h-9 items-center gap-2 rounded-[6px] border px-3 text-[13px] transition-colors duration-150 cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070f3]',
                    active
                      ? 'border-[var(--foreground)] bg-[var(--foreground)] text-[var(--background)] font-medium'
                      : 'border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] hover:border-[var(--border-hover)]'
                  )}
                >
                  <span className="font-mono text-[12px]">{ar.label}</span>
                  <span className="text-[11px] opacity-75">{ar.hint}</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Workspace Appearance & Inspector */}
      <section className="space-y-4 rounded-[12px] border border-[var(--border)] bg-[var(--card)] p-5">
        <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-[var(--foreground)]">
          Workspace Interface
        </h2>

        <div className="flex items-center justify-between gap-4 border-b border-[var(--border)] pb-4">
          <div>
            <Label htmlFor="show-inspector-switch" className="text-[13px] text-[var(--foreground)]">
              Show Prompt Inspector
            </Label>
            <p className="mt-0.5 text-[12px] text-[var(--muted-foreground)]">
              Inspect and manually override the deterministic Realism Engine prompt before generating.
            </p>
          </div>
          <Switch
            id="show-inspector-switch"
            checked={settings.showPromptInspector}
            onCheckedChange={(checked) =>
              onUpdateSettings({ showPromptInspector: checked })
            }
          />
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <Label className="text-[13px] text-[var(--foreground)]">Theme</Label>
            <p className="mt-0.5 text-[12px] text-[var(--muted-foreground)]">
              Monochrome dark mode is recommended for evaluating studio highlights and pure white borders.
            </p>
          </div>
          <div className="flex items-center rounded-[6px] border border-[var(--border)] bg-[var(--surface)] p-0.5">
            {(['dark', 'light'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => onUpdateSettings({ theme: t })}
                className={cn(
                  'h-8 rounded-[5px] px-3 text-[12px] font-medium capitalize transition-colors cursor-pointer',
                  settings.theme === t
                    ? 'bg-[var(--foreground)] text-[var(--background)]'
                    : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Server Environment Configuration (read-only status) */}
      <section className="space-y-3 rounded-[12px] border border-[var(--border)] bg-[var(--card)] p-5">
        <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-[var(--foreground)]">
          Server Configuration
        </h2>
        <div className="space-y-2 text-[13px]">
          <div className="flex items-center justify-between border-b border-[var(--border)] pb-2">
            <span className="font-mono text-[12px] text-[var(--muted-foreground)]">
              OPENROUTER_API_KEY
            </span>
            <span className="font-mono text-[12px] text-[var(--foreground)]">
              {serverStatus === null
                ? 'Checking...'
                : serverStatus.hasApiKey
                  ? 'Configured (.env)'
                  : 'Not detected'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-mono text-[12px] text-[var(--muted-foreground)]">
              OPENROUTER_ENHANCER_MODEL
            </span>
            <span className="font-mono text-[12px] text-[var(--foreground)]">
              {serverStatus?.enhancerModel ?? 'openai/gpt-4o-mini'}
            </span>
          </div>
        </div>
        <p className="text-[12px] text-[var(--muted-foreground)]">
          Keys are read exclusively by Next.js Route Handlers and never exposed to client bundles.
        </p>
      </section>
    </div>
  );
}
