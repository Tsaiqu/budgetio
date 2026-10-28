// Aplikacja Fastify: wszystkie trasy API w jednym miejscu.
import type { Database } from 'bun:sqlite';
import Fastify, { type FastifyInstance } from 'fastify';
import { z } from 'zod';
import { makeMonth, type Month } from '../shared/months';
import { monthInput, monthSchema, settingsInput, taxRatesInput, zusStagesInput } from '../shared/schemas';
import type { Meta, TaxYear } from '../shared/types';
import { monthSummary, resolveRates, taxSeries } from './domain/finance';
import * as repo from './repo';

const idParam = z.object({ id: z.coerce.number().int().positive() });
const yearParam = z.object({ year: z.coerce.number().int().min(2000).max(2100) });

export interface AppOptions {
  /** Gdy ustawione, API wymaga logowania (Basic Auth). Przydaje się przy hostingu poza własnym komputerem. */
  password?: string;
}

export function buildApp(db: Database, opts: AppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false });

  if (opts.password) {
    const expected = 'Basic ' + Buffer.from(`budgetio:${opts.password}`).toString('base64');
    app.addHook('onRequest', async (req, reply) => {
      if (req.headers.authorization !== expected) {
        reply.header('WWW-Authenticate', 'Basic realm="budgetio"').code(401).send('Wymagane logowanie');
      }
    });
  }

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof z.ZodError) {
      return reply.code(400).send({ error: z.prettifyError(err) });
    }
    if (err instanceof repo.AppError) {
      return reply.code(err.status).send({ error: err.message });
    }
    console.error(err);
    return reply.code(500).send({ error: 'Błąd serwera. Szczegóły są w konsoli serwera.' });
  });

  // ---------------------------------------------------------------- ustawienia i słowniki

  app.get(
    '/api/meta',
    async (): Promise<Meta> => ({
      categories: repo.listCategories(db),
      settings: repo.getSettings(db),
      zusStages: repo.getStages(db),
      taxRateYears: Object.keys(repo.getRates(db)).map(Number),
    }),
  );

  app.put('/api/settings', async (req) => {
    const s = settingsInput.parse(req.body);
    repo.saveSettings(db, s);
    return repo.getSettings(db);
  });

  app.get('/api/tax-rates', async () => repo.getRates(db));

  app.put('/api/tax-rates/:year', async (req) => {
    const { year } = yearParam.parse(req.params);
    repo.upsertRates(db, year, taxRatesInput.parse(req.body));
    return repo.getRates(db)[year];
  });

  app.put('/api/zus-stages', async (req) => {
    repo.replaceStages(db, zusStagesInput.parse(req.body));
    return repo.getStages(db);
  });

  // ---------------------------------------------------------------- kategorie

  app.post('/api/categories', async (req, reply) => {
    reply.code(201);
    return repo.createCategory(db, req.body);
  });

  app.put('/api/categories/:id', async (req) => repo.updateCategory(db, idParam.parse(req.params).id, req.body));

  // ---------------------------------------------------------------- transakcje

  app.get('/api/transactions', async (req) => {
    const { month } = z.object({ month: monthSchema.optional() }).parse(req.query);
    return repo.listTransactions(db, month);
  });

  app.post('/api/transactions', async (req, reply) => {
    reply.code(201);
    return repo.saveTransaction(db, req.body);
  });

  app.put('/api/transactions/:id', async (req) => repo.saveTransaction(db, req.body, idParam.parse(req.params).id));

  app.delete('/api/transactions/:id', async (req, reply) => {
    repo.deleteTransaction(db, idParam.parse(req.params).id);
    return reply.code(204).send();
  });

  // ---------------------------------------------------------------- koszty stałe

  app.get('/api/recurring', async () => repo.listRecurring(db));

  app.post('/api/recurring', async (req, reply) => {
    reply.code(201);
    return repo.createRecurring(db, req.body);
  });

  app.put('/api/recurring/:id', async (req) => repo.updateRecurring(db, idParam.parse(req.params).id, req.body));

  app.post('/api/recurring/:id/stop', async (req) => {
    const { month } = monthInput.parse(req.body);
    return repo.stopRecurring(db, idParam.parse(req.params).id, month);
  });

  app.post('/api/recurring/:id/resume', async (req) => {
    const body = monthInput.extend({ amountGross: z.number().int().positive().optional() }).parse(req.body);
    return repo.resumeRecurring(db, idParam.parse(req.params).id, body.month, body.amountGross);
  });

  app.delete('/api/recurring/:id', async (req, reply) => {
    repo.deleteRecurring(db, idParam.parse(req.params).id);
    return reply.code(204).send();
  });

  // ---------------------------------------------------------------- raporty

  app.get('/api/summary', async (req) => {
    const { month } = monthInput.parse(req.query);
    const { data, from } = repo.loadFinanceData(db, month);
    return monthSummary(data, month, taxSeries(data, from, month));
  });

  app.get('/api/taxes', async (req): Promise<TaxYear> => {
    const { year } = yearParam.parse(req.query);
    const to: Month = makeMonth(year, 12);
    const { data, from } = repo.loadFinanceData(db, to);
    const months = taxSeries(data, from, to).filter((m) => m.month.startsWith(`${year}-`));
    const resolved = resolveRates(data.rates, year);
    return { year, months, ratesYear: resolved && resolved.year !== year ? resolved.year : null };
  });

  return app;
}
