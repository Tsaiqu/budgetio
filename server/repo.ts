// Dostęp do bazy. Czyste SQL, bez ORM. Kolumny zamieniamy na camelCase aliasami w SELECT.
import type { Database } from 'bun:sqlite';
import { addDays, addMonths, monthOf, todayIso, yearOf, type Month } from '../shared/months';
import type { Settings, TaxRates, ZusStageChange } from '../shared/schemas';
import { CATEGORY_KIND_FOR_TYPE, categoryInput, recurringCreateInput, recurringUpdateInput, transactionInput } from '../shared/schemas';
import type { Category, RecurringItem, RecurringPeriod, Transaction } from '../shared/types';
import { recurringAmountIn } from '../shared/recurring';
import { computeAmounts, expandRecurring, type Entry, type FinanceData } from './domain/finance';
import type { z } from 'zod';

/** Błąd, który pokazujemy użytkownikowi (HTTP 400 / 404 / 409). */
export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const currentMonth = (): Month => monthOf(todayIso());

// ---------------------------------------------------------------- ustawienia

export function getSettings(db: Database): Settings {
  const rows = db.query<{ key: string; value: string }, []>('SELECT key, value FROM settings').all();
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    defaultVatRate: Number(map.defaultVatRate ?? 23),
    sicknessInsurance: map.sicknessInsurance !== 'false',
    paymentTermDays: Number(map.paymentTermDays ?? 7),
  };
}

export function saveSettings(db: Database, s: Settings): void {
  const stmt = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value');
  db.transaction(() => {
    for (const [key, value] of Object.entries(s)) stmt.run(key, String(value));
  })();
}

// ---------------------------------------------------------------- stawki i etapy ZUS

const RATE_COLUMNS = `zus_full_base AS zusFullBase, zus_pref_base AS zusPrefBase, pension_rate_bp AS pensionRateBp,
  disability_rate_bp AS disabilityRateBp, accident_rate_bp AS accidentRateBp, sickness_rate_bp AS sicknessRateBp,
  labor_fund_rate_bp AS laborFundRateBp, health_rate_bp AS healthRateBp, health_min AS healthMin,
  pit_rate1_bp AS pitRate1Bp, pit_rate2_bp AS pitRate2Bp, pit_threshold AS pitThreshold, pit_reduction AS pitReduction`;

export function getRates(db: Database): Record<number, TaxRates> {
  const rows = db.query<TaxRates & { year: number }, []>(`SELECT year, ${RATE_COLUMNS} FROM tax_rates ORDER BY year`).all();
  return Object.fromEntries(rows.map(({ year, ...r }) => [year, r]));
}

export function upsertRates(db: Database, year: number, r: TaxRates): void {
  db.prepare(
    `INSERT INTO tax_rates VALUES ($year, $zusFullBase, $zusPrefBase, $pensionRateBp, $disabilityRateBp, $accidentRateBp,
      $sicknessRateBp, $laborFundRateBp, $healthRateBp, $healthMin, $pitRate1Bp, $pitRate2Bp, $pitThreshold, $pitReduction)
     ON CONFLICT (year) DO UPDATE SET
      zus_full_base = excluded.zus_full_base, zus_pref_base = excluded.zus_pref_base,
      pension_rate_bp = excluded.pension_rate_bp, disability_rate_bp = excluded.disability_rate_bp,
      accident_rate_bp = excluded.accident_rate_bp, sickness_rate_bp = excluded.sickness_rate_bp,
      labor_fund_rate_bp = excluded.labor_fund_rate_bp, health_rate_bp = excluded.health_rate_bp,
      health_min = excluded.health_min, pit_rate1_bp = excluded.pit_rate1_bp, pit_rate2_bp = excluded.pit_rate2_bp,
      pit_threshold = excluded.pit_threshold, pit_reduction = excluded.pit_reduction`,
  ).run({ year, ...r });
}

export function getStages(db: Database): ZusStageChange[] {
  return db.query<ZusStageChange, []>('SELECT month, stage FROM zus_stage_changes ORDER BY month').all();
}

export function replaceStages(db: Database, stages: ZusStageChange[]): void {
  const months = stages.map((s) => s.month);
  if (new Set(months).size !== months.length) throw new AppError(400, 'Każdy miesiąc może mieć tylko jedną zmianę etapu ZUS.');
  db.transaction(() => {
    db.exec('DELETE FROM zus_stage_changes');
    const stmt = db.prepare('INSERT INTO zus_stage_changes (month, stage) VALUES (?, ?)');
    for (const s of stages) stmt.run(s.month, s.stage);
  })();
}

// ---------------------------------------------------------------- kategorie

interface CategoryRow extends Omit<Category, 'rollover' | 'archived'> {
  rollover: number;
  archived: number;
}

export function listCategories(db: Database): Category[] {
  return db
    .query<CategoryRow, []>(
      `SELECT id, name, kind, monthly_limit AS monthlyLimit, rollover, rollover_from AS rolloverFrom, archived
       FROM categories ORDER BY sort_order, name`,
    )
    .all()
    .map((r) => ({ ...r, rollover: r.rollover === 1, archived: r.archived === 1 }));
}

function getCategory(db: Database, id: number): Category | undefined {
  return listCategories(db).find((c) => c.id === id);
}

export function createCategory(db: Database, raw: unknown): Category {
  const c = categoryInput.parse(raw);
  const sortOrder =
    db.query<{ m: number | null }, [string]>('SELECT MAX(sort_order) AS m FROM categories WHERE kind = ?').get(c.kind)?.m ?? 0;
  try {
    const res = db
      .prepare(
        `INSERT INTO categories (name, kind, monthly_limit, rollover, rollover_from, archived, sort_order)
         VALUES (?, ?, ?, ?, ?, 0, ?)`,
      )
      .run(c.name, c.kind, c.monthlyLimit, c.rollover ? 1 : 0, c.rollover ? currentMonth() : null, sortOrder + 1);
    return getCategory(db, Number(res.lastInsertRowid))!;
  } catch (e) {
    if (String(e).includes('UNIQUE')) throw new AppError(409, `Kategoria „${c.name}” już istnieje.`);
    throw e;
  }
}

export function updateCategory(db: Database, id: number, raw: unknown): Category {
  const c = categoryInput.parse(raw);
  const existing = getCategory(db, id);
  if (!existing) throw new AppError(404, 'Nie ma takiej kategorii.');
  if (existing.kind !== c.kind) throw new AppError(400, 'Nie można zmienić rodzaju kategorii.');
  // Przenoszenie salda liczymy od miesiąca, w którym je włączono.
  const rolloverFrom = c.rollover ? (existing.rollover ? existing.rolloverFrom : currentMonth()) : null;
  try {
    db.prepare('UPDATE categories SET name = ?, monthly_limit = ?, rollover = ?, rollover_from = ?, archived = ? WHERE id = ?').run(
      c.name,
      c.monthlyLimit,
      c.rollover ? 1 : 0,
      rolloverFrom,
      c.archived ? 1 : 0,
      id,
    );
  } catch (e) {
    if (String(e).includes('UNIQUE')) throw new AppError(409, `Kategoria „${c.name}” już istnieje.`);
    throw e;
  }
  return getCategory(db, id)!;
}

function assertCategoryFits(db: Database, categoryId: number | null, type: keyof typeof CATEGORY_KIND_FOR_TYPE): void {
  if (categoryId === null) return;
  const c = getCategory(db, categoryId);
  if (!c) throw new AppError(400, 'Wybrana kategoria nie istnieje.');
  if (c.kind !== CATEGORY_KIND_FOR_TYPE[type]) throw new AppError(400, `Kategoria „${c.name}” nie pasuje do tego typu.`);
}

// ---------------------------------------------------------------- transakcje

type TxRow = Omit<Transaction, 'net' | 'vat' | 'vatDeductible' | 'taxCost'>;

const TX_SELECT = `SELECT id, type, description, category_id AS categoryId, amount_gross AS amountGross, vat_rate AS vatRate,
  vat_deductible_pct AS vatDeductiblePct, tax_cost_pct AS taxCostPct, invoice_date AS invoiceDate, payment_date AS paymentDate
  FROM transactions`;

const withAmounts = (r: TxRow): Transaction => ({ ...r, ...computeAmounts(r) });

/** Transakcje, które dotyczą miesiąca: faktura LUB płatność w tym miesiącu. */
export function listTransactions(db: Database, month?: Month): Transaction[] {
  const rows = month
    ? db
        .query<TxRow, [string, string]>(
          `${TX_SELECT} WHERE substr(invoice_date, 1, 7) = ? OR substr(payment_date, 1, 7) = ?
          ORDER BY invoice_date DESC, id DESC`,
        )
        .all(month, month)
    : db.query<TxRow, []>(`${TX_SELECT} ORDER BY invoice_date DESC, id DESC`).all();
  return rows.map(withAmounts);
}

function getTransaction(db: Database, id: number): Transaction {
  const row = db.query<TxRow, [number]>(`${TX_SELECT} WHERE id = ?`).get(id);
  if (!row) throw new AppError(404, 'Nie ma takiej transakcji.');
  return withAmounts(row);
}

/** Uzupełnia brakujące pola wartościami domyślnymi i zeruje VAT dla pozycji prywatnych. */
function resolveTransaction(input: z.output<typeof transactionInput>, settings: Settings) {
  const business = input.type === 'business_income' || input.type === 'business_cost';
  const cost = input.type === 'business_cost';
  const paymentDate =
    input.paymentDate ?? (input.type === 'business_income' ? addDays(input.invoiceDate, settings.paymentTermDays) : input.invoiceDate);
  return {
    ...input,
    vatRate: business ? (input.vatRate ?? settings.defaultVatRate) : 0,
    vatDeductiblePct: cost ? input.vatDeductiblePct : 100,
    taxCostPct: cost ? input.taxCostPct : 100,
    paymentDate,
  };
}

export function saveTransaction(db: Database, raw: unknown, id?: number): Transaction {
  const t = resolveTransaction(transactionInput.parse(raw), getSettings(db));
  assertCategoryFits(db, t.categoryId, t.type);
  const params = [
    t.type,
    t.description,
    t.categoryId,
    t.amountGross,
    t.vatRate,
    t.vatDeductiblePct,
    t.taxCostPct,
    t.invoiceDate,
    t.paymentDate,
  ];
  if (id === undefined) {
    const res = db
      .prepare(
        `INSERT INTO transactions (type, description, category_id, amount_gross, vat_rate, vat_deductible_pct, tax_cost_pct, invoice_date, payment_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(...params);
    return getTransaction(db, Number(res.lastInsertRowid));
  }
  getTransaction(db, id); // 404, gdy nie istnieje
  db.prepare(
    `UPDATE transactions SET type = ?, description = ?, category_id = ?, amount_gross = ?, vat_rate = ?, vat_deductible_pct = ?,
     tax_cost_pct = ?, invoice_date = ?, payment_date = ? WHERE id = ?`,
  ).run(...params, id);
  return getTransaction(db, id);
}

export function deleteTransaction(db: Database, id: number): void {
  const res = db.prepare('DELETE FROM transactions WHERE id = ?').run(id);
  if (res.changes === 0) throw new AppError(404, 'Nie ma takiej transakcji.');
}

// ---------------------------------------------------------------- koszty stałe

type RecurringRow = Omit<RecurringItem, 'periods' | 'status' | 'currentAmount'>;

function periodsOf(db: Database, itemId: number): RecurringPeriod[] {
  return db
    .query<RecurringPeriod, [number]>(
      `SELECT id, start_month AS startMonth, end_month AS endMonth, amount_gross AS amountGross
       FROM recurring_periods WHERE item_id = ? ORDER BY start_month`,
    )
    .all(itemId);
}

function toItem(db: Database, row: RecurringRow): RecurringItem {
  const periods = periodsOf(db, row.id);
  const now = currentMonth();
  const last = periods[periods.length - 1];
  const status: RecurringItem['status'] =
    recurringAmountIn(periods, now) > 0 ? 'active' : periods.some((p) => p.startMonth > now) ? 'planned' : 'stopped';
  return { ...row, periods, status, currentAmount: last?.amountGross ?? 0 };
}

const RECURRING_SELECT = `SELECT id, name, type, category_id AS categoryId, vat_rate AS vatRate, vat_deductible_pct AS vatDeductiblePct,
  tax_cost_pct AS taxCostPct, payment_day AS paymentDay FROM recurring_items`;

export function listRecurring(db: Database): RecurringItem[] {
  return db
    .query<RecurringRow, []>(`${RECURRING_SELECT} ORDER BY name`)
    .all()
    .map((r) => toItem(db, r));
}

function getRecurring(db: Database, id: number): RecurringItem {
  const row = db.query<RecurringRow, [number]>(`${RECURRING_SELECT} WHERE id = ?`).get(id);
  if (!row) throw new AppError(404, 'Nie ma takiego kosztu stałego.');
  return toItem(db, row);
}

function itemFields(r: { type: string; vatRate: number; vatDeductiblePct: number; taxCostPct: number }) {
  const business = r.type === 'business_cost';
  return {
    vatRate: business ? r.vatRate : 0,
    vatDeductiblePct: business ? r.vatDeductiblePct : 100,
    taxCostPct: business ? r.taxCostPct : 100,
  };
}

export function createRecurring(db: Database, raw: unknown): RecurringItem {
  const r = recurringCreateInput.parse(raw);
  assertCategoryFits(db, r.categoryId, r.type);
  const f = itemFields(r);
  const id = db.transaction(() => {
    const res = db
      .prepare(
        `INSERT INTO recurring_items (name, type, category_id, vat_rate, vat_deductible_pct, tax_cost_pct, payment_day)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(r.name, r.type, r.categoryId, f.vatRate, f.vatDeductiblePct, f.taxCostPct, r.paymentDay);
    const itemId = Number(res.lastInsertRowid);
    db.prepare('INSERT INTO recurring_periods (item_id, start_month, amount_gross) VALUES (?, ?, ?)').run(
      itemId,
      r.startMonth,
      r.amountGross,
    );
    return itemId;
  })();
  return getRecurring(db, id);
}

/**
 * Zmiana danych kosztu stałego. Nowa kwota obowiązuje od `effectiveFrom`:
 * bieżący okres kończy się miesiąc wcześniej i zaczyna się nowy – historia zostaje bez zmian.
 */
export function updateRecurring(db: Database, id: number, raw: unknown): RecurringItem {
  const r = recurringUpdateInput.parse(raw);
  const item = getRecurring(db, id);
  if (item.type !== r.type) throw new AppError(400, 'Nie można zmienić typu kosztu stałego.');
  assertCategoryFits(db, r.categoryId, r.type);
  const f = itemFields(r);
  const last = item.periods[item.periods.length - 1];

  db.transaction(() => {
    db.prepare(
      'UPDATE recurring_items SET name = ?, category_id = ?, vat_rate = ?, vat_deductible_pct = ?, tax_cost_pct = ?, payment_day = ? WHERE id = ?',
    ).run(r.name, r.categoryId, f.vatRate, f.vatDeductiblePct, f.taxCostPct, r.paymentDay, id);

    if (last && last.amountGross !== r.amountGross) {
      if (r.effectiveFrom <= last.startMonth) {
        db.prepare('UPDATE recurring_periods SET amount_gross = ? WHERE id = ?').run(r.amountGross, last.id);
      } else if (last.endMonth === null || r.effectiveFrom <= last.endMonth) {
        db.prepare('UPDATE recurring_periods SET end_month = ? WHERE id = ?').run(addMonths(r.effectiveFrom, -1), last.id);
        db.prepare('INSERT INTO recurring_periods (item_id, start_month, end_month, amount_gross) VALUES (?, ?, ?, ?)').run(
          id,
          r.effectiveFrom,
          last.endMonth,
          r.amountGross,
        );
      } else {
        throw new AppError(400, 'Ten koszt jest wstrzymany. Nową kwotę ustawisz przy wznowieniu.');
      }
    }
  })();
  return getRecurring(db, id);
}

/** Wstrzymanie: `month` to ostatni miesiąc, w którym koszt jeszcze obowiązuje. */
export function stopRecurring(db: Database, id: number, month: Month): RecurringItem {
  const item = getRecurring(db, id);
  const last = item.periods[item.periods.length - 1];
  if (!last || (last.endMonth !== null && last.endMonth <= month)) throw new AppError(400, 'Ten koszt jest już wstrzymany.');
  if (month < last.startMonth) throw new AppError(400, 'Ostatni miesiąc nie może być przed początkiem okresu.');
  db.prepare('UPDATE recurring_periods SET end_month = ? WHERE id = ?').run(month, last.id);
  return getRecurring(db, id);
}

/** Wznowienie od `month` – nowy okres. Kwota: podana albo taka jak ostatnio. */
export function resumeRecurring(db: Database, id: number, month: Month, amountGross?: number): RecurringItem {
  const item = getRecurring(db, id);
  const last = item.periods[item.periods.length - 1];
  if (!last || last.endMonth === null) throw new AppError(400, 'Ten koszt nie jest wstrzymany.');
  if (month <= last.endMonth) throw new AppError(400, 'Wznowienie musi być po ostatnim opłaconym miesiącu.');
  db.prepare('INSERT INTO recurring_periods (item_id, start_month, amount_gross) VALUES (?, ?, ?)').run(
    id,
    month,
    amountGross ?? last.amountGross,
  );
  return getRecurring(db, id);
}

export function deleteRecurring(db: Database, id: number): void {
  const res = db.prepare('DELETE FROM recurring_items WHERE id = ?').run(id);
  if (res.changes === 0) throw new AppError(404, 'Nie ma takiego kosztu stałego.');
}

// ---------------------------------------------------------------- dane do obliczeń

/** Wszystko, czego potrzebują obliczenia, z kosztami stałymi rozwiniętymi do miesiąca `to`. */
export function loadFinanceData(db: Database, to: Month): { data: FinanceData; from: Month } {
  const transactions = db.query<TxRow, []>(TX_SELECT).all();
  const recurring = listRecurring(db);
  const stages = getStages(db);

  const months = [
    ...transactions.flatMap((t) => [monthOf(t.invoiceDate), monthOf(t.paymentDate)]),
    ...recurring.flatMap((r) => r.periods.map((p) => p.startMonth)),
    ...stages.map((s) => s.month),
    addMonths(to, -2),
  ];
  const earliest = months.reduce((min, m) => (m < min ? m : min));
  const from = `${yearOf(earliest)}-01`;

  const entries: Entry[] = [
    ...transactions.map((t) => ({
      type: t.type,
      categoryId: t.categoryId,
      amountGross: t.amountGross,
      vatRate: t.vatRate,
      vatDeductiblePct: t.vatDeductiblePct,
      taxCostPct: t.taxCostPct,
      taxMonth: monthOf(t.invoiceDate),
      cashMonth: monthOf(t.paymentDate),
      recurring: false,
    })),
    ...expandRecurring(recurring, from, to),
  ];

  return {
    data: { entries, categories: listCategories(db), stages, rates: getRates(db), settings: getSettings(db) },
    from,
  };
}
