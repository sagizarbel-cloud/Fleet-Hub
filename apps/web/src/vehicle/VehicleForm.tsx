import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'motion/react';
import { Check, ChevronLeft, ChevronRight, ImagePlus, KeyRound, Trash2, Undo2 } from 'lucide-react';
import {
  normalizePlate,
  vehicleBody,
  VIN_PATTERN,
  type VehicleCategory,
  type VehiclePicture,
  VEHICLE_PICTURES,
} from '@fleet-hub/shared';
import { useSession } from '@/auth/session';
import { Sheet } from '@/components/Sheet';
import { Button } from '@/components/ui/button';
import { drawingFor } from '@/drawings/registry';
import { VehicleVisual } from '@/drawings/VehicleVisual';
import { lookupName, useLookups } from '@/fleet/data';
import { markNewTile } from '@/fleet/newTile';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { errorProps, INPUT, issuesToErrors, Labeled, type Errors } from '@/money/form';
import { attachmentUrl } from './records/api';
import { useVehicle } from './data';
import { useSaveVehicle, useVehicleForm } from './form-api';

const STEPS = [
  { key: 'type', fields: ['type'] },
  { key: 'identity', fields: ['serial', 'vin', 'licenseNo', 'make', 'model', 'year', 'startCode'] },
  {
    key: 'assignment',
    fields: ['department', 'location', 'operatorName', 'odometerKm', 'engineHours'],
  },
  {
    key: 'compliance',
    fields: [
      'nextServiceDate',
      'nextServiceKm',
      'nextServiceHours',
      'annualTestExpiry',
      'insuranceExpiry',
      'safetyCheckExpiry',
    ],
  },
  {
    key: 'ownership',
    fields: ['purchaseDate', 'purchasePrice', 'warrantyTerms', 'warrantyExpiry'],
  },
  { key: 'pictures', fields: [] },
] as const;
type StepKey = (typeof STEPS)[number]['key'];

const TEXT = [
  'type',
  'serial',
  'vin',
  'licenseNo',
  'make',
  'model',
  'department',
  'location',
  'operatorName',
  'warrantyTerms',
] as const;
const NUMBERS = [
  'year',
  'odometerKm',
  'engineHours',
  'nextServiceKm',
  'nextServiceHours',
  'purchasePrice',
] as const;
const DATES = [
  'nextServiceDate',
  'annualTestExpiry',
  'insuranceExpiry',
  'safetyCheckExpiry',
  'purchaseDate',
  'warrantyExpiry',
] as const;
type Field = (typeof TEXT)[number] | (typeof NUMBERS)[number] | (typeof DATES)[number];
type Values = Record<Field, string>;

const EMPTY = Object.fromEntries([...TEXT, ...NUMBERS, ...DATES].map((k) => [k, ''])) as Values;

const MESSAGES = {
  vin: 'vehicleForm.error.vin',
  plate: 'vehicleForm.error.plate',
  serial: 'vehicleForm.error.serial',
  taken: 'vehicleForm.error.taken',
  unknown: 'records.error.invalid',
  future: 'records.error.future',
};

// Input kinds for `text()` below.
const ID = { ltr: true, upper: true } as const;
const DIGITS = { ltr: true, inputMode: 'numeric' } as const;
const COUNT = { type: 'number', inputMode: 'numeric', ltr: true } as const;
const MONEY = { type: 'number', inputMode: 'decimal', ltr: true } as const;
const DATE = { type: 'date' } as const;
const REQUIRED = { required: true } as const;

const PICKER_BOX = { width: 40, height: 60 };
/** Fits each top-down drawing in the same small box, like the grid tiles. */
function pickerSize(type: string) {
  const { top } = drawingFor(type);
  return Math.min(PICKER_BOX.width, (PICKER_BOX.height * top.width) / top.height);
}

const PHOTO_TYPES = 'image/jpeg,image/png,image/webp';
const DRAWING_TYPES = `${PHOTO_TYPES},image/svg+xml`;
const SLOT_ID = { top: 'topPhotoId', side: 'sidePhotoId', drawing: 'customImageId' } as const;
type Pictures = Partial<Record<VehiclePicture, File | null>>;

/**
 * Add or edit a vehicle (SPEC 5.8): a short stepper, Type → Identity → Assignment → Compliance
 * dates → Ownership and warranty → Photo or drawing. A new vehicle's tile grows into the grid.
 */
export function VehicleForm({
  serial,
  reduced,
  onClose,
}: {
  /** The vehicle to edit, or null to add one. */
  serial: string | null;
  reduced: boolean;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { data: user } = useSession();
  const { data: lookups } = useLookups();
  const existing = useVehicleForm(serial);
  const detail = useVehicle(serial ?? '', !!serial);
  const save = useSaveVehicle();
  const [values, setValues] = useState<Values>(EMPTY);
  const [loaded, setLoaded] = useState(!serial);
  const [step, setStep] = useState(serial ? 1 : 0);
  const [dir, setDir] = useState<1 | -1>(1);
  const [errors, setErrors] = useState<Errors>({});
  const [failed, setFailed] = useState<string | null>(null);
  const [code, setCode] = useState<{ mode: 'keep' | 'set' | 'remove'; value: string }>({
    mode: 'keep',
    value: '',
  });
  const [pictures, setPictures] = useState<Pictures>({});
  const canCodes = !!user?.canViewStartCodes;
  const lang = i18n.language;

  // Fill the form once the saved values arrive.
  if (!loaded && existing.data) {
    setLoaded(true);
    const v = existing.data.values as Record<string, unknown>;
    setValues(
      Object.fromEntries(
        Object.keys(EMPTY).map((k) => {
          const raw = v[k];
          if (raw === null || raw === undefined) return [k, ''];
          return [k, DATES.includes(k as never) ? String(raw).slice(0, 10) : String(raw)];
        }),
      ) as Values,
    );
  }

  const types = lookups?.vehicleTypes ?? [];
  const type = types.find((x) => x.code === values.type);
  const category: VehicleCategory = type?.category ?? 'ROAD';
  const unit = type?.usageUnit ?? 'KM';
  const set = (k: Field, v: string) => {
    setValues((s) => ({ ...s, [k]: v }));
    if (errors[k]) setErrors(({ [k]: _drop, ...rest }) => rest);
  };

  const body = useMemo(() => {
    const out: Record<string, unknown> = { category };
    for (const k of TEXT) out[k] = values[k].trim() === '' ? null : values[k];
    for (const k of NUMBERS) out[k] = values[k].trim() === '' ? null : Number(values[k]);
    for (const k of DATES) out[k] = values[k] === '' ? null : values[k];
    if (out.type === null) delete out.type;
    if (canCodes && code.mode === 'set') out.startCode = code.value;
    if (canCodes && code.mode === 'remove') out.startCode = null;
    return out;
  }, [values, category, canCodes, code]);

  /** Errors for the fields of steps 0..upTo. */
  const check = (upTo: number): Errors => {
    const parsed = vehicleBody.safeParse(body);
    const all = parsed.success
      ? {}
      : issuesToErrors(parsed.error.issues, (f) => values[f as Field] === '', MESSAGES);
    if (!values.type) all.type = 'vehicleForm.error.pickType';
    const fields = new Set<string>(STEPS.slice(0, upTo + 1).flatMap((s) => s.fields));
    return Object.fromEntries(Object.entries(all).filter(([k]) => fields.has(k)));
  };
  const firstStepWith = (errs: Errors) => STEPS.findIndex((s) => s.fields.some((f) => errs[f]));

  const go = (to: number) => {
    setDir(to > step ? 1 : -1);
    setStep(to);
  };
  const next = () => {
    const errs = check(step);
    setErrors(errs);
    const at = firstStepWith(errs);
    if (at !== -1) return go(at);
    go(step + 1);
  };

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    setFailed(null);
    const errs = check(STEPS.length - 1);
    setErrors(errs);
    const at = firstStepWith(errs);
    if (at !== -1) return go(at);
    const changes = (Object.entries(pictures) as [VehiclePicture, File | null][]).map(
      ([slot, file]) => ({ slot, file }),
    );
    try {
      const { saved, pictureError } = await save.mutateAsync({ serial, body, pictures: changes });
      if (pictureError) {
        setFailed(
          pictureError.status === 413
            ? 'vehicleForm.error.pictureTooBig'
            : pictureError.status === 415
              ? 'vehicleForm.error.pictureType'
              : 'vehicleForm.error.picture',
        );
        return;
      }
      onClose();
      if (saved.created) {
        markNewTile(saved.serial);
        navigate('/');
      } else if (serial && saved.serial !== serial) {
        navigate(`/vehicles/${encodeURIComponent(saved.serial)}`, { replace: true });
      }
    } catch (err) {
      if (err instanceof ApiError && err.issues.length) {
        const errs2 = Object.fromEntries(
          err.issues.map((i) => [
            i.path,
            MESSAGES[i.code as keyof typeof MESSAGES] ?? 'records.error.invalid',
          ]),
        );
        setErrors(errs2);
        const at2 = firstStepWith(errs2);
        if (at2 !== -1) go(at2);
      } else
        setFailed(
          err instanceof ApiError && err.status === 403
            ? 'records.error.forbidden'
            : 'records.error.save',
        );
    }
  };

  const text = (
    k: Field,
    opts: {
      required?: boolean;
      ltr?: boolean;
      type?: 'text' | 'number' | 'date';
      hint?: string;
      label?: string;
      upper?: boolean;
      inputMode?: 'numeric' | 'decimal';
    } = {},
  ) => (
    <Labeled
      id={`vf-${k}`}
      label={opts.label ?? t(`vehicleForm.field.${k}`)}
      required={opts.required}
      error={errors[k]}
      hint={opts.hint}
    >
      <input
        {...errorProps(`vf-${k}`, errors[k])}
        type={opts.type ?? 'text'}
        inputMode={opts.inputMode}
        dir={opts.ltr ? 'ltr' : undefined}
        value={values[k]}
        onChange={(e) => set(k, opts.upper ? e.target.value.toUpperCase() : e.target.value)}
        className={cn(INPUT, opts.ltr && 'num text-start')}
      />
    </Labeled>
  );
  const select = (k: 'department' | 'location', list: 'departments' | 'locations') => (
    <Labeled id={`vf-${k}`} label={t(`vehicleForm.field.${k}`)} error={errors[k]}>
      <select
        {...errorProps(`vf-${k}`, errors[k])}
        value={values[k]}
        onChange={(e) => set(k, e.target.value)}
        className={INPUT}
      >
        <option value="">{t('vehicleForm.none')}</option>
        {lookups?.[list].map((o) => (
          <option key={o.code} value={o.code}>
            {lookupName(o, lang)}
          </option>
        ))}
      </select>
    </Labeled>
  );

  const vinLen = values.vin.replace(/\s/g, '').length;
  const vinOk = VIN_PATTERN.test(values.vin.replace(/\s/g, '').toUpperCase());
  const plateDigits = normalizePlate(values.licenseNo);

  // Every control, built once here so the steps below only place them.
  const f = {
    serial: text('serial', { ...ID, required: true, hint: t('vehicleForm.hint.serial') }),
    vin:
      category === 'ROAD'
        ? text('vin', {
            ...ID,
            label: t('vehicle.info.vin'),
            hint: values.vin
              ? t(vinOk ? 'vehicleForm.hint.vinOk' : 'vehicleForm.hint.vinCount', { n: vinLen })
              : t('vehicleForm.hint.vin'),
          })
        : text('vin', {
            ...ID,
            label: t('vehicleForm.field.pin'),
            hint: t('vehicleForm.hint.pin'),
          }),
    licenseNo: text('licenseNo', {
      ...DIGITS,
      label: t('vehicle.info.licenseNo'),
      hint:
        plateDigits.length === 7 || plateDigits.length === 8
          ? t('vehicleForm.hint.plateOk')
          : t('vehicleForm.hint.plate'),
    }),
    make: text('make', REQUIRED),
    model: text('model', REQUIRED),
    year: text('year', COUNT),
    department: select('department', 'departments'),
    location: select('location', 'locations'),
    operatorName: text('operatorName'),
    usage: unit === 'HOURS' ? text('engineHours', COUNT) : text('odometerKm', COUNT),
    nextServiceDate: text('nextServiceDate', DATE),
    nextServiceUsage:
      unit === 'HOURS' ? text('nextServiceHours', COUNT) : text('nextServiceKm', COUNT),
    annualTestExpiry: text('annualTestExpiry', DATE),
    insuranceExpiry: text('insuranceExpiry', DATE),
    safetyCheckExpiry: text('safetyCheckExpiry', DATE),
    purchaseDate: text('purchaseDate', DATE),
    purchasePrice: text('purchasePrice', MONEY),
    warrantyExpiry: text('warrantyExpiry', DATE),
  };

  const stepKey: StepKey = STEPS[step]!.key;
  let content: ReactNode;
  switch (stepKey) {
    case 'type':
      content = (
        <fieldset>
          <legend className="sr-only">{t('vehicleForm.step.type')}</legend>
          {errors.type && (
            <p role="alert" className="text-bad mb-2 text-xs">
              {t(errors.type as never)}
            </p>
          )}
          <div className="grid grid-cols-3 gap-2" data-testid="type-picker">
            {types.map((ty) => (
              <label
                key={ty.code}
                className={cn(
                  'border-border bg-surface flex cursor-pointer flex-col items-center gap-1 rounded-xl border p-2 text-center text-xs has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--fh-accent)]',
                  values.type === ty.code && 'border-accent ring-accent/40 ring-2',
                )}
              >
                <input
                  type="radio"
                  name="vehicle-type"
                  className="sr-only"
                  checked={values.type === ty.code}
                  onChange={() => set('type', ty.code)}
                />
                <span className="grid h-16 place-items-center overflow-hidden">
                  <VehicleVisual type={ty.code} view="top" status="GREEN" size={pickerSize(ty.code)} />
                </span>
                {lookupName(ty, lang)}
              </label>
            ))}
          </div>
        </fieldset>
      );
      break;
    case 'identity':
      content = (
        <div className="space-y-3">
          {f.serial}
          {f.vin}
          {f.licenseNo}
          <div className="grid grid-cols-2 gap-3">
            {f.make}
            {f.model}
          </div>
          {f.year}
          <StartCodeField
            canCodes={canCodes}
            hasCode={!!existing.data?.hasStartCode}
            state={code}
            onChange={setCode}
          />
        </div>
      );
      break;
    case 'assignment':
      content = (
        <div className="space-y-3">
          {f.department}
          {f.location}
          {f.operatorName}
          {f.usage}
        </div>
      );
      break;
    case 'compliance':
      content = (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {f.nextServiceDate}
            {f.nextServiceUsage}
          </div>
          {f.annualTestExpiry}
          {f.insuranceExpiry}
          {f.safetyCheckExpiry}
        </div>
      );
      break;
    case 'ownership':
      content = (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {f.purchaseDate}
            {f.purchasePrice}
          </div>
          {f.warrantyExpiry}
          <Labeled id="vf-warrantyTerms" label={t('vehicleForm.field.warrantyTerms')}>
            <textarea
              id="vf-warrantyTerms"
              rows={3}
              value={values.warrantyTerms}
              onChange={(e) => set('warrantyTerms', e.target.value)}
              className={cn(INPUT, 'h-auto py-2')}
            />
          </Labeled>
        </div>
      );
      break;
    case 'pictures':
      content = (
        <div className="space-y-3">
          <p className="text-muted text-xs">{t('vehicleForm.pictures.hint')}</p>
          {VEHICLE_PICTURES.map((slot) => (
            <PictureSlot
              key={slot}
              slot={slot}
              current={detail.data?.[SLOT_ID[slot]] ?? null}
              pending={pictures[slot]}
              onChange={(file) => setPictures((p) => ({ ...p, [slot]: file }))}
              onUndo={() => setPictures(({ [slot]: _drop, ...rest }) => rest as Pictures)}
            />
          ))}
        </div>
      );
      break;
  }

  const last = step === STEPS.length - 1;
  const title = serial ? t('vehicleForm.editTitle', { serial }) : t('vehicleForm.addTitle');
  const shift = reduced ? 0 : 24 * dir * (i18n.dir() === 'rtl' ? -1 : 1);
  const Prev = i18n.dir() === 'rtl' ? ChevronRight : ChevronLeft;
  const Next = i18n.dir() === 'rtl' ? ChevronLeft : ChevronRight;

  return (
    <Sheet
      title={title}
      onClose={onClose}
      reduced={reduced}
      footer={
        <div className="space-y-2">
          {failed && (
            <p role="alert" className="text-bad text-xs">
              {t(failed as never)}
            </p>
          )}
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              type="button"
              onClick={step === 0 || (serial && step === 1) ? onClose : () => go(step - 1)}
            >
              {step === 0 || (serial && step === 1) ? (
                t('records.cancel')
              ) : (
                <>
                  <Prev aria-hidden />
                  {t('vehicleForm.back')}
                </>
              )}
            </Button>
            {serial && !last && (
              <Button
                variant="outline"
                className="ms-auto"
                type="button"
                onClick={() => void submit()}
                disabled={save.isPending}
              >
                {t('records.save')}
              </Button>
            )}
            {last ? (
              <Button
                // Its own key: reusing the Next button's element would submit on the same click.
                key="save"
                className="ms-auto"
                type="submit"
                form="vehicle-form"
                disabled={save.isPending}
                data-testid="vehicle-save"
              >
                <Check aria-hidden />
                {t(serial ? 'records.save' : 'vehicleForm.create')}
              </Button>
            ) : (
              <Button
                key="next"
                type="button"
                className={serial ? undefined : 'ms-auto'}
                onClick={next}
                data-testid="vehicle-next"
              >
                {t('vehicleForm.next')}
                <Next aria-hidden />
              </Button>
            )}
          </div>
        </div>
      }
    >
      <form id="vehicle-form" onSubmit={submit} noValidate className="space-y-4">
        <ol className="flex flex-wrap gap-1" aria-label={t('vehicleForm.steps')}>
          {STEPS.map((s, i) => {
            const bad = s.fields.some((f) => errors[f]);
            return (
              <li key={s.key}>
                <button
                  type="button"
                  onClick={() => go(i)}
                  disabled={!serial && i > step}
                  aria-current={i === step ? 'step' : undefined}
                  className={cn(
                    'rounded-full border px-2.5 py-0.5 text-xs disabled:opacity-50',
                    i === step
                      ? 'border-accent bg-accent/15 text-text'
                      : bad
                        ? 'border-bad/60 text-bad'
                        : 'border-border text-muted',
                  )}
                >
                  <span className="num me-1">{i + 1}</span>
                  {t(`vehicleForm.step.${s.key}`)}
                </button>
              </li>
            );
          })}
        </ol>
        {serial && !loaded ? (
          <p className="text-muted text-sm" role="status">
            {t('common.loading')}
          </p>
        ) : (
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={stepKey}
              initial={{ opacity: 0, x: shift }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -shift }}
              transition={{ duration: reduced ? 0 : 0.18, ease: 'easeOut' }}
            >
              <h3 className="mb-3 text-sm font-semibold">{t(`vehicleForm.step.${stepKey}`)}</h3>
              {content}
            </motion.div>
          </AnimatePresence>
        )}
      </form>
    </Sheet>
  );
}

function StartCodeField({
  canCodes,
  hasCode,
  state,
  onChange,
}: {
  canCodes: boolean;
  hasCode: boolean;
  state: { mode: 'keep' | 'set' | 'remove'; value: string };
  onChange: (s: { mode: 'keep' | 'set' | 'remove'; value: string }) => void;
}) {
  const { t } = useTranslation();
  if (!canCodes)
    return (
      <p className="text-muted flex items-center gap-2 text-xs">
        <KeyRound aria-hidden className="size-3.5" />
        {t(
          hasCode ? 'vehicleForm.startCode.setNoPermission' : 'vehicleForm.startCode.noPermission',
        )}
      </p>
    );
  if (hasCode && state.mode !== 'set')
    return (
      <div className="border-border flex flex-wrap items-center gap-2 rounded-lg border p-2 text-sm">
        <KeyRound aria-hidden className="text-muted size-4" />
        <span className="me-auto">
          {t(
            state.mode === 'remove'
              ? 'vehicleForm.startCode.willRemove'
              : 'vehicleForm.startCode.isSet',
          )}
        </span>
        {state.mode === 'remove' ? (
          <Button
            size="sm"
            variant="ghost"
            type="button"
            onClick={() => onChange({ mode: 'keep', value: '' })}
          >
            <Undo2 aria-hidden />
            {t('vehicleForm.startCode.keep')}
          </Button>
        ) : (
          <>
            <Button
              size="sm"
              variant="outline"
              type="button"
              onClick={() => onChange({ mode: 'set', value: '' })}
            >
              {t('vehicleForm.startCode.change')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              type="button"
              onClick={() => onChange({ mode: 'remove', value: '' })}
            >
              {t('vehicleForm.startCode.remove')}
            </Button>
          </>
        )}
      </div>
    );
  return (
    <Labeled
      id="vf-startCode"
      label={t('vehicle.startCode.label')}
      hint={t('vehicleForm.startCode.hint')}
    >
      <input
        id="vf-startCode"
        type="password"
        autoComplete="off"
        inputMode="numeric"
        dir="ltr"
        value={state.value}
        onChange={(e) =>
          onChange({
            mode: e.target.value ? 'set' : hasCode ? 'set' : 'keep',
            value: e.target.value,
          })
        }
        className={cn(INPUT, 'num text-start')}
      />
    </Labeled>
  );
}

function PictureSlot({
  slot,
  current,
  pending,
  onChange,
  onUndo,
}: {
  slot: VehiclePicture;
  current: string | null;
  /** undefined: unchanged; a file: replace; null: remove. */
  pending: File | null | undefined;
  onChange: (file: File | null) => void;
  onUndo: () => void;
}) {
  const { t } = useTranslation();
  const preview = useMemo(() => (pending ? URL.createObjectURL(pending) : null), [pending]);
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);
  const shown =
    pending === null ? null : (preview ?? (current ? attachmentUrl({ id: current }) : null));
  const id = `vf-pic-${slot}`;

  return (
    <div className="border-border flex items-center gap-3 rounded-lg border p-2" data-slot={slot}>
      <div className="bg-surface-strong grid size-16 shrink-0 place-items-center overflow-hidden rounded-md">
        {shown ? (
          <img src={shown} alt="" className="size-full object-contain" />
        ) : (
          <ImagePlus aria-hidden className="text-muted size-5" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{t(`vehicleForm.pictures.${slot}`)}</div>
        <div className="text-muted truncate text-xs">
          {pending ? (
            <bdi>{pending.name}</bdi>
          ) : pending === null ? (
            t('vehicleForm.pictures.willRemove')
          ) : current ? (
            t('vehicleForm.pictures.current')
          ) : (
            t(slot === 'drawing' ? 'vehicleForm.pictures.drawingNone' : 'vehicleForm.pictures.none')
          )}
        </div>
      </div>
      <label
        htmlFor={id}
        className="border-border-strong hover:bg-border inline-flex h-8 cursor-pointer items-center rounded-lg border px-3 text-xs font-medium has-[:focus-visible]:outline-2"
      >
        {t(current || pending ? 'vehicleForm.pictures.replace' : 'vehicleForm.pictures.choose')}
        <input
          id={id}
          type="file"
          className="sr-only"
          accept={slot === 'drawing' ? DRAWING_TYPES : PHOTO_TYPES}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onChange(file);
            e.target.value = '';
          }}
        />
      </label>
      {pending !== undefined ? (
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          type="button"
          aria-label={t('vehicleForm.pictures.undo')}
          title={t('vehicleForm.pictures.undo')}
          onClick={onUndo}
        >
          <Undo2 aria-hidden />
        </Button>
      ) : (
        current && (
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            type="button"
            aria-label={t('vehicleForm.pictures.remove')}
            title={t('vehicleForm.pictures.remove')}
            onClick={() => onChange(null)}
          >
            <Trash2 aria-hidden />
          </Button>
        )
      )}
    </div>
  );
}
