import { useState, useSyncExternalStore, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, Check } from 'lucide-react';
import {
  changePasswordBody,
  DEFAULT_PINNED_VITALS,
  VITAL_KEYS,
  type VitalKey,
} from '@fleet-hub/shared';
import { Button } from '@/components/ui/button';
import { LANGUAGES, setLanguage, type Language } from '@/i18n';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { currentTheme, setTheme, subscribeTheme, type Theme } from '@/lib/theme';
import { errorProps, INPUT, issuesToErrors, Labeled, type Errors } from '@/money/form';
import { usePreferences, useSavePreferences } from '@/vehicle/data';
import { useChangePassword } from './api';
import { useSaveLook } from './prefs';

const THEMES: Theme[] = ['dark', 'light'];

export function Panel({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="glass space-y-3 p-4 sm:p-5">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        {hint && <p className="text-muted mt-0.5 text-sm">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

/** A row of choices that behaves as one radio group. */
function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
  name,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; lang?: string }[];
  onChange: (v: T) => void;
  name: string;
}) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-xs font-medium">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label
            key={o.value}
            className={cn(
              'border-border-strong flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--fh-accent)]',
              value === o.value && 'border-accent bg-accent/10',
            )}
          >
            <input
              type="radio"
              name={name}
              className="sr-only"
              checked={value === o.value}
              onChange={() => onChange(o.value)}
            />
            {value === o.value && <Check aria-hidden className="text-accent-ink size-4" />}
            <span lang={o.lang}>{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function MySettings() {
  const { t, i18n } = useTranslation();
  const look = useSaveLook();
  const theme = useSyncExternalStore(subscribeTheme, currentTheme);

  return (
    <div className="space-y-3">
      <Panel title={t('settings.mine.look')} hint={t('settings.mine.lookHint')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Choice
            name="language"
            label={t('settings.mine.language')}
            value={i18n.language as Language}
            options={LANGUAGES.map((l) => ({ value: l, label: t(`language.${l}`), lang: l }))}
            onChange={(l) => {
              void setLanguage(l);
              look.language(l);
            }}
          />
          <Choice
            name="theme"
            label={t('settings.mine.theme')}
            value={theme}
            options={THEMES.map((v) => ({ value: v, label: t(`settings.mine.themes.${v}`) }))}
            onChange={(v) => {
              setTheme(v);
              look.theme(v);
            }}
          />
        </div>
      </Panel>
      <DefaultVitals />
      <ChangePassword />
    </div>
  );
}

/** The vitals every vehicle page opens with (SPEC A6), in order. */
function DefaultVitals() {
  const { t } = useTranslation();
  const prefs = usePreferences();
  const save = useSavePreferences();
  const pinned = prefs.data?.pinnedVitals ?? DEFAULT_PINNED_VITALS;
  const set = (pinnedVitals: VitalKey[]) => save.mutate({ pinnedVitals });
  const label = (k: VitalKey) => t(`vehicle.info.${k}`);
  const move = (i: number, by: -1 | 1) => {
    const next = [...pinned];
    [next[i], next[i + by]] = [next[i + by]!, next[i]!];
    set(next);
  };

  return (
    <Panel title={t('settings.mine.vitals')} hint={t('vehicle.vitals.hint')}>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <h3 className="text-muted mb-1.5 text-xs font-medium">{t('vehicle.vitals.pinned')}</h3>
          <ol className="space-y-1" data-testid="pinned-vitals">
            {pinned.map((k, i) => (
              <li
                key={k}
                className="border-border bg-surface-strong/60 flex items-center gap-1 rounded-lg border px-2 py-1"
              >
                <label className="flex min-w-0 flex-1 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked
                    onChange={() => set(pinned.filter((p) => p !== k))}
                    className="accent-[var(--fh-accent)]"
                  />
                  <span className="truncate">{label(k)}</span>
                </label>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  disabled={i === 0}
                  aria-label={t('vehicle.vitals.moveUp', { name: label(k) })}
                  onClick={() => move(i, -1)}
                >
                  <ArrowUp aria-hidden />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  disabled={i === pinned.length - 1}
                  aria-label={t('vehicle.vitals.moveDown', { name: label(k) })}
                  onClick={() => move(i, 1)}
                >
                  <ArrowDown aria-hidden />
                </Button>
              </li>
            ))}
          </ol>
        </div>
        <div>
          <h3 className="text-muted mb-1.5 text-xs font-medium">{t('vehicle.vitals.more')}</h3>
          <ul className="space-y-1">
            {VITAL_KEYS.filter((k) => !pinned.includes(k)).map((k) => (
              <li key={k} className="px-2 py-1">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={false}
                    onChange={() => set([...pinned, k])}
                    className="accent-[var(--fh-accent)]"
                  />
                  {label(k)}
                </label>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <Button variant="outline" size="sm" onClick={() => set(DEFAULT_PINNED_VITALS)}>
        {t('vehicle.vitals.reset')}
      </Button>
    </Panel>
  );
}

const PASSWORD_MESSAGES = { wrong: 'settings.password.wrong' };
const PASSWORD_FIELDS = [
  ['current', 'current-password'],
  ['next', 'new-password'],
  ['confirm', 'new-password'],
] as const;

function ChangePassword() {
  const { t } = useTranslation();
  const change = useChangePassword();
  const [values, setValues] = useState({ current: '', next: '', confirm: '' });
  const [errors, setErrors] = useState<Errors>({});
  const [done, setDone] = useState(false);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setDone(false);
    const parsed = changePasswordBody.safeParse({ current: values.current, next: values.next });
    const errs = parsed.success
      ? {}
      : issuesToErrors(parsed.error.issues, (f) => values[f as 'current' | 'next'] === '', {
          tooShort: 'settings.password.tooShort',
        });
    if (values.confirm !== values.next) errs.confirm = 'settings.password.mismatch';
    setErrors(errs);
    if (Object.keys(errs).length || !parsed.success) return;
    change.mutate(parsed.data, {
      onSuccess: () => {
        setValues({ current: '', next: '', confirm: '' });
        setDone(true);
      },
      onError: (err) => {
        if (err instanceof ApiError && err.issues.length)
          setErrors(
            Object.fromEntries(
              err.issues.map((i) => [
                i.path,
                PASSWORD_MESSAGES[i.code as keyof typeof PASSWORD_MESSAGES] ??
                  'records.error.invalid',
              ]),
            ),
          );
      },
    });
  };

  const field = (key: keyof typeof values, autoComplete: string) => (
    <Labeled key={key} id={`pw-${key}`} label={t(`settings.password.${key}`)} error={errors[key]}>
      <input
        {...errorProps(`pw-${key}`, errors[key])}
        type="password"
        autoComplete={autoComplete}
        value={values[key]}
        onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
        className={INPUT}
      />
    </Labeled>
  );

  const failed =
    change.error instanceof ApiError && change.error.status === 429
      ? 'login.rateLimited'
      : change.error && !(change.error instanceof ApiError && change.error.issues.length)
        ? 'records.error.save'
        : null;

  return (
    <Panel title={t('settings.password.title')} hint={t('settings.password.hint')}>
      <form onSubmit={onSubmit} className="grid max-w-md gap-3" noValidate>
        {PASSWORD_FIELDS.map(([key, autoComplete]) => field(key, autoComplete))}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={change.isPending}>
            {t('settings.password.submit')}
          </Button>
          {done && (
            <p role="status" className="text-ok text-sm">
              {t('settings.password.done')}
            </p>
          )}
          {failed && (
            <p role="alert" className="text-bad text-sm">
              {t(failed as never)}
            </p>
          )}
        </div>
      </form>
    </Panel>
  );
}
