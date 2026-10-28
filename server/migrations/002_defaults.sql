-- Dane startowe: ustawienia, stawki na 2026 r. i ogólne kategorie (bez limitów).
-- Źródła stawek 2026: zus.pl (kalkulator składki zdrowotnej), symfonia.pl, inewi.pl.

INSERT INTO settings (key, value) VALUES
  ('defaultVatRate', '23'),
  ('sicknessInsurance', 'true'),
  ('paymentTermDays', '7');

INSERT INTO tax_rates VALUES (
  2026,
  565200,   -- podstawa pełnego ZUS: 5 652,00 zł
  144180,   -- podstawa preferencyjnego ZUS: 1 441,80 zł
  1952,     -- emerytalna 19,52%
  800,      -- rentowa 8%
  167,      -- wypadkowa 1,67%
  245,      -- chorobowa 2,45% (dobrowolna)
  245,      -- Fundusz Pracy 2,45% (tylko pełny ZUS)
  900,      -- zdrowotna 9% (skala podatkowa)
  43254,    -- minimalna zdrowotna 432,54 zł
  1200,     -- PIT I próg 12%
  3200,     -- PIT II próg 32%
  12000000, -- próg 120 000 zł
  360000    -- kwota zmniejszająca podatek 3 600 zł
);

INSERT INTO categories (name, kind, sort_order) VALUES
  ('Faktura B2B', 'income', 1),
  ('Inny przychód firmowy', 'income', 2),
  ('Przychód prywatny', 'income', 3),
  ('Mieszkanie (czynsz)', 'personal', 10),
  ('Media i rachunki', 'personal', 11),
  ('Jedzenie', 'personal', 12),
  ('Transport prywatny', 'personal', 13),
  ('Zdrowie i higiena', 'personal', 14),
  ('Zwierzęta', 'personal', 15),
  ('Rozrywka', 'personal', 16),
  ('Subskrypcje', 'personal', 17),
  ('Ubrania', 'personal', 18),
  ('Prezenty', 'personal', 19),
  ('Edukacja', 'personal', 20),
  ('Oszczędności', 'personal', 21),
  ('Inne prywatne', 'personal', 22),
  ('Sprzęt i elektronika', 'business', 30),
  ('Oprogramowanie', 'business', 31),
  ('Internet i telefon', 'business', 32),
  ('Transport służbowy', 'business', 33),
  ('Paliwo', 'business', 34),
  ('Księgowość', 'business', 35),
  ('Szkolenia', 'business', 36),
  ('Inne firmowe', 'business', 37);
