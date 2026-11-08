import { useTranslation } from 'react-i18next';
import { Check, CheckCheck, X } from 'lucide-react';
import {
  WIGGLE_STEERING,
  WIGGLE_SYSTEMS,
  wiggleProfileOf,
  type WiggleItem,
  type WiggleProfile,
} from '@fleet-hub/shared';
import { cn } from '@/lib/cn';
import { useAppSettings } from './api';
import type { FormValues } from './kinds';

/** The wiggle test checklist this vehicle type takes, or null (Sagi, 2026-11-08). */
export function useWiggleProfile(typeCode: string | null | undefined): WiggleProfile | null {
  const { data } = useAppSettings();
  return data ? wiggleProfileOf(data.wiggleTypes, typeCode) : null;
}

/**
 * The V / X list of a wiggle test: the machine's steering items, then cameras, LiDARs and
 * communications. Big buttons, so it fills in fast on a phone with gloves on; "All V" marks
 * every item at once and an X is then a single tap away.
 */
export function WiggleChecklist({
  profile,
  values,
  fieldKey,
  error,
  onChange,
}: {
  profile: WiggleProfile;
  values: FormValues;
  fieldKey: string;
  error?: string;
  onChange: (key: string, value: string) => void;
}) {
  const { t } = useTranslation();
  const keyOf = (item: WiggleItem) => `${fieldKey}.${item}`;
  const groups: { title: string; items: readonly WiggleItem[] }[] = [
    { title: t(`wiggle.steering.${profile}`), items: WIGGLE_STEERING[profile] },
    { title: t('wiggle.systems'), items: WIGGLE_SYSTEMS },
  ];
  const all = groups.flatMap((g) => g.items);
  const allPass = () => all.forEach((i) => onChange(keyOf(i), 'PASS'));

  return (
    <div className="space-y-4" data-testid="wiggle-checklist" data-profile={profile}>
      <div className="flex items-center gap-2">
        <p className="text-muted me-auto text-xs">{t('wiggle.howTo')}</p>
        <button
          type="button"
          onClick={allPass}
          className="border-border-strong hover:border-ok text-ok inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border px-3 text-sm font-medium"
          data-testid="wiggle-all-ok"
        >
          <CheckCheck aria-hidden className="size-4" />
          {t('wiggle.markAllOk')}
        </button>
      </div>
      {groups.map((g) => (
        <fieldset key={g.title} className="space-y-1.5">
          <legend className="mb-1 text-xs font-semibold">{g.title}</legend>
          <ul className="border-border divide-border divide-y rounded-md border">
            {g.items.map((item) => {
              const v = values[keyOf(item)];
              const missing = !!error && v !== 'PASS' && v !== 'FAIL';
              const label = t(`wiggle.item.${item}`);
              return (
                <li
                  key={item}
                  className={cn('flex items-center gap-2 px-2.5 py-1.5', missing && 'bg-bad/10')}
                  data-item={item}
                >
                  <span id={`wiggle-${item}`} className="min-w-0 flex-1 text-sm">
                    {label}
                  </span>
                  <div
                    role="radiogroup"
                    aria-labelledby={`wiggle-${item}`}
                    className="flex gap-1.5"
                  >
                    {(['PASS', 'FAIL'] as const).map((r) => {
                      const on = v === r;
                      const Icon = r === 'PASS' ? Check : X;
                      return (
                        <button
                          key={r}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          onClick={() => onChange(keyOf(item), r)}
                          title={t(r === 'PASS' ? 'wiggle.passHint' : 'wiggle.failHint')}
                          data-result={r}
                          className={cn(
                            'grid size-11 place-items-center rounded-md border text-base font-bold',
                            !on && 'border-border-strong text-muted hover:text-text',
                            on && r === 'PASS' && 'border-ok bg-ok text-accent-contrast',
                            on && r === 'FAIL' && 'border-bad bg-bad text-white',
                          )}
                        >
                          <Icon aria-hidden className="size-5" strokeWidth={3} />
                          <span className="sr-only">
                            {t(r === 'PASS' ? 'wiggle.passHint' : 'wiggle.failHint')}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </li>
              );
            })}
          </ul>
        </fieldset>
      ))}
      {error && (
        <p className="text-bad text-xs" role="alert">
          {t('wiggle.answerAll')}
        </p>
      )}
    </div>
  );
}
