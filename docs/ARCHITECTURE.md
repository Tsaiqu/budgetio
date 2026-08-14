# Budgetio — architektura i decyzje

Dokument opisuje **co** budujemy i **dlaczego tak**. Kolejność prac jest w [ROADMAP.md](./ROADMAP.md).

---

## 1. Zakres MVP

MVP jest **gotowe**, kiedy potrafię:

1. założyć konto i się zalogować,
2. dodać wydatek/przychód (kwota, kategoria, data, opis),
3. zobaczyć listę transakcji za wybrany miesiąc,
4. ustawić miesięczny limit na kategorię,
5. zobaczyć podsumowanie miesiąca: wydane / limit / zostało,
6. zrobić to wszystko z telefonu i z komputera,
7. wejść na to pod własną domeną po HTTPS.

**Świadomie poza MVP** — schemat bazy to obsłuży, ale UI i API zostawiamy na później:
wiele kont/portfeli (w MVP jeden domyślny, zakładany przy rejestracji) · przelewy między kontami
(`Transaction.transferGroupId`) · kategorie zagnieżdżone (`Category.parentId`) · wiele walut ·
import z banku · transakcje cykliczne · współdzielenie budżetu.

Schemat celowo wyprzedza UI — dołożenie kolumny do żywej bazy z historią boli, dołożenie ekranu nie.

---

## 2. Stack

Monorepo [Nx](https://nx.dev) 23 na Bunie, w całości TypeScript.

| Projekt | Technologia | Rola |
|---|---|---|
| `apps/api` | Fastify 5 | całość logiki biznesowej |
| `apps/web` | Next.js 16 + React 19 | UI + cienki BFF do obsługi cookie |
| `apps/mobile` | Expo 56 / React Native 0.85 | aplikacja mobilna |
| `packages/db` | Prisma 7 + `@prisma/adapter-pg` | schemat, migracje, klient |
| `packages/core` | zod + typy domenowe | **kontrakt wspólny dla wszystkich powyższych** |
| — | PostgreSQL | baza |
| — | Docker Compose + Caddy | hosting na VPS |

VPS: 2 vCPU / 2–4 GB RAM wystarczy (api + web + Postgres + Caddy).

---

## 3. Cztery decyzje, które warto rozumieć

### 3.1 `packages/core` jest sercem tego monorepo

To jest powód, dla którego całość jest w TypeScripcie, więc warto tego pilnować bardziej
niż czegokolwiek innego w tym dokumencie.

Schematy [zod](https://zod.dev) w `packages/core` są **jednocześnie** walidacją wejścia w API
i źródłem typów dla weba i mobilki:

```ts
// packages/core
export const createTransactionInput = z.object({
  accountId: z.uuid(),
  categoryId: z.uuid().nullable(),
  amountMinor: z.int().positive(),
  type: z.enum(['INCOME', 'EXPENSE', 'TRANSFER']),
  occurredAt: z.iso.date(),          // 'YYYY-MM-DD'
  description: z.string().max(200).optional(),
});
export type CreateTransactionInput = z.infer<typeof createTransactionInput>;
```

API waliduje tym schematem przez `fastify-type-provider-zod`, web i mobile importują z niego typ.
Efekt, którego pilnujemy: **zmiana pola w `packages/core` wywala kompilację we wszystkich trzech
aplikacjach naraz** — zamiast produkcyjnego 422, którego nikt się nie spodziewał.
To jest kryterium odbioru chunka 2.5 i najważniejszy test tego, czy monorepo faktycznie pracuje.

Co tam trafia: schematy wejścia/wyjścia endpointów, typy DTO, enumy domenowe, helpery do groszy.
Czego tam **nie** ma: cokolwiek dotykającego Prismy (to `packages/db`), cokolwiek zależnego od
Reacta czy Fastify. `packages/core` musi dać się zaimportować w React Native, więc żadnych
zależności od Node API.

Na razie jeden pakiet zamiast osobnych `contracts` / `utils` — przy MVP osobne pakiety to sama
ceremonia. Podział wtedy, gdy `core` przestanie się mieścić w głowie.

### 3.2 Po co Next.js ma gadać z Fastify, skoro przeglądarka mogłaby sama?

Jedyny sensowny powód w tym projekcie: **token nie trafia do JavaScriptu**.
Route handlery Next.js działają jako cienki BFF — logowanie leci przez `/api/auth/login`
w Next.js, on woła Fastify i zapisuje JWT w `httpOnly` cookie. Przeglądarka nie ma dostępu
do tokenu, więc XSS go nie wykradnie.

**Zasada:** w Next.js trzymamy tylko przekazywanie żądań i obsługę cookie.
Zero logiki biznesowej — żadnego liczenia sald ani walidacji reguł budżetu.
Gdy pojawi się pokusa „to policzę szybko po stronie Next" — to znak, że brakuje endpointu w API.
Mobilka i tak idzie prosto do Fastify (token w `expo-secure-store`, nie w cookie), więc każda
logika w Next.js oznacza natychmiast dwie implementacje tego samego.

### 3.3 Pieniądze to `int`, nigdy `float`

Wszystkie kwoty jako **grosze w `amountMinor`** — tak jest już w schemacie i tak zostaje.
`19.99` w `float` to naprawdę `19.989999...`, a sumy takich liczb rozjeżdżają się po kilkuset
rekordach. Formatowanie na `199,99 zł` robi helper z `packages/core`, dopiero przy wyświetlaniu.

Prismowy `Int` to w Postgresie `INTEGER`, czyli sufit **2 147 483 647 groszy ≈ 21,5 mln zł**
na pojedynczą transakcję. Dla budżetu domowego bez znaczenia — zostawiamy `Int`.
Gdyby kiedyś doszły kwoty w słabszej walucie albo agregaty historyczne, `BigInt` jest zmianą
na jedną migrację.

### 3.4 `occurredAt` musi być `DATE`, nie `TIMESTAMP`

W obecnym schemacie `occurredAt` to `DateTime`, co Prisma tłumaczy na `TIMESTAMP(3)`. To błąd
do naprawienia zanim wejdą pierwsze prawdziwe dane (chunk 1.1).

„Wydatek z 31 sierpnia" to fakt kalendarzowy, nie moment w czasie. Przy `TIMESTAMP` transakcja
dodana 31.08 o 23:30 w Warszawie zapisze się jako 21:30 UTC — jeszcze sierpień — ale ta sama
o 01:30 w nocy 1.09 czasu lokalnego wpadnie do sierpnia w UTC i zniknie z wrześniowego
podsumowania. Użytkownik widzi wtedy budżet, który nie zgadza się z jego kalendarzem, i nie ma
jak zgadnąć dlaczego.

Lekarstwo to jedna adnotacja: `occurredAt DateTime @db.Date`.
`createdAt` zostaje `TIMESTAMP` — to faktycznie moment w czasie i tak ma być.

---

## 4. Model danych

Schemat żyje w `packages/db/prisma/schema.prisma`, migracje w `packages/db/prisma/migrations`.
Stan po Fazie 1 roadmapy:

```
User          id, email (unique), passwordHash, createdAt
Account       id, userId → User, name, type (CASH|CHECKING|SAVINGS|CREDIT_CARD),
              currency (default 'PLN'), createdAt
Category      id, userId → User, name, type (INCOME|EXPENSE), parentId → Category?
Transaction   id, accountId → Account, categoryId → Category?,
              amountMinor (int, zawsze dodatnie — znak wynika z type),
              type (INCOME|EXPENSE|TRANSFER), description?, occurredAt (DATE),
              createdAt, transferGroupId?
Budget        id, userId → User, categoryId → Category,
              amountMinor, periodStart (DATE), periodEnd (DATE), createdAt
```

**Do dołożenia w Fazie 1** (schemat startowy tego nie ma):

- `occurredAt @db.Date`, `periodStart/periodEnd @db.Date`
- `@@unique([userId, categoryId, periodStart])` na `Budget` — inaczej „ustaw limit" bez upserta
  robi duplikaty i podsumowanie zaczyna kłamać
- `@@unique([userId, name, parentId])` na `Category`
- `@@index([accountId, occurredAt])` na `Transaction` — po tym idzie każde listowanie miesiąca
- `@@index([userId, periodStart])` na `Budget`

W migracji startowej nie ma **żadnego** indeksu poza unikatem na `User.email` — Postgres nie
zakłada indeksów na kolumnach FK automatycznie.

### Izolacja użytkowników

`Transaction` **nie ma** `userId` — wisi na `Account`, a dopiero `Account` na `User`.
Każde zapytanie o transakcje musi więc filtrować przez relację:

```ts
where: { account: { userId } }
```

To jedna linijka, ale jej brak oznacza, że dowolny zalogowany user czyta cudze transakcje.
Nigdy nie bierzemy `userId` z body ani z query — zawsze z tokenu.

---

## 5. Środowisko deweloperskie

| | port | komenda |
|---|---|---|
| `apps/api` | **3333** | `nx serve api` |
| `apps/web` | 3000 | `nx dev web` |
| Postgres | 5432 | `docker compose up -d` |

`apps/api/src/main.ts` domyślnie bierze port 3000 — ten sam, co Next.js dev. Rozjazd portów
robimy w chunku 0.2, bo inaczej druga uruchomiona aplikacja po prostu nie wstaje.

Lokalnie api i web chodzą **poza Dockerem** — hot reload działa wtedy bez kombinowania
z wolumenami. W kontenerach są dopiero przy deployu (Faza 7).

`DATABASE_URL` czyta `packages/db/src/index.ts` przez `PrismaPg`, więc musi być w `.env`
zanim cokolwiek dotknie bazy.

---

## 6. Środowiska

| | lokalnie | produkcja (VPS) |
|---|---|---|
| Postgres | kontener z `docker-compose.yml` | kontener, wolumen na dysku VPS |
| api | `nx serve api` z hosta | kontener za Caddy |
| web | `nx dev web` z hosta | kontener za Caddy (`output: 'standalone'`) |
| migracje | `prisma migrate dev` | `prisma migrate deploy` jako krok deployu |
| HTTPS | brak, `http://localhost` | Caddy + Let's Encrypt |
