// Komunikacja z API + hooki TanStack Query.
// Po każdej zmianie unieważniamy wszystkie zapytania: dane są małe, a prawie każda zmiana
// wpływa na podsumowanie, budżet i podatki naraz.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Month } from '../../../shared/months';
import type {
  CategoryInput,
  RecurringCreateInput,
  RecurringUpdateInput,
  Settings,
  TaxRates,
  TransactionInput,
  ZusStageChange,
} from '../../../shared/schemas';
import type { Category, Meta, MonthSummary, RecurringItem, TaxYear, Transaction } from '../../../shared/types';

export class ApiError extends Error {}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(data?.error ?? `Błąd ${res.status}`);
  return data as T;
}

// ---------------------------------------------------------------- odczyt

export const useMeta = () => useQuery({ queryKey: ['meta'], queryFn: () => request<Meta>('GET', '/api/meta') });

export const useSummary = (month: Month) =>
  useQuery({ queryKey: ['summary', month], queryFn: () => request<MonthSummary>('GET', `/api/summary?month=${month}`) });

export const useTransactions = (month: Month) =>
  useQuery({ queryKey: ['transactions', month], queryFn: () => request<Transaction[]>('GET', `/api/transactions?month=${month}`) });

export const useRecurring = () => useQuery({ queryKey: ['recurring'], queryFn: () => request<RecurringItem[]>('GET', '/api/recurring') });

export const useTaxes = (year: number) =>
  useQuery({ queryKey: ['taxes', year], queryFn: () => request<TaxYear>('GET', `/api/taxes?year=${year}`) });

export const useRates = () => useQuery({ queryKey: ['rates'], queryFn: () => request<Record<number, TaxRates>>('GET', '/api/tax-rates') });

// ---------------------------------------------------------------- zapis

function useApiMutation<V, T = unknown>(fn: (vars: V) => Promise<T>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries() });
}

export const useSaveTransaction = () =>
  useApiMutation(({ id, data }: { id?: number; data: TransactionInput }) =>
    id ? request<Transaction>('PUT', `/api/transactions/${id}`, data) : request<Transaction>('POST', '/api/transactions', data),
  );

export const useDeleteTransaction = () => useApiMutation((id: number) => request('DELETE', `/api/transactions/${id}`));

export const useSaveCategory = () =>
  useApiMutation(({ id, data }: { id?: number; data: CategoryInput }) =>
    id ? request<Category>('PUT', `/api/categories/${id}`, data) : request<Category>('POST', '/api/categories', data),
  );

export const useCreateRecurring = () =>
  useApiMutation((data: RecurringCreateInput) => request<RecurringItem>('POST', '/api/recurring', data));

export const useUpdateRecurring = () =>
  useApiMutation(({ id, data }: { id: number; data: RecurringUpdateInput }) => request<RecurringItem>('PUT', `/api/recurring/${id}`, data));

export const useStopRecurring = () =>
  useApiMutation(({ id, month }: { id: number; month: Month }) => request('POST', `/api/recurring/${id}/stop`, { month }));

export const useResumeRecurring = () =>
  useApiMutation(({ id, month, amountGross }: { id: number; month: Month; amountGross?: number }) =>
    request('POST', `/api/recurring/${id}/resume`, { month, amountGross }),
  );

export const useDeleteRecurring = () => useApiMutation((id: number) => request('DELETE', `/api/recurring/${id}`));

export const useSaveSettings = () => useApiMutation((data: Settings) => request('PUT', '/api/settings', data));

export const useSaveStages = () => useApiMutation((data: ZusStageChange[]) => request('PUT', '/api/zus-stages', data));

export const useSaveRates = () =>
  useApiMutation(({ year, data }: { year: number; data: TaxRates }) => request('PUT', `/api/tax-rates/${year}`, data));
