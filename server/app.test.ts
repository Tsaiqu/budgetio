// Testy API na bazie w pamięci: migracje, zapis i najważniejsze reguły.
import { describe, expect, test } from 'bun:test';
import { buildApp } from './app';
import { migrate, openDatabase } from './db';
import type { Category, MonthSummary, RecurringItem, Transaction } from '../shared/types';

function setup() {
  const db = openDatabase(':memory:');
  migrate(db);
  return buildApp(db);
}

async function call<T>(app: ReturnType<typeof setup>, method: string, url: string, payload?: unknown) {
  const res = await app.inject({ method: method as 'GET', url, payload: payload as object });
  return { status: res.statusCode, body: (res.body ? res.json() : null) as T };
}

describe('API', () => {
  test('migracje tworzą kategorie i stawki 2026', async () => {
    const app = setup();
    const { body } = await call<{ categories: Category[]; taxRateYears: number[] }>(app, 'GET', '/api/meta');
    expect(body.categories.length).toBeGreaterThan(10);
    expect(body.taxRateYears).toEqual([2026]);
  });

  test('przychód firmowy bez daty wpływu: data faktury + termin płatności, VAT domyślny', async () => {
    const app = setup();
    const { status, body } = await call<Transaction>(app, 'POST', '/api/transactions', {
      type: 'business_income',
      description: 'Faktura za październik',
      categoryId: 1,
      amountGross: 1230000,
      vatRate: null,
      invoiceDate: '2026-10-30',
      paymentDate: null,
    });
    expect(status).toBe(201);
    expect(body.paymentDate).toBe('2026-11-06');
    expect(body.vatRate).toBe(23);
    expect(body.net).toBe(1000000);
  });

  test('kategoria musi pasować do typu', async () => {
    const app = setup();
    const { status } = await call(app, 'POST', '/api/transactions', {
      type: 'personal_expense',
      categoryId: 1, // Faktura B2B – kategoria przychodu
      amountGross: 100,
      vatRate: null,
      invoiceDate: '2026-10-01',
      paymentDate: null,
    });
    expect(status).toBe(400);
  });

  test('koszt stały: zmiana kwoty od stycznia nie zmienia grudnia, wstrzymanie i wznowienie', async () => {
    const app = setup();
    const { body: item } = await call<RecurringItem>(app, 'POST', '/api/recurring', {
      name: 'Czynsz',
      type: 'personal_expense',
      categoryId: 4,
      amountGross: 95000,
      paymentDay: 10,
      startMonth: '2026-10',
    });
    const { body: changed } = await call<RecurringItem>(app, 'PUT', `/api/recurring/${item.id}`, {
      name: 'Czynsz',
      type: 'personal_expense',
      categoryId: 4,
      amountGross: 100000,
      paymentDay: 10,
      effectiveFrom: '2027-01',
    });
    expect(changed.periods.map((p) => [p.startMonth, p.endMonth, p.amountGross])).toEqual([
      ['2026-10', '2026-12', 95000],
      ['2027-01', null, 100000],
    ]);

    await call(app, 'POST', `/api/recurring/${item.id}/stop`, { month: '2027-03' });
    const { body: resumed } = await call<RecurringItem>(app, 'POST', `/api/recurring/${item.id}/resume`, { month: '2027-06' });
    expect(resumed.periods.at(-1)).toMatchObject({ startMonth: '2027-06', endMonth: null, amountGross: 100000 });

    const dec = await call<MonthSummary>(app, 'GET', '/api/summary?month=2026-12');
    const apr = await call<MonthSummary>(app, 'GET', '/api/summary?month=2027-04');
    expect(dec.body.cash.personalExpenses).toBe(95000);
    expect(apr.body.cash.personalExpenses).toBe(0);
  });

  test('błędne dane zwracają 400 z opisem', async () => {
    const app = setup();
    const { status, body } = await call<{ error: string }>(app, 'POST', '/api/transactions', { type: 'nope' });
    expect(status).toBe(400);
    expect(body.error.length).toBeGreaterThan(0);
  });
});
