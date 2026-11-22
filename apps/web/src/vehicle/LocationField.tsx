import { useId, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { lookupName, useLookups } from '@/fleet/data';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { errorProps, INPUT, Labeled } from '@/money/form';
import { useSaveLookup } from '@/settings/api';

const NEW = '__new__';
const FIELD_ID = 'vf-location';
/** The name fields in the reader's order: their own language first. */
const LANGS = [
  ['en', 'he'],
  ['he', 'en'],
] as const;

/** A stable list code from the English name, or a generated one when the name has no Latin letters. */
export function locationCode(name: string, taken: readonly string[]): string {
  const slug = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^[^a-z]+/, '')
    .replace(/_+$/, '')
    .slice(0, 32);
  const base = slug || `loc_${Date.now().toString(36)}`;
  let code = base;
  for (let n = 2; taken.includes(code); n++) code = `${base}_${n}`;
  return code;
}

/**
 * The vehicle form's Location: the Settings list plus "New location…", which adds a site to the
 * list on the spot (Sagi, 2026-11-15) instead of a trip to Settings. Both names start as typed;
 * the other language can be fixed later in Settings → Lists.
 */
export function LocationField({
  value,
  error,
  onChange,
}: {
  value: string;
  error?: string;
  onChange: (code: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const { data: lookups } = useLookups();
  const save = useSaveLookup('locations');
  const [adding, setAdding] = useState(false);
  const [nameEn, setNameEn] = useState('');
  const [nameHe, setNameHe] = useState('');
  const [failed, setFailed] = useState<string | null>(null);
  const uid = useId();
  const he = i18n.language.startsWith('he');
  const list = lookups?.locations ?? [];

  const close = () => {
    setAdding(false);
    setNameEn('');
    setNameHe('');
    setFailed(null);
  };
  const create = async () => {
    const en = nameEn.trim() || nameHe.trim();
    const hb = nameHe.trim() || nameEn.trim();
    if (!en) {
      setFailed('vehicleForm.location.nameRequired');
      return;
    }
    try {
      const row = await save.mutateAsync({
        body: {
          code: locationCode(
            nameEn,
            list.map((l) => l.code),
          ),
          nameEn: en,
          nameHe: hb,
          active: true,
        },
      });
      onChange(row.code);
      close();
    } catch (err) {
      setFailed(
        err instanceof ApiError && err.issues.some((i) => i.code === 'taken')
          ? 'vehicleForm.location.taken'
          : err instanceof ApiError && err.status === 403
            ? 'records.error.forbidden'
            : 'records.error.save',
      );
    }
  };
  // Enter adds the location instead of submitting the vehicle form around it.
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void create();
    }
  };
  const nameInput = (lang: 'en' | 'he') => (
    <Labeled key={lang} id={`${uid}-${lang}`} label={t(`vehicleForm.location.name_${lang}`)}>
      <input
        id={`${uid}-${lang}`}
        dir={lang === 'en' ? 'ltr' : 'rtl'}
        maxLength={80}
        value={lang === 'en' ? nameEn : nameHe}
        onChange={(e) => {
          (lang === 'en' ? setNameEn : setNameHe)(e.target.value);
          setFailed(null);
        }}
        onKeyDown={onKey}
        className={cn(INPUT, 'text-start')}
        data-testid={`new-location-${lang}`}
      />
    </Labeled>
  );

  return (
    <div className="space-y-2">
      <Labeled id={FIELD_ID} label={t('vehicleForm.field.location')} error={error}>
        <select
          {...errorProps(FIELD_ID, error)}
          value={adding ? NEW : value}
          onChange={(e) => {
            if (e.target.value === NEW) {
              setAdding(true);
              return;
            }
            close();
            onChange(e.target.value);
          }}
          className={INPUT}
        >
          <option value="">{t('vehicleForm.none')}</option>
          {list.map((o) => (
            <option key={o.code} value={o.code}>
              {lookupName(o, i18n.language)}
            </option>
          ))}
          <option value={NEW}>{t('vehicleForm.location.new')}</option>
        </select>
      </Labeled>
      {adding && (
        <div
          className="border-border space-y-2 rounded-lg border border-dashed p-2"
          data-testid="new-location"
        >
          <div className="grid gap-2 sm:grid-cols-2">{LANGS[he ? 1 : 0].map(nameInput)}</div>
          <p className="text-muted text-xs">{t('vehicleForm.location.hint')}</p>
          {failed && (
            <p role="alert" className="text-bad text-xs">
              {t(failed as never)}
            </p>
          )}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => void create()}
              disabled={save.isPending}
              data-testid="new-location-save"
            >
              <Check aria-hidden className="size-3.5" />
              {t('vehicleForm.location.add')}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={close}>
              <X aria-hidden className="size-3.5" />
              {t('vehicleForm.location.cancel')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
