// Budżet: limity kategorii, przenoszenie salda i zarządzanie kategoriami.
import { useEffect, useState } from 'react';
import { groszeToInput, parseMoney } from '../../../shared/money';
import type { Month } from '../../../shared/months';
import type { CategoryKind } from '../../../shared/schemas';
import type { BudgetRow, Category } from '../../../shared/types';
import { ErrorText, Loading, Money, UsageBar } from '../components/ui';
import { useMeta, useSaveCategory, useSummary } from '../lib/api';
import { inMonth } from '../lib/labels';

const KIND_TITLE: Record<CategoryKind, string> = {
  personal: 'Wydatki prywatne',
  business: 'Koszty firmowe',
  income: 'Kategorie przychodów',
};

export function Budget(props: { month: Month }) {
  const { data: meta } = useMeta();
  const { data: summary, isLoading } = useSummary(props.month);
  const save = useSaveCategory();
  const [showArchived, setShowArchived] = useState(false);

  if (isLoading || !summary || !meta) return <Loading />;

  const rowFor = (c: Category) => summary.budget.find((r) => r.categoryId === c.id);
  const update = (c: Category, patch: Partial<Category>) => {
    const next = { ...c, ...patch };
    save.mutate({
      id: c.id,
      data: { name: next.name, kind: next.kind, monthlyLimit: next.monthlyLimit, rollover: next.rollover, archived: next.archived },
    });
  };

  return (
    <div className="space-y-6">
      <p className="text-muted max-w-prose text-sm">
        Wydatki liczą się wg daty płatności. Przenoszenie salda: niewydana kwota przechodzi na kolejny miesiąc bez limitu, a przekroczenie
        zmniejsza kolejny limit (najwyżej o 1× limit).
      </p>
      <ErrorText error={save.error} />

      {(['personal', 'business'] as const).map((kind) => {
        const cats = meta.categories.filter((c) => c.kind === kind && (showArchived || !c.archived));
        const uncategorized = summary.budget.find((r) => r.categoryId === null && r.kind === kind);
        const total = summary.budget.filter((r) => r.kind === kind).reduce((s, r) => s + r.spent, 0);
        const limits = summary.budget.filter((r) => r.kind === kind).reduce((s, r) => s + (r.available ?? 0), 0);
        return (
          <section key={kind} className="panel overflow-hidden">
            <header className="border-base-200 flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-3">
              <h2 className="font-semibold">
                {KIND_TITLE[kind]} <span className="text-muted text-sm font-normal">{inMonth(props.month, true)}</span>
              </h2>
              <p className="text-muted text-sm">
                Wydano <Money value={total} className="text-base-content font-medium" />
                {limits > 0 && (
                  <>
                    {' '}
                    z <Money value={limits} />
                  </>
                )}
              </p>
            </header>
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr className="text-muted text-xs">
                    <th className="font-medium">Kategoria</th>
                    <th className="w-36 font-medium">Limit miesięczny</th>
                    <th className="font-medium" title="Przenoszenie niewydanej kwoty / długu na kolejny miesiąc">
                      Przenoś saldo
                    </th>
                    <th className="text-right font-medium">Przeniesione</th>
                    <th className="text-right font-medium">Wydano</th>
                    <th className="w-44 text-right font-medium">Zostało</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {cats.map((c) => (
                    <CategoryRow key={c.id} category={c} row={rowFor(c)} onChange={(patch) => update(c, patch)} />
                  ))}
                  {uncategorized && (
                    <tr>
                      <td className="text-muted italic">Bez kategorii</td>
                      <td colSpan={3} />
                      <td className="text-right">
                        <Money value={uncategorized.spent} />
                      </td>
                      <td colSpan={2} />
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}

      <section className="panel p-4">
        <h2 className="font-semibold">{KIND_TITLE.income}</h2>
        <ul className="mt-2 flex flex-wrap gap-2">
          {meta.categories
            .filter((c) => c.kind === 'income' && (showArchived || !c.archived))
            .map((c) => (
              <li key={c.id} className={`badge badge-lg badge-ghost gap-2 ${c.archived ? 'opacity-60' : ''}`}>
                {c.name}
                <button className="text-muted hover:text-base-content text-xs" onClick={() => update(c, { archived: !c.archived })}>
                  {c.archived ? 'przywróć' : 'ukryj'}
                </button>
              </li>
            ))}
        </ul>
      </section>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <AddCategory />
        <label className="label cursor-pointer text-sm">
          <input
            type="checkbox"
            className="checkbox checkbox-sm"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          Pokaż ukryte kategorie
        </label>
      </div>
    </div>
  );
}

function CategoryRow(props: { category: Category; row?: BudgetRow; onChange: (patch: Partial<Category>) => void }) {
  const c = props.category;
  const r = props.row;
  // Lokalny stan przełącznika, żeby reagował od razu (zapis i odświeżenie trwają chwilę).
  const [rollover, setRollover] = useState(c.rollover);
  useEffect(() => setRollover(c.rollover), [c.rollover]);
  return (
    <tr className={c.archived ? 'opacity-60' : ''}>
      <td className="font-medium">{c.name}</td>
      <td>
        <LimitInput value={c.monthlyLimit} onSave={(monthlyLimit) => props.onChange({ monthlyLimit })} />
      </td>
      <td>
        <input
          type="checkbox"
          className="toggle toggle-sm toggle-primary"
          checked={rollover}
          disabled={c.monthlyLimit === null}
          title={c.monthlyLimit === null ? 'Najpierw ustaw limit' : undefined}
          onChange={(e) => {
            setRollover(e.target.checked);
            props.onChange({ rollover: e.target.checked });
          }}
          aria-label={`Przenoś saldo: ${c.name}`}
        />
      </td>
      <td className="text-right text-sm">
        {r && r.carry !== 0 ? (
          <Money value={r.carry} sign className={r.carry < 0 ? 'text-error' : 'text-success'} />
        ) : (
          <span className="text-muted">–</span>
        )}
      </td>
      <td className="text-right">{r ? <Money value={r.spent} /> : '–'}</td>
      <td className="text-right">
        {r?.available != null && r.remaining != null ? (
          <div className="space-y-1">
            <Money value={r.remaining} className={r.remaining < 0 ? 'text-error font-medium' : 'font-medium'} />
            <UsageBar spent={r.spent} available={r.available} />
          </div>
        ) : (
          <span className="text-muted text-xs">bez limitu</span>
        )}
      </td>
      <td className="text-right">
        <button className="btn btn-ghost btn-xs text-muted" onClick={() => props.onChange({ archived: !c.archived })}>
          {c.archived ? 'Przywróć' : 'Ukryj'}
        </button>
      </td>
    </tr>
  );
}

/** Pole limitu zapisywane po wyjściu z pola albo Enter. Puste = bez limitu. */
function LimitInput(props: { value: number | null; onSave: (v: number | null) => void }) {
  const [text, setText] = useState(groszeToInput(props.value));
  const commit = () => {
    const parsed = text.trim() === '' ? null : parseMoney(text);
    if (text.trim() !== '' && parsed === null) return setText(groszeToInput(props.value));
    if (parsed !== props.value) props.onSave(parsed);
  };
  return (
    <label className="input input-sm w-32">
      <input
        className="money grow text-right"
        inputMode="decimal"
        placeholder="brak"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
      <span className="text-muted text-xs">zł</span>
    </label>
  );
}

function AddCategory() {
  const save = useSaveCategory();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<CategoryKind>('personal');
  return (
    <form
      className="flex flex-wrap items-start gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate({ data: { name, kind, monthlyLimit: null, rollover: false } }, { onSuccess: () => setName('') });
      }}
    >
      <input
        className="input input-sm w-52"
        placeholder="Nowa kategoria"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        maxLength={60}
      />
      <select className="select select-sm w-44" value={kind} onChange={(e) => setKind(e.target.value as CategoryKind)}>
        <option value="personal">Wydatek prywatny</option>
        <option value="business">Koszt firmowy</option>
        <option value="income">Przychód</option>
      </select>
      <button className="btn btn-sm btn-primary" disabled={!name.trim() || save.isPending}>
        Dodaj kategorię
      </button>
      <ErrorText error={save.error} />
    </form>
  );
}
