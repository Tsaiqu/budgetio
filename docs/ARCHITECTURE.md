# budgetio – architektura i decyzje

Dokument opisuje **co** aplikacja robi i **dlaczego tak**.

---

## 1. Zmiana stacku (październik 2026)

Pierwsza wersja repozytorium to był szkielet monorepo Nx: Next.js (web) + Fastify (API) + Expo
(mobile) + Prisma + PostgreSQL + Docker na VPS. Logiki biznesowej jeszcze nie było.

**Nie trzymamy się tego stacku.** Zastępujemy go jedną lekką aplikacją:

| Było | Jest | Dlaczego |
|---|---|---|
| Nx monorepo (3 aplikacje, 2 pakiety) | jeden `package.json` | jedna osoba, mała aplikacja – monorepo to sama ceremonia |
| Next.js + BFF | React + Vite (SPA) | Next.js był trudny do zrozumienia i review; BFF był potrzebny tylko do ciasteczek logowania |
| PostgreSQL w Dockerze + Prisma | SQLite (`bun:sqlite`) + czyste SQL | jeden plik bazy, zero usług do uruchomienia, łatwa kopia; SQL widać wprost w kodzie |
| Expo / React Native | brak (na razie) | telefon obsługuje przeglądarka (responsywny UI + `HOST=0.0.0.0`) |
| konta użytkowników, JWT | brak; opcjonalne hasło (Basic Auth) | aplikacja dla jednej osoby |

Co zostaje z poprzednich założeń, bo były dobre:

- **Kwoty jako `int` w groszach**, nigdy `float`.
- **Daty kalendarzowe jako tekst `YYYY-MM-DD`**, nie timestamp (wydatek z 31 sierpnia nie może
  "przeskoczyć" na 1 września przez strefę czasową).
- **Wspólne schematy Zod** dla serwera i frontu (`shared/schemas.ts`).
- Cała logika liczenia po stronie serwera; front tylko wyświetla.

Gdyby kiedyś aplikacja miała obsłużyć wiele osób albo osobną aplikację mobilną: API jest już
oddzielone od frontu (`/api/*`), więc można dołożyć logowanie i inny klient bez przepisywania obliczeń.

---

## 2. Model danych

```
settings            key, value                      (domyślny VAT, termin płatności, chorobowe)
tax_rates           year, podstawy ZUS, stawki (punkty bazowe), minimum zdrowotnej, progi PIT
zus_stage_changes   month, stage                    (etap obowiązuje do następnej zmiany)
categories          id, name, kind (income|personal|business), monthly_limit, rollover, rollover_from, archived
transactions        id, type, description, category_id, amount_gross, vat_rate,
                    vat_deductible_pct, tax_cost_pct, invoice_date, payment_date
recurring_items     id, name, type, category_id, vat_rate, vat_deductible_pct, tax_cost_pct, payment_day
recurring_periods   id, item_id, start_month, end_month (NULL = trwa), amount_gross
```

Typy transakcji: `business_income` (faktura), `business_cost`, `personal_income`, `personal_expense`.

### Dwie daty w transakcji

- `invoice_date` (data faktury / zakupu) – decyduje o **miesiącu podatkowym** (VAT, PIT, ZUS).
- `payment_date` (data wpływu / płatności) – decyduje o **budżecie i saldzie** miesiąca.

Faktura z 30.10 to przychód października, ale pieniądze są na koncie w listopadzie. Gdy data wpływu
nie jest podana, serwer zapisuje: data faktury + termin płatności z ustawień.

### Kwota kosztu stałego jest w okresie, nie w pozycji

Zmiana czynszu od stycznia zamyka bieżący okres w grudniu i otwiera nowy – grudzień zostaje ze
starą kwotą. Wstrzymanie ustawia `end_month`, wznowienie dodaje nowy okres. Historia nigdy się nie zmienia.

### Stawki podatkowe w bazie, nie w kodzie

Co rok zmieniają się podstawy ZUS i minimalna zdrowotna. Aktualizujesz je w Ustawieniach
(albo nową migracją z danymi). Brak stawek na dany rok = obliczenia biorą ostatni znany rok
i pokazują ostrzeżenie.

---

## 3. Zasady obliczeń (`server/domain/finance.ts`)

Wszystko w groszach. Testy w `finance.test.ts` mają te same liczby co arkusz Excel.

| Co | Jak |
|---|---|
| Netto / VAT | `netto = round(brutto × 100 / (100 + stawka))`, `VAT = brutto − netto` |
| VAT do odliczenia (koszt) | `VAT × % odliczenia`; nieodliczony VAT zwiększa koszt podatkowy |
| Koszt podatkowy | `(netto + nieodliczony VAT) × % w kosztach` |
| VAT do zapłaty | należny − naliczony − nadwyżka z poprzedniego miesiąca; ujemny wynik przechodzi dalej |
| ZUS społeczny | ulga na start = 0; preferencyjny = bez Funduszu Pracy; pełny = z FP; chorobowe opcjonalne |
| PIT (skala) | narastająco od stycznia: `(dochód − ZUS społeczny)` zaokrąglone do zł, 12% / 32%, minus kwota zmniejszająca; zaliczka = podatek narastająco − wpłacone zaliczki |
| Zdrowotna (skala) | `9% × (dochód miesiąca − ZUS społeczny)`, nie mniej niż minimum; brak działalności = 0 |

### Kiedy co płacisz (widok "pieniądze w miesiącu")

W miesiącu **M** płacisz:

- VAT za M−1 (do 25.),
- zaliczkę PIT i ZUS społeczny za M−1 (do 20.),
- składkę zdrowotną liczoną od dochodu z **M−2** (do 20.) – dochód z sierpnia → składka za wrzesień →
  płatność do 20 października.

### Przenoszenie budżetu (rollover)

Włączane osobno dla każdej kategorii z limitem. Saldo liczymy od miesiąca włączenia:
`saldo = max(−limit, saldo + limit − wydane)`. Niewydana kwota rośnie bez limitu, dług najwyżej 1× limit.
Saldo przechodzi też na nowy rok.

### Czego aplikacja świadomie nie liczy

- rocznego rozliczenia składki zdrowotnej,
- ulg w PIT, wspólnego rozliczenia, podatku liniowego i ryczałtu,
- specjalnego terminu składki zdrowotnej za pierwszy miesiąc działalności.

---

## 4. Migracje i bezpieczeństwo danych

- Migracje to pliki `server/migrations/NNN_nazwa.sql`, wykonywane przy starcie w kolejności nazw.
  Tabela `schema_migrations` pamięta, co już się wykonało.
- **Zastosowanej migracji nie zmieniamy.** Każda zmiana schematu = nowy plik.
- Przed wykonaniem nowych migracji na istniejącej bazie serwer robi kopię (`VACUUM INTO`)
  do `data/backups/`.
- Każda migracja działa w transakcji – błąd w połowie nie zostawia bazy w dziwnym stanie.
