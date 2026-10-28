# budgetio – zasady dla Claude

Aplikacja: budżet domowy + rozliczenia JDG (VAT, PIT skala, ZUS). Szczegóły: `docs/ARCHITECTURE.md`.

## Stack

Bun + Fastify + `bun:sqlite` (czyste SQL) + Zod; front React + Vite + TanStack Query + Tailwind 4 + daisyUI 5.
Bez Next.js, bez ORM, bez monorepo. Nie dodawaj zależności, jeśli wystarczy kilka linii kodu.

## Zasady, których pilnujemy

- Kwoty zawsze jako `int` w groszach. Formatowanie tylko przez `shared/money.ts`.
- Daty jako tekst `YYYY-MM-DD`, miesiące jako `YYYY-MM` (`shared/months.ts`). Bez obiektów `Date` w logice.
- Obliczenia tylko w `server/domain/finance.ts` (czyste funkcje). Front niczego nie liczy poza podglądem w formularzu.
- **Nigdy nie zmieniaj istniejącej migracji** w `server/migrations/`. Zmiana schematu = nowy plik z kolejnym numerem.
- Nigdy nie commituj `data/` (prawdziwe dane użytkownika).
- Teksty w UI po polsku, krótko i konkretnie.

## Komendy

```sh
bun run dev        # front :5173 + API :3000
bun test           # testy obliczeń i API
bun run typecheck
bun start          # build + produkcyjny start
```

Po zmianie w obliczeniach dodaj test w `server/domain/finance.test.ts`.
