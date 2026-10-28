// Ustawienia: ogólne, etapy ZUS, stawki podatkowe na rok, kopia zapasowa.
import { useState } from 'react';
import { groszeToInput, parseMoney } from '../../../shared/money';
import { addMonths, monthLabel, type Month } from '../../../shared/months';
import { ZUS_STAGES, type Settings as SettingsT, type TaxRates, type ZusStageChange } from '../../../shared/schemas';
import { ErrorText, Field, Loading } from '../components/ui';
import { useMeta, useRates, useSaveRates, useSaveSettings, useSaveStages } from '../lib/api';
import { VAT_RATES, vatLabel, ZUS_STAGE_LABEL } from '../lib/labels';

export function Settings(props: { month: Month }) {
  const { data: meta } = useMeta();
  const { data: rates } = useRates();
  if (!meta || !rates) return <Loading />;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <GeneralSettings settings={meta.settings} />
        <ZusStages stages={meta.zusStages} month={props.month} />
        <section className="panel p-5">
          <h2 className="font-semibold">Twoje dane</h2>
          <p className="text-muted mt-2 text-sm">
            Wszystko jest w jednym pliku <code className="bg-base-200 rounded px-1">data/budgetio.db</code>. Plik nie jest w repozytorium,
            więc aktualizacja kodu go nie rusza. Przed każdą zmianą schematu bazy aplikacja sama robi kopię w{' '}
            <code className="bg-base-200 rounded px-1">data/backups/</code>. Ręczną kopię zrobisz komendą{' '}
            <code className="bg-base-200 rounded px-1">bun run backup</code>.
          </p>
        </section>
      </div>
      <RatesEditor rates={rates} />
    </div>
  );
}

function GeneralSettings({ settings }: { settings: SettingsT }) {
  const save = useSaveSettings();
  const [s, setS] = useState(settings);
  return (
    <section className="panel p-5">
      <h2 className="font-semibold">Ogólne</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(s);
        }}
      >
        <div className="grid gap-x-3 sm:grid-cols-2">
          <Field label="Domyślna stawka VAT na fakturach">
            <select
              className="select w-full"
              value={s.defaultVatRate}
              onChange={(e) => setS({ ...s, defaultVatRate: Number(e.target.value) })}
            >
              {VAT_RATES.map((r) => (
                <option key={r} value={r}>
                  {vatLabel(r)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Termin płatności faktury" hint="Domyślna data wpływu = data faktury + tyle dni.">
            <label className="input w-full">
              <input
                type="number"
                min={0}
                max={120}
                className="grow"
                value={s.paymentTermDays}
                onChange={(e) => setS({ ...s, paymentTermDays: Number(e.target.value) })}
              />
              <span className="text-muted">dni</span>
            </label>
          </Field>
        </div>
        <label className="label mt-3 cursor-pointer gap-3 text-sm">
          <input
            type="checkbox"
            className="toggle toggle-sm toggle-primary"
            checked={s.sicknessInsurance}
            onChange={(e) => setS({ ...s, sicknessInsurance: e.target.checked })}
          />
          <span className="text-base-content">Płacę dobrowolne ubezpieczenie chorobowe</span>
        </label>
        <ErrorText error={save.error} />
        <div className="mt-4 flex items-center gap-3">
          <button className="btn btn-primary btn-sm" disabled={save.isPending}>
            Zapisz ustawienia
          </button>
          {save.isSuccess && <span className="text-success text-sm">Zapisano</span>}
        </div>
      </form>
    </section>
  );
}

function ZusStages({ stages, month }: { stages: ZusStageChange[]; month: Month }) {
  const save = useSaveStages();
  const [rows, setRows] = useState(stages);
  const set = (i: number, patch: Partial<ZusStageChange>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const sorted = [...rows].sort((a, b) => a.month.localeCompare(b.month));

  return (
    <section className="panel p-5">
      <h2 className="font-semibold">Etapy ZUS</h2>
      <p className="text-muted mt-1 text-sm">
        Etap obowiązuje od wybranego miesiąca do następnej zmiany. Zwykle: ulga na start (6 miesięcy), potem preferencyjny (24 miesiące),
        potem pełny.
      </p>
      <form
        className="mt-3 space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(sorted);
        }}
      >
        {rows.length === 0 && <p className="text-sm">Nie ma jeszcze żadnego etapu. Dodaj miesiąc, w którym zaczęła się działalność.</p>}
        {rows.map((r, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <span className="text-muted w-6 text-sm">od</span>
            <input
              type="month"
              className="input input-sm w-40"
              required
              value={r.month}
              onChange={(e) => set(i, { month: e.target.value })}
            />
            <select
              className="select select-sm w-48"
              value={r.stage}
              onChange={(e) => set(i, { stage: e.target.value as ZusStageChange['stage'] })}
            >
              {ZUS_STAGES.map((s) => (
                <option key={s} value={s}>
                  {ZUS_STAGE_LABEL[s]}
                </option>
              ))}
            </select>
            <button type="button" className="btn btn-ghost btn-xs text-muted" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
              Usuń
            </button>
          </div>
        ))}
        <div className="flex flex-wrap gap-2 pt-2">
          <button
            type="button"
            className="btn btn-ghost btn-sm border-base-300"
            onClick={() => {
              const last = sorted[sorted.length - 1];
              setRows([
                ...rows,
                last
                  ? { month: addMonths(last.month, last.stage === 'start_relief' ? 6 : 24), stage: nextStage(last.stage) }
                  : { month, stage: 'start_relief' },
              ]);
            }}
          >
            Dodaj zmianę etapu
          </button>
          <button className="btn btn-primary btn-sm" disabled={save.isPending}>
            Zapisz etapy
          </button>
          {save.isSuccess && <span className="text-success self-center text-sm">Zapisano</span>}
        </div>
        {sorted.length > 0 && (
          <p className="text-muted text-xs">
            Teraz ({monthLabel(month)}): {ZUS_STAGE_LABEL[[...sorted].reverse().find((s) => s.month <= month)?.stage ?? 'none']}
          </p>
        )}
        <ErrorText error={save.error} />
      </form>
    </section>
  );
}

function nextStage(stage: ZusStageChange['stage']): ZusStageChange['stage'] {
  return stage === 'none' ? 'start_relief' : stage === 'start_relief' ? 'preferential' : 'full';
}

// ---------------------------------------------------------------- stawki

type RateField = { key: keyof TaxRates; label: string; unit: 'zl' | 'pct' };
const RATE_GROUPS: { title: string; fields: RateField[] }[] = [
  {
    title: 'ZUS społeczny',
    fields: [
      { key: 'zusFullBase', label: 'Podstawa – pełny ZUS', unit: 'zl' },
      { key: 'zusPrefBase', label: 'Podstawa – preferencyjny', unit: 'zl' },
      { key: 'pensionRateBp', label: 'Emerytalna', unit: 'pct' },
      { key: 'disabilityRateBp', label: 'Rentowa', unit: 'pct' },
      { key: 'accidentRateBp', label: 'Wypadkowa', unit: 'pct' },
      { key: 'sicknessRateBp', label: 'Chorobowa', unit: 'pct' },
      { key: 'laborFundRateBp', label: 'Fundusz Pracy', unit: 'pct' },
    ],
  },
  {
    title: 'Składka zdrowotna (skala)',
    fields: [
      { key: 'healthRateBp', label: 'Stawka', unit: 'pct' },
      { key: 'healthMin', label: 'Minimalna składka', unit: 'zl' },
    ],
  },
  {
    title: 'PIT – skala podatkowa',
    fields: [
      { key: 'pitRate1Bp', label: 'Stawka I progu', unit: 'pct' },
      { key: 'pitRate2Bp', label: 'Stawka II progu', unit: 'pct' },
      { key: 'pitThreshold', label: 'Próg roczny', unit: 'zl' },
      { key: 'pitReduction', label: 'Kwota zmniejszająca (rocznie)', unit: 'zl' },
    ],
  },
];

const toText = (v: number, unit: RateField['unit']) => (unit === 'zl' ? groszeToInput(v) : String(v / 100).replace('.', ','));
const fromText = (t: string, unit: RateField['unit']) => {
  if (unit === 'zl') return parseMoney(t);
  const n = Number(t.replace(',', '.'));
  return Number.isFinite(n) && t.trim() !== '' ? Math.round(n * 100) : null;
};

function RatesEditor({ rates }: { rates: Record<number, TaxRates> }) {
  const years = Object.keys(rates).map(Number).sort();
  const [year, setYear] = useState(years[years.length - 1] ?? new Date().getFullYear());
  return (
    <section className="panel p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Stawki podatkowe</h2>
        <div className="flex items-center gap-2">
          <select className="select select-sm w-28" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
            {!years.includes(year) && <option value={year}>{year} (nowy)</option>}
          </select>
          <button type="button" className="btn btn-ghost btn-sm border-base-300" onClick={() => setYear(Math.max(...years, year) + 1)}>
            Dodaj rok
          </button>
        </div>
      </div>
      <p className="text-muted mt-1 text-sm">Sprawdź stawki raz w roku (zwykle w styczniu). Nowy rok startuje jako kopia ostatniego.</p>
      <RatesForm key={year} year={year} initial={rates[year] ?? rates[years[years.length - 1]]} isNew={!rates[year]} />
    </section>
  );
}

function RatesForm({ year, initial, isNew }: { year: number; initial?: TaxRates; isNew: boolean }) {
  const save = useSaveRates();
  const [text, setText] = useState<Record<string, string>>(() =>
    Object.fromEntries(RATE_GROUPS.flatMap((g) => g.fields).map((f) => [f.key, initial ? toText(initial[f.key], f.unit) : ''])),
  );
  const fields = RATE_GROUPS.flatMap((g) => g.fields);
  const parsed = Object.fromEntries(fields.map((f) => [f.key, fromText(text[f.key] ?? '', f.unit)]));
  const valid = fields.every((f) => parsed[f.key] !== null);

  return (
    <form
      className="mt-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) save.mutate({ year, data: parsed as unknown as TaxRates });
      }}
    >
      {RATE_GROUPS.map((g) => (
        <fieldset key={g.title} className="mb-3">
          <legend className="text-muted mb-1 text-xs font-medium">{g.title}</legend>
          <div className="grid gap-y-1">
            {g.fields.map((f) => (
              <label key={f.key} className="flex items-center justify-between gap-2 text-sm">
                <span>{f.label}</span>
                <span className={`input input-sm w-36 ${parsed[f.key] === null ? 'input-error' : ''}`}>
                  <input
                    className="money grow text-right"
                    inputMode="decimal"
                    value={text[f.key]}
                    onChange={(e) => setText({ ...text, [f.key]: e.target.value })}
                  />
                  <span className="text-muted text-xs">{f.unit === 'zl' ? 'zł' : '%'}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      <ErrorText error={save.error} />
      <div className="mt-2 flex items-center gap-3">
        <button className="btn btn-primary btn-sm" disabled={!valid || save.isPending}>
          {isNew ? `Zapisz stawki na ${year}` : 'Zapisz stawki'}
        </button>
        {save.isSuccess && <span className="text-success text-sm">Zapisano</span>}
      </div>
    </form>
  );
}
