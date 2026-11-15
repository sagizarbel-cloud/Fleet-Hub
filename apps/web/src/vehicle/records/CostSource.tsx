import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { FileText, ReceiptText } from 'lucide-react';
import type { CostSourceKind } from '@fleet-hub/shared';
import type { RecordRow } from './api';
import type { FormatCtx } from './kinds';
import { isolate } from '@/lib/bidi';

/** What a service's cost links to (Sagi, 2026-11-15), as the API returns it. */
export interface CostSource {
  kind: CostSourceKind;
  id: string;
  /** A quote this user can't see: only that there is one. */
  hidden?: boolean;
  documentKind?: 'RECEIPT' | 'INVOICE' | 'OTHER';
  date?: string;
  /** The receipt's vendor or the quote's supplier. */
  label?: string | null;
  amount?: number | null;
  /** A receipt that counts in costs by itself (it isn't linked to a record). */
  counted?: boolean;
}

export const costSourceOf = (row: RecordRow | undefined): CostSource | null =>
  row?.costSource && typeof row.costSource === 'object' ? (row.costSource as CostSource) : null;

/** The page the link opens: that one receipt, or the quote's detail. */
export const costSourceHref = (s: CostSource) =>
  s.kind === 'receipt'
    ? `/receipts?id=${encodeURIComponent(s.id)}`
    : `/quotes?open=${encodeURIComponent(s.id)}`;

/** "Receipt · Garage · 12/11/2026", in the active language. */
export function costSourceText(s: CostSource, ctx: FormatCtx) {
  if (s.hidden) return ctx.t('records.costSource.hiddenQuote');
  const name =
    s.label ??
    (s.kind === 'receipt' && s.documentKind ? ctx.t(`records.documentKind.${s.documentKind}`) : '');
  return ctx.t(`records.costSource.${s.kind}`, {
    name: isolate(name),
    date: s.date ? ctx.date(s.date) : '',
  });
}

/** A link to the receipt or quote a service's cost comes from; icon only when `compact`. */
export function CostLink({
  source,
  ctx,
  compact,
}: {
  source: CostSource;
  ctx: FormatCtx;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const Icon = source.kind === 'receipt' ? ReceiptText : FileText;
  const text = costSourceText(source, ctx);
  if (source.hidden)
    return (
      <span className="text-muted inline-flex items-center gap-1 text-xs" title={text}>
        <Icon aria-hidden className="size-3.5 shrink-0" />
        {!compact && text}
        {compact && <span className="sr-only">{text}</span>}
      </span>
    );
  const open = t(`records.costSource.open_${source.kind}`, { name: text });
  return (
    <Link
      to={costSourceHref(source)}
      className="text-accent inline-flex min-w-0 items-center gap-1 underline-offset-2 hover:underline"
      aria-label={open}
      title={open}
      data-testid="cost-link"
    >
      <Icon aria-hidden className="size-3.5 shrink-0" />
      {!compact && <bdi className="truncate">{text}</bdi>}
    </Link>
  );
}

/**
 * A service's cost on screen: the amount, or its note when there is no amount, plus the link.
 * The record report shows the note as its own field, so there `withNote` is off.
 */
export function ServiceCost({
  row,
  ctx,
  compact,
  withNote = true,
}: {
  row: RecordRow;
  ctx: FormatCtx;
  compact?: boolean;
  withNote?: boolean;
}) {
  const source = costSourceOf(row);
  const amount = typeof row.cost === 'number' ? row.cost : null;
  const note = withNote && typeof row.costNote === 'string' ? row.costNote : null;
  if (amount === null && !note && !source) return <span className="text-muted">—</span>;
  return (
    <span className="inline-flex max-w-full flex-wrap items-center gap-x-1.5 gap-y-0.5">
      {amount !== null && <span className="num">{ctx.money(amount)}</span>}
      {note && (
        <bdi className="line-clamp-2" data-testid="cost-note">
          {note}
        </bdi>
      )}
      {source && <CostLink source={source} ctx={ctx} compact={compact} />}
    </span>
  );
}
