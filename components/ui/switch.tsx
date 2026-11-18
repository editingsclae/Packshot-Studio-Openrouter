'use client';

import * as React from 'react';
import * as SwitchPrimitives from '@radix-ui/react-switch';
import { cn } from '@/lib/utils';

export const Switch = React.forwardRef<
  React.ComponentRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    ref={ref}
    className={cn(
      'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-[var(--border)] bg-[var(--muted)] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070f3] disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-[var(--foreground)] data-[state=checked]:border-[var(--foreground)]',
      className
    )}
    {...props}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        'pointer-events-none block h-3.5 w-3.5 rounded-full bg-[var(--foreground)] transition-transform duration-150 data-[state=checked]:translate-x-[17px] data-[state=unchecked]:translate-x-[2px] data-[state=checked]:bg-[var(--background)]'
      )}
    />
  </SwitchPrimitives.Root>
));

Switch.displayName = 'Switch';
