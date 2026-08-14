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

> ⚠️ Oba dokumenty powstały przed wrzuceniem szkieletu na `main` i opisują wariant
> z backendem w Pythonie (FastAPI + SQLAlchemy). Część o zakresie MVP, modelu danych
> i kolejności prac pozostaje aktualna; nazwy technologii w backendzie — nie.
> Do przepisania pod Fastify + Prisma.

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

Schemat i migracje żyją w `packages/db`:

```sh
npx prisma migrate dev --schema packages/db/prisma/schema.prisma
npx prisma generate --schema packages/db/prisma/schema.prisma
```

Wymaga `DATABASE_URL` w `.env` (plik jest w `.gitignore`).

## Przydatne linki

- [Nx — wprowadzenie](https://nx.dev/getting-started/intro)
- [Nx Console dla VSCode / IntelliJ](https://nx.dev/getting-started/editor-setup)
- [Uruchamianie zadań](https://nx.dev/features/run-tasks)
