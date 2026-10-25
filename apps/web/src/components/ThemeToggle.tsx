import { useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { currentTheme, setTheme, type Theme } from '@/lib/theme';
import { Button } from './ui/button';

export function ThemeToggle() {
  const { t } = useTranslation();
  const [theme, setState] = useState<Theme>(currentTheme);
  const next: Theme = theme === 'dark' ? 'light' : 'dark';

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={t(next === 'light' ? 'theme.toLight' : 'theme.toDark')}
      title={t('theme.toggle')}
      data-testid="theme-toggle"
      onClick={() => {
        setTheme(next);
        setState(next);
      }}
    >
      {theme === 'dark' ? <Sun aria-hidden /> : <Moon aria-hidden />}
    </Button>
  );
}
