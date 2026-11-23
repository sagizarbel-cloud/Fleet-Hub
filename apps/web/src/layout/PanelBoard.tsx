import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  Check,
  GripVertical,
  LayoutDashboard,
  RotateCcw,
} from 'lucide-react';
import {
  PANEL_HEIGHT,
  type LayoutName,
  type Layouts,
  type PanelLayout,
  type PanelScreen,
} from '@fleet-hub/shared';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { usePreferences, useSavePreferences } from '@/vehicle/data';

const WIDE = '(min-width: 64rem)';
const LIST = { start: 'start', end: 'end', phone: 'phone' } as const;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function useWide() {
  const [wide, setWide] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(WIDE).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(WIDE);
    const on = () => setWide(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return wide;
}

type Where = { list: 'start' | 'end' | 'phone'; index: number };

/** Moves a panel to a list and position, keeping every panel exactly once in that layout part. */
export function movePanel<P extends string>(l: PanelLayout<P>, id: P, to: Where): PanelLayout<P> {
  if (to.list === 'phone') {
    const phone = l.phone.filter((p) => p !== id);
    phone.splice(clamp(to.index, 0, phone.length), 0, id);
    return { ...l, phone };
  }
  const start = l.start.filter((p) => p !== id);
  const end = l.end.filter((p) => p !== id);
  const target = to.list === 'start' ? start : end;
  target.splice(clamp(to.index, 0, target.length), 0, id);
  return { ...l, start, end };
}

/** What a page's wrap gets to know about where a panel is. */
export interface PanelPlace {
  list: Where['list'];
  /** Has a height the user set. */
  sized: boolean;
  /** Last in its column. */
  last: boolean;
}

/**
 * Panels each user can arrange (Sagi, 2026-11-22), on the dashboard and the vehicle page:
 * "Arrange panels" shows a handle on each panel to drag it (mouse or touch) to another place or
 * column, arrow buttons that do the same from the keyboard, a divider to change the columns'
 * widths, and a bottom edge to make scrolling lists taller or shorter, within limits. The
 * arrangement is saved to the account (so it follows the user to other devices) and "Reset to
 * default" brings back the original. Phones keep one column with their own order.
 */
export function PanelBoard<P extends string>({
  name,
  screen,
  panels,
  wrap,
  lead,
  toolbarAt = 'top',
  sticky = [],
  controls = true,
}: {
  /** Which saved layout this is. */
  name: LayoutName;
  screen: PanelScreen<P>;
  panels: Record<P, ReactNode>;
  /** Wraps each panel (the page's entrance motion). */
  wrap?: (id: P, node: ReactNode, place: PanelPlace) => ReactNode;
  /** Fixed content on top of the start column (one column: on top), which doesn't move. */
  lead?: ReactNode;
  /** Where the Arrange button sits; at the bottom it stays in view while arranging. */
  toolbarAt?: 'top' | 'bottom';
  /** Panels that stay in view while the page scrolls when they're last in a wide column. */
  sticky?: readonly P[];
  /** Shows the Arrange button; off while the page is covered or has nothing to arrange. */
  controls?: boolean;
}) {
  const { t } = useTranslation();
  const wide = useWide();
  const prefs = usePreferences();
  const save = useSavePreferences();
  const saved = screen.of(prefs.data?.layouts?.[name]);
  const [draft, setDraft] = useState<PanelLayout<P> | null>(null);
  const layout = draft ?? saved;
  const [arrangeOn, setArranging] = useState(false);
  const arranging = arrangeOn && controls;
  const [dragging, setDragging] = useState<P | null>(null);
  const [dropAt, setDropAt] = useState<Where | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const saveTimer = useRef<number | undefined>(undefined);
  const SPLIT = screen.split;

  const isDefault = JSON.stringify(layout) === JSON.stringify(screen.defaults);

  /** Shows a change at once and saves it shortly after (a drag sends many). */
  const change = (next: PanelLayout<P>, now = false) => {
    setDraft(next);
    window.clearTimeout(saveTimer.current);
    const send = () =>
      save.mutate(
        { layouts: { ...(prefs.data?.layouts ?? {}), [name]: next } as Layouts },
        { onSettled: () => setDraft(null) },
      );
    if (now) send();
    else saveTimer.current = window.setTimeout(send, 400);
  };
  useEffect(() => () => window.clearTimeout(saveTimer.current), []);

  const reset = () => {
    window.clearTimeout(saveTimer.current);
    setDraft(screen.defaults);
    const others: Layouts = { ...(prefs.data?.layouts ?? {}) };
    delete others[name];
    save.mutate(
      { layouts: Object.keys(others).length ? others : null },
      { onSettled: () => setDraft(null) },
    );
  };

  // ---------- Dragging a panel by its handle (pointer events: mouse, pen and touch) ----------

  /** The drop place under the pointer: before or after the panel it is over, or a column's end. */
  const whereAt = (x: number, y: number): Where | null => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-slot]');
    if (!el || !root.current?.contains(el)) return null;
    const list = el.dataset.list as Where['list'];
    if (el.dataset.slot === 'end') return { list, index: Number(el.dataset.count) };
    const rect = el.getBoundingClientRect();
    const index = Number(el.dataset.index) + (y > rect.top + rect.height / 2 ? 1 : 0);
    return { list, index };
  };
  const startDrag = (id: P) => (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation(); // not a swipe of the page
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDragging(id);
  };
  const onDragMove = (e: ReactPointerEvent) => {
    if (!dragging) return;
    setDropAt(whereAt(e.clientX, e.clientY));
  };
  const endDrag = () => {
    if (dragging && dropAt) {
      // Moving down within one list: the panel's own slot disappears first.
      const sameList = wide
        ? (dropAt.list === 'start' ? layout.start : layout.end).includes(dragging)
        : true;
      const ownIndex = wide
        ? (dropAt.list === 'start' ? layout.start : layout.end).indexOf(dragging)
        : layout.phone.indexOf(dragging);
      const index =
        sameList && ownIndex !== -1 && dropAt.index > ownIndex ? dropAt.index - 1 : dropAt.index;
      change(movePanel(layout, dragging, { list: dropAt.list, index }), true);
    }
    setDragging(null);
    setDropAt(null);
  };

  // ---------- The same from the keyboard (and for anyone who prefers buttons) ----------

  const listOf = (id: P): Where['list'] =>
    !wide ? 'phone' : layout.start.includes(id) ? 'start' : 'end';
  const nudge = (id: P, by: -1 | 1) => {
    const list = listOf(id);
    const items = layout[list];
    change(movePanel(layout, id, { list, index: items.indexOf(id) + by }), true);
  };
  const otherColumn = (id: P) => {
    const list = listOf(id) === 'start' ? 'end' : 'start';
    change(movePanel(layout, id, { list, index: layout[list].length }), true);
  };

  // ---------- Column width and panel height ----------

  const splitDrag = useRef<{ left: number; width: number; rtl: boolean } | null>(null);
  const onSplitDown = (e: ReactPointerEvent) => {
    const box = root.current?.querySelector<HTMLElement>('[data-columns]')?.getBoundingClientRect();
    if (!box) return;
    e.preventDefault();
    e.stopPropagation(); // not a swipe of the page
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    splitDrag.current = {
      left: box.left,
      width: box.width,
      rtl: getComputedStyle(root.current!).direction === 'rtl',
    };
  };
  const onSplitMove = (e: ReactPointerEvent) => {
    const d = splitDrag.current;
    if (!d) return;
    const frac = (e.clientX - d.left) / d.width;
    change({ ...layout, split: round2(clamp(d.rtl ? 1 - frac : frac, SPLIT.min, SPLIT.max)) });
  };
  const onSplitKey = (e: KeyboardEvent) => {
    const rtl = getComputedStyle(root.current!).direction === 'rtl';
    const step = e.key === 'ArrowRight' ? 0.02 : e.key === 'ArrowLeft' ? -0.02 : 0;
    if (!step) return;
    e.preventDefault();
    change({
      ...layout,
      split: round2(clamp(layout.split + (rtl ? -step : step), SPLIT.min, SPLIT.max)),
    });
  };

  const heightDrag = useRef<{ id: P; top: number } | null>(null);
  const onHeightDown = (id: P) => (e: ReactPointerEvent) => {
    const frame = (e.currentTarget as HTMLElement).closest<HTMLElement>('[data-panel-frame]');
    if (!frame) return;
    e.preventDefault();
    e.stopPropagation(); // not a swipe of the page
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    heightDrag.current = { id, top: frame.getBoundingClientRect().top };
  };
  const onHeightMove = (e: ReactPointerEvent) => {
    const d = heightDrag.current;
    if (!d) return;
    const h = Math.round(clamp(e.clientY - d.top, PANEL_HEIGHT.min, PANEL_HEIGHT.max));
    change({ ...layout, heights: { ...layout.heights, [d.id]: h } });
  };
  const onHeightKey = (id: P, current: number) => (e: KeyboardEvent) => {
    const step = e.key === 'ArrowDown' ? 40 : e.key === 'ArrowUp' ? -40 : 0;
    if (!step) return;
    e.preventDefault();
    change({
      ...layout,
      heights: {
        ...layout.heights,
        [id]: clamp(current + step, PANEL_HEIGHT.min, PANEL_HEIGHT.max),
      },
    });
  };

  // ---------- Rendering ----------

  const frame = (id: P, list: Where['list'], index: number, count: number) => {
    const height = layout.heights[id];
    const resizable = screen.resizable.includes(id);
    const name = t(`layout.panel.${id}` as 'layout.panel.kpi');
    const marker =
      dragging && dropAt?.list === list
        ? dropAt.index === index
          ? 'before'
          : dropAt.index === count && index === count - 1
            ? 'after'
            : null
        : null;
    return (
      <div
        key={id}
        data-slot="panel"
        data-list={list}
        data-index={index}
        data-panel-frame={id}
        data-sized={height ? '' : undefined}
        className={cn(
          'fh-panel relative flex min-h-0 min-w-0 flex-col',
          arranging && 'ring-border-strong rounded-sm ring-1 ring-dashed',
          dragging === id && 'opacity-50',
          wide && !arranging && index === count - 1 && sticky.includes(id) && 'sticky top-0',
          marker === 'before' && 'fh-drop-before',
          marker === 'after' && 'fh-drop-after',
        )}
        style={height ? { height } : undefined}
      >
        {arranging && (
          <div className="bg-surface border-border flex items-center gap-1 border-b px-1 py-1 text-xs">
            <button
              type="button"
              onPointerDown={startDrag(id)}
              onPointerMove={onDragMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              aria-label={t('layout.drag', { panel: name })}
              title={t('layout.drag', { panel: name })}
              className="text-muted hover:text-text flex flex-1 cursor-grab touch-none items-center gap-1 rounded px-1 py-1 active:cursor-grabbing"
              data-testid={`drag-${id}`}
            >
              <GripVertical aria-hidden className="size-4" />
              <span className="truncate font-medium">{name}</span>
            </button>
            <IconButton
              label={t('layout.up', { panel: name })}
              disabled={index === 0}
              onClick={() => nudge(id, -1)}
              testId={`up-${id}`}
            >
              <ArrowUp aria-hidden className="size-3.5" />
            </IconButton>
            <IconButton
              label={t('layout.down', { panel: name })}
              disabled={index === count - 1}
              onClick={() => nudge(id, 1)}
              testId={`down-${id}`}
            >
              <ArrowDown aria-hidden className="size-3.5" />
            </IconButton>
            {wide && (
              <IconButton
                label={t('layout.otherColumn', { panel: name })}
                onClick={() => otherColumn(id)}
                testId={`swap-${id}`}
              >
                <ArrowLeftRight aria-hidden className="size-3.5" />
              </IconButton>
            )}
          </div>
        )}
        <div className="fh-panel-body flex min-h-0 flex-1 flex-col">
          {wrap
            ? wrap(id, panels[id], { list, sized: !!height, last: index === count - 1 })
            : panels[id]}
        </div>
        {arranging && resizable && (
          <div
            role="separator"
            aria-orientation="horizontal"
            aria-label={t('layout.height', { panel: name })}
            aria-valuemin={PANEL_HEIGHT.min}
            aria-valuemax={PANEL_HEIGHT.max}
            aria-valuenow={height ?? undefined}
            tabIndex={0}
            onPointerDown={onHeightDown(id)}
            onPointerMove={onHeightMove}
            onPointerUp={() => (heightDrag.current = null)}
            onPointerCancel={() => (heightDrag.current = null)}
            onKeyDown={onHeightKey(id, height ?? 400)}
            className="fh-resize-y bg-border-strong/40 hover:bg-accent mx-auto mt-1 h-2 w-16 cursor-ns-resize touch-none rounded-full"
            data-testid={`height-${id}`}
          />
        )}
      </div>
    );
  };

  const column = (list: Where['list'], items: P[]) => (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-3 lg:gap-4" data-list-root={list}>
      {list !== LIST.end && lead}
      {items.map((id, i) => panels[id] != null && frame(id, list, i, items.length))}
      {/* A drop place at the column's end, so a column can also take a panel when empty. */}
      {arranging && (
        <div
          data-slot="end"
          data-list={list}
          data-count={items.length}
          className={cn(
            'border-border text-muted grid min-h-12 place-items-center rounded-sm border border-dashed text-xs',
            dropAt?.list === list &&
              dropAt.index === items.length &&
              dragging &&
              'border-accent text-text',
          )}
        >
          {t('layout.dropHere')}
        </div>
      )}
    </div>
  );

  const toolbar = (
    <div
      className={cn(
        'flex flex-wrap items-center justify-end gap-2',
        // Hidden, not removed, so the panels below don't shift (the dashboard behind a vehicle).
        !controls && 'invisible',
        toolbarAt === 'bottom' && arranging && 'glass sticky bottom-2 z-20 px-2 py-1.5 shadow-lg',
      )}
    >
      {arranging && (
        <p className="text-muted me-auto text-xs" role="status">
          {t(wide ? 'layout.hintWide' : 'layout.hintPhone')}
        </p>
      )}
      {arranging && (
        <Button
          variant="ghost"
          size="sm"
          onClick={reset}
          disabled={isDefault}
          data-testid="layout-reset"
        >
          <RotateCcw aria-hidden />
          {t('layout.reset')}
        </Button>
      )}
      <Button
        variant={arranging ? 'primary' : 'outline'}
        size="sm"
        aria-pressed={arranging}
        onClick={() => setArranging((a) => !a)}
        data-testid="layout-arrange"
      >
        {arranging ? <Check aria-hidden /> : <LayoutDashboard aria-hidden />}
        {t(arranging ? 'layout.done' : 'layout.arrange')}
      </Button>
    </div>
  );

  return (
    <div ref={root} className="space-y-2" data-testid={`panels-${name}`}>
      {toolbarAt === 'top' && toolbar}
      {wide && (arranging || (layout.start.length > 0 && layout.end.length > 0)) ? (
        <div className="flex" data-columns>
          <div style={{ width: `${layout.split * 100}%` }} className="min-w-0 shrink-0">
            {column(LIST.start, layout.start)}
          </div>
          <div
            role={arranging ? 'separator' : undefined}
            aria-orientation={arranging ? 'vertical' : undefined}
            aria-label={arranging ? t('layout.width') : undefined}
            aria-valuemin={arranging ? Math.round(SPLIT.min * 100) : undefined}
            aria-valuemax={arranging ? Math.round(SPLIT.max * 100) : undefined}
            aria-valuenow={arranging ? Math.round(layout.split * 100) : undefined}
            tabIndex={arranging ? 0 : undefined}
            onPointerDown={arranging ? onSplitDown : undefined}
            onPointerMove={arranging ? onSplitMove : undefined}
            onPointerUp={() => (splitDrag.current = null)}
            onPointerCancel={() => (splitDrag.current = null)}
            onKeyDown={arranging ? onSplitKey : undefined}
            className={cn(
              'w-4 shrink-0 self-stretch',
              arranging && 'group grid cursor-ew-resize touch-none place-items-center',
            )}
            data-testid="layout-split"
          >
            {arranging && (
              <span
                aria-hidden
                className="bg-border-strong/50 group-hover:bg-accent h-16 w-1.5 rounded-full"
              />
            )}
          </div>
          <div className="min-w-0 flex-1">{column(LIST.end, layout.end)}</div>
        </div>
      ) : wide ? (
        // One column was emptied: the other takes the whole width (until arranging again).
        column(LIST.start, [...layout.start, ...layout.end])
      ) : (
        column(LIST.phone, layout.phone)
      )}
      {toolbarAt === 'bottom' && toolbar}
    </div>
  );
}

const round2 = (v: number) => Math.round(v * 100) / 100;

function IconButton({
  label,
  onClick,
  disabled,
  testId,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  testId?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="text-muted hover:text-text hover:bg-border grid size-7 place-items-center rounded disabled:opacity-30"
      data-testid={testId}
    >
      {children}
    </button>
  );
}
