'use client';

import React, { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AlertCircle, ArrowRight, Eye, EyeOff, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function LoginForm() {
  const searchParams = useSearchParams();
  const nextPath = searchParams.get('next') || '/';
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isPending) return;
    setError(null);
    setIsPending(true);

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, next: nextPath }),
      });

      let data: { ok?: boolean; redirectTo?: string; error?: string } = {};
      try {
        data = (await res.json()) as {
          ok?: boolean;
          redirectTo?: string;
          error?: string;
        };
      } catch {
        // Non-JSON error response
      }

      if (!res.ok || !data.ok) {
        setError(data.error || 'Sign-in failed. Please try again.');
        setIsPending(false);
        return;
      }

      window.location.assign(data.redirectTo || '/');
    } catch {
      setError('Unable to reach the server. Please try again.');
      setIsPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="studio-password">Shared password</Label>
        <div className="relative">
          <Input
            id="studio-password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="Enter access password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            required
            className="pr-10"
          />
          <button
            type="button"
            onClick={() => setShowPassword((prev) => !prev)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-7 w-7 items-center justify-center rounded-[5px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer"
          >
            {showPassword ? (
              <EyeOff className="h-3.5 w-3.5" />
            ) : (
              <Eye className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>

      {error ? (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-[8px] border border-red-500/40 bg-red-500/10 px-3 py-2 text-[12px] text-red-400"
        >
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      <Button type="submit" size="lg" disabled={isPending} className="w-full justify-between">
        <span>{isPending ? 'Verifying...' : 'Unlock Packshot Studio'}</span>
        <ArrowRight className="h-4 w-4" />
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="studio-dot-grid flex min-h-screen items-center justify-center bg-[var(--background)] px-4 py-12 text-[var(--foreground)]">
      <div className="w-full max-w-sm rounded-[14px] border border-[var(--border)] bg-[var(--card)] p-6 space-y-5">
        <div className="space-y-2">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)]">
            <Lock className="h-4 w-4" />
          </div>
          <h1 className="text-[18px] font-semibold tracking-[-0.02em] text-[var(--foreground)]">
            Packshot Studio
          </h1>
          <p className="text-[13px] leading-relaxed text-[var(--muted-foreground)]">
            Enter the shared access password to unlock image generation and studio controls.
          </p>
        </div>

        <Suspense
          fallback={
            <div className="h-28 rounded-[8px] border border-[var(--border)] bg-[var(--surface)]" />
          }
        >
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
