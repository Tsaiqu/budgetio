// Schematy wejścia do API. Serwer nimi waliduje, front bierze z nich typy formularzy.
// Zmiana pola tutaj od razu psuje kompilację po obu stronach – i o to chodzi.
import { z } from 'zod';

export const TX_TYPES = ['business_income', 'business_cost', 'personal_income', 'personal_expense'] as const;
export type TxType = (typeof TX_TYPES)[number];

export const RECURRING_TYPES = ['business_cost', 'personal_expense'] as const;
export type RecurringType = (typeof RECURRING_TYPES)[number];

export const CATEGORY_KINDS = ['income', 'personal', 'business'] as const;
export type CategoryKind = (typeof CATEGORY_KINDS)[number];

export const ZUS_STAGES = ['none', 'start_relief', 'preferential', 'full'] as const;
export type ZusStage = (typeof ZUS_STAGES)[number];

/** Jaka kategoria pasuje do jakiego typu transakcji. */
export const CATEGORY_KIND_FOR_TYPE: Record<TxType, CategoryKind> = {
  business_income: 'income',
  personal_income: 'income',
  business_cost: 'business',
  personal_expense: 'personal',
};

const isoDate = z.iso.date();
export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Miesiąc w formacie RRRR-MM');
const grosze = z.number().int().positive().max(2_000_000_000);
const percent = z.number().int().min(0).max(100);
const id = z.number().int().positive();

export const transactionInput = z.object({
  type: z.enum(TX_TYPES),
  description: z.string().trim().max(200).default(''),
  categoryId: id.nullable(),
  amountGross: grosze,
  /** null = domyślna stawka z ustawień (przychód firmowy) albo 0 */
  vatRate: percent.nullable(),
  vatDeductiblePct: percent.default(100),
  taxCostPct: percent.default(100),
  /** Data faktury / zakupu – decyduje o miesiącu podatkowym. */
  invoiceDate: isoDate,
  /** Data wpływu / płatności – decyduje o budżecie. null = serwer wylicza. */
  paymentDate: isoDate.nullable(),
});
export type TransactionInput = z.input<typeof transactionInput>;

export const categoryInput = z.object({
  name: z.string().trim().min(1).max(60),
  kind: z.enum(CATEGORY_KINDS),
  monthlyLimit: z.number().int().min(0).max(2_000_000_000).nullable(),
  rollover: z.boolean().default(false),
  archived: z.boolean().default(false),
});
export type CategoryInput = z.input<typeof categoryInput>;

const recurringBase = z.object({
  name: z.string().trim().min(1).max(100),
  type: z.enum(RECURRING_TYPES),
  categoryId: id.nullable(),
  amountGross: grosze,
  vatRate: percent.default(0),
  vatDeductiblePct: percent.default(100),
  taxCostPct: percent.default(100),
  paymentDay: z.number().int().min(1).max(31).nullable(),
});

export const recurringCreateInput = recurringBase.extend({
  /** Pierwszy miesiąc, w którym koszt obowiązuje. */
  startMonth: monthSchema,
});
export type RecurringCreateInput = z.input<typeof recurringCreateInput>;

export const recurringUpdateInput = recurringBase.extend({
  /** Od kiedy obowiązuje nowa kwota (gdy kwota się zmienia). Wcześniejsze miesiące zostają bez zmian. */
  effectiveFrom: monthSchema,
});
export type RecurringUpdateInput = z.input<typeof recurringUpdateInput>;

export const monthInput = z.object({ month: monthSchema });

export const settingsInput = z.object({
  defaultVatRate: percent,
  sicknessInsurance: z.boolean(),
  paymentTermDays: z.number().int().min(0).max(120),
});
export type Settings = z.infer<typeof settingsInput>;

export const taxRatesInput = z.object({
  zusFullBase: z.number().int().min(0),
  zusPrefBase: z.number().int().min(0),
  pensionRateBp: z.number().int().min(0).max(10000),
  disabilityRateBp: z.number().int().min(0).max(10000),
  accidentRateBp: z.number().int().min(0).max(10000),
  sicknessRateBp: z.number().int().min(0).max(10000),
  laborFundRateBp: z.number().int().min(0).max(10000),
  healthRateBp: z.number().int().min(0).max(10000),
  healthMin: z.number().int().min(0),
  pitRate1Bp: z.number().int().min(0).max(10000),
  pitRate2Bp: z.number().int().min(0).max(10000),
  pitThreshold: z.number().int().min(0),
  pitReduction: z.number().int().min(0),
});
/** Stawki na rok. Procenty w punktach bazowych (1952 = 19,52%), kwoty w groszach. */
export type TaxRates = z.infer<typeof taxRatesInput>;

export const zusStagesInput = z.array(z.object({ month: monthSchema, stage: z.enum(ZUS_STAGES) })).max(60);
export type ZusStageChange = z.infer<typeof zusStagesInput>[number];
