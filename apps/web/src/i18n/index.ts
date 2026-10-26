import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';
import he from './he.json';

export const LANGUAGES = ['en', 'he'] as const;
export type Language = (typeof LANGUAGES)[number];
const STORAGE_KEY = 'fh.lang';

export function savedLanguage(): Language {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'he' ? 'he' : 'en';
  } catch {
    return 'en';
  }
}

/** Sets <html lang/dir> so the whole layout mirrors via logical properties. */
export function applyDocumentLanguage(lang: Language) {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr';
}

export async function setLanguage(lang: Language) {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Private mode: the choice lasts for this visit only.
  }
  applyDocumentLanguage(lang);
  await i18n.changeLanguage(lang);
}

export const resources = { en: { translation: en }, he: { translation: he } } as const;

void i18n.use(initReactI18next).init({
  resources,
  lng: savedLanguage(),
  fallbackLng: 'en',
  supportedLngs: LANGUAGES,
  interpolation: { escapeValue: false },
  returnNull: false,
});
applyDocumentLanguage(savedLanguage());

export default i18n;
