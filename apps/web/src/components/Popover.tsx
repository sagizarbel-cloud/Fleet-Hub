import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * A button with a small panel under it. Closes on outside click and on Esc; Esc is marked
 * handled (preventDefault) so the page's own Esc shortcut doesn't fire as well.
 */
export function Popover({
  trigger,
  label,
  children,
  className,
  panelClassName,
  align = 'end',
}: {
  trigger: ReactNode;
  label: string;
  children: (close: () => void) => ReactNode;
  className?: string;
  panelClassName?: string;
  align?: 'start' | 'end';
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener('pointerdown', onDown);
    // Capture phase, so this runs before the page's own Esc handler.
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  return (
    <div ref={root} className={cn('relative', className)}>
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={id}
        aria-label={label}
        title={label}
        onClick={() => setOpen((o) => !o)}
        className="border-border hover:border-border-strong text-muted hover:text-text inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs"
      >
        {trigger}
      </button>
      {open && (
        <div
          id={id}
          role="dialog"
          aria-label={label}
          className={cn(
            'glass bg-surface-strong absolute top-full z-20 mt-1.5 p-2',
            align === 'end' ? 'end-0' : 'start-0',
            panelClassName,
          )}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}
