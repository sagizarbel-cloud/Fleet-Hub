/**
 * Cached Intl formatters. Building one is slow (a fraction of a millisecond each), and lists such
 * as the activity timeline format hundreds of dates per render, which once held up the opening
 * of a vehicle. Same options, same formatter.
 */
const cache = new Map<string, Intl.DateTimeFormat | Intl.NumberFormat | Intl.RelativeTimeFormat>();

function cached<T extends Intl.DateTimeFormat | Intl.NumberFormat | Intl.RelativeTimeFormat>(
  kind: string,
  locale: string,
  options: object,
  make: () => T,
): T {
  const key = `${kind}|${locale}|${JSON.stringify(options)}`;
  let f = cache.get(key) as T | undefined;
  if (!f) {
    f = make();
    cache.set(key, f);
  }
  return f;
}

/** The app's locale for a UI language: Hebrew as he-IL, English with day-first dates. */
export const localeOf = (lang: string) => (lang === 'he' ? 'he-IL' : 'en-GB');

export const dateFormat = (locale: string, options: Intl.DateTimeFormatOptions = {}) =>
  cached('d', locale, options, () => new Intl.DateTimeFormat(locale, options));

export const numberFormat = (locale: string, options: Intl.NumberFormatOptions = {}) =>
  cached('n', locale, options, () => new Intl.NumberFormat(locale, options));

export const relativeFormat = (locale: string, options: Intl.RelativeTimeFormatOptions = {}) =>
  cached('r', locale, options, () => new Intl.RelativeTimeFormat(locale, options));
