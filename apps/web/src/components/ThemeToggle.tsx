import { useSyncExternalStore } from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { currentTheme, setTheme, subscribeTheme, type Theme } from '@/lib/theme';
import { Button } from './ui/button';

export function ThemeToggle({ onChange }: { onChange?: (theme: Theme) => void }) {
  const { t } = useTranslation();
  const theme = useSyncExternalStore(subscribeTheme, currentTheme);
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
        onChange?.(next);
      }}
    >
      {theme === 'dark' ? <Sun aria-hidden /> : <Moon aria-hidden />}
    </Button>
  );
}
