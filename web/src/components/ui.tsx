// Małe, wspólne elementy interfejsu.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { formatMoney, groszeToInput, parseMoney } from '../../../shared/money';
import { addMonths, monthLabel, type Month } from '../../../shared/months';

/** Okno dialogowe na natywnym <dialog> (Esc i kliknięcie w tło zamykają). */
export function Modal(props: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (props.open && !d.open) d.showModal();
    if (!props.open && d.open) d.close();
  }, [props.open]);

  return (
    <dialog ref={ref} className="modal modal-bottom sm:modal-middle" onClose={props.onClose}>
      <div className={`modal-box ${props.wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'}`}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold">{props.title}</h2>
          <button type="button" className="btn btn-ghost btn-sm btn-square" onClick={props.onClose} aria-label="Zamknij">
            ✕
          </button>
        </div>
        {props.open && props.children}
      </div>
      <form method="dialog" className="modal-backdrop">
        <button aria-label="Zamknij">zamknij</button>
      </form>
    </dialog>
  );
}

export function Field(props: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <fieldset className={`fieldset py-1 ${props.className ?? ''}`}>
      <legend className="fieldset-legend pb-1 text-sm font-medium">{props.label}</legend>
      {props.children}
      {props.hint && <p className="text-muted text-xs">{props.hint}</p>}
    </fieldset>
  );
}

/** Pole kwoty: użytkownik wpisuje "99,99", komponent oddaje grosze (albo null). */
export function MoneyInput(props: {
  value: number | null;
  onChange: (grosze: number | null) => void;
  autoFocus?: boolean;
  large?: boolean;
  placeholder?: string;
  id?: string;
}) {
  const [text, setText] = useState(groszeToInput(props.value));
  // Synchronizacja, gdy wartość zmieni się z zewnątrz (np. otwarcie innej pozycji).
  useEffect(() => {
    if (parseMoney(text) !== props.value) setText(groszeToInput(props.value));
  }, [props.value]);

  const invalid = text.trim() !== '' && parseMoney(text) === null;
  return (
    <label className={`input w-full ${props.large ? 'input-lg text-xl font-semibold' : ''} ${invalid ? 'input-error' : ''}`}>
      <input
        id={props.id}
        inputMode="decimal"
        autoComplete="off"
        className="money grow"
        placeholder={props.placeholder ?? '0,00'}
        autoFocus={props.autoFocus}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          props.onChange(parseMoney(e.target.value));
        }}
      />
      <span className="text-muted text-base font-normal">zł</span>
    </label>
  );
}

export function Money(props: { value: number; className?: string; sign?: boolean }) {
  const text = formatMoney(Math.abs(props.value));
  const prefix = props.sign ? (props.value > 0 ? '+' : props.value < 0 ? '−' : '') : props.value < 0 ? '−' : '';
  return (
    <span className={`money ${props.className ?? ''}`}>
      {prefix}
      {prefix && ' '}
      {text}
    </span>
  );
}

export function MonthSwitcher(props: { month: Month; onChange: (m: Month) => void }) {
  return (
    <div className="flex items-center gap-1">
      <button
        className="btn btn-ghost btn-sm btn-square"
        onClick={() => props.onChange(addMonths(props.month, -1))}
        aria-label="Poprzedni miesiąc"
      >
        ‹
      </button>
      <label className="relative">
        <span className="min-w-40 text-center text-base font-semibold first-letter:uppercase sm:inline-block">
          {monthLabel(props.month)}
        </span>
        <input
          type="month"
          className="absolute inset-0 cursor-pointer opacity-0"
          value={props.month}
          onChange={(e) => e.target.value && props.onChange(e.target.value)}
          aria-label="Wybierz miesiąc"
        />
      </label>
      <button
        className="btn btn-ghost btn-sm btn-square"
        onClick={() => props.onChange(addMonths(props.month, 1))}
        aria-label="Następny miesiąc"
      >
        ›
      </button>
    </div>
  );
}

export function ErrorText(props: { error: unknown }) {
  if (!props.error) return null;
  return (
    <div role="alert" className="alert alert-error alert-soft mt-3 text-sm">
      {props.error instanceof Error ? props.error.message : String(props.error)}
    </div>
  );
}

export function Loading() {
  return (
    <div className="flex justify-center py-16">
      <span className="loading loading-spinner loading-md text-primary" />
    </div>
  );
}

/** Pasek wykorzystania limitu. */
export function UsageBar(props: { spent: number; available: number }) {
  const pct = props.available > 0 ? Math.min(100, (props.spent / props.available) * 100) : props.spent > 0 ? 100 : 0;
  const over = props.spent > props.available;
  const color = over ? 'bg-error' : pct >= 80 ? 'bg-warning' : 'bg-accent';
  return (
    <div className="bg-base-200 h-1.5 w-full overflow-hidden rounded-full" role="presentation">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
