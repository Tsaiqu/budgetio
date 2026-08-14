import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { defineConfig, env } from 'prisma/config';

// .env leży w korzeniu monorepo, a komendy Prismy uruchamiamy z packages/db
// (schema i migrations mają tu ścieżki względne). `dotenv/config` szukałby .env
// w katalogu roboczym, czyli w packages/db — dlatego wskazujemy ścieżkę jawnie.
config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../.env') });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
