/** Flattens nested translation JSON into dotted keys (shared by the /i18n-check page and tests). */
export function flatten(obj: object, prefix = '', out: Record<string, unknown> = {}) {
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object') flatten(value, path, out);
    else out[path] = value;
  }
  return out;
}

export function missingHebrew(en: object, he: object): string[] {
  const enFlat = flatten(en);
  const heFlat = flatten(he);
  return Object.keys(enFlat).filter(
    (k) => typeof heFlat[k] !== 'string' || (heFlat[k] as string).trim() === '',
  );
}
