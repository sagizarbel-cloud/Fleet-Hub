import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Loader2, Pencil, ReceiptText, Trash2, TriangleAlert } from 'lucide-react';
import { hasRole, type RecordKind } from '@fleet-hub/shared';
import { useSession } from '@/auth/session';
import { ResizableSheet } from '@/components/ResizableSheet';
import { Button } from '@/components/ui/button';
import { useLookups } from '@/fleet/data';
import { describeEvent, EVENT_ICON } from '@/fleet/events';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { dateFormat, localeOf } from '@/lib/intl';
import type { VehicleDetail } from '../data';
import {
  attachmentUrl,
  useProgress,
  useRecord,
  type ProgressEntry,
  type RecordPage,
  type RecordRow,
} from './api';
import { AttachmentList } from './Attachments';
import { cellText, useFormatCtx } from './format';
import { colTitle, KIND_UI, localDay, type Column, type FormatCtx } from './kinds';
import { useKindColumns } from './columns';
import { RecordForm } from './RecordForm';
import { useRecordLink, type ReportTarget } from './recordLink';

/** Malfunctions read as two parts (Revisions 1): what the issue was, and what happened about it. */
const MALFUNCTION_PARTS = [
  { title: 'report.issue', keys: ['reportedAt', 'severity', 'isAccident', 'description'] },
  {
    title: 'report.whatHappened',
    keys: ['state', 'resolvedAt', 'downtimeHours', 'cost'],
  },
] as const;

/** What each line of the open list shows under the description. */
const SUMMARY_KEYS = ['reportedAt', 'severity', 'state'];

function Value({ col, row, ctx }: { col: Column; row: RecordRow; ctx: FormatCtx }) {
  const text = cellText(col, row, ctx);
  if (!text) return <span className="text-muted">—</span>;
  // Typed text keeps its own direction but lines up with the labels (start of the page's direction).
  if (col.kind === 'long' || col.kind === 'text')
    return (
      <span className="block whitespace-pre-line">
        <bdi>{text}</bdi>
      </span>
    );
  return (
    <span className={cn((col.kind === 'number' || col.kind === 'money') && 'num')}>{text}</span>
  );
}

function Fields({ columns, row, ctx }: { columns: Column[]; row: RecordRow; ctx: FormatCtx }) {
  const { t, i18n } = useTranslation();
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
      {columns.map((col) => (
        <div key={col.key} className={cn(col.kind === 'long' && 'col-span-2')} data-field={col.key}>
          <dt className="text-muted text-xs">{colTitle(col, t, i18n.language)}</dt>
          <dd className="mt-0.5">
            <Value col={col} row={row} ctx={ctx} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-accent-ink text-xs font-semibold tracking-wide uppercase">{title}</h3>
      {children}
    </section>
  );
}

/** The record's own entries from the activity log: what happened, who, when. */
function History({
  vehicle,
  entries,
}: {
  vehicle: VehicleDetail;
  entries: NonNullable<ReturnType<typeof useRecord>['data']>['history'];
}) {
  const { t, i18n } = useTranslation();
  const { data: lookups } = useLookups();
  const when = dateFormat(localeOf(i18n.language), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  if (!entries.length) return <p className="text-muted text-sm">{t('report.noHistory')}</p>;
  return (
    <ol className="border-border space-y-3 border-s ps-4" data-testid="report-history">
      {entries.map((e) => {
        const Icon = EVENT_ICON[e.type];
        return (
          <li key={e.id} className="relative">
            <span
              aria-hidden
              className="bg-surface-strong border-border-strong absolute -start-[1.4rem] top-0.5 grid size-5 place-items-center rounded-full border"
            >
              <Icon className="text-muted size-3" />
            </span>
            <p className="text-sm">
              {describeEvent(
                t,
                { ...e, vehicle: { serial: vehicle.serial, type: vehicle.type } },
                lookups,
                i18n.language,
              )}
            </p>
            <p className="text-muted text-xs">
              <time dateTime={e.occurredAt} className="num">
                {when.format(new Date(e.occurredAt))}
              </time>
              {e.by && <> · {t('report.by', { name: e.by })}</>}
              {e.imported && <> · {t('events.imported')}</>}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * What was done so far about a malfunction (Revisions 1, fleet manager): dated updates, oldest
 * first, each with its author. Editors add and remove them.
 */
function ProgressLog({
  vehicle,
  malfunctionId,
  entries,
  canEdit,
}: {
  vehicle: VehicleDetail;
  malfunctionId: string;
  entries: ProgressEntry[];
  canEdit: boolean;
}) {
  const { t } = useTranslation();
  const ctx = useFormatCtx(vehicle.usageUnit);
  const { add, remove } = useProgress(vehicle.serial, malfunctionId);
  const [body, setBody] = useState('');
  const [at, setAt] = useState(() => localDay());
  const [failed, setFailed] = useState(false);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    setFailed(false);
    add.mutate(
      { at: at || null, body: body.trim() },
      { onSuccess: () => setBody(''), onError: () => setFailed(true) },
    );
  };
  return (
    <div className="space-y-3" data-testid="progress-log">
      {entries.length === 0 ? (
        <p className="text-muted text-sm">{t('report.noProgress')}</p>
      ) : (
        <ol className="border-border space-y-3 border-s-2 ps-4">
          {entries.map((p) => (
            <li key={p.id} className="relative" data-progress={p.id}>
              <span
                aria-hidden
                className="absolute -start-[1.3rem] top-1.5 size-2.5 rounded-full bg-[var(--fh-accent)]"
              />
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-muted text-xs">
                    <span className="num">{ctx.date(p.at)}</span>
                    {p.createdBy && <> · {t('report.by', { name: p.createdBy })}</>}
                  </p>
                  <p className="mt-0.5 text-sm">
                    <span className="block whitespace-pre-line">
                      <bdi>{p.body}</bdi>
                    </span>
                  </p>
                </div>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => remove.mutate(p.id)}
                    disabled={remove.isPending}
                    aria-label={t('report.removeProgress')}
                    title={t('report.removeProgress')}
                    className="text-muted hover:text-bad grid size-7 shrink-0 place-items-center rounded-md"
                  >
                    <Trash2 aria-hidden className="size-3.5" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
      {canEdit && (
        <form onSubmit={submit} className="space-y-2" data-testid="progress-form">
          <label className="block space-y-1">
            <span className="text-xs font-medium">{t('report.addProgress')}</span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={2}
              maxLength={2000}
              placeholder={t('report.progressPlaceholder')}
              className="border-border-strong bg-surface w-full rounded-md border px-2.5 py-2 text-sm focus-visible:outline-2 focus-visible:outline-[var(--fh-accent)]"
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1 text-xs">
              <span className="text-muted">{t('report.progressDate')}</span>
              <input
                type="date"
                value={at}
                max={localDay()}
                onChange={(e) => setAt(e.target.value)}
                className="border-border-strong bg-surface num h-8 rounded-md border px-2 text-xs"
              />
            </label>
            {failed && (
              <p role="alert" className="text-bad text-xs">
                {t('report.progressFailed')}
              </p>
            )}
            <Button
              type="submit"
              size="sm"
              className="ms-auto"
              disabled={!body.trim() || add.isPending}
            >
              {t('report.saveProgress')}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

interface LinkedReceipt {
  id: string;
  kind: 'RECEIPT' | 'INVOICE' | 'OTHER';
  date: string;
  vendor: string | null;
  amount: number | null;
}

/** A work card's receipts (Revisions 1). */
function Receipts({ row, ctx }: { row: RecordRow; ctx: FormatCtx }) {
  const { t } = useTranslation();
  const items = (Array.isArray(row.receipts) ? row.receipts : []) as LinkedReceipt[];
  if (!items.length) return <p className="text-muted text-sm">{t('report.noReceipts')}</p>;
  const total = items.reduce((sum, r) => sum + (r.amount ?? 0), 0);
  return (
    <ul
      className="border-border divide-border divide-y rounded-lg border"
      data-testid="report-receipts"
    >
      {items.map((r) => (
        <li key={r.id} className="flex items-center gap-2 px-3 py-2 text-sm">
          <ReceiptText aria-hidden className="text-muted size-4 shrink-0" />
          <span className="num text-muted shrink-0 text-xs">{ctx.date(r.date)}</span>
          <span className="min-w-0 flex-1 truncate">
            {r.vendor ? <bdi>{r.vendor}</bdi> : t(`records.documentKind.${r.kind}`)}
          </span>
          {r.amount !== null && <span className="num shrink-0">{ctx.money(r.amount)}</span>}
        </li>
      ))}
      {items.length > 1 && (
        <li className="flex justify-end px-3 py-2 text-sm font-medium">
          <span className="num">{ctx.money(total)}</span>
        </li>
      )}
    </ul>
  );
}

/** Photos shown large; other files as links. */
function Files({ serial, row }: { serial: string; row: RecordRow }) {
  const { t } = useTranslation();
  const photos = row.attachments.filter((a) => a.hasThumb);
  const others = row.attachments.filter((a) => !a.hasThumb);
  if (!row.attachments.length) return <p className="text-muted text-sm">{t('report.noFiles')}</p>;
  return (
    <div className="space-y-2">
      {photos.length > 0 && (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3" data-testid="report-photos">
          {photos.map((a) => (
            <li key={a.id}>
              <a
                href={attachmentUrl(a)}
                target="_blank"
                rel="noreferrer"
                title={a.fileName}
                className="border-border hover:border-border-strong block overflow-hidden rounded-lg border"
              >
                <img
                  src={attachmentUrl(a, 'thumb')}
                  alt={a.fileName}
                  loading="lazy"
                  className="aspect-[4/3] w-full object-cover"
                />
              </a>
            </li>
          ))}
        </ul>
      )}
      {others.length > 0 && <AttachmentList serial={serial} items={others} canEdit={false} />}
    </div>
  );
}

function OneRecord({
  vehicle,
  kind,
  id,
  reduced,
  onBack,
  close,
}: {
  vehicle: VehicleDetail;
  kind: RecordKind;
  id: string;
  reduced: boolean;
  onBack?: () => void;
  close: () => void;
}) {
  const { t } = useTranslation();
  const ui = KIND_UI[kind];
  const columns = useKindColumns(kind);
  const ctx = useFormatCtx(vehicle.usageUnit);
  const { data: user } = useSession();
  const record = useRecord(vehicle.serial, kind, id);
  const [editing, setEditing] = useState(false);
  const row = record.data?.item;
  const canEdit =
    !!user &&
    !!row &&
    (hasRole(user.role, 'EDITOR') || (kind === 'notes' && row.createdById === user.id));

  // The edit form takes the report's place, then the report comes back with the new values.
  if (editing && row)
    return (
      <RecordForm
        serial={vehicle.serial}
        kind={kind}
        unit={vehicle.usageUnit}
        location={vehicle.location}
        row={row}
        canEdit={canEdit}
        reduced={reduced}
        onClose={() => setEditing(false)}
        onSaved={() => setEditing(false)}
      />
    );

  const dateCol = ui.columns.find((c) => c.key === ui.dateKey);
  const title = t('report.title', { record: t(`vehicle.records.one.${kind}`) });
  const subtitle = (
    <>
      <bdi dir="ltr">{vehicle.serial}</bdi>
      {row && dateCol && <> · {cellText(dateCol, row, ctx)}</>}
    </>
  );
  const open = kind === 'malfunctions' && row && row.state !== 'RESOLVED';

  return (
    <ResizableSheet
      title={title}
      subtitle={subtitle}
      onClose={close}
      reduced={reduced}
      testId="record-report"
      footer={
        row && (
          <div className="flex items-center gap-2">
            {onBack && (
              <Button variant="ghost" size="sm" onClick={onBack}>
                {t('report.backToList')}
              </Button>
            )}
            <span className="text-muted me-auto truncate text-xs">
              {row.createdBy && t('report.addedBy', { name: row.createdBy })}
            </span>
            {canEdit && (
              <Button size="sm" onClick={() => setEditing(true)} data-testid="report-edit">
                <Pencil aria-hidden />
                {t('records.edit')}
              </Button>
            )}
          </div>
        )
      }
    >
      {record.isPending ? (
        <Loader2 aria-hidden className="text-muted mx-auto my-8 size-5 animate-spin" />
      ) : record.isError || !row ? (
        <p role="alert" className="text-bad py-6 text-center text-sm">
          {t('report.notFound')}
        </p>
      ) : (
        <div className="space-y-6" data-kind={kind} data-record-id={row.id}>
          {open && (
            <p className="text-warn inline-flex items-center gap-1.5 text-sm font-medium">
              <TriangleAlert aria-hidden className="size-4" />
              {t('report.stillOpen')}
            </p>
          )}
          {kind === 'malfunctions' ? (
            <>
              {MALFUNCTION_PARTS.map((part) => (
                <Section key={part.title} title={t(part.title)}>
                  <Fields
                    columns={part.keys
                      .map((k) => ui.columns.find((c) => c.key === k))
                      .filter((c): c is Column => !!c)}
                    row={row}
                    ctx={ctx}
                  />
                </Section>
              ))}
              <Section title={t('report.progress')}>
                <ProgressLog
                  vehicle={vehicle}
                  malfunctionId={row.id}
                  entries={(row.progress as ProgressEntry[] | undefined) ?? []}
                  canEdit={!!user && hasRole(user.role, 'EDITOR')}
                />
              </Section>
            </>
          ) : (
            <Section title={t('report.details')}>
              <Fields columns={columns} row={row} ctx={ctx} />
            </Section>
          )}
          {kind === 'workCards' && (
            <Section title={t('report.receipts')}>
              <Receipts row={row} ctx={ctx} />
            </Section>
          )}
          <Section title={t('records.files')}>
            <Files serial={vehicle.serial} row={row} />
          </Section>
          <Section title={t('report.history')}>
            <History vehicle={vehicle} entries={record.data.history} />
          </Section>
        </div>
      )}
    </ResizableSheet>
  );
}

/** The vehicle's open and in-progress malfunctions, to pick one to read. */
function OpenMalfunctions({
  vehicle,
  reduced,
  onPick,
  close,
  autoPick,
}: {
  vehicle: VehicleDetail;
  reduced: boolean;
  onPick: (id: string, auto: boolean) => void;
  close: () => void;
  /** With only one open, go straight to it (not when coming back to the list from it). */
  autoPick: boolean;
}) {
  const { t } = useTranslation();
  const ctx = useFormatCtx(vehicle.usageUnit);
  const ui = KIND_UI.malfunctions;
  const base = `/vehicles/${encodeURIComponent(vehicle.serial)}/records/malfunctions`;
  const list = useQuery({
    queryKey: ['records', vehicle.serial, 'malfunctions', 'open-list'],
    queryFn: async () => {
      const [open, working] = await Promise.all([
        api<RecordPage>(`${base}?state=OPEN&limit=50`),
        api<RecordPage>(`${base}?state=IN_PROGRESS&limit=50`),
      ]);
      return [...open.items, ...working.items];
    },
  });
  const summary = (row: RecordRow) =>
    SUMMARY_KEYS.map((k) =>
      cellText(
        ui.columns.find((c) => c.key === k)!,
        row,
        ctx,
      ),
    ).join(' · ');
  const single = autoPick && list.data?.length === 1 ? list.data[0]!.id : null;
  const picked = useRef(false);
  useEffect(() => {
    if (!single || picked.current) return;
    picked.current = true;
    onPick(single, true);
  }, [single, onPick]);
  if (single) return null;
  return (
    <ResizableSheet
      title={t('report.openTitle')}
      subtitle={<bdi dir="ltr">{vehicle.serial}</bdi>}
      onClose={close}
      reduced={reduced}
      testId="record-report"
    >
      {list.isPending ? (
        <Loader2 aria-hidden className="text-muted mx-auto my-8 size-5 animate-spin" />
      ) : list.isError ? (
        <p role="alert" className="text-bad py-6 text-center text-sm">
          {t('records.error.load')}
        </p>
      ) : list.data.length === 0 ? (
        <p className="text-muted py-6 text-center text-sm">{t('report.noneOpen')}</p>
      ) : (
        <ul className="space-y-2" data-testid="open-malfunctions">
          {list.data.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => onPick(row.id, false)}
                className="border-border hover:border-border-strong hover:bg-border/40 flex w-full items-start gap-3 rounded-lg border p-3 text-start"
              >
                <TriangleAlert aria-hidden className="text-warn mt-0.5 size-4 shrink-0" />
                <span className="min-w-0 flex-1">
                  <bdi className="line-clamp-2 block text-sm">{String(row.description ?? '')}</bdi>
                  <span className="text-muted text-xs">{summary(row)}</span>
                </span>
                <ChevronRight aria-hidden className="text-muted mt-0.5 size-4 rtl:-scale-x-100" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </ResizableSheet>
  );
}

/** The record report (Revisions 1), opened from `?record=` on the vehicle page. */
export default function RecordReport({
  vehicle,
  target,
  reduced,
}: {
  vehicle: VehicleDetail;
  target: ReportTarget;
  reduced: boolean;
}) {
  const link = useRecordLink();
  const { open } = link;
  // Picked from the open list: Back in the footer returns to the list.
  const [fromList, setFromList] = useState(false);
  const [listed, setListed] = useState(false);
  const pick = useCallback(
    (id: string, auto: boolean) => {
      setFromList(!auto);
      setListed(true);
      open('malfunctions', id);
    },
    [open],
  );
  if (target.id === 'open')
    return (
      <OpenMalfunctions
        vehicle={vehicle}
        reduced={reduced}
        close={link.close}
        onPick={pick}
        autoPick={!listed}
      />
    );
  return (
    <OneRecord
      key={`${target.kind}.${target.id}`}
      vehicle={vehicle}
      kind={target.kind}
      id={target.id}
      reduced={reduced}
      close={link.close}
      onBack={fromList ? () => link.open('malfunctions', 'open') : undefined}
    />
  );
}
