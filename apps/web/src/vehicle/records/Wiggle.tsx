import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, CheckCheck, Gamepad2, X } from 'lucide-react';
import {
  WIGGLE_GROUPS,
  wiggleGroupItems,
  wiggleItems,
  wiggleProfileOf,
  wiggleScale,
  type WiggleItem,
  type WiggleProfile,
  type WiggleResult,
} from '@fleet-hub/shared';
import { cn } from '@/lib/cn';
import { useAppSettings } from './api';
import type { FormValues } from './kinds';

/** The wiggle test checklist this vehicle type takes, or null (Sagi, 2026-11-08). */
export function useWiggleProfile(typeCode: string | null | undefined): WiggleProfile | null {
  const { data } = useAppSettings();
  return data ? wiggleProfileOf(data.wiggleTypes, typeCode) : null;
}

/** Two presses this close together mean X (Sagi: "twice fast, 0.5 s"). */
export const DOUBLE_PRESS_MS = 500;
/** The Logitech logo button: "home" in the browser's standard gamepad layout. */
const DEFAULT_BUTTON = 16;
const BUTTON_KEY = 'fh.wiggleButton';

function storedButton() {
  try {
    const v = Number(localStorage.getItem(BUTTON_KEY));
    return Number.isInteger(v) && v >= 0 && localStorage.getItem(BUTTON_KEY) !== null
      ? v
      : DEFAULT_BUTTON;
  } catch {
    return DEFAULT_BUTTON;
  }
}

/**
 * One controller button answers the item in turn: one press is V, two within half a second X.
 * The button is the logo button unless this device picked another ("Use another button").
 */
function useControllerButton(onPress: (count: 1 | 2) => void) {
  const [connected, setConnected] = useState(false);
  const [learning, setLearning] = useState(false);
  const [button, setButton] = useState(storedButton);
  const [pending, setPending] = useState(false);
  const press = useRef(onPress);
  const learn = useRef(learning);
  useLayoutEffect(() => {
    press.current = onPress;
    learn.current = learning;
  });

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return;
    let raf = 0;
    let wasDown = true; // a button already held when this starts is not a press
    let timer: ReturnType<typeof setTimeout> | null = null;
    const loop = () => {
      const pads = [...navigator.getGamepads()].filter((p): p is Gamepad => !!p);
      setConnected(pads.length > 0);
      let down = false;
      for (const pad of pads) {
        if (learn.current) {
          const i = pad.buttons.findIndex((b) => b.pressed);
          if (i >= 0) {
            setButton(i);
            setLearning(false);
            try {
              localStorage.setItem(BUTTON_KEY, String(i));
            } catch {
              // Private window: the choice lasts until the page closes.
            }
            wasDown = true; // this press only picks the button
          }
        } else if (pad.buttons[button]?.pressed) down = true;
      }
      if (down && !wasDown) {
        if (timer) {
          clearTimeout(timer);
          timer = null;
          setPending(false);
          press.current(2);
        } else {
          setPending(true);
          timer = setTimeout(() => {
            timer = null;
            setPending(false);
            press.current(1);
          }, DOUBLE_PRESS_MS);
        }
      }
      if (!learn.current) wasDown = down;
      else if (!pads.some((p) => p.buttons.some((b) => b.pressed))) wasDown = false;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      if (timer) clearTimeout(timer);
    };
  }, [button]);

  return { connected, learning, setLearning, pending };
}

/**
 * The wiggle test list: steering, the machine's cameras, sensors and communications, then
 * fluids, mechanical and hydraulic tools. Big buttons for a phone; on a PC the item in turn is
 * answered from the keyboard (V or Y for V, X or N for X) or the controller's logo button.
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
  const order = wiggleItems(profile);
  const answered = (v: FormValues, item: WiggleItem) =>
    v[keyOf(item)] === 'PASS' || v[keyOf(item)] === 'FAIL';
  const [current, setCurrent] = useState<WiggleItem | null>(
    () => order.find((i) => !answered(values, i)) ?? null,
  );
  const latest = useRef({ values, current });
  useLayoutEffect(() => {
    latest.current = { values, current };
  });
  const rows = useRef(new Map<WiggleItem, HTMLLIElement>());

  /** Answers an item, then moves on to the next one still open (or the next one). */
  const answer = useCallback(
    (item: WiggleItem, r: WiggleResult) => {
      onChange(`${fieldKey}.${item}`, r);
      const next = { ...latest.current.values, [`${fieldKey}.${item}`]: r };
      const from = order.indexOf(item);
      const after = [...order.slice(from + 1), ...order.slice(0, from)];
      setCurrent(after.find((i) => !answered(next, i)) ?? null);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onChange, fieldKey, profile],
  );
  const answerCurrent = useCallback(
    (r: WiggleResult) => {
      const item = latest.current.current;
      if (item) answer(item, r);
    },
    [answer],
  );

  // Keyboard: V / Y and X / N by key position, so a Hebrew layout works too.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el?.closest('input, textarea, select, [contenteditable="true"]')) return;
      const r =
        e.code === 'KeyV' || e.code === 'KeyY'
          ? 'PASS'
          : e.code === 'KeyX' || e.code === 'KeyN'
            ? 'FAIL'
            : null;
      if (!r || !latest.current.current) return;
      e.preventDefault();
      answerCurrent(r);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [answerCurrent]);

  const pad = useControllerButton((count) => answerCurrent(count === 1 ? 'PASS' : 'FAIL'));

  useEffect(() => {
    if (current) rows.current.get(current)?.scrollIntoView({ block: 'nearest' });
  }, [current]);

  const allPass = () => {
    order.forEach((i) => onChange(keyOf(i), 'PASS'));
    setCurrent(null);
  };

  return (
    <div className="space-y-4" data-testid="wiggle-checklist" data-profile={profile}>
      <div className="flex items-start gap-2">
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
      <p
        className="text-muted flex flex-wrap items-center gap-x-2 gap-y-1 text-xs"
        data-testid="wiggle-controller"
        data-connected={pad.connected || undefined}
        aria-live="polite"
      >
        <Gamepad2 aria-hidden className={cn('size-4', pad.connected && 'text-ok')} />
        <span>
          {pad.learning
            ? t('wiggle.controller.learning')
            : t(pad.connected ? 'wiggle.controller.on' : 'wiggle.controller.off')}
        </span>
        {pad.connected && !pad.learning && (
          <button
            type="button"
            onClick={() => pad.setLearning(true)}
            className="text-accent-ink underline-offset-2 hover:underline"
          >
            {t('wiggle.controller.change')}
          </button>
        )}
      </p>
      {WIGGLE_GROUPS.map((g) => (
        <fieldset key={g} className="space-y-1.5" data-group={g}>
          <legend className="mb-1 text-xs font-semibold">{t(`wiggle.group.${g}`)}</legend>
          <ul className="border-border divide-border divide-y rounded-md border">
            {wiggleGroupItems(profile, g).map((item) => {
              const v = values[keyOf(item)];
              const missing = !!error && v !== 'PASS' && v !== 'FAIL';
              const isCurrent = current === item;
              const scale = wiggleScale(item);
              return (
                <li
                  key={item}
                  ref={(el) => {
                    if (el) rows.current.set(item, el);
                    else rows.current.delete(item);
                  }}
                  className={cn(
                    'flex flex-wrap items-center gap-2 px-2.5 py-1.5',
                    missing && 'bg-bad/10',
                    isCurrent && 'outline-accent bg-accent/5 outline-2 -outline-offset-2',
                  )}
                  data-item={item}
                  data-current={isCurrent || undefined}
                  data-pending={(isCurrent && pad.pending) || undefined}
                  aria-current={isCurrent ? 'step' : undefined}
                >
                  <button
                    type="button"
                    id={`wiggle-${item}`}
                    onClick={() => setCurrent(item)}
                    // The keyboard answers right away: focus starts here, not in the notes.
                    data-autofocus={isCurrent || undefined}
                    className="min-w-0 flex-1 text-start text-sm"
                  >
                    {t(`wiggle.item.${item}`)}
                  </button>
                  <div
                    role="radiogroup"
                    aria-labelledby={`wiggle-${item}`}
                    className="ms-auto flex gap-1.5"
                  >
                    {(['PASS', 'FAIL'] as const).map((r) => {
                      const on = v === r;
                      const Icon = r === 'PASS' ? Check : X;
                      const name = t(`wiggle.answer.${scale}.${r}`);
                      return (
                        <button
                          key={r}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          aria-label={name}
                          onClick={() => answer(item, r)}
                          title={name}
                          data-result={r}
                          className={cn(
                            'flex h-11 min-w-11 items-center justify-center rounded-md border px-2 text-sm font-semibold',
                            !on && 'border-border-strong text-muted hover:text-text',
                            on && r === 'PASS' && 'border-ok bg-ok text-accent-contrast',
                            on && r === 'FAIL' && 'border-bad bg-bad text-white',
                          )}
                        >
                          {scale === 'vx' ? (
                            <Icon aria-hidden className="size-5" strokeWidth={3} />
                          ) : (
                            name
                          )}
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
