// Szkielet aplikacji: nawigacja, wybór miesiąca, okno dodawania transakcji.
import { useEffect, useState } from 'react';
import { monthOf, todayIso, yearOf, type Month } from '../../shared/months';
import type { TxType } from '../../shared/schemas';
import type { Transaction } from '../../shared/types';
import { TransactionForm } from './components/TransactionForm';
import { Loading, Modal, MonthSwitcher } from './components/ui';
import { useMeta } from './lib/api';
import { Budget } from './pages/Budget';
import { Dashboard } from './pages/Dashboard';
import { Recurring } from './pages/Recurring';
import { Settings } from './pages/Settings';
import { Taxes } from './pages/Taxes';
import { Transactions } from './pages/Transactions';

const PAGES = [
  { id: 'pulpit', label: 'Pulpit', usesMonth: true },
  { id: 'transakcje', label: 'Transakcje', usesMonth: true },
  { id: 'stale', label: 'Koszty stałe', usesMonth: true },
  { id: 'budzet', label: 'Budżet', usesMonth: true },
  { id: 'podatki', label: 'Podatki', usesMonth: false },
  { id: 'ustawienia', label: 'Ustawienia', usesMonth: false },
] as const;
type PageId = (typeof PAGES)[number]['id'];

/** Prosty routing po #hash – bez dodatkowej biblioteki. */
function usePage(): [PageId, (p: string) => void] {
  const read = () => {
    const id = window.location.hash.replace('#/', '');
    return (PAGES.find((p) => p.id === id)?.id ?? 'pulpit') as PageId;
  };
  const [page, setPage] = useState<PageId>(read);
  useEffect(() => {
    const onHash = () => setPage(read());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return [page, (p) => (window.location.hash = `#/${p}`)];
}

type TxDialog = { transaction?: Transaction; initialType?: TxType } | null;

export function App() {
  const meta = useMeta();
  const [page, go] = usePage();
  const [month, setMonth] = useState<Month>(monthOf(todayIso()));
  const [txDialog, setTxDialog] = useState<TxDialog>(null);

  // Skrót klawiszowy: "n" = nowa transakcja.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.key === 'n' && !e.ctrlKey && !e.metaKey && !['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) && !txDialog) {
        e.preventDefault();
        setTxDialog({});
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [txDialog]);

  const current = PAGES.find((p) => p.id === page)!;
  // Nowa transakcja w innym miesiącu niż bieżący dostaje datę 1. dnia wybranego miesiąca.
  const defaultDate = month === monthOf(todayIso()) ? todayIso() : `${month}-01`;

  return (
    <div className="min-h-screen lg:flex">
      <aside className="bg-base-100 border-base-300 lg:fixed lg:inset-y-0 lg:w-56 lg:border-r">
        <div className="flex items-center gap-2 px-5 pt-4 pb-2 lg:pt-6 lg:pb-6">
          <svg viewBox="0 0 32 32" className="size-7" aria-hidden>
            <rect width="32" height="32" rx="7" className="fill-primary" />
            <rect x="7" y="9" width="18" height="14" rx="2" fill="none" stroke="white" strokeWidth="2.4" />
            <path d="M7 13l9 5 9-5" fill="none" stroke="white" strokeWidth="2.4" />
          </svg>
          <span className="text-lg font-semibold tracking-tight">budgetio</span>
        </div>
        <nav aria-label="Główna" className="border-base-300 border-b lg:border-0">
          <ul className="flex gap-1 overflow-x-auto px-3 pb-2 lg:flex-col lg:px-3">
            {PAGES.map((p) => (
              <li key={p.id}>
                <a
                  href={`#/${p.id}`}
                  aria-current={page === p.id ? 'page' : undefined}
                  className={`block rounded-field px-3 py-2 text-sm whitespace-nowrap ${
                    page === p.id ? 'bg-primary/10 text-primary font-semibold' : 'hover:bg-base-200 text-base-content/80'
                  }`}
                >
                  {p.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      <main className="grow lg:pl-56">
        <header className="bg-base-200/90 sticky top-0 z-10 backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 lg:px-8 lg:py-5">
            <h1 className="text-xl font-semibold">{current.label}</h1>
            <div className="flex items-center gap-2">
              {current.usesMonth && <MonthSwitcher month={month} onChange={setMonth} />}
              <button className="btn btn-primary btn-sm" onClick={() => setTxDialog({})} title="Skrót: N">
                Dodaj transakcję
              </button>
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-6xl px-4 pb-16 lg:px-8">
          {meta.isLoading ? (
            <Loading />
          ) : meta.isError ? (
            <div role="alert" className="alert alert-error">
              Brak połączenia z serwerem. Sprawdź, czy działa komenda „bun run dev” albo „bun start”.
            </div>
          ) : (
            <>
              {page === 'pulpit' && <Dashboard month={month} go={go} onAdd={(initialType) => setTxDialog({ initialType })} />}
              {page === 'transakcje' && (
                <Transactions month={month} onEdit={(transaction) => setTxDialog({ transaction })} onAdd={() => setTxDialog({})} />
              )}
              {page === 'stale' && <Recurring month={month} />}
              {page === 'budzet' && <Budget month={month} />}
              {page === 'podatki' && <Taxes initialYear={yearOf(month)} />}
              {page === 'ustawienia' && <Settings month={month} />}
            </>
          )}
        </div>
      </main>

      <Modal
        open={txDialog !== null}
        onClose={() => setTxDialog(null)}
        title={txDialog?.transaction ? 'Edytuj transakcję' : 'Nowa transakcja'}
        wide
      >
        {txDialog && meta.data && (
          <TransactionForm
            key={txDialog.transaction?.id ?? `new-${txDialog.initialType ?? ''}`}
            transaction={txDialog.transaction}
            initialType={txDialog.initialType}
            defaultDate={defaultDate}
            onDone={() => setTxDialog(null)}
          />
        )}
      </Modal>
    </div>
  );
}
