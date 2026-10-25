import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';
import { flatten, missingHebrew } from './flatten';
import i18n, { setLanguage } from './index';

describe('translations', () => {
  it('have the same keys in English and Hebrew, none empty', () => {
    expect(Object.keys(flatten(he)).sort()).toEqual(Object.keys(flatten(en)).sort());
    expect(missingHebrew(en, he)).toEqual([]);
  });

  it('use the A9 glossary for core terms', () => {
    expect(he.nav.dashboard).toBe('לוח בקרה');
    expect(he.nav.fleetTable).toBe('טבלה מרוכזת');
    expect(he.status).toMatchObject({ GREEN: 'תקין', AMBER: 'עם תקלות', RED: 'מושבת' });
  });

  it('detects a missing Hebrew value', () => {
    expect(missingHebrew({ a: { b: 'x', c: 'y' } }, { a: { b: 'x', c: ' ' } })).toEqual(['a.c']);
  });
});

describe('setLanguage', () => {
  it('switches to Hebrew with RTL and remembers it', async () => {
    await setLanguage('he');
    expect(document.documentElement.dir).toBe('rtl');
    expect(document.documentElement.lang).toBe('he');
    expect(localStorage.getItem('fh.lang')).toBe('he');
    expect(i18n.t('nav.settings')).toBe('הגדרות');

    await setLanguage('en');
    expect(document.documentElement.dir).toBe('ltr');
    expect(i18n.t('nav.settings')).toBe('Settings');
  });
});
