import { useEffect } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Printer } from 'lucide-react';
import type { RecordKind } from '@fleet-hub/shared';
import { useSession } from '@/auth/session';
import { Button } from '@/components/ui/button';
import { lookupName, useLookups } from '@/fleet/data';
import { cn } from '@/lib/cn';
import { useVehicle, type VehicleDetail } from '../data';
import { fetchAllRecords, useDocuments, type DocumentRow, type RecordRow } from '../records/api';
import { cellText, useFormatCtx } from '../records/format';
import { createdByCol, KIND_UI, type Column, type FormatCtx } from '../records/kinds';
import { useLogo } from '@/settings/ReportLogo';
import { parseReport, REPORT_KINDS, type ReportOptions } from './sections';

/** Receipt table columns, by their header key under records.col. */
const RECEIPT_COLS = ['date', 'documentKind', 'vendor', 'category', 'notes'] as const;

/** Kinds whose rows carry a cost, for the summary. */
const COSTED: RecordKind[] = ['workCards', 'service', 'malfunctions', 'fuel', 'inspections'];

/** Every row of each chosen kind in the dates, fetched together. */
function useReportRecords(serial: string, o: ReportOptions) {
  const kinds = REPORT_KINDS.filter((k) => o.parts.includes(k));
  return useQuery({
    queryKey: ['vehicle-report', serial, o.from, o.to, kinds.join(',')],
    queryFn: async () => {
      const pages = await Promise.all(
        kinds.map((k) =>
          fetchAllRecords(serial, k, { from: o.from || undefined, to: o.to || undefined }).then(
            (p) => [k, p.items] as const,
          ),
        ),
      );
      return Object.fromEntries(pages) as Partial<Record<RecordKind, RecordRow[]>>;
    },
  });
}

function Table({ columns, rows, ctx }: { columns: Column[]; rows: RecordRow[]; ctx: FormatCtx }) {
  const { t } = useTranslation();
  return (
    <table className="vr-table w-full border-collapse text-[11px] leading-snug">
      <thead>
        <tr>
          {columns.map((c) => (
            <th
              key={c.key}
              scope="col"
              className={cn(
                'border-b border-neutral-400 px-1.5 py-1 text-start font-semibold',
                (c.kind === 'number' || c.kind === 'money') && 'text-end',
              )}
            >
              {t(c.header as never)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className="break-inside-avoid border-b border-neutral-200">
            {columns.map((c) => {
              const text = cellText(c, r, ctx);
              const numeric = c.kind === 'number' || c.kind === 'money';
              return (
                <td
                  key={c.key}
                  className={cn(
                    'px-1.5 py-1 align-top',
                    numeric && 'num text-end whitespace-nowrap',
                    c.kind === 'date' && 'num whitespace-nowrap',
                    c.kind === 'long' && 'whitespace-pre-line',
                  )}
                >
                  {numeric || c.kind === 'date' || c.kind === 'bool' ? text : <bdi>{text}</bdi>}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const sumCost = (rows: RecordRow[] | undefined) =>
  (rows ?? []).reduce((s, r) => s + (typeof r.cost === 'number' ? r.cost : 0), 0);

function inRange(iso: string, o: ReportOptions) {
  const day = iso.slice(0, 10);
  return (!o.from || day >= o.from) && (!o.to || day <= o.to);
}

function Header({
  vehicle,
  o,
  ctx,
  logo,
}: {
  vehicle: VehicleDetail;
  o: ReportOptions;
  ctx: FormatCtx;
  logo: string | null;
}) {
  const { t, i18n } = useTranslation();
  const { data: user } = useSession();
  const { data: lookups } = useLookups();
  const name = (list: 'locations' | 'departments' | 'vehicleTypes', code: string | null) =>
    code
      ? (lookupName(
          lookups?.[list].find((i) => i.code === code),
          i18n.language,
        ) ?? code)
      : '';
  const reading =
    vehicle.usageUnit === 'KM'
      ? vehicle.odometerKm !== null &&
        t('vehicle.units.km', { value: ctx.number(vehicle.odometerKm) })
      : vehicle.engineHours !== null &&
        t('vehicle.units.hours', { value: ctx.number(vehicle.engineHours) });
  const facts: [string, React.ReactNode][] = [
    [t('vehicle.info.serial'), <bdi dir="ltr">{vehicle.serial}</bdi>],
    [
      t('vehicle.info.makeModelYear'),
      [vehicle.make, vehicle.model, vehicle.year].filter(Boolean).join(' '),
    ],
    [t('vehicleForm.field.type'), name('vehicleTypes', vehicle.type)],
    [t('vehicle.info.licenseNo'), vehicle.licenseNo && <bdi dir="ltr">{vehicle.licenseNo}</bdi>],
    [t('vehicle.info.vin'), vehicle.vin && <bdi dir="ltr">{vehicle.vin}</bdi>],
    [t(`vehicle.info.usage_${vehicle.usageUnit}`), reading || null],
    [t('vehicle.info.location'), name('locations', vehicle.location)],
    [t('vehicle.info.department'), name('departments', vehicle.department)],
  ];
  const period =
    o.from || o.to
      ? t('vreport.period', {
          from: o.from ? ctx.date(o.from) : '…',
          to: o.to ? ctx.date(o.to) : '…',
        })
      : t('vreport.allTime');
  return (
    <header className="space-y-4 border-b-2 border-neutral-800 pb-4">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold">{t('vreport.title')}</h1>
          <p className="text-base font-semibold">
            <bdi dir="ltr">{vehicle.serial}</bdi> · {vehicle.make} {vehicle.model}
          </p>
          <p className="text-sm text-neutral-600">{period}</p>
        </div>
        {logo && (
          <img
            src={logo}
            alt={t('settings.logo.alt')}
            className="max-h-20 max-w-56 object-contain"
            data-testid="vreport-logo"
          />
        )}
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs sm:grid-cols-4">
        {facts
          .filter(([, v]) => v)
          .map(([label, value]) => (
            <div key={label}>
              <dt className="text-neutral-500">{label}</dt>
              <dd className="font-medium">{value}</dd>
            </div>
          ))}
      </dl>
      <p className="text-[11px] text-neutral-500">
        {t('vreport.created', { date: ctx.date(new Date().toISOString()), name: user?.name ?? '' })}
      </p>
    </header>
  );
}

function Receipts({ rows, ctx }: { rows: DocumentRow[]; ctx: FormatCtx }) {
  const { t, i18n } = useTranslation();
  const { data: lookups } = useLookups();
  return (
    <table className="w-full border-collapse text-[11px] leading-snug">
      <thead>
        <tr>
          {RECEIPT_COLS.map((k) => (
            <th
              key={k}
              scope="col"
              className="border-b border-neutral-400 px-1.5 py-1 text-start font-semibold"
            >
              {t(`records.col.${k}`)}
            </th>
          ))}
          <th
            scope="col"
            className="border-b border-neutral-400 px-1.5 py-1 text-end font-semibold"
          >
            {t('records.col.amount')}
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((d) => (
          <tr key={d.id} className="break-inside-avoid border-b border-neutral-200">
            <td className="num px-1.5 py-1 whitespace-nowrap">{ctx.date(d.date)}</td>
            <td className="px-1.5 py-1">{t(`records.documentKind.${d.kind}`)}</td>
            <td className="px-1.5 py-1">{d.vendor && <bdi>{d.vendor}</bdi>}</td>
            <td className="px-1.5 py-1">
              {d.category &&
                (lookupName(
                  lookups?.receiptCategories.find((c) => c.code === d.category),
                  i18n.language,
                ) ??
                  d.category)}
            </td>
            <td className="px-1.5 py-1 whitespace-pre-line">{d.notes && <bdi>{d.notes}</bdi>}</td>
            <td className="num px-1.5 py-1 text-end whitespace-nowrap">
              {d.amount === null ? '' : ctx.money(d.amount)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Part({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <section className="vr-part space-y-2">
      <h2 className="flex items-baseline gap-3 border-b border-neutral-300 pb-1 text-base font-semibold">
        {title}
        {count !== undefined && (
          <span className="text-xs font-normal text-neutral-500">
            {t('vreport.rows', { count })}
          </span>
        )}
      </h2>
      {children}
    </section>
  );
}

/**
 * A printable report of everything done to one vehicle in chosen dates (Revisions 1): the
 * chosen record kinds, receipts and a cost summary, with the company logo. Printed through
 * the browser, which can also save it as PDF.
 */
export function VehicleReportPage() {
  const { serial = '' } = useParams();
  const [params] = useSearchParams();
  const o = parseReport(params);
  const { t, i18n } = useTranslation();
  const vehicle = useVehicle(serial);
  const ctx = useFormatCtx(vehicle.data?.usageUnit ?? 'KM');
  const records = useReportRecords(serial, o);
  const docs = useDocuments(serial);
  const logo = useLogo();
  const wantsReceipts = o.parts.includes('receipts') || o.parts.includes('costs');
  const receipts = (docs.data?.items ?? []).filter((d) => d.approved && inRange(d.date, o));

  useEffect(() => {
    document.title = `${t('vreport.title')} · ${serial}`;
  }, [t, serial]);

  const loading =
    vehicle.isPending ||
    records.isPending ||
    (wantsReceipts && docs.isPending) ||
    (o.logo && logo.isPending);
  const failed = vehicle.isError || records.isError;

  const costRows = COSTED.filter((k) => records.data?.[k]).map((k) => ({
    kind: k,
    total: sumCost(records.data?.[k]),
  }));
  const recordsTotal = costRows.reduce((s, r) => s + r.total, 0);
  const receiptsTotal = receipts.reduce((s, d) => s + (d.amount ?? 0), 0);

  return (
    <div className="vreport mx-auto max-w-5xl" lang={i18n.language} data-testid="vehicle-report">
      <div className="mb-4 flex items-center gap-2 print:hidden">
        <Link
          to={`/vehicles/${encodeURIComponent(serial)}`}
          className="text-muted hover:text-text inline-flex items-center gap-1.5 text-sm"
        >
          <ArrowLeft aria-hidden className="size-4 rtl:-scale-x-100" />
          {t('vreport.back')}
        </Link>
        <Button className="ms-auto" onClick={() => window.print()} disabled={loading || failed}>
          <Printer aria-hidden />
          {t('vreport.print')}
        </Button>
      </div>
      <article className="space-y-6 rounded-lg bg-white p-6 text-neutral-900 shadow-sm print:rounded-none print:p-0 print:shadow-none sm:p-10">
        {loading ? (
          <p role="status" className="flex items-center justify-center gap-2 py-16 text-sm">
            <Loader2 aria-hidden className="size-4 animate-spin" />
            {t('vreport.loading')}
          </p>
        ) : failed || !vehicle.data ? (
          <p role="alert" className="py-16 text-center text-sm text-red-700">
            {t('vreport.failed')}
          </p>
        ) : (
          <>
            <Header
              vehicle={vehicle.data}
              o={o}
              ctx={ctx}
              logo={o.logo ? (logo.data ?? null) : null}
            />
            {REPORT_KINDS.filter((k) => o.parts.includes(k)).map((k) => {
              const rows = records.data?.[k] ?? [];
              const columns = [...KIND_UI[k].columns, ...(k === 'notes' ? [] : [createdByCol])];
              return (
                <Part key={k} title={t(`vehicle.records.${k}`)} count={rows.length}>
                  {rows.length ? (
                    <Table columns={columns} rows={rows} ctx={ctx} />
                  ) : (
                    <p className="text-xs text-neutral-500">{t('vreport.empty')}</p>
                  )}
                </Part>
              );
            })}
            {o.parts.includes('receipts') && (
              <Part title={t('vreport.receipts')} count={receipts.length}>
                {receipts.length ? (
                  <Receipts rows={receipts} ctx={ctx} />
                ) : (
                  <p className="text-xs text-neutral-500">{t('vreport.empty')}</p>
                )}
              </Part>
            )}
            {o.parts.includes('costs') && (
              <Part title={t('vreport.costs')}>
                <table
                  className="w-full max-w-md border-collapse text-xs"
                  data-testid="vreport-costs"
                >
                  <tbody>
                    {costRows.map((r) => (
                      <tr key={r.kind} className="border-b border-neutral-200">
                        <th scope="row" className="px-1.5 py-1 text-start font-normal">
                          {t(`vehicle.records.${r.kind}`)}
                        </th>
                        <td className="num px-1.5 py-1 text-end">{ctx.money(r.total)}</td>
                      </tr>
                    ))}
                    <tr className="border-b-2 border-neutral-800 font-semibold">
                      <th scope="row" className="px-1.5 py-1 text-start">
                        {t('vreport.recordsCost')}
                      </th>
                      <td className="num px-1.5 py-1 text-end">{ctx.money(recordsTotal)}</td>
                    </tr>
                    <tr className="font-semibold">
                      <th scope="row" className="px-1.5 py-1 text-start">
                        {t('vreport.receiptsTotal')}
                      </th>
                      <td className="num px-1.5 py-1 text-end">{ctx.money(receiptsTotal)}</td>
                    </tr>
                  </tbody>
                </table>
                <p className="text-[11px] text-neutral-500">{t('vreport.costNote')}</p>
              </Part>
            )}
            <footer className="border-t border-neutral-300 pt-2 text-[10px] text-neutral-500">
              {t('vreport.page', { serial: vehicle.data.serial })}
            </footer>
          </>
        )}
      </article>
    </div>
  );
}
