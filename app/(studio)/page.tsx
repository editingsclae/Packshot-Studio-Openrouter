import { StudioApp } from '@/components/studio-app';

export default function HomePage() {
  const initialMonthKey = new Date().toISOString().slice(0, 7);
  return <StudioApp initialMonthKey={initialMonthKey} />;
}
