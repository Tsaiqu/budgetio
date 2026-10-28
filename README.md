# budgetio

Budżet domowy i rozliczenia JDG w jednym miejscu. Aplikacja liczy:

- ile realnie zostaje na koncie w danym miesiącu (wpływy minus podatki, koszty i wydatki),
- ile odłożyć z każdej faktury na VAT, PIT (skala podatkowa), ZUS i składkę zdrowotną,
- budżet kategorii z limitami i opcjonalnym przenoszeniem salda na kolejny miesiąc,
- koszty stałe (czynsz, subskrypcje) z historią zmian kwoty, wstrzymaniem i wznowieniem.

To narzędzie do planowania. Nie zastępuje księgowości.

## Stack

| Część | Technologia |
|---|---|
| Runtime | [Bun](https://bun.sh) (TypeScript bez kompilacji, wbudowane SQLite i testy) |
| Backend | Fastify 5 + `bun:sqlite`, czyste SQL bez ORM |
| Walidacja | Zod (te same schematy na serwerze i we froncie) |
| Front | React 19 + Vite + TanStack Query + Tailwind CSS 4 + daisyUI 5 |
| Baza | SQLite – jeden plik `data/budgetio.db` |

Dlaczego tak, a nie Next.js + Postgres: patrz [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Uruchomienie

Wymagany Bun 1.2 albo nowszy (`curl -fsSL https://bun.sh/install | bash` albo `yay -S bun-bin`).

```sh
bun install
bun start            # buduje front i uruchamia aplikację: http://localhost:3000
```

Tryb deweloperski (przeładowanie po każdej zmianie kodu):

```sh
bun run dev          # front: http://localhost:5173, API: http://localhost:3000
```

## Twoje dane

- Wszystkie dane są w pliku `data/budgetio.db`. Katalog `data/` jest w `.gitignore`, więc `git pull`
  i zmiany w kodzie nigdy go nie nadpiszą.
- Przy starcie aplikacja sama uruchamia nowe migracje bazy. **Przed każdą migracją robi kopię**
  w `data/backups/`.
- Ręczna kopia: `bun run backup`. Nie kopiuj pliku `.db` ręcznie, gdy aplikacja działa – część zmian
  może być jeszcze w pliku `budgetio.db-wal`. Komenda `backup` robi spójną kopię w jednym pliku.
- Inna lokalizacja bazy: `BUDGETIO_DB=/ścieżka/do/pliku.db bun start`.

Aktualizacja aplikacji:

```sh
git pull && bun install && bun start
```

## Dostęp z telefonu (sieć domowa)

```sh
HOST=0.0.0.0 BUDGETIO_PASSWORD='twoje-hasło' bun start
```

Potem na telefonie otwórz `http://<IP-komputera>:3000` (login: `budgetio`). Bez `HOST` aplikacja
jest dostępna tylko na tym komputerze.

### Autostart (systemd, opcjonalnie)

`~/.config/systemd/user/budgetio.service`:

```ini
[Unit]
Description=budgetio

[Service]
WorkingDirectory=%h/projekty/budgetio
ExecStart=%h/.bun/bin/bun server/index.ts
Restart=on-failure

[Install]
WantedBy=default.target
```

Potem: `bun run build && systemctl --user enable --now budgetio`.

## Testy i sprawdzanie typów

```sh
bun test             # obliczenia (zgodne z arkuszem Excel) + API na bazie w pamięci
bun run typecheck
```

## Struktura

```
server/
  index.ts            start: baza, migracje, API, serwowanie zbudowanego frontu
  app.ts              wszystkie trasy API
  repo.ts             zapytania SQL
  db.ts               połączenie z SQLite, migracje, kopie zapasowe
  domain/finance.ts   obliczenia VAT / PIT / ZUS / budżet (czyste funkcje + testy)
  migrations/         pliki 001_*.sql, 002_*.sql, ...
shared/               kod wspólny: schematy Zod, typy API, kwoty, miesiące
web/src/
  App.tsx             nawigacja, wybór miesiąca, okno nowej transakcji
  pages/              Pulpit, Transakcje, Koszty stałe, Budżet, Podatki, Ustawienia
  components/         formularze i małe elementy UI
  lib/api.ts          hooki TanStack Query
```

## Zmiana schematu bazy

1. Dodaj nowy plik `server/migrations/00X_opis.sql` (kolejny numer).
2. **Nigdy nie zmieniaj migracji, która już jest w `main`** – u Ciebie lokalnie już się wykonała.
3. Uruchom aplikację – migracja wykona się sama, a stara baza trafi do `data/backups/`.
