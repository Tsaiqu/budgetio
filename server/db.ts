// Połączenie z bazą SQLite i migracje.
// Baza to jeden plik (domyślnie data/budgetio.db). Plik jest poza gitem,
// więc aktualizacja kodu (git pull) nigdy go nie nadpisze.
import { Database } from 'bun:sqlite';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const MIGRATIONS_DIR = join(import.meta.dir, 'migrations');

export const DEFAULT_DB_PATH = process.env.BUDGETIO_DB ?? join(process.cwd(), 'data', 'budgetio.db');

export function openDatabase(path: string = DEFAULT_DB_PATH): Database {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path, { strict: true });
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  return db;
}

/** Spójna kopia bazy do pliku (działa także, gdy aplikacja chodzi). */
export function backupDatabase(db: Database, targetPath: string): void {
  mkdirSync(dirname(targetPath), { recursive: true });
  db.prepare('VACUUM INTO ?').run(targetPath);
}

/**
 * Uruchamia brakujące migracje z server/migrations (w kolejności nazw plików).
 * Przed pierwszą brakującą migracją robi kopię istniejącej bazy do data/backups/.
 */
export function migrate(db: Database, backupDir?: string): string[] {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version    TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  const applied = new Set(
    db
      .query<{ version: string }, []>('SELECT version FROM schema_migrations')
      .all()
      .map((r) => r.version),
  );
  const pending = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .filter((f) => !applied.has(f));

  if (pending.length === 0) return [];

  if (backupDir && applied.size > 0) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const target = join(backupDir, `budgetio-before-${pending[0].replace('.sql', '')}-${stamp}.db`);
    backupDatabase(db, target);
    console.log(`[db] kopia zapasowa przed migracją: ${target}`);
  }

  for (const file of pending) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(file);
    })();
    console.log(`[db] migracja zastosowana: ${file}`);
  }
  return pending;
}
