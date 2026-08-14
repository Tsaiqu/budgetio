# Budgetio

Aplikacja do planowania budżetu domowego. Dostępna z przeglądarki (desktop + telefon)
oraz jako aplikacja mobilna. Docelowo hostowana na własnym VPS.

**Status:** szkielet monorepo stoi, logika biznesowa jeszcze nie.

## Stack

Monorepo [Nx](https://nx.dev) na Bunie:

| Projekt | Technologia |
|---|---|
| `apps/api` | Fastify 5 (TypeScript) |
| `apps/web` | Next.js 16 + React 19 |
| `apps/mobile` | Expo 56 / React Native 0.85 |
| `packages/db` | Prisma 7 + PostgreSQL |
| `packages/core` | kod współdzielony |

## Dokumentacja

- [docs/ROADMAP.md](docs/ROADMAP.md) — plan pracy rozbity na małe chunki z kryteriami odbioru
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — zakres MVP, model danych, decyzje i ich uzasadnienie

## Uruchomienie lokalne

Wymagane: [Bun](https://bun.sh) i Docker.

```sh
bun install
cp .env.example .env        # domyślne wartości wystarczą do pracy lokalnej
docker compose up -d        # Postgres na porcie z POSTGRES_PORT
docker compose ps           # db powinno mieć status "healthy"

cd packages/db
bunx prisma migrate deploy  # zakłada tabele
```

Sprawdzenie, że baza stoi i ma schemat:

```sh
docker compose exec db psql -U budgetio -d budgetio -c '\dt'
```

Powinno wypisać pięć tabel: `User`, `Account`, `Category`, `Transaction`, `Budget`
(plus `_prisma_migrations`).

Zatrzymanie: `docker compose down`. Dane przeżywają restart w wolumenie
`budgetio_budgetio-db-data`; `docker compose down -v` kasuje je razem z wolumenem.

## Uruchamianie zadań

```sh
npx nx <target> <project-name>
```

Na przykład:

```sh
npx nx serve api
npx nx dev web
npx nx build web
```

Cele są [wywnioskowane automatycznie](https://nx.dev/concepts/inferred-tasks) albo zdefiniowane
w `project.json` / `package.json` danego projektu.
Podgląd grafu zależności: `npx nx graph`.

## Baza danych

Schemat i migracje żyją w `packages/db`. Komendy Prismy uruchamiamy **z tego katalogu** —
`prisma.config.ts` ma ścieżki względne:

```sh
cd packages/db
bunx prisma migrate dev --name <nazwa>   # lokalnie
bunx prisma migrate deploy               # produkcja
bunx prisma generate
```

Wymaga `DATABASE_URL` w `.env` (plik jest w `.gitignore`).

## Przydatne linki

- [Nx — wprowadzenie](https://nx.dev/getting-started/intro)
- [Nx Console dla VSCode / IntelliJ](https://nx.dev/getting-started/editor-setup)
- [Uruchamianie zadań](https://nx.dev/features/run-tasks)
