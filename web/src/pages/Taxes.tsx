// Podatki i ZUS miesiąc po miesiącu (wg daty faktury). Odpowiednik zakładki "Podatki" z Excela.
import { useState } from 'react';
import { MONTH_NAMES, monthIndex } from '../../../shared/months';
import type { TaxMonth } from '../../../shared/types';
import { Loading, Money } from '../components/ui';
import { useTaxes } from '../lib/api';
import { ZUS_STAGE_LABEL } from '../lib/labels';

const COLUMNS: { key: keyof TaxMonth; label: string; title?: string }[] = [
  { key: 'revenueNet', label: 'Przychód netto' },
  { key: 'vatDue', label: 'VAT należny' },
  { key: 'vatInput', label: 'VAT naliczony', title: 'VAT do odliczenia z kosztów' },
  {
    key: 'vatPayable',
    label: 'VAT do zapłaty',
    title: 'Po odjęciu nadwyżki z poprzedniego miesiąca. Termin: 25. dnia następnego miesiąca.',
  },
  { key: 'taxCosts', label: 'Koszty (PIT)' },
  { key: 'income', label: 'Dochód' },
  { key: 'social', label: 'ZUS społeczny', title: 'Termin: 20. dnia następnego miesiąca.' },
  { key: 'pitAdvance', label: 'Zaliczka PIT', title: 'Liczona narastająco od stycznia. Termin: 20. dnia następnego miesiąca.' },
  { key: 'health', label: 'Zdrowotna', title: 'Od dochodu z tego miesiąca. Płacisz ją do 20. dnia za 2 miesiące.' },
  { key: 'total', label: 'Razem' },
];

const SUMMED: (keyof TaxMonth)[] = [
  'revenueNet',
  'vatDue',
  'vatInput',
  'vatPayable',
  'taxCosts',
  'income',
  'social',
  'pitAdvance',
  'health',
  'total',
];

export function Taxes(props: { initialYear: number }) {
  const [year, setYear] = useState(props.initialYear);
  const { data, isLoading } = useTaxes(year);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <button className="btn btn-ghost btn-sm btn-square" onClick={() => setYear(year - 1)} aria-label="Poprzedni rok">
            ‹
          </button>
          <span className="w-16 text-center text-base font-semibold">{year}</span>
          <button className="btn btn-ghost btn-sm btn-square" onClick={() => setYear(year + 1)} aria-label="Następny rok">
            ›
          </button>
        </div>
        <p className="text-muted max-w-xl text-sm">
          Wiersz to miesiąc faktury. Kwoty z wiersza płacisz w kolejnym miesiącu (zdrowotną za 2 miesiące).
        </p>
      </div>

      {data?.ratesYear && (
        <div role="alert" className="alert alert-warning alert-soft text-sm">
          Brak stawek na {year} r. Liczę ze stawek z {data.ratesYear} r. Uzupełnij je w Ustawieniach.
        </div>
      )}

      {isLoading || !data ? (
        <Loading />
      ) : (
        <div className="panel overflow-x-auto">
          <table className="table table-sm">
            <thead>
              <tr className="text-muted text-xs">
                <th className="bg-base-100 sticky left-0 font-medium">Miesiąc</th>
                <th className="font-medium">Etap ZUS</th>
                {COLUMNS.map((c) => (
                  <th key={c.key} className="text-right font-medium" title={c.title}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.months.map((m) => (
                <tr key={m.month} className={m.total === 0 && m.revenueNet === 0 ? 'text-muted' : ''}>
                  <td className="bg-base-100 sticky left-0 font-medium first-letter:uppercase">{MONTH_NAMES[monthIndex(m.month) - 1]}</td>
                  <td className="text-xs whitespace-nowrap">{ZUS_STAGE_LABEL[m.stage]}</td>
                  {COLUMNS.map((c) => (
                    <td key={c.key} className={`text-right ${c.key === 'total' ? 'font-semibold' : ''}`}>
                      {(m[c.key] as number) === 0 ? <span className="text-muted">–</span> : <Money value={m[c.key] as number} />}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="text-base-content">
                <th className="bg-base-100 sticky left-0">Razem</th>
                <th />
                {COLUMNS.map((c) => (
                  <th key={c.key} className="text-right">
                    {SUMMED.includes(c.key) ? <Money value={data.months.reduce((s, m) => s + (m[c.key] as number), 0)} /> : null}
                  </th>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <p className="text-muted text-xs">
        To narzędzie do planowania, nie zastępuje księgowości. Nie liczy rocznego rozliczenia składki zdrowotnej ani ulg w PIT.
      </p>
    </div>
  );
}
