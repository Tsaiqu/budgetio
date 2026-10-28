// Pulpit: ile realnie zostaje w tym miesiącu + na co rozkłada się faktura z tego miesiąca.
import type { ReactNode } from 'react';
import { formatMoney } from '../../../shared/money';
import { addMonths, MONTH_NAMES, monthIndex, type Month } from '../../../shared/months';
import type { TxType } from '../../../shared/schemas';
import type { MonthSummary } from '../../../shared/types';
import { Loading, Money, UsageBar } from '../components/ui';
import { useSummary } from '../lib/api';
import { dueDate, inMonth, ZUS_STAGE_LABEL } from '../lib/labels';

export function Dashboard(props: { month: Month; onAdd: (type?: TxType) => void; go: (page: string) => void }) {
  const { data, isLoading } = useSummary(props.month);
  if (isLoading || !data) return <Loading />;

  const monthName = MONTH_NAMES[monthIndex(props.month) - 1];

  return (
    <div className="space-y-4">
      {data.warnings.map((w) => (
        <div key={w} role="alert" className="alert alert-warning alert-soft text-sm">
          <span>{w}</span>
          {w.includes('Ustawieniach') && (
            <button className="btn btn-sm btn-ghost" onClick={() => props.go('ustawienia')}>
              Otwórz ustawienia
            </button>
          )}
        </div>
      ))}

      <div className="grid gap-4 lg:grid-cols-5">
        <CashPanel data={data} />
        <InvoicePanel data={data} monthName={monthName} onAdd={() => props.onAdd('business_income')} />
      </div>

      <BudgetPreview data={data} go={props.go} />
    </div>
  );
}

function CashPanel({ data }: { data: MonthSummary }) {
  const c = data.cash;
  const prev = addMonths(data.month, -1);
  return (
    <section className="panel p-5 lg:col-span-3" aria-labelledby="cash-title">
      <h2 id="cash-title" className="text-muted text-sm font-medium first-letter:uppercase">
        Saldo {inMonth(data.month)}
      </h2>
      <p className={`money mt-1 text-4xl font-semibold tracking-tight ${c.balance < 0 ? 'text-error' : ''}`}>
        <Money value={c.balance} />
      </p>
      <p className="text-muted mt-1 max-w-prose text-sm">Tyle zostaje na koncie w tym miesiącu po podatkach, kosztach i wydatkach.</p>

      <dl className="divide-base-200 mt-5 divide-y text-sm">
        <Row label="Wpływy z faktur" note="Zwykle faktura za poprzedni miesiąc" value={c.businessIncome} sign={1} />
        {c.personalIncome > 0 && <Row label="Przychody prywatne" value={c.personalIncome} sign={1} />}
        <details className="group">
          <summary className="flex cursor-pointer list-none items-baseline justify-between gap-4 py-2.5">
            <span>
              Podatki i ZUS <span className="text-muted text-xs">za {MONTH_NAMES[monthIndex(prev) - 1]}</span>
              <span className="text-muted ml-1 text-xs group-open:hidden">▸</span>
              <span className="text-muted ml-1 hidden text-xs group-open:inline">▾</span>
            </span>
            <Money value={-c.taxesPaid.total} sign className="font-medium" />
          </summary>
          <dl className="text-muted mb-2 space-y-1 pl-4 text-xs">
            <SubRow label={`VAT – do ${dueDate(data.month, 25)}`} value={c.taxesPaid.vat} />
            <SubRow label={`Zaliczka PIT – do ${dueDate(data.month, 20)}`} value={c.taxesPaid.pit} />
            <SubRow label={`ZUS społeczny – do ${dueDate(data.month, 20)}`} value={c.taxesPaid.social} />
            <SubRow label={`Składka zdrowotna – do ${dueDate(data.month, 20)}`} value={c.taxesPaid.health} />
          </dl>
        </details>
        <Row label="Koszty firmowe" value={c.businessCosts} sign={-1} />
        <Row
          label="Wydatki prywatne"
          note={c.recurringPersonal > 0 ? `w tym koszty stałe ${formatMoney(c.recurringPersonal)}` : undefined}
          value={c.personalExpenses}
          sign={-1}
        />
      </dl>
    </section>
  );
}

function InvoicePanel({ data, monthName, onAdd }: { data: MonthSummary; monthName: string; onAdd: () => void }) {
  const s = data.settlement;
  const next = addMonths(data.month, 1);
  const next2 = addMonths(data.month, 2);

  if (s.revenueGross === 0) {
    return (
      <section className="panel flex flex-col p-5 lg:col-span-2">
        <h2 className="font-semibold">Faktura za {monthName}</h2>
        <p className="text-muted mt-2 text-sm">
          Brak faktury z datą w tym miesiącu. Dodaj ją, a zobaczysz, ile z niej odłożyć na VAT, PIT i ZUS.
        </p>
        {s.total > 0 && (
          <p className="mt-3 text-sm">
            Składki do odłożenia mimo braku przychodu: <Money value={s.total} className="font-medium" />
          </p>
        )}
        <div className="mt-auto pt-4">
          <button className="btn btn-primary btn-sm" onClick={onAdd}>
            Dodaj fakturę
          </button>
        </div>
      </section>
    );
  }

  const parts = [
    { key: 'own', label: 'Zostaje dla Ciebie', value: Math.max(0, s.left), color: 'bg-env-own', due: null },
    { key: 'costs', label: 'Koszty firmowe', value: s.businessCostsGross, color: 'bg-env-costs', due: null },
    { key: 'vat', label: 'VAT', value: s.vat, color: 'bg-env-vat', due: dueDate(next, 25) },
    { key: 'pit', label: 'Zaliczka PIT', value: s.pit, color: 'bg-env-pit', due: dueDate(next, 20) },
    { key: 'zus', label: 'ZUS społeczny', value: s.social, color: 'bg-env-zus', due: dueDate(next, 20) },
    { key: 'health', label: 'Składka zdrowotna', value: s.health, color: 'bg-env-health', due: dueDate(next2, 20) },
  ].filter((p) => p.value > 0);
  const total = parts.reduce((sum, p) => sum + p.value, 0);

  return (
    <section className="panel p-5 lg:col-span-2" aria-labelledby="invoice-title">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="invoice-title" className="font-semibold">
          Faktura za {monthName}
        </h2>
        <Money value={s.revenueGross} className="text-muted text-sm" />
      </div>
      <p className="text-muted mt-1 text-sm">Tak dzieli się ta kwota. Pieniądze na podatki odłóż od razu po wpływie.</p>

      <div className="mt-4 flex h-4 w-full overflow-hidden rounded-full" role="img" aria-label="Podział faktury">
        {parts.map((p) => (
          <div key={p.key} className={`${p.color} h-full`} style={{ width: `${(p.value / total) * 100}%` }} title={p.label} />
        ))}
      </div>

      <dl className="mt-4 space-y-2 text-sm">
        {parts.map((p) => (
          <div key={p.key} className="flex items-baseline gap-2">
            <span className={`${p.color} inline-block size-2.5 shrink-0 translate-y-px rounded-sm`} aria-hidden />
            <dt className="grow">
              {p.label}
              {p.due && <span className="text-muted text-xs"> do {p.due}</span>}
            </dt>
            <dd>
              <Money value={p.value} className={p.key === 'own' ? 'font-semibold' : ''} />
            </dd>
          </div>
        ))}
      </dl>
      <p className="border-base-200 text-muted mt-4 border-t pt-3 text-xs">
        Do odłożenia razem: <Money value={s.total} className="text-base-content font-medium" />. Etap ZUS: {ZUS_STAGE_LABEL[s.stage]}.
      </p>
    </section>
  );
}

function BudgetPreview({ data, go }: { data: MonthSummary; go: (page: string) => void }) {
  const rows = data.budget
    .filter((r) => r.available !== null || r.spent > 0)
    .sort((a, b) => ratio(b) - ratio(a))
    .slice(0, 6);
  return (
    <section className="panel p-5" aria-labelledby="budget-title">
      <div className="flex items-baseline justify-between">
        <h2 id="budget-title" className="font-semibold">
          Budżet
        </h2>
        <button className="link link-primary text-sm" onClick={() => go('budzet')}>
          Cały budżet
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="text-muted mt-2 text-sm">Ustaw limity kategorii w zakładce Budżet, żeby widzieć, ile zostało.</p>
      ) : (
        <ul className="mt-3 grid gap-x-8 gap-y-3 sm:grid-cols-2">
          {rows.map((r) => (
            <li key={`${r.kind}-${r.categoryId}`}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate">{r.name}</span>
                <span className="text-muted text-xs">
                  {r.available !== null ? (
                    <>
                      <Money value={r.spent} className="text-base-content" /> z <Money value={r.available} />
                    </>
                  ) : (
                    <Money value={r.spent} className="text-base-content" />
                  )}
                </span>
              </div>
              {r.available !== null && (
                <div className="mt-1">
                  <UsageBar spent={r.spent} available={r.available} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Row(props: { label: string; note?: ReactNode; value: number; sign: 1 | -1 }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt>
        {props.label}
        {props.note && <span className="text-muted block text-xs">{props.note}</span>}
      </dt>
      <dd>
        <Money value={props.sign * props.value} sign className={`font-medium ${props.sign > 0 && props.value > 0 ? 'text-success' : ''}`} />
      </dd>
    </div>
  );
}

function SubRow(props: { label: string; value: number }) {
  return (
    <div className="flex justify-between gap-4">
      <dt>{props.label}</dt>
      <dd>
        <Money value={props.value} />
      </dd>
    </div>
  );
}

const ratio = (r: { spent: number; available: number | null }) => (r.available ? r.spent / r.available : r.spent > 0 ? 0.0001 : 0);
