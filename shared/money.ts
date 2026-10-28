// Kwoty trzymamy zawsze jako liczby całkowite w groszach (int), nigdy jako float.
// 19.99 w float to 19.98999..., a sumy takich liczb szybko się rozjeżdżają.

const plnFormat = new Intl.NumberFormat('pl-PL', {
  style: 'currency',
  currency: 'PLN',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  // Polski standard nie dzieli liczb 4-cyfrowych ("7361,82"). Dzielimy zawsze, żeby kolumny wyglądały równo.
  useGrouping: 'always',
});

/** 12345 -> "123,45 zł" */
export function formatMoney(grosze: number): string {
  return plnFormat.format(grosze / 100);
}

/** 12345 -> "123,45" (bez waluty, do pól formularza) */
export function groszeToInput(grosze: number | null | undefined): string {
  if (grosze == null) return '';
  return (grosze / 100).toFixed(2).replace('.', ',');
}

/**
 * Zamienia tekst wpisany przez użytkownika na grosze.
 * Akceptuje "99,99", "99.99", "1 234,5", "1234". Zwraca null, gdy tekst nie jest kwotą.
 */
export function parseMoney(input: string): number | null {
  const cleaned = input.replace(/\s|zł/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [zl, gr = ''] = cleaned.split('.');
  return Number(zl) * 100 + Number(gr.padEnd(2, '0'));
}
