// Miesiąc to tekst 'YYYY-MM', data to tekst 'YYYY-MM-DD'.
// Daty kalendarzowe trzymamy jako tekst, a nie jako timestamp: "wydatek z 31 sierpnia"
// to fakt z kalendarza, a timestamp w UTC potrafi przesunąć go na inny dzień.

export type Month = string;
export type IsoDate = string;

export const MONTH_NAMES = [
  'styczeń',
  'luty',
  'marzec',
  'kwiecień',
  'maj',
  'czerwiec',
  'lipiec',
  'sierpień',
  'wrzesień',
  'październik',
  'listopad',
  'grudzień',
];

export function monthOf(date: IsoDate): Month {
  return date.slice(0, 7);
}

export function yearOf(month: Month): number {
  return Number(month.slice(0, 4));
}

export function monthIndex(month: Month): number {
  return Number(month.slice(5, 7));
}

export function makeMonth(year: number, month: number): Month {
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function addMonths(month: Month, delta: number): Month {
  const total = yearOf(month) * 12 + (monthIndex(month) - 1) + delta;
  return makeMonth(Math.floor(total / 12), (total % 12) + 1);
}

/** Wszystkie miesiące od `from` do `to` włącznie. */
export function monthRange(from: Month, to: Month): Month[] {
  const out: Month[] = [];
  for (let m = from; m <= to; m = addMonths(m, 1)) out.push(m);
  return out;
}

/** '2026-10' -> 'październik 2026' */
export function monthLabel(month: Month): string {
  return `${MONTH_NAMES[monthIndex(month) - 1]} ${yearOf(month)}`;
}

/** Dzisiejsza data w lokalnej strefie czasowej jako 'YYYY-MM-DD'. */
export function todayIso(): IsoDate {
  const d = new Date();
  return `${makeMonth(d.getFullYear(), d.getMonth() + 1)}-${String(d.getDate()).padStart(2, '0')}`;
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/** '2026-10-30' -> '30.10.2026' */
export function formatDate(date: IsoDate): string {
  const [y, m, d] = date.split('-');
  return `${d}.${m}.${y}`;
}
