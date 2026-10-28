// Koszty stałe: dodajesz raz, liczą się co miesiąc. Wstrzymanie i wznowienie zachowują historię.
import { useState } from 'react';
import { addMonths, monthLabel, type Month } from '../../../shared/months';
import type { RecurringItem } from '../../../shared/types';
import { RecurringForm } from '../components/RecurringForm';
import { ErrorText, Field, Loading, Modal, Money, MoneyInput } from '../components/ui';
import { recurringAmountIn } from '../../../shared/recurring';
import { useMeta, useRecurring, useResumeRecurring, useStopRecurring } from '../lib/api';
import { inMonth, RECURRING_TYPE_LABEL } from '../lib/labels';

type Dialog =
  | { kind: 'form'; item?: RecurringItem }
  | { kind: 'stop'; item: RecurringItem }
  | { kind: 'resume'; item: RecurringItem }
  | null;

export function Recurring(props: { month: Month }) {
  const { data, isLoading } = useRecurring();
  const { data: meta } = useMeta();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  if (isLoading || !data) return <Loading />;

  const categoryName = (id: number | null) => meta?.categories.find((c) => c.id === id)?.name ?? 'Bez kategorii';
  const totalFor = (type: RecurringItem['type']) =>
    data.filter((i) => i.type === type).reduce((s, i) => s + recurringAmountIn(i.periods, props.month), 0);
  const close = () => setDialog(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="text-sm">
          <p className="text-muted first-letter:uppercase">{inMonth(props.month, true)}</p>
          <p className="mt-0.5 flex flex-wrap gap-x-5">
            <span>
              Prywatne <Money value={totalFor('personal_expense')} className="font-semibold" />
            </span>
            <span>
              Firmowe <Money value={totalFor('business_cost')} className="font-semibold" />
            </span>
          </p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setDialog({ kind: 'form' })}>
          Dodaj koszt stały
        </button>
      </div>

      {data.length === 0 ? (
        <div className="panel p-8 text-center">
          <p className="font-medium">Nie masz jeszcze kosztów stałych.</p>
          <p className="text-muted mt-1 text-sm">Czynsz, abonamenty i subskrypcje dodaj raz – aplikacja doliczy je do każdego miesiąca.</p>
        </div>
      ) : (
        <ul className="panel divide-base-200 divide-y">
          {data.map((item) => {
            const amountNow = recurringAmountIn(item.periods, props.month);
            const last = item.periods[item.periods.length - 1];
            return (
              <li key={item.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 grow">
                    <p className="flex items-center gap-2 font-medium">
                      <span className="truncate">{item.name}</span>
                      <StatusBadge item={item} />
                    </p>
                    <p className="text-muted text-xs">
                      {categoryName(item.categoryId)}, {RECURRING_TYPE_LABEL[item.type].toLowerCase()}
                      {item.paymentDay && `, płatne ${item.paymentDay}. dnia`}
                      {last?.endMonth && `, ostatni miesiąc: ${monthLabel(last.endMonth)}`}
                    </p>
                  </div>
                  <div className="text-right">
                    <Money value={item.currentAmount} className={`font-semibold ${amountNow === 0 ? 'text-muted line-through' : ''}`} />
                    <span className="text-muted block text-xs">miesięcznie</span>
                  </div>
                  <div className="flex gap-1">
                    <button className="btn btn-ghost btn-xs" onClick={() => setDialog({ kind: 'form', item })}>
                      Edytuj
                    </button>
                    {last?.endMonth === null ? (
                      <button className="btn btn-ghost btn-xs" onClick={() => setDialog({ kind: 'stop', item })}>
                        Wstrzymaj
                      </button>
                    ) : (
                      <button className="btn btn-ghost btn-xs text-primary" onClick={() => setDialog({ kind: 'resume', item })}>
                        Wznów
                      </button>
                    )}
                    <button
                      className="btn btn-ghost btn-xs"
                      aria-expanded={expanded === item.id}
                      onClick={() => setExpanded(expanded === item.id ? null : item.id)}
                    >
                      Historia
                    </button>
                  </div>
                </div>
                {expanded === item.id && (
                  <ol className="border-base-300 text-muted mt-3 ml-1 space-y-1 border-l pl-4 text-xs">
                    {item.periods.map((p) => (
                      <li key={p.id} className="flex justify-between gap-4">
                        <span>
                          {monthLabel(p.startMonth)} – {p.endMonth ? monthLabel(p.endMonth) : 'nadal'}
                        </span>
                        <Money value={p.amountGross} />
                      </li>
                    ))}
                  </ol>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Modal
        open={dialog?.kind === 'form'}
        onClose={close}
        title={dialog?.kind === 'form' && dialog.item ? 'Edytuj koszt stały' : 'Nowy koszt stały'}
        wide
      >
        {dialog?.kind === 'form' && <RecurringForm key={dialog.item?.id ?? 'new'} item={dialog.item} month={props.month} onDone={close} />}
      </Modal>
      <Modal open={dialog?.kind === 'stop'} onClose={close} title="Wstrzymaj koszt stały">
        {dialog?.kind === 'stop' && <StopForm item={dialog.item} month={props.month} onDone={close} />}
      </Modal>
      <Modal open={dialog?.kind === 'resume'} onClose={close} title="Wznów koszt stały">
        {dialog?.kind === 'resume' && <ResumeForm item={dialog.item} month={props.month} onDone={close} />}
      </Modal>
    </div>
  );
}

function StatusBadge({ item }: { item: RecurringItem }) {
  if (item.status === 'active') return null;
  if (item.status === 'planned') return <span className="badge badge-info badge-soft badge-xs">zaplanowany</span>;
  return <span className="badge badge-ghost badge-xs">wstrzymany</span>;
}

function StopForm(props: { item: RecurringItem; month: Month; onDone: () => void }) {
  const stop = useStopRecurring();
  const [month, setMonth] = useState(props.month);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        stop.mutate({ id: props.item.id, month }, { onSuccess: props.onDone });
      }}
    >
      <p className="text-muted text-sm">
        „{props.item.name}” przestanie się liczyć po wybranym miesiącu. Historia zostaje, a koszt możesz później wznowić.
      </p>
      <Field label="Ostatni opłacony miesiąc" className="mt-2">
        <input type="month" className="input w-full" required value={month} onChange={(e) => setMonth(e.target.value)} />
      </Field>
      <ErrorText error={stop.error} />
      <div className="flex justify-end gap-2 pt-4">
        <button type="button" className="btn btn-ghost" onClick={props.onDone}>
          Anuluj
        </button>
        <button className="btn btn-primary" disabled={stop.isPending}>
          Wstrzymaj
        </button>
      </div>
    </form>
  );
}

function ResumeForm(props: { item: RecurringItem; month: Month; onDone: () => void }) {
  const resume = useResumeRecurring();
  const lastEnd = props.item.periods[props.item.periods.length - 1]?.endMonth;
  const [month, setMonth] = useState(lastEnd && lastEnd >= props.month ? addMonths(lastEnd, 1) : props.month);
  const [amount, setAmount] = useState<number | null>(props.item.currentAmount);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (amount) resume.mutate({ id: props.item.id, month, amountGross: amount }, { onSuccess: props.onDone });
      }}
    >
      <div className="grid gap-x-3 sm:grid-cols-2">
        <Field label="Wznów od miesiąca">
          <input type="month" className="input w-full" required value={month} onChange={(e) => setMonth(e.target.value)} />
        </Field>
        <Field label="Kwota miesięcznie">
          <MoneyInput value={amount} onChange={setAmount} />
        </Field>
      </div>
      <ErrorText error={resume.error} />
      <div className="flex justify-end gap-2 pt-4">
        <button type="button" className="btn btn-ghost" onClick={props.onDone}>
          Anuluj
        </button>
        <button className="btn btn-primary" disabled={!amount || resume.isPending}>
          Wznów
        </button>
      </div>
    </form>
  );
}
