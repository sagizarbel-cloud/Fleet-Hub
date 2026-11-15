import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ITEM_KINDS, itemBody, type ItemKind } from '@fleet-hub/shared';
import { Sheet } from '@/components/Sheet';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useSaveItem, type Item } from './api';
import { errorProps, INPUT, issuesToErrors, Labeled, type Errors } from './form';

const FIELD = { name: 'name', model: 'model', serial: 'serial', spec: 'spec' } as const;

/** Add or edit a catalog item (equipment and tools). Used on the Equipment page and the vehicle page. */
export function ItemForm({
  item,
  reduced,
  onClose,
}: {
  item?: Item;
  reduced: boolean;
  onClose: (saved?: Item) => void;
}) {
  const { t } = useTranslation();
  const save = useSaveItem();
  const [values, setValues] = useState({
    kind: (item?.kind ?? 'bucket') as ItemKind,
    name: item?.name ?? '',
    model: item?.model ?? '',
    spec: item?.spec ?? '',
    serial: item?.serial ?? '',
  });
  const [errors, setErrors] = useState<Errors>({});
  const [failed, setFailed] = useState<string | null>(null);
  const set = (k: keyof typeof values, v: string) => {
    setValues((s) => ({ ...s, [k]: v }));
    setErrors(({ [k]: _gone, ...rest }) => rest);
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = itemBody.safeParse(values);
    if (!parsed.success) {
      setErrors(
        issuesToErrors(parsed.error.issues, (f) => values[f as keyof typeof values] === ''),
      );
      return;
    }
    try {
      onClose(await save.mutateAsync({ id: item?.id, body: values }));
    } catch (err) {
      if (err instanceof ApiError && err.code === 'serial_taken')
        setErrors({ serial: 'equipment.serialTaken' });
      else setFailed('records.error.save');
    }
  };
  const field = (
    k: 'name' | 'model' | 'spec' | 'serial',
    label: string,
    max: number,
    required = false,
  ) => (
    <Labeled id={`item-${k}`} label={label} required={required} error={errors[k]}>
      <input
        {...errorProps(`item-${k}`, errors[k])}
        className={cn(INPUT, k === 'serial' && 'num')}
        dir={k === 'serial' ? 'ltr' : undefined}
        maxLength={max}
        value={values[k]}
        onChange={(e) => set(k, e.target.value)}
        data-testid={`item-${k}`}
      />
    </Labeled>
  );
  return (
    <Sheet
      title={t(item ? 'equipment.editTitle' : 'equipment.addTitle')}
      onClose={() => onClose()}
      reduced={reduced}
      footer={
        <div className="flex items-center gap-2">
          {failed && (
            <p role="alert" className="text-bad me-auto text-xs">
              {t(failed as never)}
            </p>
          )}
          <Button variant="ghost" className="ms-auto" type="button" onClick={() => onClose()}>
            {t('records.cancel')}
          </Button>
          <Button type="submit" form="item-form" disabled={save.isPending} data-testid="item-save">
            {t('records.save')}
          </Button>
        </div>
      }
    >
      <form id="item-form" noValidate onSubmit={submit} className="space-y-4">
        <Labeled id="item-kind" label={t('equipment.kind')} required>
          <select
            id="item-kind"
            className={INPUT}
            value={values.kind}
            onChange={(e) => set('kind', e.target.value)}
          >
            {ITEM_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`equipment.kinds.${k}`)}
              </option>
            ))}
          </select>
        </Labeled>
        {field(FIELD.name, t('vehicle.items.item'), 120, true)}
        <div className="grid gap-4 sm:grid-cols-2">
          {field(FIELD.model, t('vehicle.items.model'), 80)}
          {field(FIELD.serial, t('vehicle.items.serial'), 60)}
        </div>
        {field(FIELD.spec, t('vehicle.items.spec'), 300)}
      </form>
    </Sheet>
  );
}
