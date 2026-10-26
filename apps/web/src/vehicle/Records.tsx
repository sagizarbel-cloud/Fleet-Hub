import { useEffect } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import {
  ArrowLeftRight,
  ClipboardCheck,
  Droplet,
  FileText,
  Fuel,
  Loader2,
  ReceiptText,
  ShieldCheck,
  StickyNote,
  TriangleAlert,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { EventType } from '@fleet-hub/shared';
import { useEvents } from '@/fleet/data';
import { useDateFormat } from '@/fleet/FleetGrid';
import { EventList } from '@/fleet/Timeline';
import { cn } from '@/lib/cn';
import type { VehicleDetail } from './data';

export const RECORD_KEYS = [
  'service',
  'malfunctions',
  'fluids',
  'fuel',
  'movements',
  'inspections',
  'ownership',
  'documents',
  'quotes',
  'notes',
] as const;
export type RecordKey = (typeof RECORD_KEYS)[number];

const RECORDS: Record<RecordKey, { icon: LucideIcon; types: EventType[] }> = {
  service: { icon: Wrench, types: ['SERVICE'] },
  malfunctions: {
    icon: TriangleAlert,
    types: ['MALFUNCTION_REPORTED', 'MALFUNCTION_UPDATED', 'MALFUNCTION_RESOLVED'],
  },
  fluids: { icon: Droplet, types: ['FLUID_ADDED'] },
  fuel: { icon: Fuel, types: ['FUEL_ADDED'] },
  movements: { icon: ArrowLeftRight, types: ['MOVEMENT'] },
  inspections: { icon: ClipboardCheck, types: ['INSPECTION'] },
  ownership: { icon: ShieldCheck, types: [] },
  documents: { icon: ReceiptText, types: ['DOCUMENT_ADDED'] },
  quotes: { icon: FileText, types: ['QUOTE_LINKED'] },
  notes: { icon: StickyNote, types: ['NOTE_ADDED'] },
};

const DAY_MS = 86_400_000;
const LAYOUT = { type: 'spring', duration: 0.4, bounce: 0.1 } as const;

function isRecordKey(s: string | null): s is RecordKey {
  return !!s && (RECORD_KEYS as readonly string[]).includes(s);
}

/** The card's one-line summary, e.g. "Open: 2" or "Next in 23 days". */
function useSummary(v: VehicleDetail | undefined) {
  const { t, i18n } = useTranslation();
  const formatDate = useDateFormat();
  const relative = new Intl.RelativeTimeFormat(i18n.language === 'he' ? 'he-IL' : 'en-GB', {
    numeric: 'auto',
  });
  return (key: RecordKey): { text: string; warn?: boolean } => {
    // Still loading: the cards are already in place, their counts follow.
    if (!v) return { text: '…' };
    const c = v.counts;
    switch (key) {
      case 'malfunctions':
        return c.malfunctionsOpen > 0
          ? { text: t('vehicle.records.open', { count: c.malfunctionsOpen }), warn: true }
          : { text: t('vehicle.records.count', { count: c.malfunctions }) };
      case 'inspections':
        return c.nextInspection
          ? {
              text: t('vehicle.records.next', {
                kind: t(`inspection.${c.nextInspection.kind}`),
                when: relative.format(
                  Math.ceil((Date.parse(c.nextInspection.validUntil) - Date.now()) / DAY_MS),
                  'day',
                ),
              }),
            }
          : { text: t('vehicle.records.count', { count: c.inspections }) };
      case 'ownership':
        return v.warrantyExpiry
          ? { text: t('vehicle.info.warrantyUntil', { date: formatDate(v.warrantyExpiry) }) }
          : { text: t('vehicle.records.noWarranty') };
      default:
        return { text: t('vehicle.records.count', { count: c[key] }) };
    }
  };
}

function PanelBody({ recordKey, vehicle }: { recordKey: RecordKey; vehicle: VehicleDetail }) {
  const { t } = useTranslation();
  const formatDate = useDateFormat();
  const types = RECORDS[recordKey].types;
  const events = useEvents({ vehicle: vehicle.serial, types: types.length ? types : ['SERVICE'] });

  if (recordKey === 'ownership') {
    const rows = [
      ['purchaseDate', vehicle.purchaseDate],
      ['warrantyExpiry', vehicle.warrantyExpiry],
    ] as const;
    return (
      <dl className="grid gap-3 sm:grid-cols-2">
        {rows.map(([key, value]) => (
          <div key={key}>
            <dt className="text-muted text-xs">{t(`vehicle.ownership.${key}`)}</dt>
            <dd className="text-sm">{value ? formatDate(value) : t('dashboard.notSet')}</dd>
          </div>
        ))}
      </dl>
    );
  }
  if (events.isPending)
    return <Loader2 aria-hidden className="text-muted mx-auto my-6 size-5 animate-spin" />;
  const pages = events.data?.pages.slice(0, 1) ?? [];
  if (pages.every((p) => p.items.length === 0))
    return <p className="text-muted py-6 text-center text-sm">{t('vehicle.records.empty')}</p>;
  return (
    <div className="max-h-80 overflow-y-auto">
      <EventList pages={pages} linkable={false} showSerial={false} />
    </div>
  );
}

/**
 * The record cards (SPEC 5.3). A card expands, as one shared element, into its panel; the
 * panel is in the URL (?panel=…) so Back closes it. Phase 4 turns panels into full tables.
 */
export function Records({
  serial,
  vehicle,
  motionFor,
  reduced,
}: {
  serial: string;
  vehicle: VehicleDetail | undefined;
  motionFor: (i: number) => object;
  reduced: boolean;
}) {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const summary = useSummary(vehicle);
  const raw = params.get('panel');
  const open = vehicle && isRecordKey(raw) ? raw : null;
  const pushed = (location.state as { panelPushed?: boolean } | null)?.panelPushed === true;
  const layout = reduced ? { duration: 0 } : LAYOUT;

  const show = (key: RecordKey) => {
    const next = new URLSearchParams(params);
    next.set('panel', key);
    next.delete('event');
    setParams(next, { state: { ...(location.state as object), panelPushed: true } });
  };
  const close = () => {
    if (pushed) {
      navigate(-1);
      return;
    }
    const next = new URLSearchParams(params);
    next.delete('panel');
    setParams(next, { replace: true, state: location.state });
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      close();
    };
    // Capture phase: Esc closes the panel before it would leave the vehicle page.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  return (
    <LayoutGroup id={`records-${serial}`}>
      <AnimatePresence initial={false}>
        {open && vehicle && (
          <motion.section
            key={open}
            layoutId={`record-${open}`}
            transition={{ layout }}
            aria-labelledby="record-panel-title"
            className="glass mb-2 overflow-hidden p-3"
            data-testid="record-panel"
            data-panel-key={open}
            exit={{ opacity: 0 }}
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2, delay: reduced ? 0 : 0.15 }}
            >
              <div className="mb-3 flex items-center gap-2">
                {(() => {
                  const Icon = RECORDS[open].icon;
                  return <Icon aria-hidden className="text-accent-ink size-4" />;
                })()}
                <h2 id="record-panel-title" className="me-auto text-sm font-semibold">
                  {t(`vehicle.records.${open}`)}
                </h2>
                <button
                  type="button"
                  onClick={close}
                  aria-label={t('vehicle.records.close')}
                  title={t('vehicle.records.close')}
                  className="text-muted hover:text-text grid size-8 place-items-center rounded-lg"
                >
                  <X aria-hidden className="size-4" />
                </button>
              </div>
              <PanelBody recordKey={open} vehicle={vehicle} />
              <p className="text-muted mt-3 text-xs">{t('vehicle.records.preview')}</p>
            </motion.div>
          </motion.section>
        )}
      </AnimatePresence>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-5" data-testid="record-cards">
        {RECORD_KEYS.map((key, i) => {
          const Icon = RECORDS[key].icon;
          const s = summary(key);
          return (
            <motion.li key={key} data-panel {...motionFor(i)} className="min-h-[3.75rem]">
              {/* The open card's place stays, outlined, so the grid doesn't jump. */}
              {open === key && (
                <div
                  aria-hidden
                  className="border-border-strong h-full rounded-[var(--radius-panel)] border border-dashed"
                />
              )}
              {open !== key && (
                <motion.button
                  layoutId={`record-${key}`}
                  transition={{ layout }}
                  type="button"
                  onClick={() => show(key)}
                  data-record={key}
                  className="glass hover:border-border-strong flex h-full w-full items-start gap-2 p-3 text-start"
                >
                  <Icon aria-hidden className="text-accent-ink mt-0.5 size-4 shrink-0" />
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-medium">
                      {t(`vehicle.records.${key}`)}
                    </span>
                    <span
                      className={cn('text-muted block truncate text-xs', s.warn && 'text-warn')}
                    >
                      {s.text}
                    </span>
                  </span>
                </motion.button>
              )}
            </motion.li>
          );
        })}
      </ul>
    </LayoutGroup>
  );
}
