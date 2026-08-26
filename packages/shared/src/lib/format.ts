/** Money is stored in the smallest currency unit. IDR has no minor unit. */

const ZERO_DECIMAL = new Set(['IDR', 'JPY', 'KRW', 'VND', 'CLP', 'ISK']);

export function minorUnits(currency: string): number {
  return ZERO_DECIMAL.has(currency.toUpperCase()) ? 0 : 2;
}

export interface MoneyFormat {
  currency: string;
  locale: string;
}

export const IDR: MoneyFormat = { currency: 'IDR', locale: 'id-ID' };

/** 9095079 -> "Rp9.095.079" */
export function formatMoney(amount: number, fmt: MoneyFormat = IDR): string {
  const decimals = minorUnits(fmt.currency);
  const value = decimals === 0 ? Math.round(amount) : amount / 10 ** decimals;
  const digits = value.toLocaleString(fmt.locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return fmt.currency.toUpperCase() === 'IDR' ? `Rp${digits}` : `${fmt.currency} ${digits}`;
}

/** 9095079 -> "Rp9,1jt" — for axis labels and dense chips. */
export function formatMoneyShort(amount: number, fmt: MoneyFormat = IDR): string {
  if (fmt.currency.toUpperCase() === 'IDR' && Math.abs(amount) >= 1_000_000) {
    const jt = (amount / 1_000_000).toLocaleString(fmt.locale, { maximumFractionDigits: 1 });
    return `Rp${jt}jt`;
  }
  return formatMoney(amount, fmt);
}

/** Digits-only text from an amount input back into a number. */
export function parseAmountInput(text: string): number {
  const digits = text.replace(/[^0-9]/g, '');
  return digits ? parseInt(digits, 10) : 0;
}

/** Group an in-progress amount input for display: "9095079" -> "9.095.079". */
export function formatAmountInput(text: string, fmt: MoneyFormat = IDR): string {
  const digits = text.replace(/[^0-9]/g, '');
  return digits ? parseInt(digits, 10).toLocaleString(fmt.locale) : '';
}

export function formatPercent(fraction: number, locale = 'en-US'): string {
  return `${Math.round(fraction * 100).toLocaleString(locale)}%`;
}

/** One decimal, locale-aware separator — "12,4%" in id-ID. */
export function formatShare(fraction: number, locale = 'id-ID'): string {
  return `${(fraction * 100).toLocaleString(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}
