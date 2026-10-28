// Formularz dodawania i edycji transakcji.
import { useMemo, useState } from 'react';
import { formatMoney } from '../../../shared/money';
import { addDays, todayIso } from '../../../shared/months';
import { CATEGORY_KIND_FOR_TYPE, type TxType } from '../../../shared/schemas';
import type { Category, Transaction } from '../../../shared/types';
import { useDeleteTransaction, useMeta, useSaveTransaction } from '../lib/api';
import { isBusiness, TX_TYPE_ORDER, TX_TYPE_SHORT, VAT_RATES, vatLabel } from '../lib/labels';
import { ErrorText, Field, MoneyInput } from './ui';

const DEDUCTION_PRESETS = [
  { label: 'Normalnie', vat: 100, cost: 100, hint: 'VAT w całości, 100% w kosztach' },
  { label: 'Auto mieszane', vat: 50, cost: 75, hint: 'Paliwo, serwis auta używanego też prywatnie' },
  { label: 'Bez odliczenia VAT', vat: 0, cost: 100, hint: 'Np. gastronomia, nocleg – VAT idzie do kosztów' },
];

export function TransactionForm(props: { transaction?: Transaction; initialType?: TxType; defaultDate?: string; onDone: () => void }) {
  const { data: meta } = useMeta();
  const save = useSaveTransaction();
  const remove = useDeleteTransaction();
  const t = props.transaction;
  const settings = meta?.settings;

  const [type, setType] = useState<TxType>(t?.type ?? props.initialType ?? 'personal_expense');
  const [amount, setAmount] = useState<number | null>(t?.amountGross ?? null);
  const [description, setDescription] = useState(t?.description ?? '');
  const [categoryId, setCategoryId] = useState<number | null>(
    t ? t.categoryId : firstCategory(meta?.categories ?? [], props.initialType ?? 'personal_expense'),
  );
  const [invoiceDate, setInvoiceDate] = useState(t?.invoiceDate ?? props.defaultDate ?? todayIso());
  const [paymentDate, setPaymentDate] = useState<string | null>(t?.paymentDate ?? null);
  const [vatRate, setVatRate] = useState<number>(t?.vatRate ?? settings?.defaultVatRate ?? 23);
  const [vatPct, setVatPct] = useState(t?.vatDeductiblePct ?? 100);
  const [costPct, setCostPct] = useState(t?.taxCostPct ?? 100);
  const [showDeductions, setShowDeductions] = useState(t ? t.vatDeductiblePct !== 100 || t.taxCostPct !== 100 : false);

  const business = isBusiness(type);
  const categories = (meta?.categories ?? []).filter(
    (c) => c.kind === CATEGORY_KIND_FOR_TYPE[type] && (!c.archived || c.id === categoryId),
  );
  const defaultPayment = type === 'business_income' && settings ? addDays(invoiceDate, settings.paymentTermDays) : invoiceDate;

  const preview = useMemo(() => {
    if (!business || !amount) return null;
    const net = Math.round((amount * 100) / (100 + vatRate));
    const vat = amount - net;
    const deductible = type === 'business_cost' ? Math.round((vat * vatPct) / 100) : 0;
    return { net, vat, deductible };
  }, [business, amount, vatRate, vatPct, type]);

  function changeType(next: TxType) {
    setType(next);
    setPaymentDate(null);
    const fits = meta?.categories.find((c) => c.id === categoryId)?.kind === CATEGORY_KIND_FOR_TYPE[next];
    if (!fits) setCategoryId(firstCategory(meta?.categories ?? [], next));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!amount) return;
    save.mutate(
      {
        id: t?.id,
        data: {
          type,
          description,
          categoryId,
          amountGross: amount,
          vatRate: business ? vatRate : 0,
          vatDeductiblePct: type === 'business_cost' ? vatPct : 100,
          taxCostPct: type === 'business_cost' ? costPct : 100,
          invoiceDate,
          paymentDate: business ? (paymentDate ?? defaultPayment) : invoiceDate,
        },
      },
      {
        onSuccess: () => {
          if (categoryId !== null) writeStorage(`budgetio:lastCategory:${type}`, String(categoryId));
          props.onDone();
        },
      },
    );
  }

  return (
    <form onSubmit={submit} className="space-y-1">
      <div className="grid grid-cols-2 gap-1 sm:grid-cols-4" role="radiogroup" aria-label="Typ transakcji">
        {TX_TYPE_ORDER.map((tt) => (
          <button
            key={tt}
            type="button"
            role="radio"
            aria-checked={type === tt}
            className={`btn btn-sm ${type === tt ? 'btn-primary' : 'btn-ghost border-base-300'}`}
            onClick={() => changeType(tt)}
          >
            {TX_TYPE_SHORT[tt]}
          </button>
        ))}
      </div>

      <Field label="Kwota brutto" hint={business ? 'Tyle, ile jest na fakturze (z VAT).' : undefined}>
        <MoneyInput value={amount} onChange={setAmount} autoFocus large />
      </Field>

      <div className="grid gap-x-3 sm:grid-cols-2">
        <Field label="Opis">
          <input
            className="input w-full"
            value={description}
            maxLength={200}
            placeholder={type === 'business_income' ? 'Faktura za październik' : 'Np. bilety PKP'}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
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
      </div>

      <div className="grid gap-x-3 sm:grid-cols-2">
        <Field
          label={business ? (type === 'business_income' ? 'Data faktury' : 'Data faktury / zakupu') : 'Data'}
          hint={business ? 'Decyduje o miesiącu dla VAT, PIT i ZUS.' : undefined}
        >
          <input type="date" className="input w-full" required value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
        </Field>
        {business && (
          <Field
            label={type === 'business_income' ? 'Data wpływu' : 'Data płatności'}
            hint={
              type === 'business_income'
                ? `Domyślnie data faktury + ${settings?.paymentTermDays ?? 7} dni.`
                : 'Decyduje o budżecie miesiąca.'
            }
          >
            <input
              type="date"
              className="input w-full"
              required
              value={paymentDate ?? defaultPayment}
              onChange={(e) => setPaymentDate(e.target.value || null)}
            />
          </Field>
        )}
      </div>

      {business && (
        <div className="grid items-end gap-x-3 sm:grid-cols-2">
          <Field label="Stawka VAT">
            <div className="join w-full">
              {VAT_RATES.map((r) => (
                <button
                  key={r}
                  type="button"
                  className={`btn btn-sm join-item flex-1 ${vatRate === r ? 'btn-primary' : 'btn-ghost border-base-300'}`}
                  onClick={() => setVatRate(r)}
                >
                  {vatLabel(r)}
                </button>
              ))}
            </div>
          </Field>
          {preview && (
            <dl className="bg-base-200 mb-1 grid grid-cols-3 gap-2 rounded-field px-3 py-2 text-xs">
              <div>
                <dt className="text-muted">Netto</dt>
                <dd className="money font-medium">{formatMoney(preview.net)}</dd>
              </div>
              <div>
                <dt className="text-muted">VAT</dt>
                <dd className="money font-medium">{formatMoney(preview.vat)}</dd>
              </div>
              {type === 'business_cost' ? (
                <div>
                  <dt className="text-muted">Odliczysz</dt>
                  <dd className="money text-env-own font-medium">{formatMoney(preview.deductible)}</dd>
                </div>
              ) : (
                <div>
                  <dt className="text-muted">Do US</dt>
                  <dd className="money text-env-vat font-medium">{formatMoney(preview.vat)}</dd>
                </div>
              )}
            </dl>
          )}
        </div>
      )}

      {type === 'business_cost' && (
        <div className="pt-1">
          <button type="button" className="link link-hover text-muted text-sm" onClick={() => setShowDeductions((v) => !v)}>
            {showDeductions ? 'Ukryj zasady odliczenia' : `Zasady odliczenia: VAT ${vatPct}%, w kosztach ${costPct}%`}
          </button>
          {showDeductions && (
            <div className="mt-2 space-y-2">
              <div className="flex flex-wrap gap-1">
                {DEDUCTION_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    title={p.hint}
                    className={`btn btn-xs ${vatPct === p.vat && costPct === p.cost ? 'btn-primary' : 'btn-ghost border-base-300'}`}
                    onClick={() => {
                      setVatPct(p.vat);
                      setCostPct(p.cost);
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="% odliczenia VAT">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    className="input input-sm w-full"
                    value={vatPct}
                    onChange={(e) => setVatPct(clampPct(e.target.value))}
                  />
                </Field>
                <Field label="% w kosztach (PIT)">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    className="input input-sm w-full"
                    value={costPct}
                    onChange={(e) => setCostPct(clampPct(e.target.value))}
                  />
                </Field>
              </div>
            </div>
          )}
        </div>
      )}

      <ErrorText error={save.error ?? remove.error} />

      <div className="flex items-center justify-between gap-2 pt-4">
        {t ? (
          <button
            type="button"
            className="btn btn-ghost text-error"
            onClick={() => confirm('Usunąć tę transakcję?') && remove.mutate(t.id, { onSuccess: props.onDone })}
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
          <button type="submit" className="btn btn-primary" disabled={!amount || save.isPending}>
            {t ? 'Zapisz zmiany' : 'Dodaj transakcję'}
          </button>
        </div>
      </div>
    </form>
  );
}

/** Domyślna kategoria: ostatnio użyta dla tego typu, a gdy jej brak – pierwsza pasująca. */
function firstCategory(categories: Category[], type: TxType): number | null {
  const fits = categories.filter((c) => c.kind === CATEGORY_KIND_FOR_TYPE[type] && !c.archived);
  const last = Number(readStorage(`budgetio:lastCategory:${type}`));
  return fits.find((c) => c.id === last)?.id ?? fits[0]?.id ?? null;
}

// localStorage tylko na drobne wygody – może być niedostępny (tryb prywatny), więc zawsze w try/catch.
function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* brak dostępu – trudno */
  }
}

function clampPct(v: string): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
}
