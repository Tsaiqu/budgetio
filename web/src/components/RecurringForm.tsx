// Formularz kosztu stałego (dodawanie i edycja).
import { useState } from 'react';
import { monthLabel, type Month } from '../../../shared/months';
import { CATEGORY_KIND_FOR_TYPE, type RecurringType } from '../../../shared/schemas';
import type { RecurringItem } from '../../../shared/types';
import { useCreateRecurring, useDeleteRecurring, useMeta, useUpdateRecurring } from '../lib/api';
import { RECURRING_TYPE_LABEL, VAT_RATES, vatLabel } from '../lib/labels';
import { ErrorText, Field, MoneyInput } from './ui';

export function RecurringForm(props: { item?: RecurringItem; month: Month; onDone: () => void }) {
  const { data: meta } = useMeta();
  const create = useCreateRecurring();
  const update = useUpdateRecurring();
  const remove = useDeleteRecurring();
  const item = props.item;

  const [type, setType] = useState<RecurringType>(item?.type ?? 'personal_expense');
  const [name, setName] = useState(item?.name ?? '');
  const [amount, setAmount] = useState<number | null>(item?.currentAmount ?? null);
  const [categoryId, setCategoryId] = useState<number | null>(item?.categoryId ?? null);
  const [startMonth, setStartMonth] = useState<Month>(props.month);
  const [effectiveFrom, setEffectiveFrom] = useState<Month>(props.month);
  const [paymentDay, setPaymentDay] = useState<string>(item?.paymentDay ? String(item.paymentDay) : '');
  const [vatRate, setVatRate] = useState(item?.vatRate ?? 23);
  const [vatPct, setVatPct] = useState(item?.vatDeductiblePct ?? 100);
  const [costPct, setCostPct] = useState(item?.taxCostPct ?? 100);

  const categories = (meta?.categories ?? []).filter(
    (c) => c.kind === CATEGORY_KIND_FOR_TYPE[type] && (!c.archived || c.id === categoryId),
  );
  const amountChanged = item && amount !== null && amount !== item.currentAmount;
  const business = type === 'business_cost';
  const error = create.error ?? update.error ?? remove.error;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!amount || !name.trim()) return;
    const common = {
      name,
      type,
      categoryId,
      amountGross: amount,
      vatRate: business ? vatRate : 0,
      vatDeductiblePct: business ? vatPct : 100,
      taxCostPct: business ? costPct : 100,
      paymentDay: paymentDay ? Number(paymentDay) : null,
    };
    if (item) update.mutate({ id: item.id, data: { ...common, effectiveFrom } }, { onSuccess: props.onDone });
    else create.mutate({ ...common, startMonth }, { onSuccess: props.onDone });
  }

  return (
    <form onSubmit={submit} className="space-y-1">
      {!item && (
        <div className="join w-full" role="radiogroup" aria-label="Rodzaj kosztu">
          {(['personal_expense', 'business_cost'] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={type === t}
              className={`btn btn-sm join-item flex-1 ${type === t ? 'btn-primary' : 'btn-ghost border-base-300'}`}
              onClick={() => {
                setType(t);
                setCategoryId(null);
              }}
            >
              {RECURRING_TYPE_LABEL[t]}
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-x-3 sm:grid-cols-2">
        <Field label="Nazwa">
          <input
            className="input w-full"
            required
            maxLength={100}
            value={name}
            placeholder="Np. czynsz, Spotify"
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </Field>
        <Field label="Kwota miesięcznie (brutto)">
          <MoneyInput value={amount} onChange={setAmount} />
        </Field>
      </div>

      {amountChanged && (
        <Field label="Nowa kwota obowiązuje od" hint="Wcześniejsze miesiące zostaną ze starą kwotą.">
          <input type="month" className="input w-full" required value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
        </Field>
      )}

      <div className="grid gap-x-3 sm:grid-cols-2">
        <Field label="Kategoria">
          <select
            className="select w-full"
            value={categoryId ?? ''}
            onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Bez kategorii</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Dzień płatności" hint="Opcjonalnie, tylko informacja.">
          <input
            type="number"
            min={1}
            max={31}
            className="input w-full"
            value={paymentDay}
            onChange={(e) => setPaymentDay(e.target.value)}
            placeholder="np. 10"
          />
        </Field>
      </div>

      {!item && (
        <Field label="Pierwszy miesiąc" hint={`Koszt liczy się od ${monthLabel(startMonth)} w każdym miesiącu, aż go wstrzymasz.`}>
          <input type="month" className="input w-full" required value={startMonth} onChange={(e) => setStartMonth(e.target.value)} />
        </Field>
      )}

      {business && (
        <div className="grid gap-x-3 sm:grid-cols-3">
          <Field label="Stawka VAT">
            <select className="select w-full" value={vatRate} onChange={(e) => setVatRate(Number(e.target.value))}>
              {VAT_RATES.map((r) => (
                <option key={r} value={r}>
                  {vatLabel(r)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="% odliczenia VAT">
            <input
              type="number"
              min={0}
              max={100}
              className="input w-full"
              value={vatPct}
              onChange={(e) => setVatPct(Number(e.target.value))}
            />
          </Field>
          <Field label="% w kosztach">
            <input
              type="number"
              min={0}
              max={100}
              className="input w-full"
              value={costPct}
              onChange={(e) => setCostPct(Number(e.target.value))}
            />
          </Field>
        </div>
      )}

      <ErrorText error={error} />

      <div className="flex items-center justify-between gap-2 pt-4">
        {item ? (
          <button
            type="button"
            className="btn btn-ghost text-error"
            title="Usuwa koszt razem z historią. Żeby zakończyć koszt i zachować historię, użyj „Wstrzymaj”."
            onClick={() =>
              confirm('Usunąć ten koszt razem z całą historią? Jeśli koszt się skończył, lepiej go wstrzymać.') &&
              remove.mutate(item.id, { onSuccess: props.onDone })
            }
          >
            Usuń
          </button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <button type="button" className="btn btn-ghost" onClick={props.onDone}>
            Anuluj
          </button>
          <button type="submit" className="btn btn-primary" disabled={!amount || !name.trim() || create.isPending || update.isPending}>
            {item ? 'Zapisz zmiany' : 'Dodaj koszt stały'}
          </button>
        </div>
      </div>
    </form>
  );
}
