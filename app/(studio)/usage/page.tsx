import { StudioApp } from '@/components/studio-app';

export default function UsagePage() {
  const initialMonthKey = new Date().toISOString().slice(0, 7);
  return <StudioApp initialTab="usage" initialMonthKey={initialMonthKey} />;
}
