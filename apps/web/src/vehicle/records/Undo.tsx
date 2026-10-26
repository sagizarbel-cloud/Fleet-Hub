import {
  createContext,
  use,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'motion/react';
import { Undo2, X } from 'lucide-react';
import { UNDO_MS } from '@fleet-hub/shared';

interface Offer {
  id: number;
  message: string;
  undo: () => Promise<unknown>;
}

const UndoContext = createContext<(message: string, undo: () => Promise<unknown>) => void>(
  () => undefined,
);

/** Offers Undo after a delete: `offerUndo(message, undo)`. One offer at a time; a new one replaces it. */
export const useOfferUndo = () => use(UndoContext);

/** The Undo bar: stays UNDO_MS (30 s), then the delete simply stands. */
export function UndoProvider({ children, reduced }: { children: ReactNode; reduced: boolean }) {
  const { t } = useTranslation();
  const [offer, setOffer] = useState<Offer | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const seq = useRef(0);

  const offerUndo = useCallback((message: string, undo: () => Promise<unknown>) => {
    setFailed(false);
    setOffer({ id: ++seq.current, message, undo });
  }, []);

  useEffect(() => {
    if (!offer) return;
    const timer = setTimeout(() => setOffer(null), UNDO_MS);
    return () => clearTimeout(timer);
  }, [offer]);

  const undo = async () => {
    if (!offer) return;
    setBusy(true);
    try {
      await offer.undo();
      setOffer(null);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <UndoContext value={offerUndo}>
      {children}
      {/* Portalled: the vehicle page's animated layers would otherwise pin "fixed" to themselves. */}
      {createPortal(
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
          <AnimatePresence>
            {offer && (
              <motion.div
                key={offer.id}
                role="status"
                data-testid="undo-bar"
                initial={{ opacity: 0, y: reduced ? 0 : 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: reduced ? 0 : 16 }}
                transition={{ duration: 0.2 }}
                className="glass bg-surface-strong pointer-events-auto relative flex max-w-md items-center gap-3 overflow-hidden px-4 py-2.5 text-sm shadow-lg"
              >
                <span className="me-auto">{failed ? t('records.undoFailed') : offer.message}</span>
                <button
                  type="button"
                  onClick={undo}
                  disabled={busy}
                  className="text-accent-ink inline-flex items-center gap-1.5 font-semibold disabled:opacity-50"
                >
                  <Undo2 aria-hidden className="size-4 rtl:-scale-x-100" />
                  {t('records.undo')}
                </button>
                <button
                  type="button"
                  onClick={() => setOffer(null)}
                  aria-label={t('records.dismiss')}
                  title={t('records.dismiss')}
                  className="text-muted hover:text-text grid size-7 place-items-center rounded-md"
                >
                  <X aria-hidden className="size-4" />
                </button>
                {/* Time left, as a bar that shrinks (transform only). */}
                {!reduced && (
                  <motion.span
                    aria-hidden
                    className="bg-accent absolute inset-x-0 bottom-0 h-0.5 origin-left rtl:origin-right"
                    initial={{ scaleX: 1 }}
                    animate={{ scaleX: 0 }}
                    transition={{ duration: UNDO_MS / 1000, ease: 'linear' }}
                  />
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>,
        document.body,
      )}
    </UndoContext>
  );
}
