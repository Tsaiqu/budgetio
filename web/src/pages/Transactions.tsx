// Lista transakcji miesiąca: pozycje z fakturą LUB płatnością w tym miesiącu.
import { useState } from 'react';
import { formatDate, monthOf, type Month } from '../../../shared/months';
import type { Transaction } from '../../../shared/types';
import { Loading, Money } from '../components/ui';
import { useMeta, useTransactions } from '../lib/api';
import { isBusiness, isIncome, TX_TYPE_LABEL } from '../lib/labels';

type Filter = 'all' | 'business' | 'personal';

const DOT: Record<Transaction['type'], string> = {
  business_income: 'bg-env-own',
  personal_income: 'bg-env-own',
  business_cost: 'bg-env-vat',
  personal_expense: 'bg-env-costs',
};

export function Transactions(props: { month: Month; onEdit: (t: Transaction) => void; onAdd: () => void }) {
  const { data, isLoading } = useTransactions(props.month);
  const { data: meta } = useMeta();
  const [filter, setFilter] = useState<Filter>('all');

  if (isLoading || !data) return <Loading />;

  const categoryName = (id: number | null) => meta?.categories.find((c) => c.id === id)?.name ?? 'Bez kategorii';
  const visible = data.filter((t) => filter === 'all' || (filter === 'business') === isBusiness(t.type));

  // Sumy liczymy wg daty płatności, tak jak budżet.
  const paidHere = data.filter((t) => monthOf(t.paymentDate) === props.month);
  const income = paidHere.filter((t) => isIncome(t.type)).reduce((s, t) => s + t.amountGross, 0);
  const expenses = paidHere.filter((t) => !isIncome(t.type)).reduce((s, t) => s + t.amountGross, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="join" role="tablist" aria-label="Filtr">
          {(
            [
              ['all', 'Wszystkie'],
              ['business', 'Firma'],
              ['personal', 'Prywatne'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={filter === key}
              className={`btn btn-sm join-item ${filter === key ? 'btn-neutral' : 'btn-ghost border-base-300 bg-base-100'}`}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-muted flex gap-4 text-sm">
          <span>
            Wpływy <Money value={income} className="text-success font-medium" />
          </span>
          <span>
            Wydatki bez kosztów stałych <Money value={expenses} className="text-base-content font-medium" />
          </span>
        </p>
      </div>

      {visible.length === 0 ? (
        <div className="panel p-8 text-center">
          <p className="font-medium">Brak transakcji w tym miesiącu.</p>
          <p className="text-muted mt-1 text-sm">Koszty stałe (czynsz, subskrypcje) dodaj w zakładce Koszty stałe – liczą się same.</p>
          <button className="btn btn-primary btn-sm mt-4" onClick={props.onAdd}>
            Dodaj transakcję
          </button>
        </div>
      ) : (
        <ul className="panel divide-base-200 divide-y">
          {visible.map((t) => {
            const otherMonth = monthOf(t.paymentDate) !== monthOf(t.invoiceDate);
            const income = isIncome(t.type);
            return (
              <li key={t.id}>
                <button className="hover:bg-base-200/60 flex w-full items-center gap-3 px-4 py-3 text-left" onClick={() => props.onEdit(t)}>
                  <span className={`${DOT[t.type]} size-2.5 shrink-0 rounded-full`} title={TX_TYPE_LABEL[t.type]} />
                  <span className="min-w-0 grow">
                    <span className="block truncate font-medium">{t.description || categoryName(t.categoryId)}</span>
                    <span className="text-muted flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                      <span>
                        {formatDate(t.invoiceDate)}, {categoryName(t.categoryId)}
                      </span>
                      <span className="badge badge-ghost badge-xs">{TX_TYPE_LABEL[t.type]}</span>
                      {otherMonth && (
                        <span className="badge badge-warning badge-soft badge-xs">
                          {income ? 'wpływ' : 'płatność'} {formatDate(t.paymentDate)}
                        </span>
                      )}
                    </span>
                  </span>
                  <span className="text-right">
                    <Money value={income ? t.amountGross : -t.amountGross} sign className={`font-medium ${income ? 'text-success' : ''}`} />
                    {isBusiness(t.type) && t.vat > 0 && (
                      <span className="text-muted block text-xs">
                        VAT <Money value={t.vat} />
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
