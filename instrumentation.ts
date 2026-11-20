import { warnIfVercelBudgetMissing } from '@/lib/budget';

export function register() {
  warnIfVercelBudgetMissing();
}
