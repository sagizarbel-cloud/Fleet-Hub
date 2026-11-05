import { useEffect } from 'react';
import { setLanguage, type Language } from '@/i18n';
import i18n from '@/i18n';
import type { Design } from '@fleet-hub/shared';
import { currentDesign, setDesign } from '@/lib/design';
import { currentTheme, setTheme, type Theme } from '@/lib/theme';
import { usePreferences, useSavePreferences } from '@/vehicle/data';

/**
 * Language, theme and design follow the user across devices: a saved choice wins over this browser's
 * own, and a change from the top bar is saved to the account.
 */
export function usePreferenceSync() {
  const { data } = usePreferences();
  const language = data?.language ?? null;
  const theme = data?.theme ?? null;
  const design = data?.design ?? null;
  useEffect(() => {
    if (language && language !== i18n.language) void setLanguage(language);
  }, [language]);
  useEffect(() => {
    if (theme && theme !== currentTheme()) setTheme(theme);
  }, [theme]);
  useEffect(() => {
    if (design && design !== currentDesign()) setDesign(design);
  }, [design]);
}

/** Saves a language or theme picked in the top bar or in Settings. */
export function useSaveLook() {
  const save = useSavePreferences();
  return {
    language: (lang: Language) => save.mutate({ language: lang }),
    theme: (theme: Theme) => save.mutate({ theme }),
    design: (design: Design) => save.mutate({ design }),
  };
}
