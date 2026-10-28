// Obliczenia: VAT, PIT (skala podatkowa), ZUS, składka zdrowotna, budżet.
// Czyste funkcje bez bazy danych – dostają dane, zwracają wynik. Łatwo je testować (finance.test.ts).
// Wszystkie kwoty w groszach.
import { addMonths, monthIndex, monthRange, yearOf, type Month } from '../../shared/months';
import { recurringAmountIn } from '../../shared/recurring';
import type { RecurringType, Settings, TaxRates, TxType, ZusStage, ZusStageChange } from '../../shared/schemas';
import type { BudgetRow, Category, MonthSummary, RecurringPeriod, TaxMonth } from '../../shared/types';

/** Jedna pozycja do obliczeń: transakcja albo koszt stały w danym miesiącu. */
export interface Entry {
  type: TxType;
  categoryId: number | null;
  amountGross: number;
  vatRate: number;
  vatDeductiblePct: number;
  taxCostPct: number;
  /** Miesiąc podatkowy (data faktury). */
  taxMonth: Month;
  /** Miesiąc kasowy (data wpływu / płatności). */
  cashMonth: Month;
  recurring: boolean;
}

export interface FinanceData {
  entries: Entry[];
  categories: Category[];
  stages: ZusStageChange[];
  rates: Record<number, TaxRates>;
  settings: Settings;
}

const roundToZl = (grosze: number) => Math.round(grosze / 100) * 100;
const applyBp = (amount: number, bp: number) => Math.round((amount * bp) / 10000);

// ---------------------------------------------------------------- pojedyncza pozycja

export interface Amounts {
  net: number;
  vat: number;
  /** VAT, który odliczasz (tylko koszt firmowy). */
  vatDeductible: number;
  /** Koszt uzyskania przychodu do PIT (tylko koszt firmowy). */
  taxCost: number;
}

export function computeAmounts(e: Pick<Entry, 'type' | 'amountGross' | 'vatRate' | 'vatDeductiblePct' | 'taxCostPct'>): Amounts {
  const isBusiness = e.type === 'business_income' || e.type === 'business_cost';
  if (!isBusiness) return { net: e.amountGross, vat: 0, vatDeductible: 0, taxCost: 0 };

  const net = Math.round((e.amountGross * 100) / (100 + e.vatRate));
  const vat = e.amountGross - net;
  if (e.type === 'business_income') return { net, vat, vatDeductible: 0, taxCost: 0 };

  const vatDeductible = Math.round((vat * e.vatDeductiblePct) / 100);
  // VAT, którego nie odliczasz, zwiększa koszt podatkowy.
  const taxCost = Math.round(((net + vat - vatDeductible) * e.taxCostPct) / 100);
  return { net, vat, vatDeductible, taxCost };
}

// ---------------------------------------------------------------- koszty stałe

export interface RecurringLike {
  type: RecurringType;
  categoryId: number | null;
  vatRate: number;
  vatDeductiblePct: number;
  taxCostPct: number;
  periods: RecurringPeriod[];
}

/** Rozwija koszty stałe na pozycje miesięczne w zakresie od..do. */
export function expandRecurring(items: RecurringLike[], from: Month, to: Month): Entry[] {
  const out: Entry[] = [];
  for (const month of monthRange(from, to)) {
    for (const item of items) {
      const amountGross = recurringAmountIn(item.periods, month);
      if (amountGross === 0) continue;
      out.push({
        type: item.type,
        categoryId: item.categoryId,
        amountGross,
        vatRate: item.type === 'business_cost' ? item.vatRate : 0,
        vatDeductiblePct: item.vatDeductiblePct,
        taxCostPct: item.taxCostPct,
        taxMonth: month,
        cashMonth: month,
        recurring: true,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------- stawki i etapy ZUS

/** Stawki na rok. Gdy brak – najbliższy wcześniejszy rok, a gdy go brak – najbliższy późniejszy. */
export function resolveRates(rates: Record<number, TaxRates>, year: number): { rates: TaxRates; year: number } | null {
  const years = Object.keys(rates)
    .map(Number)
    .sort((a, b) => a - b);
  if (years.length === 0) return null;
  const earlier = years.filter((y) => y <= year);
  const chosen = earlier.length ? earlier[earlier.length - 1] : years[0];
  return { rates: rates[chosen], year: chosen };
}

export function stageFor(stages: ZusStageChange[], month: Month): ZusStage {
  let stage: ZusStage = 'none';
  for (const s of [...stages].sort((a, b) => a.month.localeCompare(b.month))) {
    if (s.month <= month) stage = s.stage;
  }
  return stage;
}

/** Składki społeczne za miesiąc. Ulga na start = 0 zł, preferencyjny = bez Funduszu Pracy. */
export function socialContribution(stage: ZusStage, r: TaxRates, sicknessInsurance: boolean): number {
  if (stage === 'none' || stage === 'start_relief') return 0;
  const base = stage === 'full' ? r.zusFullBase : r.zusPrefBase;
  let total = applyBp(base, r.pensionRateBp) + applyBp(base, r.disabilityRateBp) + applyBp(base, r.accidentRateBp);
  if (sicknessInsurance) total += applyBp(base, r.sicknessRateBp);
  if (stage === 'full') total += applyBp(base, r.laborFundRateBp);
  return total;
}

/** Podatek wg skali od podstawy liczonej narastająco od początku roku. */
export function scaleTax(base: number, r: TaxRates): number {
  if (base <= r.pitThreshold) return Math.max(0, applyBp(base, r.pitRate1Bp) - r.pitReduction);
  return applyBp(r.pitThreshold, r.pitRate1Bp) - r.pitReduction + applyBp(base - r.pitThreshold, r.pitRate2Bp);
}

// ---------------------------------------------------------------- miesiące podatkowe

/**
 * Podatki miesiąc po miesiącu od `from` do `to`.
 * - VAT: należny – naliczony; nadwyżka przechodzi na kolejny miesiąc.
 * - PIT: narastająco od stycznia, minus ZUS społeczny, z kwotą zmniejszającą.
 * - Zdrowotna: 9% (dochód – ZUS społeczny) z tego miesiąca, nie mniej niż minimum.
 * Zakres powinien zaczynać się od stycznia, żeby PIT narastająco był poprawny.
 */
export function taxSeries(data: FinanceData, from: Month, to: Month): TaxMonth[] {
  const perMonth = new Map<Month, { revenueNet: number; vatDue: number; vatInput: number; taxCosts: number }>();
  for (const e of data.entries) {
    if (e.type !== 'business_income' && e.type !== 'business_cost') continue;
    const a = computeAmounts(e);
    const m = perMonth.get(e.taxMonth) ?? { revenueNet: 0, vatDue: 0, vatInput: 0, taxCosts: 0 };
    if (e.type === 'business_income') {
      m.revenueNet += a.net;
      m.vatDue += a.vat;
    } else {
      m.vatInput += a.vatDeductible;
      m.taxCosts += a.taxCost;
    }
    perMonth.set(e.taxMonth, m);
  }

  const out: TaxMonth[] = [];
  let vatCarry = 0;
  let incomeCum = 0;
  let socialCum = 0;
  let advancesCum = 0;

  for (const month of monthRange(from, to)) {
    const year = yearOf(month);
    if (monthIndex(month) === 1) {
      incomeCum = 0;
      socialCum = 0;
      advancesCum = 0;
    }
    const r = resolveRates(data.rates, year)?.rates;
    const m = perMonth.get(month) ?? { revenueNet: 0, vatDue: 0, vatInput: 0, taxCosts: 0 };
    const stage = stageFor(data.stages, month);

    const vatCarryIn = vatCarry;
    const vatBalance = m.vatDue - m.vatInput - vatCarryIn;
    const vatPayable = Math.max(0, roundToZl(vatBalance));
    const vatCarryOut = Math.max(0, -vatBalance);
    vatCarry = vatCarryOut;

    const social = r ? socialContribution(stage, r, data.settings.sicknessInsurance) : 0;
    const income = m.revenueNet - m.taxCosts;
    incomeCum += income;
    socialCum += social;
    const pitBaseCum = Math.max(0, roundToZl(incomeCum - socialCum));
    const pitCum = r ? scaleTax(pitBaseCum, r) : 0;
    const pitAdvance = Math.max(0, roundToZl(pitCum - advancesCum));
    advancesCum += pitAdvance;

    // Minimalna zdrowotna obowiązuje w roku składkowym luty–styczeń, więc w styczniu bierzemy minimum z poprzedniego roku.
    const healthRates = monthIndex(month) === 1 ? (resolveRates(data.rates, year - 1)?.rates ?? r) : r;
    const healthBase = Math.max(0, income - social);
    const health = stage === 'none' || !r || !healthRates ? 0 : Math.max(healthRates.healthMin, applyBp(healthBase, r.healthRateBp));

    out.push({
      month,
      stage,
      revenueNet: m.revenueNet,
      vatDue: m.vatDue,
      vatInput: m.vatInput,
      vatCarryIn,
      vatPayable,
      vatCarryOut,
      taxCosts: m.taxCosts,
      social,
      income,
      pitBaseCum,
      pitCum,
      pitAdvance,
      healthBase,
      health,
      total: vatPayable + pitAdvance + social + health,
    });
  }
  return out;
}

// ---------------------------------------------------------------- budżet

function spentIn(entries: Entry[], category: Category, month: Month): number {
  const type: TxType = category.kind === 'business' ? 'business_cost' : 'personal_expense';
  let sum = 0;
  for (const e of entries) {
    if (e.categoryId === category.id && e.cashMonth === month && e.type === type) sum += e.amountGross;
  }
  return sum;
}

/**
 * Saldo przeniesione na `month` (+ naddatek, – dług).
 * Niewydana kwota przechodzi dalej bez limitu, dług najwyżej do 1× limitu.
 */
export function rolloverCarry(entries: Entry[], category: Category, month: Month): number {
  if (!category.rollover || !category.rolloverFrom || category.monthlyLimit === null) return 0;
  const limit = category.monthlyLimit;
  let carry = 0;
  for (let m = category.rolloverFrom; m < month; m = addMonths(m, 1)) {
    carry = Math.max(-limit, carry + limit - spentIn(entries, category, m));
  }
  return carry;
}

export function budgetRows(data: FinanceData, month: Month): BudgetRow[] {
  const rows: BudgetRow[] = [];
  for (const c of data.categories) {
    if (c.kind === 'income') continue;
    const spent = spentIn(data.entries, c, month);
    if (c.archived && spent === 0) continue;
    const carry = rolloverCarry(data.entries, c, month);
    const available = c.monthlyLimit === null ? null : c.monthlyLimit + carry;
    rows.push({
      categoryId: c.id,
      name: c.name,
      kind: c.kind,
      limit: c.monthlyLimit,
      spent,
      carry,
      available,
      remaining: available === null ? null : available - spent,
      rollover: c.rollover,
    });
  }
  // Wydatki bez kategorii też muszą być widoczne.
  for (const kind of ['personal', 'business'] as const) {
    const type: TxType = kind === 'business' ? 'business_cost' : 'personal_expense';
    const spent = data.entries
      .filter((e) => e.categoryId === null && e.cashMonth === month && e.type === type)
      .reduce((s, e) => s + e.amountGross, 0);
    if (spent > 0) {
      rows.push({
        categoryId: null,
        name: 'Bez kategorii',
        kind,
        limit: null,
        spent,
        carry: 0,
        available: null,
        remaining: null,
        rollover: false,
      });
    }
  }
  return rows;
}

// ---------------------------------------------------------------- podsumowanie miesiąca

/**
 * Podsumowanie miesiąca w dwóch widokach:
 * - cash: pieniądze na koncie w tym miesiącu (wpływy, podatki płacone teraz, wydatki),
 * - settlement: rozliczenie firmy za ten miesiąc (faktura z tego miesiąca i podatki od niej).
 *
 * Podatki płacone w miesiącu M: VAT, PIT i ZUS społeczny za M-1 oraz zdrowotna od dochodu z M-2
 * (dochód z sierpnia -> składka za wrzesień -> płatność do 20 października).
 */
export function monthSummary(data: FinanceData, month: Month, series: TaxMonth[]): MonthSummary {
  const byMonth = new Map(series.map((t) => [t.month, t]));
  const prev = byMonth.get(addMonths(month, -1));
  const prev2 = byMonth.get(addMonths(month, -2));
  const current = byMonth.get(month);

  const sum = (pred: (e: Entry) => boolean) => data.entries.filter(pred).reduce((s, e) => s + e.amountGross, 0);

  const taxesPaid = {
    vat: prev?.vatPayable ?? 0,
    pit: prev?.pitAdvance ?? 0,
    social: prev?.social ?? 0,
    health: prev2?.health ?? 0,
    total: 0,
  };
  taxesPaid.total = taxesPaid.vat + taxesPaid.pit + taxesPaid.social + taxesPaid.health;

  const businessIncome = sum((e) => e.type === 'business_income' && e.cashMonth === month);
  const personalIncome = sum((e) => e.type === 'personal_income' && e.cashMonth === month);
  const businessCosts = sum((e) => e.type === 'business_cost' && e.cashMonth === month);
  const personalExpenses = sum((e) => e.type === 'personal_expense' && e.cashMonth === month);
  const recurringPersonal = sum((e) => e.type === 'personal_expense' && e.cashMonth === month && e.recurring);

  const revenueGross = sum((e) => e.type === 'business_income' && e.taxMonth === month);
  const businessCostsGross = sum((e) => e.type === 'business_cost' && e.taxMonth === month);
  const s = {
    vat: current?.vatPayable ?? 0,
    pit: current?.pitAdvance ?? 0,
    social: current?.social ?? 0,
    health: current?.health ?? 0,
  };
  const total = s.vat + s.pit + s.social + s.health;

  const warnings: string[] = [];
  const resolved = resolveRates(data.rates, yearOf(month));
  if (!resolved) warnings.push('Brak stawek podatkowych. Dodaj je w Ustawieniach.');
  else if (resolved.year !== yearOf(month)) {
    warnings.push(`Brak stawek na ${yearOf(month)} r. Używam stawek z ${resolved.year} r. Uzupełnij je w Ustawieniach.`);
  }
  if (data.stages.length === 0) warnings.push('Nie ustawiono etapu ZUS. Ustaw go w Ustawieniach, żeby liczyć składki.');

  return {
    month,
    cash: {
      businessIncome,
      personalIncome,
      taxesPaid,
      businessCosts,
      personalExpenses,
      recurringPersonal,
      balance: businessIncome + personalIncome - taxesPaid.total - businessCosts - personalExpenses,
    },
    settlement: {
      revenueGross,
      revenueNet: current?.revenueNet ?? 0,
      businessCostsGross,
      ...s,
      total,
      stage: current?.stage ?? stageFor(data.stages, month),
      left: revenueGross - businessCostsGross - total,
    },
    budget: budgetRows(data, month),
    warnings,
  };
}
