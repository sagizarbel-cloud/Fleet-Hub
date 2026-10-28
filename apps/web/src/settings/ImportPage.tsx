import { useMemo, useState, type DragEvent } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, FileSpreadsheet, Loader2, Upload } from 'lucide-react';
import {
  guessMapping,
  headerSignature,
  IMPORT_FIELDS,
  IMPORT_MAX_ROWS,
  IMPORT_TARGETS,
  type ImportAction,
  type ImportBody,
  type ImportTarget,
} from '@fleet-hub/shared';
import { Button } from '@/components/ui/button';
import { isolate } from '@/lib/bidi';
import { cn } from '@/lib/cn';
import { INPUT } from '@/money/form';
import { fetchSavedMapping, useRunImport, type ImportResult, type ImportRow } from './api';
import { Panel } from './MySettings';
import { readWorkbook, type SheetData } from './readSheet';

const XLSX = '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const ACTION_TONE: Record<ImportAction, string> = {
  create: 'text-ok border-ok/40',
  update: 'text-accent-ink border-accent/50',
  unchanged: 'text-muted border-border',
  duplicate: 'text-muted border-border',
  error: 'text-bad border-bad/50',
};
const KNOWN_ERRORS = new Set([
  'required',
  'unknown',
  'date',
  'number',
  'bool',
  'choice',
  'taken',
  'vin',
  'plate',
  'serial',
  'future',
  'too_small',
  'too_big',
  'invalid_type',
  'before_reported',
  'before_date',
  'same',
]);

type Mapping = ImportBody['mapping'];

/**
 * Excel import (admins): pick a file and a sheet, say what it holds, match its columns
 * (remembered for the next sheet with the same headers), check a dry run, then import.
 */
export default function ImportPage() {
  const { t } = useTranslation();
  const run = useRunImport();
  const [fileName, setFileName] = useState<string | null>(null);
  const [sheets, setSheets] = useState<SheetData[] | null>(null);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState(false);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [target, setTarget] = useState<ImportTarget>('vehicles');
  const [mapping, setMapping] = useState<Mapping>({});
  const [savedMatch, setSavedMatch] = useState(false);
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [done, setDone] = useState<ImportResult | null>(null);
  const [problemsOnly, setProblemsOnly] = useState(false);
  const [over, setOver] = useState(false);

  const sheet = sheets?.[sheetIndex] ?? null;

  /** A new sheet or target: start from the saved matching, else a guess from the headers. */
  const rematch = async (s: SheetData | null, tg: ImportTarget) => {
    setPreview(null);
    setDone(null);
    if (!s) return;
    const guess = guessMapping(tg, s.headers);
    setMapping(guess);
    setSavedMatch(false);
    const saved = await fetchSavedMapping(tg, headerSignature(s.headers)).catch(() => null);
    if (saved) {
      setMapping({ ...guess, ...saved });
      setSavedMatch(true);
    }
  };

  const open = async (file: File) => {
    setReading(true);
    setReadError(false);
    setSheets(null);
    setFileName(file.name);
    try {
      const all = await readWorkbook(await file.arrayBuffer());
      setSheets(all);
      const first = Math.max(
        0,
        all.findIndex((s) => s.rows.length > 0),
      );
      setSheetIndex(first);
      await rematch(all[first] ?? null, target);
    } catch {
      setReadError(true);
    } finally {
      setReading(false);
    }
  };

  const body = (): ImportBody | null =>
    sheet && fileName
      ? {
          fileName,
          sheet: sheet.name,
          headers: sheet.headers,
          mapping: Object.fromEntries(
            IMPORT_FIELDS[target].map((f) => [f.key, mapping[f.key] ?? null]),
          ),
          rows: sheet.rows,
        }
      : null;
  const missing = IMPORT_FIELDS[target].filter(
    (f) =>
      f.required &&
      // Re-imported vehicles keep what a sheet leaves out; only the serial is a must.
      (target !== 'vehicles' || f.key === 'serial') &&
      (mapping[f.key] === null || mapping[f.key] === undefined),
  );
  const canRun = !!sheet && sheet.rows.length > 0 && missing.length === 0 && !run.isPending;

  const dryRun = () => {
    const b = body();
    if (!b) return;
    setDone(null);
    run.mutate({ target, body: b, commit: false }, { onSuccess: setPreview });
  };
  const commit = () => {
    const b = body();
    if (!b) return;
    run.mutate(
      { target, body: b, commit: true },
      {
        onSuccess: (r) => {
          setDone(r);
          setPreview(null);
        },
      },
    );
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const file = e.dataTransfer.files[0];
    if (file) void open(file);
  };

  const fieldLabel = (key: string) => t(`import.field.${key}` as never);
  const sample = (col: number | null | undefined) => {
    if (col === null || col === undefined || !sheet) return null;
    const v = sheet.rows.find((r) => r[col] !== null)?.[col];
    return v === undefined || v === null ? null : String(v);
  };
  const sheetRow = (row: number) => row - 2 + (sheet?.headerRow ?? 1) + 1;

  return (
    <div className="space-y-3">
      <Panel title={t('import.file.title')} hint={t('import.file.hint', { max: IMPORT_MAX_ROWS })}>
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={onDrop}
          className={cn(
            'border-border-strong hover:bg-border/40 flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed p-6 text-center text-sm transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--fh-accent)]',
            over && 'border-accent bg-accent/10',
          )}
          data-testid="import-drop"
        >
          {reading ? (
            <Loader2 aria-hidden className="text-muted size-6 animate-spin" />
          ) : (
            <Upload aria-hidden className="text-muted size-6" />
          )}
          <span>{fileName ? <bdi>{fileName}</bdi> : t('import.file.choose')}</span>
          <span className="text-muted text-xs">{t('import.file.types')}</span>
          <input
            type="file"
            accept={XLSX}
            className="sr-only"
            data-testid="import-file"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void open(file);
              e.target.value = '';
            }}
          />
        </label>
        {readError && (
          <p role="alert" className="text-bad text-sm">
            {t('import.file.unreadable')}
          </p>
        )}
      </Panel>

      {sheets && (
        <Panel title={t('import.sheet.title')}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-xs font-medium">
              <span>{t('import.sheet.sheet')}</span>
              <select
                value={sheetIndex}
                onChange={(e) => {
                  const i = Number(e.target.value);
                  setSheetIndex(i);
                  void rematch(sheets[i] ?? null, target);
                }}
                className={INPUT}
                data-testid="import-sheet"
              >
                {sheets.map((s, i) => (
                  <option key={s.name} value={i}>
                    {t('import.sheet.option', { name: s.name, rows: s.rows.length })}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs font-medium">
              <span>{t('import.sheet.holds')}</span>
              <select
                value={target}
                onChange={(e) => {
                  const tg = e.target.value as ImportTarget;
                  setTarget(tg);
                  void rematch(sheet, tg);
                }}
                className={INPUT}
                data-testid="import-target"
              >
                {IMPORT_TARGETS.map((tg) => (
                  <option key={tg} value={tg}>
                    {t(`import.target.${tg}`)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {sheet && sheet.cut > 0 && (
            <p className="text-warn text-xs">
              {t('import.sheet.cut', { max: IMPORT_MAX_ROWS, cut: sheet.cut })}
            </p>
          )}
          {sheet && sheet.rows.length === 0 && (
            <p className="text-muted text-sm">{t('import.sheet.empty')}</p>
          )}
        </Panel>
      )}

      {sheet && sheet.rows.length > 0 && (
        <Panel
          title={t('import.match.title')}
          hint={t(savedMatch ? 'import.match.saved' : 'import.match.hint')}
        >
          <div className="grid gap-x-4 gap-y-2 md:grid-cols-2" data-testid="import-mapping">
            {IMPORT_FIELDS[target].map((f) => {
              const required = f.required && (target !== 'vehicles' || f.key === 'serial');
              const col = mapping[f.key];
              const ex = sample(col);
              return (
                <label
                  key={f.key}
                  className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] items-center gap-2 text-sm"
                >
                  <span className="truncate">
                    {fieldLabel(f.key)}
                    {required && (
                      <span aria-hidden className="text-bad ms-0.5">
                        *
                      </span>
                    )}
                  </span>
                  <span className="min-w-0">
                    <select
                      value={col ?? ''}
                      onChange={(e) =>
                        setMapping((m) => ({
                          ...m,
                          [f.key]: e.target.value === '' ? null : Number(e.target.value),
                        }))
                      }
                      aria-invalid={(required && (col === null || col === undefined)) || undefined}
                      className={cn(INPUT, 'h-8')}
                      data-field={f.key}
                    >
                      <option value="">{t('import.match.none')}</option>
                      {sheet.headers.map((h, i) => (
                        <option key={i} value={i}>
                          {h || t('import.match.column', { n: i + 1 })}
                        </option>
                      ))}
                    </select>
                    {ex && (
                      <span className="text-muted block truncate text-xs" title={ex}>
                        {t('import.match.example', { value: isolate(ex) })}
                      </span>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
          {target === 'vehicles' && (
            <p className="text-muted text-xs">{t('import.match.vehiclesNote')}</p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={dryRun} disabled={!canRun} data-testid="import-preview">
              {run.isPending && !preview ? <Loader2 aria-hidden className="animate-spin" /> : null}
              {t('import.preview')}
            </Button>
            {missing.length > 0 && (
              <p className="text-bad text-xs" role="status">
                {t('import.match.missing', {
                  fields: missing.map((f) => fieldLabel(f.key)).join(', '),
                })}
              </p>
            )}
            {run.isError && (
              <p role="alert" className="text-bad text-xs">
                {t('import.failed')}
              </p>
            )}
          </div>
        </Panel>
      )}

      {preview && (
        <Panel title={t('import.result.previewTitle')} hint={t('import.result.previewHint')}>
          <Counts result={preview} dry />
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={problemsOnly}
              onChange={() => setProblemsOnly((v) => !v)}
              className="accent-[var(--fh-accent)]"
            />
            {t('import.result.problemsOnly')}
          </label>
          <Results
            rows={preview.results.filter((r) => !problemsOnly || r.action === 'error')}
            sheetRow={sheetRow}
            fieldLabel={fieldLabel}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={commit}
              disabled={run.isPending || preview.counts.created + preview.counts.updated === 0}
              data-testid="import-commit"
            >
              {run.isPending ? (
                <Loader2 aria-hidden className="animate-spin" />
              ) : (
                <FileSpreadsheet aria-hidden />
              )}
              {t('import.commit', { count: preview.counts.created + preview.counts.updated })}
            </Button>
            {preview.counts.errors > 0 && (
              <p className="text-muted text-xs">{t('import.result.errorsSkipped')}</p>
            )}
          </div>
        </Panel>
      )}

      {done && (
        <Panel title={t('import.result.doneTitle')}>
          <p className="flex items-center gap-2 text-sm" role="status" data-testid="import-done">
            <CheckCircle2 aria-hidden className="text-ok size-5" />
            {t('import.result.done')}
          </p>
          <Counts result={done} />
          <Button asChild variant="outline" size="sm">
            <Link to="/">{t('import.result.toDashboard')}</Link>
          </Button>
        </Panel>
      )}
    </div>
  );
}

function Counts({ result, dry }: { result: ImportResult; dry?: boolean }) {
  const { t } = useTranslation();
  const c = result.counts;
  const items = [
    ['created', c.created, 'text-ok'],
    ['updated', c.updated, 'text-accent-ink'],
    ['skipped', c.skipped - c.errors, 'text-muted'],
    ['errors', c.errors, 'text-bad'],
  ] as const;
  return (
    <dl className="flex flex-wrap gap-4" data-testid="import-counts">
      {items.map(([k, n, tone]) => (
        <div key={k} className="min-w-20">
          <dt className="text-muted text-xs">{t(`import.count.${dry ? 'will' : 'did'}.${k}`)}</dt>
          <dd className={cn('num text-2xl font-semibold', n > 0 && tone)}>{n}</dd>
        </div>
      ))}
    </dl>
  );
}

const RESULT_LIMIT = 500;

function Results({
  rows,
  sheetRow,
  fieldLabel,
}: {
  rows: ImportRow[];
  sheetRow: (row: number) => number;
  fieldLabel: (key: string) => string;
}) {
  const { t } = useTranslation();
  const shown = useMemo(() => rows.slice(0, RESULT_LIMIT), [rows]);
  if (!rows.length) return <p className="text-muted text-sm">{t('import.result.none')}</p>;
  return (
    <div className="border-border max-h-[28rem] overflow-auto rounded-lg border">
      <table className="w-full min-w-[34rem] text-sm" data-testid="import-results">
        <thead className="bg-surface-strong text-muted sticky top-0 text-xs">
          <tr>
            <th className="px-2 py-1.5 text-start font-medium">{t('import.result.row')}</th>
            <th className="px-2 py-1.5 text-start font-medium">{t('import.result.key')}</th>
            <th className="px-2 py-1.5 text-start font-medium">{t('import.result.action')}</th>
            <th className="px-2 py-1.5 text-start font-medium">{t('import.result.details')}</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <tr key={r.row} className="border-border border-t" data-action={r.action}>
              <td className="num px-2 py-1">{sheetRow(r.row)}</td>
              <td className="px-2 py-1">
                {r.key && (
                  <bdi dir="ltr" className="num">
                    {r.key}
                  </bdi>
                )}
              </td>
              <td className="px-2 py-1">
                <span
                  className={cn('rounded-full border px-2 py-px text-xs', ACTION_TONE[r.action])}
                >
                  {t(`import.action.${r.action}`)}
                </span>
              </td>
              <td className="px-2 py-1 text-xs">
                {r.errors.length
                  ? r.errors
                      .map((e) =>
                        t('import.error.line', {
                          field: e.field ? fieldLabel(e.field) : t('import.error.row'),
                          problem: t(
                            `import.error.${KNOWN_ERRORS.has(e.code) ? e.code : 'invalid'}` as never,
                          ),
                        }),
                      )
                      .join(' · ')
                  : r.changes?.length
                    ? r.changes.map((f) => t(`vehicleForm.field.${f}` as never)).join(', ')
                    : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > RESULT_LIMIT && (
        <p className="text-muted p-2 text-xs">
          {t('import.result.more', { n: rows.length - RESULT_LIMIT })}
        </p>
      )}
    </div>
  );
}
