import { useId, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { lookupName, useAddLocation, useLookups } from '@/fleet/data';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { errorProps, INPUT, Labeled } from '@/money/form';

const NEW = '__new__';
const FIELD_ID = 'vf-location';

/**
 * The vehicle form's Location: the Settings list plus "Other place…", which adds a site on the
 * spot (Sagi, 2026-11-15). Since 2026-11-23 anyone who may set the location adds one by typing
 * its name once; the other language can be fixed later in Settings → Lists.
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
  const add = useAddLocation();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [failed, setFailed] = useState<string | null>(null);
  const uid = useId();
  const list = lookups?.locations ?? [];

  const close = () => {
    setAdding(false);
    setName('');
    setFailed(null);
  };
  const create = async () => {
    if (!name.trim()) {
      setFailed('vehicleForm.location.nameRequired');
      return;
    }
    try {
      const row = await add.mutateAsync(name.trim());
      onChange(row.code);
      close();
    } catch (err) {
      setFailed(
        err instanceof ApiError && err.status === 403
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
          <Labeled id={`${uid}-name`} label={t('vehicleForm.location.name')}>
            <input
              id={`${uid}-name`}
              maxLength={80}
              value={name}
              autoFocus
              onChange={(e) => {
                setName(e.target.value);
                setFailed(null);
              }}
              onKeyDown={onKey}
              className={cn(INPUT, 'text-start')}
              data-testid="new-location-name"
            />
          </Labeled>
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
              disabled={add.isPending}
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
