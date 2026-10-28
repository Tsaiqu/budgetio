// Testy obliczeń. Liczby sprawdzone z arkuszem Excel (Planner_budzetowy_JDG_2026.xlsx).
import { describe, expect, test } from 'bun:test';
import type { Category } from '../../shared/types';
import type { TaxRates } from '../../shared/schemas';
import {
  computeAmounts,
  expandRecurring,
  monthSummary,
  rolloverCarry,
  scaleTax,
  socialContribution,
  taxSeries,
  type Entry,
  type FinanceData,
} from './finance';

const RATES_2026: TaxRates = {
  zusFullBase: 565200,
  zusPrefBase: 144180,
  pensionRateBp: 1952,
  disabilityRateBp: 800,
  accidentRateBp: 167,
  sicknessRateBp: 245,
  laborFundRateBp: 245,
  healthRateBp: 900,
  healthMin: 43254,
  pitRate1Bp: 1200,
  pitRate2Bp: 3200,
  pitThreshold: 12000000,
  pitReduction: 360000,
};

function entry(partial: Partial<Entry> & Pick<Entry, 'type' | 'amountGross' | 'taxMonth'>): Entry {
  return {
    categoryId: null,
    vatRate: partial.type.startsWith('business') ? 23 : 0,
    vatDeductiblePct: 100,
    taxCostPct: 100,
    cashMonth: partial.taxMonth,
    recurring: false,
    ...partial,
  };
}

function data(entries: Entry[], extra: Partial<FinanceData> = {}): FinanceData {
  return {
    entries,
    categories: [],
    stages: [{ month: '2026-08', stage: 'start_relief' }],
    rates: { 2026: RATES_2026 },
    settings: { defaultVatRate: 23, sicknessInsurance: true, paymentTermDays: 7 },
    ...extra,
  };
}

describe('computeAmounts', () => {
  test('bilet PKP z VAT 8%', () => {
    expect(computeAmounts(entry({ type: 'business_cost', amountGross: 32000, vatRate: 8, taxMonth: '2026-10' }))).toEqual({
      net: 29630,
      vat: 2370,
      vatDeductible: 2370,
      taxCost: 29630,
    });
  });

  test('paliwo do auta mieszanego: 50% VAT, 75% w kosztach', () => {
    const a = computeAmounts(
      entry({ type: 'business_cost', amountGross: 30000, vatRate: 23, vatDeductiblePct: 50, taxCostPct: 75, taxMonth: '2026-10' }),
    );
    expect(a).toEqual({ net: 24390, vat: 5610, vatDeductible: 2805, taxCost: 20396 });
  });

  test('wydatek prywatny nie ma VAT', () => {
    expect(computeAmounts(entry({ type: 'personal_expense', amountGross: 9999, taxMonth: '2026-10' }))).toEqual({
      net: 9999,
      vat: 0,
      vatDeductible: 0,
      taxCost: 0,
    });
  });
});

describe('ZUS i PIT', () => {
  test('składki społeczne 2026', () => {
    expect(socialContribution('full', RATES_2026, true)).toBe(192676);
    expect(socialContribution('preferential', RATES_2026, true)).toBe(45618);
    expect(socialContribution('start_relief', RATES_2026, true)).toBe(0);
  });

  test('skala podatkowa', () => {
    expect(scaleTax(3000000, RATES_2026)).toBe(0); // kwota wolna 30 000 zł
    expect(scaleTax(10000000, RATES_2026)).toBe(840000); // 12% z 100 000 – 3 600
    expect(scaleTax(13000000, RATES_2026)).toBe(1080000 + 320000); // 10 800 + 32% z 10 000
  });
});

describe('taxSeries + monthSummary', () => {
  // Faktury po 12 300 zł brutto za wrzesień i październik, bilety PKP i MPK w październiku.
  const entries = [
    entry({ type: 'business_income', amountGross: 1230000, taxMonth: '2026-09', cashMonth: '2026-10' }),
    entry({ type: 'business_income', amountGross: 1230000, taxMonth: '2026-10', cashMonth: '2026-11' }),
    entry({ type: 'business_cost', amountGross: 32000, vatRate: 8, taxMonth: '2026-10' }),
    entry({ type: 'business_cost', amountGross: 3000, vatRate: 8, taxMonth: '2026-10' }),
  ];
  const d = data(entries);
  const series = taxSeries(d, '2026-01', '2026-12');
  const sep = series[8];
  const oct = series[9];

  test('wrzesień: VAT 2300 zł, zdrowotna 900 zł, PIT 0 (kwota wolna)', () => {
    expect(sep.revenueNet).toBe(1000000);
    expect(sep.vatPayable).toBe(230000);
    expect(sep.health).toBe(90000);
    expect(sep.pitAdvance).toBe(0);
    expect(sep.social).toBe(0);
  });

  test('październik: VAT pomniejszony o VAT z biletów, zdrowotna od dochodu po kosztach', () => {
    expect(oct.vatInput).toBe(2592);
    expect(oct.vatPayable).toBe(227400);
    expect(oct.health).toBe(87083);
  });

  test('sierpień bez przychodu: minimalna zdrowotna', () => {
    expect(series[7].health).toBe(43254);
    expect(series[6].health).toBe(0); // lipiec – brak działalności
  });

  test('pieniądze w październiku: wpływ za wrzesień, VAT za wrzesień, zdrowotna od dochodu z sierpnia', () => {
    const s = monthSummary(d, '2026-10', series);
    expect(s.cash.businessIncome).toBe(1230000);
    expect(s.cash.taxesPaid.vat).toBe(230000);
    expect(s.cash.taxesPaid.health).toBe(43254);
    expect(s.cash.businessCosts).toBe(35000);
    expect(s.settlement.revenueGross).toBe(1230000);
    expect(s.settlement.total).toBe(227400 + 87083);
  });

  test('pieniądze w listopadzie: wpływ za październik, zdrowotna od dochodu z września', () => {
    const s = monthSummary(d, '2026-11', series);
    expect(s.cash.businessIncome).toBe(1230000);
    expect(s.cash.taxesPaid.vat).toBe(227400);
    expect(s.cash.taxesPaid.health).toBe(90000);
  });

  test('nadwyżka VAT przechodzi na następny miesiąc', () => {
    const s = taxSeries(
      data([
        entry({ type: 'business_cost', amountGross: 12300, taxMonth: '2026-03' }), // VAT naliczony 23 zł
        entry({ type: 'business_income', amountGross: 24600, taxMonth: '2026-04' }), // VAT należny 46 zł
      ]),
      '2026-01',
      '2026-04',
    );
    expect(s[2].vatCarryOut).toBe(2300);
    expect(s[3].vatCarryIn).toBe(2300);
    expect(s[3].vatPayable).toBe(2300);
  });
});

describe('koszty stałe z okresami', () => {
  const item = {
    type: 'personal_expense' as const,
    categoryId: 1,
    vatRate: 0,
    vatDeductiblePct: 100,
    taxCostPct: 100,
    periods: [
      { id: 1, startMonth: '2026-10', endMonth: '2026-11', amountGross: 3499 },
      { id: 2, startMonth: '2027-02', endMonth: null, amountGross: 3999 }, // wznowiona po przerwie, nowa cena
    ],
  };

  test('przerwa i wznowienie', () => {
    const out = expandRecurring([item], '2026-09', '2027-03');
    expect(out.map((e) => [e.cashMonth, e.amountGross])).toEqual([
      ['2026-10', 3499],
      ['2026-11', 3499],
      ['2027-02', 3999],
      ['2027-03', 3999],
    ]);
  });
});

describe('przenoszenie budżetu (rollover)', () => {
  const mpk: Category = {
    id: 7,
    name: 'Transport prywatny',
    kind: 'personal',
    monthlyLimit: 3000,
    rollover: true,
    rolloverFrom: '2026-10',
    archived: false,
  };
  const spend = (month: string, amountGross: number) => entry({ type: 'personal_expense', amountGross, taxMonth: month, categoryId: 7 });

  test('niewydane 5 zł przechodzi jako naddatek', () => {
    expect(rolloverCarry([spend('2026-10', 2500)], mpk, '2026-11')).toBe(500);
  });

  test('przekroczenie o 5 zł przechodzi jako dług', () => {
    expect(rolloverCarry([spend('2026-10', 3500)], mpk, '2026-11')).toBe(-500);
  });

  test('dług najwyżej 1× limit', () => {
    expect(rolloverCarry([spend('2026-10', 10000)], mpk, '2026-11')).toBe(-3000);
  });

  test('naddatek rośnie bez limitu', () => {
    expect(rolloverCarry([], mpk, '2027-02')).toBe(4 * 3000);
  });

  test('wyłączony rollover = 0', () => {
    expect(rolloverCarry([spend('2026-10', 1000)], { ...mpk, rollover: false }, '2026-11')).toBe(0);
  });
});
