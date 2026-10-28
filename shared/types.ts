// Typy odpowiedzi API. Kwoty w groszach, miesiące jako 'YYYY-MM', daty jako 'YYYY-MM-DD'.
import type { CategoryKind, RecurringType, Settings, TaxRates, TxType, ZusStage, ZusStageChange } from './schemas';
import type { IsoDate, Month } from './months';

export interface Category {
  id: number;
  name: string;
  kind: CategoryKind;
  monthlyLimit: number | null;
  rollover: boolean;
  /** Miesiąc, od którego liczymy przenoszenie salda (ustawiany przy włączeniu). */
  rolloverFrom: Month | null;
  archived: boolean;
}

export interface Transaction {
  id: number;
  type: TxType;
  description: string;
  categoryId: number | null;
  amountGross: number;
  vatRate: number;
  vatDeductiblePct: number;
  taxCostPct: number;
  invoiceDate: IsoDate;
  paymentDate: IsoDate;
  // wartości wyliczone
  net: number;
  vat: number;
  vatDeductible: number;
  taxCost: number;
}

export interface RecurringPeriod {
  id: number;
  startMonth: Month;
  /** null = trwa bez końca */
  endMonth: Month | null;
  amountGross: number;
}

export interface RecurringItem {
  id: number;
  name: string;
  type: RecurringType;
  categoryId: number | null;
  vatRate: number;
  vatDeductiblePct: number;
  taxCostPct: number;
  paymentDay: number | null;
  periods: RecurringPeriod[];
  /** Stan w bieżącym miesiącu */
  status: 'active' | 'stopped' | 'planned';
  /** Kwota z ostatniego okresu */
  currentAmount: number;
}

export interface Meta {
  categories: Category[];
  settings: Settings;
  zusStages: ZusStageChange[];
  taxRateYears: number[];
}

export interface TaxMonth {
  month: Month;
  stage: ZusStage;
  revenueNet: number;
  vatDue: number;
  vatInput: number;
  vatCarryIn: number;
  vatPayable: number;
  vatCarryOut: number;
  taxCosts: number;
  social: number;
  income: number;
  pitBaseCum: number;
  pitCum: number;
  pitAdvance: number;
  healthBase: number;
  health: number;
  /** VAT + PIT + ZUS społeczny + zdrowotna za ten miesiąc */
  total: number;
}

export interface TaxYear {
  year: number;
  months: TaxMonth[];
  /** Rok, z którego wzięto stawki (gdy brak stawek na ten rok). */
  ratesYear: number | null;
}

export interface BudgetRow {
  categoryId: number | null;
  name: string;
  kind: 'personal' | 'business';
  limit: number | null;
  spent: number;
  /** Saldo przeniesione z poprzednich miesięcy (+ naddatek, – dług). */
  carry: number;
  /** limit + carry */
  available: number | null;
  remaining: number | null;
  rollover: boolean;
}

export interface MonthSummary {
  month: Month;
  /** Pieniądze na koncie w tym miesiącu (wg daty wpływu / płatności). */
  cash: {
    businessIncome: number;
    personalIncome: number;
    taxesPaid: { vat: number; pit: number; social: number; health: number; total: number };
    businessCosts: number;
    personalExpenses: number;
    recurringPersonal: number;
    balance: number;
  };
  /** Rozliczenie firmy za ten miesiąc (wg daty faktury). Płacisz w kolejnych miesiącach. */
  settlement: {
    revenueGross: number;
    revenueNet: number;
    businessCostsGross: number;
    vat: number;
    pit: number;
    social: number;
    health: number;
    total: number;
    stage: ZusStage;
    /** Ile zostaje z faktury po odłożeniu podatków i kosztach firmowych. */
    left: number;
  };
  budget: BudgetRow[];
  warnings: string[];
}

export type { Settings, TaxRates, ZusStageChange };
