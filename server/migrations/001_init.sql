-- Schemat startowy.
-- ZASADA: zastosowanej migracji NIGDY nie zmieniamy. Każda zmiana schematu = nowy plik 00X_nazwa.sql.
-- Kwoty: grosze (INTEGER). Procenty stawek podatkowych: punkty bazowe (1952 = 19,52%).
-- Daty: tekst 'YYYY-MM-DD', miesiące: tekst 'YYYY-MM'.

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Stawki ZUS / zdrowotnej / PIT na dany rok (aktualizujesz raz w roku w Ustawieniach).
CREATE TABLE tax_rates (
  year                INTEGER PRIMARY KEY,
  zus_full_base       INTEGER NOT NULL,
  zus_pref_base       INTEGER NOT NULL,
  pension_rate_bp     INTEGER NOT NULL,
  disability_rate_bp  INTEGER NOT NULL,
  accident_rate_bp    INTEGER NOT NULL,
  sickness_rate_bp    INTEGER NOT NULL,
  labor_fund_rate_bp  INTEGER NOT NULL,
  health_rate_bp      INTEGER NOT NULL,
  health_min          INTEGER NOT NULL,
  pit_rate1_bp        INTEGER NOT NULL,
  pit_rate2_bp        INTEGER NOT NULL,
  pit_threshold       INTEGER NOT NULL,
  pit_reduction       INTEGER NOT NULL
);

-- Etap ZUS obowiązuje od podanego miesiąca do następnej zmiany.
CREATE TABLE zus_stage_changes (
  month TEXT PRIMARY KEY,
  stage TEXT NOT NULL CHECK (stage IN ('none', 'start_relief', 'preferential', 'full'))
);

CREATE TABLE categories (
  id            INTEGER PRIMARY KEY,
  name          TEXT NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('income', 'personal', 'business')),
  monthly_limit INTEGER CHECK (monthly_limit IS NULL OR monthly_limit >= 0),
  rollover      INTEGER NOT NULL DEFAULT 0,
  rollover_from TEXT,
  archived      INTEGER NOT NULL DEFAULT 0,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  UNIQUE (name, kind)
);

CREATE TABLE transactions (
  id                 INTEGER PRIMARY KEY,
  type               TEXT NOT NULL CHECK (type IN ('business_income', 'business_cost', 'personal_income', 'personal_expense')),
  description        TEXT NOT NULL DEFAULT '',
  category_id        INTEGER REFERENCES categories (id),
  amount_gross       INTEGER NOT NULL CHECK (amount_gross > 0),
  vat_rate           INTEGER NOT NULL DEFAULT 0 CHECK (vat_rate BETWEEN 0 AND 100),
  vat_deductible_pct INTEGER NOT NULL DEFAULT 100 CHECK (vat_deductible_pct BETWEEN 0 AND 100),
  tax_cost_pct       INTEGER NOT NULL DEFAULT 100 CHECK (tax_cost_pct BETWEEN 0 AND 100),
  invoice_date       TEXT NOT NULL,
  payment_date       TEXT NOT NULL,
  created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_transactions_invoice_date ON transactions (invoice_date);
CREATE INDEX ix_transactions_payment_date ON transactions (payment_date);

-- Koszty stałe. Kwota siedzi w okresie, a nie w pozycji: zmiana kwoty od stycznia
-- nie zmienia historii z grudnia, a przerwaną subskrypcję wznawiamy nowym okresem.
CREATE TABLE recurring_items (
  id                 INTEGER PRIMARY KEY,
  name               TEXT NOT NULL,
  type               TEXT NOT NULL CHECK (type IN ('business_cost', 'personal_expense')),
  category_id        INTEGER REFERENCES categories (id),
  vat_rate           INTEGER NOT NULL DEFAULT 0 CHECK (vat_rate BETWEEN 0 AND 100),
  vat_deductible_pct INTEGER NOT NULL DEFAULT 100 CHECK (vat_deductible_pct BETWEEN 0 AND 100),
  tax_cost_pct       INTEGER NOT NULL DEFAULT 100 CHECK (tax_cost_pct BETWEEN 0 AND 100),
  payment_day        INTEGER CHECK (payment_day IS NULL OR payment_day BETWEEN 1 AND 31),
  created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE recurring_periods (
  id           INTEGER PRIMARY KEY,
  item_id      INTEGER NOT NULL REFERENCES recurring_items (id) ON DELETE CASCADE,
  start_month  TEXT NOT NULL,
  end_month    TEXT,
  amount_gross INTEGER NOT NULL CHECK (amount_gross > 0),
  CHECK (end_month IS NULL OR end_month >= start_month)
);
CREATE INDEX ix_recurring_periods_item ON recurring_periods (item_id, start_month);
