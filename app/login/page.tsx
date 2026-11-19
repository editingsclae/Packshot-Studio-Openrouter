'use client';

import React, { Suspense, useActionState, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AlertCircle, ArrowRight, Eye, EyeOff, Lock } from 'lucide-react';
import { loginAction, type LoginActionState } from './actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const initialState: LoginActionState = {};

function LoginForm() {
  const searchParams = useSearchParams();
  const nextPath = searchParams.get('next') || '/';
  const [state, formAction, isPending] = useActionState(loginAction, initialState);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="next" value={nextPath} />

      <div className="space-y-1.5">
        <Label htmlFor="studio-password">Shared password</Label>
        <div className="relative">
          <Input
            id="studio-password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="Enter access password"
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

      {state.error ? (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-[8px] border border-red-500/40 bg-red-500/10 px-3 py-2 text-[12px] text-red-400"
        >
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{state.error}</span>
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
