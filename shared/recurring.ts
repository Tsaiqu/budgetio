import type { Month } from './months';
import type { RecurringPeriod } from './types';

/** Kwota kosztu stałego w danym miesiącu (0, gdy w tym miesiącu nie obowiązuje). */
export function recurringAmountIn(periods: RecurringPeriod[], month: Month): number {
  const p = periods.find((p) => p.startMonth <= month && (p.endMonth === null || p.endMonth >= month));
  return p ? p.amountGross : 0;
}
