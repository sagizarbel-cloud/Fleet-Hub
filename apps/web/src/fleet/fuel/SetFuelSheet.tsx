import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { fuelLevelBody } from '@fleet-hub/shared';
import { Sheet } from '@/components/Sheet';
import { Button } from '@/components/ui/button';
import { isolate } from '@/lib/bidi';
import { cn } from '@/lib/cn';
import { errorProps, INPUT, Labeled } from '@/money/form';
import { useSetFuel, type FuelRow } from './data';

const PCT_ID = 'fuel-pct';
const LITERS_ID = 'fuel-liters';
const PCT_ERROR = 'fuel.pctError';
const INVALID = 'records.error.invalid';

/** An editor reads the gauge and sets the level by hand; it shows as "manual" until a live one. */
export default function SetFuelSheet({
  row,
  onClose,
  reduced,
}: {
  row: FuelRow;
  onClose: () => void;
  reduced: boolean;
}) {
  const { t } = useTranslation();
  const save = useSetFuel();
  const [pct, setPct] = useState(String(Math.round(row.level?.pct ?? 50)));
  const [liters, setLiters] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setFailed(false);
    const parsed = fuelLevelBody.safeParse({
      pct: pct === '' ? NaN : Number(pct),
      liters: liters === '' ? null : Number(liters),
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      setError(issue.path[0] === 'liters' ? 'liters' : 'pct');
      return;
    }
    setError(null);
    save.mutate(
      { serial: row.serial, body: parsed.data },
      { onSuccess: onClose, onError: () => setFailed(true) },
    );
  };

  return (
    <Sheet
      title={t('fuel.setTitle', { serial: isolate(row.serial) })}
      onClose={onClose}
      reduced={reduced}
      footer={
        <div className="flex items-center gap-2">
          {failed && (
            <p role="alert" className="text-bad me-auto text-xs">
              {t('records.error.save')}
            </p>
          )}
          <Button variant="ghost" className="ms-auto" type="button" onClick={onClose}>
            {t('records.cancel')}
          </Button>
          <Button type="submit" form="fuel-form" disabled={save.isPending}>
            {t('records.save')}
          </Button>
        </div>
      }
    >
      <form id="fuel-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        <p className="text-muted text-sm">
          <bdi>
            {row.make} {row.model}
          </bdi>
        </p>
        <Labeled
          id={PCT_ID}
          label={t('fuel.pct')}
          required
          error={error === 'pct' ? PCT_ERROR : undefined}
        >
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={pct === '' ? 0 : Number(pct)}
              onChange={(e) => setPct(e.target.value)}
              className="flex-1 accent-[var(--fh-accent)]"
              aria-label={t('fuel.pct')}
              tabIndex={-1}
            />
            <input
              {...errorProps(PCT_ID, error === 'pct' ? PCT_ERROR : undefined)}
              data-autofocus
              type="number"
              inputMode="decimal"
              min={0}
              max={100}
              value={pct}
              onChange={(e) => setPct(e.target.value)}
              className={cn(INPUT, 'num w-20')}
            />
          </div>
        </Labeled>
        <Labeled
          id={LITERS_ID}
          label={t('fuel.liters')}
          hint={t('fuel.litersHint')}
          error={error === 'liters' ? INVALID : undefined}
        >
          <input
            {...errorProps(LITERS_ID, error === 'liters' ? INVALID : undefined)}
            type="number"
            inputMode="decimal"
            min={0}
            value={liters}
            onChange={(e) => setLiters(e.target.value)}
            className={cn(INPUT, 'num w-32')}
          />
        </Labeled>
        <p className="text-muted text-xs">{t('fuel.manualHint')}</p>
      </form>
    </Sheet>
  );
}
