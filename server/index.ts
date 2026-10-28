// Start serwera: otwiera bazę, uruchamia migracje, serwuje API i zbudowany front (dist/).
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { buildApp } from './app';
import { DEFAULT_DB_PATH, migrate, openDatabase } from './db';

const port = Number(process.env.PORT ?? 3000);
// Domyślnie tylko ten komputer. HOST=0.0.0.0 udostępnia aplikację w sieci domowej (np. dla telefonu).
const host = process.env.HOST ?? '127.0.0.1';

const db = openDatabase(DEFAULT_DB_PATH);
migrate(db, join(dirname(DEFAULT_DB_PATH), 'backups'));

const app = buildApp(db, { password: process.env.BUDGETIO_PASSWORD });

const distDir = join(import.meta.dir, '..', 'dist');
if (existsSync(distDir)) {
  await app.register(fastifyStatic, { root: distDir });
} else {
  app.get('/', async () => 'Front nie jest zbudowany. W trybie dev otwórz http://localhost:5173, albo uruchom: bun start');
}

if (host !== '127.0.0.1' && host !== 'localhost' && !process.env.BUDGETIO_PASSWORD) {
  console.warn('[uwaga] Aplikacja jest dostępna w sieci bez hasła. Ustaw BUDGETIO_PASSWORD, jeśli sieć nie jest tylko Twoja.');
}

await app.listen({ port, host });
console.log(`budgetio działa: http://${host === '0.0.0.0' ? 'localhost' : host}:${port}  (baza: ${DEFAULT_DB_PATH})`);

const shutdown = async () => {
  await app.close();
  db.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
