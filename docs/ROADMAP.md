# Budgetio — roadmapa w małych chunkach

Każdy chunk ma **Robisz** (co powstaje) i **Sprawdzasz** (jak w minutę potwierdzić, że działa).
Chunk kończy się działającym, sprawdzalnym stanem — nie ma "dokończę w następnym".
Szacunki czasowe są dla osoby, która zna stack; traktuj je jako proporcje, nie zobowiązanie.

Kolejność faz ma znaczenie. Kolejność chunków **wewnątrz** fazy — zwykle też, ale gdzie nie ma,
jest to zaznaczone.

**Legenda:** ⬜ do zrobienia · ✅ zrobione · ⏭️ można pominąć w MVP

---

## Faza 0 — Fundament (~1 h)

- [x] **0.1 · Szkielet repo** · ~15 min
  **Robisz:** `apps/{api,web}`, `infra/`, `docs/`, README, `.gitignore` dla Pythona i Node.
  **Sprawdzasz:** `tree -L 2` pokazuje strukturę; `git status` jest czysty.

- [ ] **0.2 · Postgres w Dockerze** · ~20 min
  **Robisz:** `docker-compose.yml` z Postgresem 17, wolumenem i healthcheckiem; `.env` z `.env.example`.
  **Sprawdzasz:** `docker compose up -d` → `docker compose ps` pokazuje `healthy` →
  `docker compose exec db psql -U budgetio -d budgetio -c '\l'` wypisuje bazy.

- [ ] **0.3 · Makefile ze skrótami** · ~15 min ⏭️
  **Robisz:** `make up`, `make down`, `make api`, `make web`, `make test`, `make migrate`.
  **Sprawdzasz:** `make up && make down` przechodzi bez błędu.
  *Do pominięcia, ale po dwudziestym `docker compose ...` będziesz żałować.*

---

## Faza 1 — Backend: szkielet (~2 h)

- [ ] **1.1 · FastAPI hello world** · ~20 min
  **Robisz:** `apps/api` z `uv` (albo venv + `requirements.txt`), `main.py`, endpoint `GET /health`.
  **Sprawdzasz:** `uvicorn app.main:app --reload` → `curl localhost:8000/health` zwraca `{"status":"ok"}`,
  a `localhost:8000/docs` pokazuje Swaggera.

- [ ] **1.2 · Konfiguracja z env** · ~20 min
  **Robisz:** `pydantic-settings`, klasa `Settings` (`DATABASE_URL`, `JWT_SECRET`, `ENV`), czytana z `.env`.
  **Sprawdzasz:** `/health` zwraca `{"status":"ok","env":"dev"}`; wywalenie `DATABASE_URL` z `.env`
  ubija start aplikacji z czytelnym komunikatem, a nie `KeyError` w losowym miejscu.

- [ ] **1.3 · Połączenie z bazą** · ~30 min
  **Robisz:** SQLAlchemy 2.x async engine + `async_sessionmaker`, dependency `get_db`,
  endpoint `GET /health/db` robiący `SELECT 1`.
  **Sprawdzasz:** `curl localhost:8000/health/db` → `{"db":"ok"}`;
  po `docker compose stop db` ten sam call zwraca 503, a nie wisi w nieskończoność.

- [ ] **1.4 · Alembic** · ~30 min
  **Robisz:** `alembic init`, podpięcie `DATABASE_URL` z `Settings`, pusta migracja startowa.
  **Sprawdzasz:** `alembic upgrade head` → w bazie jest tabela `alembic_version`;
  `alembic downgrade base` cofa bez błędu.

- [ ] **1.5 · Dockerfile API** · ~25 min
  **Robisz:** multi-stage Dockerfile, usługa `api` w compose (profil `full`).
  **Sprawdzasz:** `docker compose --profile full up -d api` → `curl localhost:8000/health/db` działa
  z kontenera.
  *Można przesunąć do fazy 7, ale wcześnie zrobione oszczędza "u mnie działa" przy pierwszym deployu.*

---

## Faza 2 — Model danych (~1,5 h)

Wzorzec każdego chunku: model SQLAlchemy → `alembic revision --autogenerate` → **przeczytaj
wygenerowaną migrację** (autogenerate lubi gubić rzeczy i wymyślać kasowanie indeksów) → `upgrade head`.

- [ ] **2.1 · `users`** · ~25 min
  **Sprawdzasz:** `\d users` w psql pokazuje kolumny i unikat na `email`;
  ręczny `INSERT` z tym samym mailem drugi raz leci błędem.

- [ ] **2.2 · `categories` + seed** · ~30 min
  **Robisz:** model + migracja + skrypt `seed_default_categories(user_id)`
  (jedzenie, transport, mieszkanie, rozrywka, zdrowie, inne + wypłata jako `income`).
  **Sprawdzasz:** `\d categories`; wywołanie seeda dwa razy dla tego samego usera nie duplikuje kategorii.

- [ ] **2.3 · `transactions`** · ~25 min
  **Sprawdzasz:** `\d transactions` — `amount_minor` to `bigint`, `occurred_on` to `date`,
  jest indeks na `(user_id, occurred_on)`. `INSERT` z `category_id` nieistniejącej kategorii → błąd FK.

- [ ] **2.4 · `budgets`** · ~25 min
  **Sprawdzasz:** `\d budgets`; dwa `INSERT`y na tę samą trójkę `(user_id, category_id, period)`
  → naruszenie unikatu.

---

## Faza 3 — Auth (~2,5 h)

- [ ] **3.1 · Rejestracja** · ~40 min
  **Robisz:** `POST /auth/register` (email + hasło), hash przez `argon2` (`passlib`/`pwdlib`),
  walidacja maila i minimalnej długości hasła, seed kategorii dla nowego usera.
  **Sprawdzasz:** rejestracja zwraca 201 i **nie** zwraca hasła ani hasha;
  druga rejestracja na ten sam mail → 409; w bazie `password_hash` zaczyna się od `$argon2`.

- [ ] **3.2 · Logowanie** · ~40 min
  **Robisz:** `POST /auth/login` → JWT (`sub` = user id, `exp` ~30 dni na MVP).
  **Sprawdzasz:** dobre hasło → 200 + token; złe hasło → 401 z **identycznym** komunikatem jak
  nieistniejący mail (inaczej endpoint zdradza, które maile są zarejestrowane);
  token wklejony w jwt.io ma sensowny payload.

- [ ] **3.3 · Chronione endpointy** · ~30 min
  **Robisz:** dependency `get_current_user` (Bearer), endpoint `GET /me`.
  **Sprawdzasz:** `/me` bez nagłówka → 401; z tokenem → dane usera;
  z tokenem po ręcznej zmianie jednego znaku → 401.

- [ ] **3.4 · CORS + rate limit na logowaniu** · ~20 min
  **Robisz:** `CORSMiddleware` z listą originów z env; prosty limiter na `/auth/login`.
  **Sprawdzasz:** fetch z `localhost:3000` przechodzi, z losowego origin nie;
  dziesiąta próba logowania z rzędu → 429.

---

## Faza 4 — API budżetu (~3 h)

Każdy endpoint od razu z filtrowaniem po zalogowanym userze. **Nigdy** nie przyjmuj `user_id`
z body ani z query — bierz go z tokenu. To jedna linijka różnicy, a bez niej dowolny zalogowany
user czyta cudze transakcje.

- [ ] **4.1 · Kategorie CRUD** · ~40 min
  **Robisz:** `GET/POST/PATCH /categories`, `DELETE` = ustawienie `archived_at`.
  **Sprawdzasz:** lista zwraca kategorie z seeda; usunięta znika z listy, ale transakcje na niej
  dalej się otwierają; `GET` z tokenem usera B nie pokazuje kategorii usera A.

- [ ] **4.2 · Transakcje: dodawanie i lista** · ~50 min
  **Robisz:** `POST /transactions`, `GET /transactions?month=YYYY-MM` (sortowane po dacie malejąco).
  **Sprawdzasz:** dodana transakcja pojawia się na liście swojego miesiąca i **nie** pojawia w sąsiednim;
  transakcja z 1. i z ostatniego dnia miesiąca wpadają do właściwego (klasyczne miejsce na błąd o jeden dzień);
  `amount_minor: -500` → 422.

- [ ] **4.3 · Transakcje: edycja i usuwanie** · ~30 min
  **Robisz:** `PATCH /transactions/{id}`, `DELETE /transactions/{id}`.
  **Sprawdzasz:** edycja kwoty zmienia listę; `DELETE` cudzej transakcji → 404 (**nie** 403 —
  403 potwierdza, że taki rekord istnieje).

- [ ] **4.4 · Budżety** · ~40 min
  **Robisz:** `PUT /budgets` (upsert po `category_id` + `period`), `GET /budgets?month=YYYY-MM`.
  **Sprawdzasz:** dwa `PUT` na tę samą kategorię i miesiąc → jeden rekord z nową kwotą, nie dwa;
  `GET` na miesiąc bez budżetów → pusta lista, nie 404.

- [ ] **4.5 · Podsumowanie miesiąca** · ~40 min
  **Robisz:** `GET /summary?month=YYYY-MM` → per kategoria: `limit_minor`, `spent_minor`,
  `remaining_minor`, plus sumy globalne (przychody, wydatki, bilans).
  **Sprawdzasz:** ręcznie policzone sumy z listy transakcji zgadzają się co do grosza;
  kategoria z limitem i bez transakcji pokazuje `spent: 0`, a nie znika z odpowiedzi;
  kategoria z transakcjami i bez limitu też jest w odpowiedzi (`limit: null`).

---

## Faza 5 — Testy backendu (~2 h)

Można wpleść wcześniej. Minimum przed fazą 6 to 5.1 + 5.3 — dashboard najłatwiej debugować,
kiedy wiadomo, że API liczy dobrze.

- [ ] **5.1 · Setup pytest** · ~40 min
  **Robisz:** `pytest` + `pytest-asyncio` + `httpx.AsyncClient`, osobna baza testowa,
  fixture czyszcząca dane między testami, fixture `authed_client`.
  **Sprawdzasz:** `pytest` przechodzi na jednym teście `/health`; drugie uruchomienie z rzędu
  daje ten sam wynik (czyli sprzątanie działa).

- [ ] **5.2 · Testy auth** · ~30 min
  **Sprawdzasz:** zielone dla: rejestracja, duplikat maila, dobre/złe logowanie, `/me` bez tokenu.

- [ ] **5.3 · Testy transakcji i podsumowania** · ~50 min
  **Sprawdzasz:** zielone dla: granice miesiąca (1. i ostatni dzień), izolacja userów,
  arytmetyka `/summary`, upsert budżetu.

---

## Faza 6 — Web (~5 h)

- [ ] **6.1 · Next.js scaffold** · ~25 min
  **Robisz:** `create-next-app` w `apps/web` (TS, App Router, Tailwind).
  **Sprawdzasz:** `npm run dev` → `localhost:3000` renderuje stronę; `npm run build` przechodzi.

- [ ] **6.2 · Klient API** · ~30 min
  **Robisz:** `lib/api.ts` — wrapper na `fetch` z bazowym URL z env, dorzucaniem cookie
  i rzucaniem czytelnego błędu przy statusie ≥ 400; typy odpowiedzi.
  **Sprawdzasz:** tymczasowa strona woła `/health` i wypisuje wynik; ubity backend daje
  czytelny komunikat, a nie biały ekran.

- [ ] **6.3 · Logowanie i rejestracja** · ~60 min
  **Robisz:** formularze + route handlery `/api/auth/login|register|logout` w Next.js,
  które wołają FastAPI i zapisują JWT w `httpOnly` cookie.
  **Sprawdzasz:** po zalogowaniu w DevTools → Application → Cookies widać cookie
  z flagami `HttpOnly` i `SameSite=Lax`, a `document.cookie` w konsoli go **nie** pokazuje;
  wylogowanie je kasuje.

- [ ] **6.4 · Ochrona tras** · ~25 min
  **Robisz:** `middleware.ts` przekierowujący `/app/*` na `/login` bez cookie.
  **Sprawdzasz:** wejście na `/app` w oknie incognito → redirect na `/login`;
  po zalogowaniu wraca na `/app`.

- [ ] **6.5 · Lista transakcji** · ~50 min
  **Robisz:** `/app` z przełącznikiem miesiąca i listą (data, kategoria, kwota, notatka).
  **Sprawdzasz:** widać transakcje dodane wcześniej curlem; przełączenie miesiąca zmienia listę;
  pusty miesiąc pokazuje komunikat, a nie pustkę.

- [ ] **6.6 · Dodawanie transakcji** · ~50 min
  **Robisz:** formularz (kwota, kategoria, data — domyślnie dziś, notatka), po zapisie odświeżenie listy.
  **Sprawdzasz:** dodana transakcja pojawia się bez ręcznego F5;
  wpisanie `12,50` i `12.50` daje ten sam wynik; litery w kwocie → błąd walidacji przy polu.

- [ ] **6.7 · Edycja i usuwanie** · ~40 min
  **Sprawdzasz:** edycja aktualizuje listę; usunięcie pyta o potwierdzenie i znika z listy.

- [ ] **6.8 · Ekran budżetu** · ~45 min
  **Robisz:** `/app/budget` — lista kategorii z polem limitu na wybrany miesiąc.
  **Sprawdzasz:** ustawiony limit przeżywa odświeżenie strony; zmiana miesiąca pokazuje limity
  tego miesiąca.

- [ ] **6.9 · Dashboard** · ~50 min
  **Robisz:** `/app` na górze: bilans miesiąca + paski postępu per kategoria
  (zielony / pomarańczowy > 80% / czerwony po przekroczeniu).
  **Sprawdzasz:** liczby zgadzają się z `GET /summary` z curla; przekroczony limit jest czerwony
  i nie wychodzi paskiem poza kontener.

- [ ] **6.10 · Telefon: responsywność + PWA** · ~45 min
  **Robisz:** przegląd layoutu mobile-first, `manifest.json`, ikony, `theme-color`.
  **Sprawdzasz:** DevTools w trybie iPhone SE — nic nie scrolluje się w poziomie, przyciski
  klikalne kciukiem; na telefonie "Dodaj do ekranu głównego" daje ikonę i pełny ekran bez paska URL.

---

## Faza 7 — Deploy na VPS (~4 h)

- [ ] **7.1 · Obrazy produkcyjne** · ~50 min
  **Robisz:** Dockerfile dla weba (`output: 'standalone'`), `infra/docker-compose.prod.yml`
  z `db` + `api` + `web`.
  **Sprawdzasz:** lokalnie `docker compose -f infra/docker-compose.prod.yml up` → aplikacja
  działa na `localhost:3000` z obrazów produkcyjnych, bez procesów dev.

- [ ] **7.2 · VPS i Caddy** · ~60 min
  **Robisz:** serwer, domena (rekord A), Docker, `Caddyfile`: `budgetio.twojadomena.pl` → web,
  `/api/*` → api. Firewall: otwarte tylko 22, 80, 443.
  **Sprawdzasz:** `https://twojadomena.pl` ładuje się z ważnym certyfikatem;
  `curl http://IP:5432` z zewnątrz nie łączy się (Postgres **nie** wystawiony na świat).

- [ ] **7.3 · Sekrety i migracje na produkcji** · ~35 min
  **Robisz:** `.env` na serwerze (poza gitem, `chmod 600`), świeży `JWT_SECRET`,
  `alembic upgrade head` jako krok deployu.
  **Sprawdzasz:** rejestracja i logowanie działają na produkcji; `git log -p` nie zawiera
  żadnego sekretu (`git log -S 'JWT_SECRET' -p`).

- [ ] **7.4 · Backup bazy** · ~35 min
  **Robisz:** cron z `pg_dump` do `/var/backups/budgetio`, rotacja 7 dni.
  **Sprawdzasz:** **odtworzenie** dumpa do bazy `budgetio_restore_test` i `SELECT count(*)`
  na transakcjach. Backup, którego nie odtworzyłeś, nie jest backupem.

- [ ] **7.5 · Deploy jedną komendą** · ~40 min ⏭️
  **Robisz:** `infra/deploy.sh` (pull → build → migrate → up -d) albo GitHub Action na push do `main`.
  **Sprawdzasz:** zmiana napisu w UI → jedna komenda → napis na produkcji w kilka minut.

---

## Faza 8 — Mobile, React Native (~5 h)

Startuje **po** wdrożonym webie. Aplikacja idzie prosto do FastAPI (bez Next.js po drodze),
więc token trzyma w `expo-secure-store`, nie w cookie.

- [ ] **8.1 · Expo scaffold + połączenie z API** · ~45 min
  **Sprawdzasz:** aplikacja na telefonie przez Expo Go wyświetla odpowiedź z `/health` produkcyjnego API.

- [ ] **8.2 · Logowanie** · ~60 min
  **Sprawdzasz:** logowanie działa, token ląduje w `expo-secure-store`, po restarcie aplikacji
  user zostaje zalogowany.

- [ ] **8.3 · Lista + dodawanie transakcji** · ~90 min
  **Sprawdzasz:** transakcja dodana w telefonie jest widoczna w webie po odświeżeniu.

- [ ] **8.4 · Podsumowanie miesiąca** · ~50 min
  **Sprawdzasz:** te same liczby co na dashboardzie webowym.

- [ ] **8.5 · Build przez EAS** · ~60 min
  **Sprawdzasz:** zainstalowany APK/TestFlight działa bez Expo Go i bez laptopa w sieci.

---

## Podsumowanie

| Faza | Efekt | Czas |
|---|---|---|
| 0–1 | działający szkielet API + baza | ~3 h |
| 2–4 | kompletne API budżetu | ~7 h |
| 5 | testy pilnujące arytmetyki | ~2 h |
| 6 | używalna aplikacja webowa | ~5 h |
| 7 | działa na VPS pod HTTPS | ~4 h |
| **0–7** | **MVP na produkcji** | **~21 h** |
| 8 | aplikacja mobilna | ~5 h |

Pierwszy moment, w którym da się realnie używać aplikacji: **koniec fazy 6**.
Pierwszy moment, w którym da się jej używać z telefonu: **7.2** (PWA pod HTTPS) — faza 8 jest
wygodą, nie warunkiem.
