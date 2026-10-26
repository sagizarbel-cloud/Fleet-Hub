import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';
import { X } from 'lucide-react';

/**
 * A side sheet (full screen on phones) for forms. Esc and the backdrop close it; Esc is
 * marked handled so the page underneath doesn't also react. Focus moves in and comes back.
 */
export function Sheet({
  title,
  onClose,
  children,
  footer,
  reduced,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  reduced: boolean;
}) {
  const { t, i18n } = useTranslation();
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const first =
      panel.current?.querySelector<HTMLElement>('input, select, textarea') ??
      panel.current?.querySelector<HTMLElement>('button');
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close.current();
        return;
      }
      if (e.key !== 'Tab' || !panel.current) return;
      // Keep Tab inside the sheet.
      const items = panel.current.querySelectorAll<HTMLElement>(
        'a[href], button:not(:disabled), input:not(:disabled), select, textarea',
      );
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl?.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl?.focus();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      before?.focus?.();
    };
  }, []);

  // Slides in from the inline end: the right in English, the left in Hebrew.
  const from = reduced ? 0 : i18n.dir() === 'rtl' ? -40 : 40;

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end" data-testid="sheet">
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
        initial={{ opacity: 0, x: from }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="bg-surface-strong border-border relative flex h-full w-full flex-col border-s sm:max-w-md"
      >
        <div className="border-border flex items-center gap-2 border-b px-4 py-3">
          <h2 id={titleId} className="me-auto text-base font-semibold">
            {title}
          </h2>
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
