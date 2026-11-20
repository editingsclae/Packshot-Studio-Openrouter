import React from 'react';
import { StudioShell } from '@/components/studio-shell';

export default function StudioGroupLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <StudioShell>{children}</StudioShell>;
}
