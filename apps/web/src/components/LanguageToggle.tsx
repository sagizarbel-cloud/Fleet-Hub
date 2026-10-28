import { Languages } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { setLanguage, type Language } from '@/i18n';
import { prefersReducedMotion } from '@/lib/motion';
import { Button } from './ui/button';

/** Instant EN/HE switch with a short crossfade; no reload. */
export function LanguageToggle({ onChange }: { onChange?: (lang: Language) => void }) {
  const { t, i18n } = useTranslation();
  const next: Language = i18n.language === 'he' ? 'en' : 'he';

  async function toggle() {
    const root = document.getElementById('root');
    if (root && !prefersReducedMotion()) {
      root.animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: 220, easing: 'ease-out' });
    }
    await setLanguage(next);
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
