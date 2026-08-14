# Budgetio — roadmapa w małych chunkach

Każdy chunk ma **Robisz** (co powstaje) i **Sprawdzasz** (jak w minutę potwierdzić, że działa).
Chunk kończy się działającym, sprawdzalnym stanem — nie ma „dokończę w następnym".
Szacunki czasowe są dla osoby znającej stack; traktuj je jako proporcje, nie zobowiązanie.

Punkt wyjścia: monorepo Nx stoi, Prisma ma schemat startowy i wygenerowany klient,
`apps/api` ma wpięty plugin Prismy i jedną działającą trasę, `apps/web` i `apps/mobile`
mają ekrany powitalne Nx.

**Legenda:** ⬜ do zrobienia · ✅ zrobione · ⏭️ można pominąć w MVP

> Komendy Prismy uruchamiamy **z katalogu `packages/db`** — `prisma.config.ts` ma tam ścieżki
> względne (`schema: 'prisma/schema.prisma'`).

---

## Faza 0 — Uporządkowanie szkieletu (~1,5 h)

Cztery rzeczy, które są tanie teraz i drogie za dwa tygodnie.

- [ ] **0.1 · Postgres w Dockerze + `.env`** · ~25 min
  **Robisz:** `docker-compose.yml` z Postgresem 17, nazwanym wolumenem i healthcheckiem;
  `.env.example` z `DATABASE_URL`, `JWT_SECRET`, `PORT`; `.env` lokalnie (jest w `.gitignore`).
  **Sprawdzasz:** `docker compose up -d` → `docker compose ps` pokazuje `healthy`;
  `cd packages/db && bunx prisma migrate deploy` przechodzi;
  `docker compose exec db psql -U budgetio -d budgetio -c '\dt'` wypisuje pięć tabel.

- [ ] **0.2 · Rozjazd portów** · ~10 min
  **Robisz:** `apps/api/src/main.ts` domyślnie na **3333** zamiast 3000 (Next.js dev zajmuje 3000).
  **Sprawdzasz:** `nx serve api` i `nx dev web` chodzą **jednocześnie**, żaden nie wywala
  `EADDRINUSE`.

- [ ] **0.3 · Literówka `pacakges/core` → `packages/core`** · ~15 min
  **Robisz:** zmiana nazwy katalogu + poprawka ścieżki w `tsconfig.base.json`
  (`"@budgetio/core": ["./pacakges/core/src/index.ts"]`) i w `project.json` pakietu.
  **Sprawdzasz:** `git ls-files | grep pacakges` nie zwraca nic;
  `import { core } from '@budgetio/core'` kompiluje się w `apps/api`.

- [ ] **0.4 · `.github/workspaces` → `.github/workflows`** · ~5 min
  **Robisz:** przeniesienie `claude.yml` do właściwego katalogu.
  **Sprawdzasz:** zakładka Actions na GitHubie widzi workflow — z `workspaces/` nie jest
  czytany w ogóle, więc dziś ten plik jest martwy.

- [ ] **0.5 · Smoke test całości** · ~20 min
  **Robisz:** `bun install`, uruchomienie wszystkich trzech aplikacji.
  **Sprawdzasz:** `curl localhost:3333/categories` → `[]` (pusta tablica z prawdziwej bazy,
  nie błąd); `localhost:3000` pokazuje stronę Nx; `nx run mobile:start` startuje Expo.

---

## Faza 1 — Poprawki schematu przed pierwszymi danymi (~1 h)

Wzorzec każdego chunku: zmiana w `schema.prisma` → `bunx prisma migrate dev --name <nazwa>` →
**przeczytaj wygenerowany SQL** → sprawdź w psql.
Kolejność wewnątrz fazy dowolna, ale **cała faza przed Fazą 4** — po wejściu prawdziwych danych
każda z tych zmian wymaga backfillu zamiast czystej migracji.

- [ ] **1.1 · Daty jako `DATE`** · ~20 min
  **Robisz:** `occurredAt DateTime @db.Date` na `Transaction`,
  `periodStart`/`periodEnd @db.Date` na `Budget`. `createdAt` zostaje `TIMESTAMP`.
  **Sprawdzasz:** `\d "Transaction"` pokazuje `date`, nie `timestamp(3)`;
  transakcja zapisana 31.08 o 23:30 czasu lokalnego ma w bazie `2026-08-31`.

- [ ] **1.2 · Unikaty** · ~20 min
  **Robisz:** `@@unique([userId, categoryId, periodStart])` na `Budget`,
  `@@unique([userId, name, parentId])` na `Category`.
  **Sprawdzasz:** dwa `INSERT`y budżetu na tę samą kategorię i miesiąc → naruszenie unikatu.
  Bez tego „ustaw limit" bez upserta cicho robi duplikaty, a podsumowanie zaczyna kłamać.

- [ ] **1.3 · Indeksy** · ~20 min
  **Robisz:** `@@index([accountId, occurredAt])` na `Transaction`,
  `@@index([categoryId])` na `Transaction`, `@@index([userId, periodStart])` na `Budget`.
  **Sprawdzasz:** `\d "Transaction"` wymienia indeksy; migracja startowa nie ma **żadnego**
  poza unikatem na `User.email` — Postgres nie indeksuje kolumn FK sam z siebie.

---

## Faza 2 — `packages/core`: wspólny kontrakt (~2 h)

To jest powód, dla którego całość jest w TypeScripcie. Szczegóły w
[ARCHITECTURE.md §3.1](./ARCHITECTURE.md).

- [ ] **2.1 · Pakiet gotowy na zod** · ~25 min
  **Robisz:** `zod` jako zależność `packages/core`, usunięcie stubu `core()` z generatora Nx.
  **Sprawdzasz:** `import { z } from 'zod'` w `packages/core` kompiluje się;
  `nx build core` przechodzi.

- [ ] **2.2 · Prymitywy domenowe** · ~30 min
  **Robisz:** `amountMinor` (int dodatni), `isoDate` (`YYYY-MM-DD`), enumy `TransactionType`,
  `CategoryType`, `AccountType` — lustrzane wobec enumów Prismy; helpery
  `formatMoney(minor)` → `199,99 zł` i `parseMoney('12,50')` → `1250`.
  **Sprawdzasz:** `parseMoney('12,50')` i `parseMoney('12.50')` dają `1250`;
  `formatMoney(1250)` → `12,50 zł`; `parseMoney('abc')` rzuca, a nie zwraca `NaN`.

- [ ] **2.3 · Schematy wejścia** · ~35 min
  **Robisz:** zod-schematy dla body każdego planowanego endpointu (`createTransactionInput`,
  `updateTransactionInput`, `upsertBudgetInput`, `createCategoryInput`, `registerInput`,
  `loginInput`) + wyeksportowane typy przez `z.infer`.
  **Sprawdzasz:** `createTransactionInput.parse({...})` odrzuca ujemne `amountMinor`
  i datę w formacie `31/08/2026`.

- [ ] **2.4 · Schematy odpowiedzi** · ~30 min
  **Robisz:** `TransactionDTO`, `CategoryDTO`, `BudgetDTO`, `AccountDTO`, `MonthSummaryDTO`.
  DTO **nie są** typami Prismy — nie wypuszczamy `passwordHash` ani kształtu bazy na zewnątrz.
  **Sprawdzasz:** `MonthSummaryDTO` ma pola `limitMinor`, `spentMinor`, `remainingMinor`;
  żaden DTO nie importuje niczego z `@budgetio/db`.

- [ ] **2.5 · Kontrakt naprawdę spina trzy aplikacje** · ~20 min
  **Robisz:** import DTO w `apps/web` i `apps/mobile` (choćby w jednym miejscu na próbę).
  **Sprawdzasz:** to jest kryterium odbioru całej fazy — **zmień nazwę pola w `packages/core`
  i uruchom `nx run-many -t typecheck`. Muszą się wywalić `api`, `web` i `mobile` naraz.**
  Jeśli któraś przechodzi, kontrakt jest tam podpięty tylko na niby.

---

## Faza 3 — Auth (~2,5 h)

- [ ] **3.1 · Rejestracja** · ~45 min
  **Robisz:** `POST /auth/register`, hash `@node-rs/argon2`, walidacja `registerInput` z core,
  w tej samej transakcji: domyślne konto (`AccountType.CASH`, „Gotówka") i zestaw kategorii
  startowych (jedzenie, transport, mieszkanie, rozrywka, zdrowie, inne + wypłata jako `INCOME`).
  **Sprawdzasz:** 201 i odpowiedź **bez** hasła i hasha; drugi raz ten sam mail → 409;
  w bazie `passwordHash` zaczyna się od `$argon2`; nowy user ma od razu 1 konto i 7 kategorii.

- [ ] **3.2 · Logowanie** · ~40 min
  **Robisz:** `@fastify/jwt`, `POST /auth/login` → token (`sub` = user id, `exp` ~30 dni na MVP).
  **Sprawdzasz:** dobre hasło → 200 + token; złe hasło i nieistniejący mail → 401
  z **identycznym** komunikatem (inaczej endpoint zdradza, które maile są zarejestrowane);
  token rozkodowany w jwt.io ma sensowny payload.

- [ ] **3.3 · Chronione trasy** · ~35 min
  **Robisz:** dekorator `fastify.authenticate` jako `preHandler`, rozszerzenie
  `apps/api/src/types/fastify.d.ts` o `request.user`, endpoint `GET /me`.
  **Sprawdzasz:** `/me` bez nagłówka → 401; z tokenem → dane usera;
  po zmianie jednego znaku w tokenie → 401; `request.user.id` podpowiada się w edytorze.

- [ ] **3.4 · CORS + rate limit** · ~25 min
  **Robisz:** `@fastify/cors` z listą originów z env, `@fastify/rate-limit` na `/auth/*`.
  **Sprawdzasz:** fetch z `localhost:3000` przechodzi, z losowego origin nie;
  dziesiąta próba logowania z rzędu → 429.

---

## Faza 4 — API budżetu (~3,5 h)

Wszystkie trasy przez `fastify-type-provider-zod` ze schematami z `packages/core`.

**Reguła bez wyjątków:** `userId` bierzemy z tokenu, nigdy z body ani query.
`Transaction` nie ma `userId` — filtrujemy przez relację `where: { account: { userId } }`.
Brak tej linijki = dowolny zalogowany user czyta cudze transakcje.

- [ ] **4.1 · Konta** · ~35 min
  **Robisz:** `GET/POST/PATCH /accounts`. Musi być przed transakcjami — `Transaction.accountId`
  jest wymagane.
  **Sprawdzasz:** lista pokazuje domyślne konto z rejestracji; token usera B nie widzi kont usera A.

- [ ] **4.2 · Kategorie** · ~40 min
  **Robisz:** rozbudowa istniejącego `apps/api/src/app/routes/categories.ts` — filtrowanie po
  `userId`, `POST`, `PATCH`, `DELETE`.
  **Sprawdzasz:** obecna trasa zwraca **wszystkie** kategorie ze wszystkich kont — po zmianie
  ma zwracać tylko swoje; usunięcie kategorii używanej przez transakcje nie wywala FK
  (`onDelete: SetNull`), transakcja zostaje z `categoryId: null`.

- [ ] **4.3 · Transakcje: dodawanie i lista** · ~50 min
  **Robisz:** `POST /transactions`, `GET /transactions?month=YYYY-MM`, sortowanie po dacie malejąco.
  **Sprawdzasz:** dodana transakcja jest na liście swojego miesiąca i **nie ma** jej w sąsiednim;
  transakcje z 1. i z ostatniego dnia miesiąca wpadają do właściwego (klasyczne miejsce na błąd
  o jeden dzień); `amountMinor: -500` → 400 z walidacji.

- [ ] **4.4 · Transakcje: edycja i usuwanie** · ~30 min
  **Sprawdzasz:** edycja kwoty zmienia listę; `DELETE` cudzej transakcji → **404**, nie 403 —
  403 potwierdza, że taki rekord istnieje.

- [ ] **4.5 · Budżety** · ~40 min
  **Robisz:** `PUT /budgets` jako upsert po unikacie z chunka 1.2, `GET /budgets?month=YYYY-MM`.
  **Sprawdzasz:** dwa `PUT` na tę samą kategorię i miesiąc → jeden rekord z nową kwotą, nie dwa;
  `GET` na miesiąc bez budżetów → pusta lista, nie 404.

- [ ] **4.6 · Podsumowanie miesiąca** · ~45 min
  **Robisz:** `GET /summary?month=YYYY-MM` → per kategoria `limitMinor`, `spentMinor`,
  `remainingMinor` + sumy globalne (przychody, wydatki, bilans). `TRANSFER` **nie liczy się**
  ani jako przychód, ani jako wydatek.
  **Sprawdzasz:** liczby zgadzają się co do grosza z ręcznie zsumowaną listą;
  kategoria z limitem i bez transakcji ma `spentMinor: 0` zamiast znikać;
  kategoria z transakcjami i bez limitu jest w odpowiedzi z `limitMinor: null`;
  dodanie transferu nie rusza bilansu.

---

## Faza 5 — Testy API (~2 h)

Minimum przed Fazą 6 to 5.1 + 5.3 — dashboard debuguje się nieporównanie łatwiej, kiedy wiadomo,
że arytmetyka po stronie API jest poprawna.

- [ ] **5.1 · Setup Vitest** · ~45 min
  **Robisz:** `@nx/vite` w `apps/api`, osobna baza testowa (`DATABASE_URL` z sufiksem `_test`),
  czyszczenie tabel między testami, helper `authedClient()` przez `fastify.inject`.
  **Sprawdzasz:** `nx test api` zielone na jednym teście; **drugie uruchomienie z rzędu daje
  ten sam wynik** (czyli sprzątanie faktycznie działa).

- [ ] **5.2 · Testy auth** · ~30 min
  **Sprawdzasz:** zielone dla: rejestracja, duplikat maila, dobre/złe logowanie,
  `/me` bez tokenu, seed konta i kategorii przy rejestracji.

- [ ] **5.3 · Testy transakcji i podsumowania** · ~45 min
  **Sprawdzasz:** zielone dla: granice miesiąca (1. i ostatni dzień), izolacja userów
  (user B nie widzi i nie kasuje danych usera A), arytmetyka `/summary`, upsert budżetu,
  transfer nieliczony do bilansu.

---

## Faza 6 — Web (~4,5 h)

- [ ] **6.1 · Sprzątanie i warstwa UI** · ~40 min
  **Robisz:** wyrzucenie strony powitalnej Nx (`apps/web/src/app/page.tsx`, ~460 linii,
  i `global.css`, ~390 linii), decyzja o stylach — Tailwind **nie jest** zainstalowany,
  więc albo `nx add @nx/tailwind`, albo zostajemy przy CSS Modules.
  **Sprawdzasz:** `nx dev web` pokazuje pustą stronę startową; `nx build web` przechodzi.

- [ ] **6.2 · Klient API** · ~35 min
  **Robisz:** `lib/api.ts` — wrapper na `fetch`, bazowy URL z env, przekazywanie cookie,
  czytelny błąd przy statusie ≥ 400, **typy odpowiedzi importowane z `@budgetio/core`**
  (żadnego przepisywania interfejsów po stronie weba).
  **Sprawdzasz:** strona woła `/categories` i wypisuje wynik; ubity backend daje czytelny
  komunikat zamiast białego ekranu.

- [ ] **6.3 · Logowanie i rejestracja** · ~60 min
  **Robisz:** formularze + route handlery `/api/auth/login|register|logout` w Next.js,
  które wołają Fastify i zapisują JWT w `httpOnly` cookie.
  **Sprawdzasz:** DevTools → Application → Cookies pokazuje cookie z `HttpOnly` i `SameSite=Lax`,
  a `document.cookie` w konsoli go **nie** widzi; wylogowanie je kasuje.

- [ ] **6.4 · Ochrona tras** · ~25 min
  **Robisz:** `middleware.ts` przekierowujący `/app/*` na `/login` przy braku cookie.
  **Sprawdzasz:** `/app` w oknie incognito → redirect na `/login`; po zalogowaniu wraca na `/app`.

- [ ] **6.5 · Lista transakcji** · ~50 min
  **Sprawdzasz:** widać transakcje dodane wcześniej curlem; przełącznik miesiąca zmienia listę;
  pusty miesiąc pokazuje komunikat, a nie samą pustkę.

- [ ] **6.6 · Dodawanie transakcji** · ~50 min
  **Robisz:** formularz (kwota, kategoria, data domyślnie dzisiejsza, opis), po zapisie odświeżenie.
  **Sprawdzasz:** transakcja pojawia się bez ręcznego F5; `12,50` i `12.50` dają ten sam wynik
  (helper `parseMoney` z core); litery w kwocie → błąd przy polu, nie 500 z serwera.

- [ ] **6.7 · Edycja i usuwanie** · ~40 min
  **Sprawdzasz:** edycja aktualizuje listę; usunięcie pyta o potwierdzenie i znika z listy.

- [ ] **6.8 · Ekran budżetu** · ~45 min
  **Sprawdzasz:** ustawiony limit przeżywa odświeżenie; zmiana miesiąca pokazuje limity
  tego miesiąca.

- [ ] **6.9 · Dashboard** · ~50 min
  **Robisz:** bilans miesiąca + paski postępu per kategoria
  (zielony / pomarańczowy > 80% / czerwony po przekroczeniu).
  **Sprawdzasz:** liczby zgadzają się z `GET /summary` z curla; przekroczony limit jest czerwony
  i pasek nie wychodzi poza kontener.

- [ ] **6.10 · Telefon: responsywność + PWA** · ~45 min
  **Robisz:** przegląd layoutu mobile-first, `manifest.json`, ikony, `theme-color`.
  **Sprawdzasz:** DevTools w trybie iPhone SE — nic nie scrolluje się w poziomie, przyciski
  klikalne kciukiem; na telefonie „Dodaj do ekranu głównego" daje ikonę i pełny ekran bez paska URL.

---

## Faza 7 — Deploy na VPS (~4 h)

- [ ] **7.1 · Obrazy produkcyjne** · ~60 min
  **Robisz:** Dockerfile dla `api` (`nx build api`) i `web` (`output: 'standalone'`),
  `infra/docker-compose.prod.yml` z `db` + `api` + `web`.
  **Sprawdzasz:** lokalnie `docker compose -f infra/docker-compose.prod.yml up` → aplikacja działa
  z obrazów produkcyjnych, bez procesów dev.

- [ ] **7.2 · VPS i Caddy** · ~60 min
  **Robisz:** serwer, domena (rekord A), Docker, `Caddyfile`: domena → web, `/api/*` → api.
  Firewall: otwarte tylko 22, 80, 443.
  **Sprawdzasz:** `https://twojadomena.pl` ładuje się z ważnym certyfikatem;
  `psql -h IP` z zewnątrz nie łączy się (Postgres **nie** wystawiony na świat).

- [ ] **7.3 · Sekrety i migracje** · ~35 min
  **Robisz:** `.env` na serwerze (poza gitem, `chmod 600`), świeży `JWT_SECRET`,
  `prisma migrate deploy` jako krok deployu — **nigdy `migrate dev` na produkcji**.
  **Sprawdzasz:** rejestracja i logowanie działają na produkcji;
  `git log -S 'JWT_SECRET' -p` nie pokazuje żadnego sekretu.

- [ ] **7.4 · Backup bazy** · ~35 min
  **Robisz:** cron z `pg_dump` do `/var/backups/budgetio`, rotacja 7 dni.
  **Sprawdzasz:** **odtworzenie** dumpa do bazy `budgetio_restore_test` i `SELECT count(*)`
  na transakcjach. Backup, którego nie odtworzyłeś, nie jest backupem.

- [ ] **7.5 · Deploy jedną komendą** · ~40 min ⏭️
  **Robisz:** `infra/deploy.sh` (pull → build → migrate deploy → up -d) albo GitHub Action.
  **Sprawdzasz:** zmiana napisu w UI → jedna komenda → napis na produkcji w kilka minut.

---

## Faza 8 — Mobile (~3,5 h)

Szkielet Expo już stoi, więc to głównie ekrany. Aplikacja idzie **prosto do Fastify** (bez Next.js
po drodze), więc token trzyma w `expo-secure-store`, nie w cookie.

- [ ] **8.1 · Sprzątanie i nawigacja** · ~45 min
  **Robisz:** wyrzucenie ekranu powitalnego (`apps/mobile/src/app/App.tsx`, ~700 linii),
  nawigacja między ekranami, adres API z konfiguracji Expo.
  **Sprawdzasz:** aplikacja w Expo Go pokazuje odpowiedź z `/categories` produkcyjnego API.

- [ ] **8.2 · Logowanie** · ~50 min
  **Sprawdzasz:** logowanie działa, token ląduje w `expo-secure-store`, po restarcie aplikacji
  user zostaje zalogowany.

- [ ] **8.3 · Lista i dodawanie transakcji** · ~70 min
  **Sprawdzasz:** transakcja dodana na telefonie jest widoczna w webie po odświeżeniu —
  te same typy z `@budgetio/core` po obu stronach.

- [ ] **8.4 · Podsumowanie miesiąca** · ~40 min
  **Sprawdzasz:** te same liczby co na dashboardzie webowym.

- [ ] **8.5 · Build przez EAS** · ~45 min
  **Robisz:** `apps/mobile/eas.json` jest już w repo — zostaje konfiguracja profilu i build.
  **Sprawdzasz:** zainstalowany APK działa bez Expo Go i bez laptopa w tej samej sieci.

---

## Podsumowanie

| Faza | Efekt | Czas |
|---|---|---|
| 0–1 | szkielet uporządkowany, schemat gotowy na dane | ~2,5 h |
| 2 | wspólny kontrakt spinający trzy aplikacje | ~2 h |
| 3–4 | kompletne API budżetu | ~6 h |
| 5 | testy pilnujące arytmetyki | ~2 h |
| 6 | używalna aplikacja webowa | ~4,5 h |
| 7 | działa na VPS pod HTTPS | ~4 h |
| **0–7** | **MVP na produkcji** | **~21 h** |
| 8 | aplikacja mobilna | ~3,5 h |

Pierwszy moment realnej używalności: **koniec Fazy 6**.
Pierwszy moment używalności z telefonu: **chunk 7.2** — PWA pod HTTPS działa na telefonie
bez żadnego kodu z Fazy 8.
