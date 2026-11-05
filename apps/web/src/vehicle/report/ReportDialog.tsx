import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink } from 'lucide-react';
import { Sheet } from '@/components/Sheet';
import { Button } from '@/components/ui/button';
import { useLogo } from '@/settings/ReportLogo';
import { localDay } from '../records/kinds';
import { REPORT_PARTS, reportPath, type ReportPart } from './sections';

const CONTROL =
  'border-border-strong bg-surface num h-9 rounded-md border px-2 text-sm focus-visible:outline-2 focus-visible:outline-[var(--fh-accent)]';

const partLabel = (p: ReportPart) =>
  p === 'receipts'
    ? 'vreport.receipts'
    : p === 'costs'
      ? 'vreport.costs'
      : (`vehicle.records.${p}` as const);

/** Chooses the dates and sections of a printable vehicle report (Revisions 1). */
export function ReportDialog({
  serial,
  reduced,
  onClose,
}: {
  serial: string;
  reduced: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const logo = useLogo();
  const year = new Date().getFullYear();
  const [from, setFrom] = useState(`${year}-01-01`);
  const [to, setTo] = useState(localDay());
  const [parts, setParts] = useState<Set<ReportPart>>(() => new Set(REPORT_PARTS));
  const [withLogo, setWithLogo] = useState(true);
  const toggle = (p: ReportPart, on: boolean) =>
    setParts((s) => {
      const next = new Set(s);
      if (on) next.add(p);
      else next.delete(p);
      return next;
    });

  const open = () => {
    const url = reportPath(serial, {
      from,
      to,
      // Keep the print order whatever order they were ticked in.
      parts: REPORT_PARTS.filter((p) => parts.has(p)),
      logo: withLogo && !!logo.data,
    });
    window.open(url, '_blank', 'noopener');
    onClose();
  };

  return (
    <Sheet
      title={t('vreport.title')}
      onClose={onClose}
      reduced={reduced}
      footer={
        <div className="flex items-center gap-2">
          {parts.size === 0 && <p className="text-bad me-auto text-xs">{t('vreport.pickOne')}</p>}
          <Button variant="ghost" className="ms-auto" onClick={onClose} type="button">
            {t('records.cancel')}
          </Button>
          <Button onClick={open} disabled={parts.size === 0} data-testid="open-vreport">
            <ExternalLink aria-hidden className="rtl:-scale-x-100" />
            {t('vreport.open')}
          </Button>
        </div>
      }
    >
      <div className="space-y-5 text-sm" data-testid="vreport-dialog">
        <p className="text-muted">{t('vreport.hint')}</p>
        <fieldset className="space-y-2">
          <legend className="mb-1 text-xs font-medium">{t('vreport.dates')}</legend>
          <div className="flex flex-wrap gap-3">
            <label className="flex items-center gap-1.5">
              <span className="text-muted text-xs">{t('records.from')}</span>
              <input
                type="date"
                value={from}
                max={to || undefined}
                onChange={(e) => setFrom(e.target.value)}
                className={CONTROL}
              />
            </label>
            <label className="flex items-center gap-1.5">
              <span className="text-muted text-xs">{t('records.to')}</span>
              <input
                type="date"
                value={to}
                min={from || undefined}
                onChange={(e) => setTo(e.target.value)}
                className={CONTROL}
              />
            </label>
          </div>
        </fieldset>
        <fieldset className="space-y-2">
          <legend className="mb-1 flex w-full items-center gap-3 text-xs font-medium">
            {t('vreport.include')}
            <button
              type="button"
              className="text-accent-ink ms-auto"
              onClick={() => setParts(new Set(REPORT_PARTS))}
            >
              {t('vreport.all')}
            </button>
            <button type="button" className="text-accent-ink" onClick={() => setParts(new Set())}>
              {t('vreport.none')}
            </button>
          </legend>
          <ul className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
            {REPORT_PARTS.map((p) => (
              <li key={p}>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={parts.has(p)}
                    onChange={(e) => toggle(p, e.target.checked)}
                    className="size-4 accent-[var(--fh-accent)]"
                    data-part={p}
                  />
                  {t(partLabel(p))}
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
        <fieldset className="space-y-2">
          <legend className="mb-1 text-xs font-medium">{t('vreport.logo')}</legend>
          {logo.data ? (
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={withLogo}
                onChange={(e) => setWithLogo(e.target.checked)}
                className="size-4 accent-[var(--fh-accent)]"
              />
              <span className="grid h-10 w-28 place-items-center rounded bg-white p-1">
                <img
                  src={logo.data}
                  alt={t('settings.logo.alt')}
                  className="max-h-full max-w-full"
                />
              </span>
            </label>
          ) : (
            <p className="text-muted text-xs">{t('vreport.noLogo')}</p>
          )}
        </fieldset>
      </div>
    </Sheet>
  );
}
