# Budgetio — architektura i decyzje

Dokument opisuje **co** budujemy i **dlaczego tak**. Kolejność prac jest w [ROADMAP.md](./ROADMAP.md).

---

## 1. Zakres MVP

MVP jest **gotowe**, kiedy potrafię:

1. założyć konto i się zalogować,
2. dodać wydatek/przychód (kwota, kategoria, data, notatka),
3. zobaczyć listę transakcji za wybrany miesiąc,
4. ustawić miesięczny limit na kategorię,
5. zobaczyć podsumowanie miesiąca: wydane / limit / zostało,
6. zrobić to wszystko z telefonu i z komputera,
7. wejść na to pod własną domeną po HTTPS.

**Świadomie poza MVP** (dopisujemy dopiero, gdy powyższe działa na produkcji):
wiele walut · import z banku / CSV · konta i portfele · transakcje cykliczne ·
współdzielenie budżetu z drugą osobą · kategorie zagnieżdżone · wykresy inne niż paski postępu · tagi.

---

## 2. Stack

| Warstwa | Wybór | Uwagi |
|---|---|---|
| Backend | Python 3.12 + FastAPI | źródło prawdy dla całej logiki |
| ORM / migracje | SQLAlchemy 2.x (async) + Alembic | |
| Baza | PostgreSQL 17 | |
| Web | Next.js (App Router) + TypeScript + Tailwind | |
| Mobile | React Native (Expo) | **faza 8**, po działającym webie |
| Hosting | 1 VPS, Docker Compose, Caddy jako reverse proxy | Caddy sam ogarnia certyfikat Let's Encrypt |

VPS: 2 vCPU / 2–4 GB RAM w zupełności wystarczy (API + web + Postgres + Caddy).

---

## 3. Trzy decyzje, które warto rozumieć

### 3.1 Po co Next.js ma gadać z FastAPI, skoro przeglądarka mogłaby sama?

Jedyny sensowny powód w tym projekcie: **token nie trafia do JavaScriptu**.
Route handlery Next.js działają jako cienki BFF — logowanie leci przez `/api/auth/login`
w Next.js, on woła FastAPI i zapisuje JWT w `httpOnly` cookie. Przeglądarka nie ma dostępu
do tokenu, więc XSS go nie wykradnie.

**Zasada:** w Next.js trzymamy tylko przekazywanie żądań i obsługę cookie.
Zero logiki biznesowej — żadnego liczenia sald, walidacji reguł budżetu itd.
Gdy pojawi się pokusa "to policzę szybko po stronie Next" — to znak, że brakuje endpointu w API.
Aplikacja mobilna i tak pójdzie prosto do FastAPI, więc każda logika w Next.js
oznacza natychmiast dwie implementacje tego samego.

### 3.2 React Native dopiero na końcu

W MVP telefon dostajesz **za darmo**: responsywny layout + manifest PWA = ikona na ekranie
głównym i aplikacja na pełnym ekranie. React Native to osobny tor (build, store, podpisy,
osobny stan) i jeżeli wystartuje równolegle z webem, oba będą wlokły się w połowie gotowe.
Faza 8 nie jest wycięta — jest przesunięta za moment, w którym web działa na produkcji.

### 3.3 Pieniądze to `int`, nigdy `float`

Wszystkie kwoty trzymamy jako **grosze w `BIGINT`** (`amount_minor`).
`19.99` w `float` to naprawdę `19.989999...`, a sumy takich liczb rozjeżdżają się po kilkuset
rekordach. Formatowanie na `199,99 zł` robimy dopiero przy wyświetlaniu.
Waluta w MVP jest jedna (PLN), ale kolumna `currency` istnieje od początku — dodanie jej później
to migracja na żywej bazie z wypełnianiem historii.

---

## 4. Model danych

```
users
  id            uuid pk
  email         text unique not null
  password_hash text not null
  created_at    timestamptz not null

categories
  id          uuid pk
  user_id     uuid fk -> users
  name        text not null
  kind        text not null      -- 'income' | 'expense'
  color       text               -- hex, do UI
  archived_at timestamptz        -- soft delete: nie kasujemy, bo wiszą na tym transakcje
  unique (user_id, name)

transactions
  id           uuid pk
  user_id      uuid fk -> users
  category_id  uuid fk -> categories
  amount_minor bigint not null   -- zawsze dodatnie; znak wynika z category.kind
  currency     char(3) not null default 'PLN'
  occurred_on  date not null     -- DATE, nie timestamp (patrz niżej)
  note         text
  created_at   timestamptz not null
  index (user_id, occurred_on desc)

budgets
  id           uuid pk
  user_id      uuid fk -> users
  category_id  uuid fk -> categories
  period       date not null     -- zawsze 1. dzień miesiąca, np. 2026-08-01
  limit_minor  bigint not null
  unique (user_id, category_id, period)
```

**Dlaczego `occurred_on` to `DATE`, a nie `timestamptz`:** "wydatek z 31 sierpnia" to fakt
kalendarzowy, nie moment w czasie. Przy `timestamptz` transakcja dodana 31.08 o 23:30 w Warszawie
wpada do września w UTC i psuje podsumowanie miesiąca. `DATE` nie ma tego problemu.

**Dlaczego `period` to `DATE` przypięty do 1. dnia miesiąca, a nie `(rok, miesiąc)` jako inty:**
jedna kolumna zamiast dwóch w każdym `WHERE`, `UNIQUE` działa bez kombinowania,
a porównania zakresów (`period >= ... AND period < ...`) są naturalne.

---

## 5. Struktura repo

```
budgetio/
├── apps/
│   ├── api/          # FastAPI
│   ├── web/          # Next.js
│   └── mobile/       # Expo (faza 8)
├── infra/            # compose produkcyjny, Caddyfile, skrypty deployu
├── docs/
├── docker-compose.yml    # lokalny dev: sam Postgres
└── .env.example
```

---

## 6. Środowiska

| | lokalnie | produkcja (VPS) |
|---|---|---|
| Postgres | kontener z `docker-compose.yml` | kontener, wolumen na dysku VPS |
| API | `uvicorn --reload` z hosta | kontener za Caddy |
| Web | `next dev` z hosta | kontener za Caddy |
| HTTPS | brak, `http://localhost` | Caddy + Let's Encrypt |

Lokalnie API i web chodzą **poza Dockerem** — hot reload działa wtedy bez kombinowania z wolumenami.
W kontenerach są dopiero przy deployu (chunki 1.5 i 7.1).
