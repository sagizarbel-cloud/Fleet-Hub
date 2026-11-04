import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';
import { Maximize2, Minimize2, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useDialogFocus } from './Sheet';

const PHONE = '(max-width: 639px)';
const WIDTH_KEY = 'fh.reportWidth';
const MIN_WIDTH = 360;
const DEFAULT_WIDTH = 520;
const STEP = 40;
/** Phone heights, as a share of the screen: half, then full. */
const HALF = 0.6;

function storedWidth() {
  try {
    const n = Number(localStorage.getItem(WIDTH_KEY));
    return Number.isFinite(n) && n >= MIN_WIDTH ? n : DEFAULT_WIDTH;
  } catch {
    return DEFAULT_WIDTH;
  }
}
const maxWidth = () => Math.max(MIN_WIDTH, window.innerWidth - 32);
const clampWidth = (w: number) => Math.round(Math.min(maxWidth(), Math.max(MIN_WIDTH, w)));

function usePhone() {
  const [phone, setPhone] = useState(() => window.matchMedia(PHONE).matches);
  useEffect(() => {
    const mq = window.matchMedia(PHONE);
    const on = () => setPhone(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return phone;
}

/**
 * A sheet the reader can resize (Revisions 1). On computers it sits on the inline end (right in
 * English, left in Hebrew); dragging its inner edge, or the arrow keys on that edge, makes it
 * wider or narrower, and a button fills the screen. The width is remembered on this device.
 * On phones it rises from the bottom at about half height; dragging its handle or tapping the
 * button switches between half and full height.
 */
export function ResizableSheet({
  title,
  subtitle,
  onClose,
  children,
  footer,
  reduced,
  testId = 'resizable-sheet',
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  reduced: boolean;
  testId?: string;
}) {
  const { t, i18n } = useTranslation();
  const rtl = i18n.dir() === 'rtl';
  const phone = usePhone();
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useDialogFocus(panel, onClose, true);

  const [width, setWidth] = useState(storedWidth);
  const [full, setFull] = useState(false);
  const [dragging, setDragging] = useState(false);
  // Phones: a share of the screen height while dragging, else half or full.
  const [phoneHeight, setPhoneHeight] = useState<number | null>(null);

  const saveWidth = (w: number) => {
    try {
      localStorage.setItem(WIDTH_KEY, String(w));
    } catch {
      // Private mode: the width just isn't remembered.
    }
  };
  const resizeTo = (w: number) => {
    const next = clampWidth(w);
    setWidth(next);
    setFull(false);
    saveWidth(next);
  };

  // Keep the width on screen when the window gets smaller.
  useEffect(() => {
    const onResize = () => setWidth((w) => clampWidth(w));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  /** Desktop: drag the inner edge. Moving away from the inline end makes the sheet wider. */
  const startWidthDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    const x0 = e.clientX;
    const w0 = full ? maxWidth() : width;
    setDragging(true);
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - x0;
      setFull(false);
      setWidth(clampWidth(rtl ? w0 + dx : w0 - dx));
    };
    const up = () => {
      setDragging(false);
      setWidth((w) => {
        saveWidth(w);
        return w;
      });
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  };

  const onEdgeKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const wider = rtl ? 'ArrowRight' : 'ArrowLeft';
    const narrower = rtl ? 'ArrowLeft' : 'ArrowRight';
    if (e.key === wider) resizeTo(width + STEP);
    else if (e.key === narrower) resizeTo(width - STEP);
    else if (e.key === 'Home') resizeTo(MIN_WIDTH);
    else if (e.key === 'End') resizeTo(maxWidth());
    else return;
    e.preventDefault();
  };

  /** Phones: drag the handle up or down; on release it settles at half or full height. */
  const startHeightDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    const vh = window.innerHeight;
    const y0 = e.clientY;
    const h0 = full ? 1 : HALF;
    let moved = false;
    setDragging(true);
    const move = (ev: PointerEvent) => {
      const dy = ev.clientY - y0;
      if (Math.abs(dy) > 4) moved = true;
      setPhoneHeight(Math.min(1, Math.max(0.3, h0 - dy / vh)));
    };
    const up = () => {
      setDragging(false);
      setPhoneHeight((h) => {
        if (!moved) setFull((f) => !f);
        else if (h !== null) setFull(h > (1 + HALF) / 2);
        return null;
      });
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  };

  const sizeLabel = t(full ? 'report.restore' : 'report.expand');
  const SizeIcon = full ? Minimize2 : Maximize2;
  const from = reduced ? 0 : phone ? 40 : rtl ? -40 : 40;

  const style = phone
    ? { height: `${Math.round((phoneHeight ?? (full ? 1 : HALF)) * 100)}dvh` }
    : { width: full ? '100%' : `${width}px` };

  return createPortal(
    <div
      className={cn('fixed inset-0 z-50 flex', phone ? 'items-end' : 'justify-end')}
      data-testid={testId}
      data-full={full || undefined}
    >
      <motion.div
        aria-hidden
        className="absolute inset-0 bg-black/50"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.15 }}
        onClick={onClose}
      />
      <motion.div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        initial={{ opacity: 0, ...(phone ? { y: from } : { x: from }) }}
        animate={{ opacity: 1, x: 0, y: 0 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        style={style}
        className={cn(
          'bg-surface-strong border-border relative flex flex-col outline-none',
          phone ? 'w-full rounded-t-2xl border-t' : 'h-full max-w-full border-s',
          dragging && 'select-none',
        )}
      >
        {phone ? (
          <div
            role="button"
            tabIndex={0}
            aria-label={sizeLabel}
            title={sizeLabel}
            onPointerDown={startHeightDrag}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setFull((f) => !f);
              }
            }}
            className="flex h-6 shrink-0 cursor-grab touch-none items-center justify-center"
            data-testid="sheet-handle"
          >
            <span aria-hidden className="bg-border-strong h-1.5 w-12 rounded-full" />
          </div>
        ) : (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label={t('report.resize')}
            aria-valuemin={MIN_WIDTH}
            aria-valuemax={maxWidth()}
            aria-valuenow={full ? maxWidth() : width}
            tabIndex={0}
            onPointerDown={startWidthDrag}
            onKeyDown={onEdgeKey}
            onDoubleClick={() => setFull((f) => !f)}
            title={t('report.resizeHint')}
            className={cn(
              'group absolute inset-y-0 -start-1.5 z-10 flex w-3 cursor-ew-resize touch-none items-center justify-center',
              'focus-visible:outline-2 focus-visible:outline-[var(--fh-accent)]',
            )}
            data-testid="sheet-resize"
          >
            <span
              aria-hidden
              className={cn(
                'bg-border-strong h-10 w-1 rounded-full transition-colors',
                'group-hover:bg-[var(--fh-accent)]',
                dragging && 'bg-[var(--fh-accent)]',
              )}
            />
          </div>
        )}
        <div
          className={cn(
            'border-border flex items-center gap-2 border-b px-4',
            phone ? 'pb-2' : 'py-3',
          )}
        >
          <div className="me-auto min-w-0">
            <h2 id={titleId} className="truncate text-base font-semibold">
              {title}
            </h2>
            {subtitle && <div className="text-muted truncate text-xs">{subtitle}</div>}
          </div>
          <button
            type="button"
            onClick={() => setFull((f) => !f)}
            aria-label={sizeLabel}
            title={sizeLabel}
            aria-pressed={full}
            className="text-muted hover:text-text grid size-8 place-items-center rounded-lg"
            data-testid="sheet-size"
          >
            <SizeIcon aria-hidden className="size-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('records.close')}
            title={t('records.close')}
            className="text-muted hover:text-text grid size-8 place-items-center rounded-lg"
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
        {footer && <div className="border-border border-t px-4 py-3">{footer}</div>}
      </motion.div>
    </div>,
    document.body,
  );
}
