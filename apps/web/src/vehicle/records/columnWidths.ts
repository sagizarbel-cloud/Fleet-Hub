import { useState, type KeyboardEvent, type PointerEvent } from 'react';

const KEY = 'fh.colWidths.';
const MIN = 60;
const MAX = 800;
const STEP = 20;

type Widths = Record<string, number>;

function read(table: string): Widths {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY + table) ?? '{}') as unknown;
    if (!raw || typeof raw !== 'object') return {};
    return Object.fromEntries(
      Object.entries(raw).filter(([, v]) => typeof v === 'number' && v >= MIN && v <= MAX),
    ) as Widths;
  } catch {
    return {};
  }
}
function write(table: string, widths: Widths) {
  try {
    localStorage.setItem(KEY + table, JSON.stringify(widths));
  } catch {
    // Private mode: widths just aren't remembered.
  }
}
const clamp = (w: number) => Math.round(Math.min(MAX, Math.max(MIN, w)));

/**
 * Column widths the reader sets by dragging a header's edge (Revisions 1), remembered on this
 * device per table. Columns nobody resized keep the table's automatic width.
 */
export function useColumnWidths(table: string, rtl: boolean) {
  const [widths, setWidths] = useState<Widths>(() => read(table));

  const update = (fn: (w: Widths) => Widths, save: boolean) =>
    setWidths((w) => {
      const next = fn(w);
      if (save) write(table, next);
      return next;
    });

  const set = (id: string, width: number, save = true) =>
    update((w) => ({ ...w, [id]: clamp(width) }), save);
  const reset = (id: string) => update(({ [id]: _gone, ...rest }) => rest, true);

  /** Props for the drag handle inside a header cell. */
  const handle = (id: string, label: string, hint: string) => ({
    role: 'separator' as const,
    'aria-orientation': 'vertical' as const,
    'aria-label': label,
    'aria-valuemin': MIN,
    'aria-valuemax': MAX,
    'aria-valuenow': widths[id],
    title: hint,
    tabIndex: 0,
    onClick: (e: { stopPropagation: () => void }) => e.stopPropagation(),
    onDoubleClick: () => reset(id),
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      e.preventDefault();
      e.stopPropagation();
      const el = e.currentTarget;
      const th = el.closest('th');
      if (!th) return;
      el.setPointerCapture(e.pointerId);
      const x0 = e.clientX;
      const w0 = th.getBoundingClientRect().width;
      const move = (ev: globalThis.PointerEvent) => {
        const dx = ev.clientX - x0;
        set(id, rtl ? w0 - dx : w0 + dx, false);
      };
      const up = () => {
        setWidths((w) => {
          write(table, w);
          return w;
        });
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
        el.removeEventListener('pointercancel', up);
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    },
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      const th = e.currentTarget.closest('th');
      const now = widths[id] ?? th?.getBoundingClientRect().width ?? 150;
      const wider = rtl ? 'ArrowLeft' : 'ArrowRight';
      const narrower = rtl ? 'ArrowRight' : 'ArrowLeft';
      if (e.key === wider) set(id, now + STEP);
      else if (e.key === narrower) set(id, now - STEP);
      else if (e.key === 'Delete' || e.key === 'Home') reset(id);
      else return;
      e.preventDefault();
      e.stopPropagation();
    },
  });

  /** The width style of a column the reader sized, else nothing. */
  const style = (id: string) => {
    const w = widths[id];
    return w ? { width: w, minWidth: w, maxWidth: w } : undefined;
  };

  return { widths, handle, style };
}
