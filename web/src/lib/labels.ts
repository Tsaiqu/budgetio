import type { RecurringType, TxType, ZusStage } from '../../../shared/schemas';

export const TX_TYPE_LABEL: Record<TxType, string> = {
  personal_expense: 'Wydatek prywatny',
  business_cost: 'Koszt firmowy',
  business_income: 'Przychód firmowy',
  personal_income: 'Przychód prywatny',
};

/** Krótkie nazwy do przełącznika w formularzu. */
export const TX_TYPE_SHORT: Record<TxType, string> = {
  personal_expense: 'Wydatek',
  business_cost: 'Koszt firmowy',
  business_income: 'Faktura',
  personal_income: 'Przychód prywatny',
};

export const TX_TYPE_ORDER: TxType[] = ['personal_expense', 'business_cost', 'business_income', 'personal_income'];

export const isIncome = (t: TxType) => t === 'business_income' || t === 'personal_income';
export const isBusiness = (t: TxType) => t === 'business_income' || t === 'business_cost';

export const RECURRING_TYPE_LABEL: Record<RecurringType, string> = {
  personal_expense: 'Prywatny',
  business_cost: 'Firmowy',
};

export const ZUS_STAGE_LABEL: Record<ZusStage, string> = {
  none: 'Brak działalności',
  start_relief: 'Ulga na start',
  preferential: 'Preferencyjny',
  full: 'Pełny',
};

export const VAT_RATES = [23, 8, 5, 0];
export const vatLabel = (rate: number) => (rate === 0 ? '0% / zw.' : `${rate}%`);

const MONTH_GENITIVE = [
  'stycznia',
  'lutego',
  'marca',
  'kwietnia',
  'maja',
  'czerwca',
  'lipca',
  'sierpnia',
  'września',
  'października',
  'listopada',
  'grudnia',
];

const MONTH_LOCATIVE = [
  'styczniu',
  'lutym',
  'marcu',
  'kwietniu',
  'maju',
  'czerwcu',
  'lipcu',
  'sierpniu',
  'wrześniu',
  'październiku',
  'listopadzie',
  'grudniu',
];

/** inMonth('2026-10') -> 'w październiku', inMonth('2026-10', true) -> 'w październiku 2026' */
export function inMonth(month: string, withYear = false): string {
  const name = MONTH_LOCATIVE[Number(month.slice(5, 7)) - 1];
  return `${name.startsWith('w') ? 'we' : 'w'} ${name}${withYear ? ` ${month.slice(0, 4)}` : ''}`;
}

/** Termin płatności: dueDate('2026-11', 25) -> '25 listopada' */
export function dueDate(month: string, day: number): string {
  return `${day} ${MONTH_GENITIVE[Number(month.slice(5, 7)) - 1]}`;
}
