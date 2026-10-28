// Ręczna kopia zapasowa bazy: bun run backup
// Kopia ląduje w data/backups/. Plik .db możesz otworzyć dowolnym narzędziem do SQLite.
import { dirname, join } from 'node:path';
import { backupDatabase, DEFAULT_DB_PATH, openDatabase } from './db';

const db = openDatabase(DEFAULT_DB_PATH);
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const target = join(dirname(DEFAULT_DB_PATH), 'backups', `budgetio-${stamp}.db`);
backupDatabase(db, target);
db.close();
console.log(`Kopia zapisana: ${target}`);
