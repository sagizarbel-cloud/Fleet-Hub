import { Languages } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { setLanguage, type Language } from '@/i18n';
import { prefersReducedMotion } from '@/lib/motion';
import { Button } from './ui/button';

/** Resolves once React has had a turn to render the new language. */
const rendered = () => new Promise<void>((resolve) => setTimeout(resolve, 30));

/**
 * Instant EN/HE switch with a short crossfade; no reload. Where the browser supports view
 * transitions, the old page (in the old direction) fades into the new one; elsewhere the page just
 * eases back in from a light dim.
 */
export function LanguageToggle({ onChange }: { onChange?: (lang: Language) => void }) {
  const { t, i18n } = useTranslation();
  const next: Language = i18n.language === 'he' ? 'en' : 'he';

  async function toggle() {
    if (prefersReducedMotion()) {
      await setLanguage(next);
    } else if (document.startViewTransition) {
      const transition = document.startViewTransition(async () => {
        await setLanguage(next);
        await rendered();
      });
      await transition.updateCallbackDone;
    } else {
      document
        .getElementById('root')
        ?.animate([{ opacity: 0.7 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' });
      await setLanguage(next);
    }
    onChange?.(next);
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggle}
      aria-label={t('language.toggle')}
      title={t(`language.${next}`)}
      data-testid="language-toggle"
    >
      <Languages aria-hidden />
      <span lang={next}>{t(`language.${next}`)}</span>
    </Button>
  );
}
