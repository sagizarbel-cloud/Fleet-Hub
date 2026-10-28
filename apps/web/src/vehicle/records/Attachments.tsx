import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Camera, FileText, Loader2, Paperclip, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { ACCEPT, attachmentUrl, useAttachmentDelete, type Attachment } from './api';
import { useOfferUndo } from './Undo';
import { isolate } from '@/lib/bidi';

const MAX_MB = 20;

/** Thumbnails and file links; editors can remove a file (with Undo). */
export function AttachmentList({
  serial,
  items,
  canEdit,
  compact = false,
}: {
  serial: string;
  items: Attachment[];
  canEdit: boolean;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const remove = useAttachmentDelete(serial);
  const offerUndo = useOfferUndo();
  if (!items.length) return null;
  return (
    <ul className={cn('flex flex-wrap gap-2', compact && 'gap-1')} data-testid="attachments">
      {items.map((a) => (
        <li key={a.id} className="group relative">
          <a
            href={attachmentUrl(a)}
            target="_blank"
            rel="noreferrer"
            title={t('receipts.openFile', { name: isolate(a.fileName) })}
            className={cn(
              'border-border hover:border-border-strong bg-surface flex items-center gap-2 overflow-hidden rounded-lg border',
              compact ? 'size-10 justify-center' : 'h-14 max-w-56 pe-3',
            )}
          >
            {a.hasThumb ? (
              <img
                src={attachmentUrl(a, 'thumb')}
                alt=""
                loading="lazy"
                className={cn('shrink-0 object-cover', compact ? 'size-10' : 'size-14')}
              />
            ) : (
              <FileText aria-hidden className={cn('text-muted shrink-0', !compact && 'ms-3')} />
            )}
            {!compact && (
              <span className="min-w-0 text-xs">
                <span className="block truncate">{a.fileName}</span>
                <span className="text-muted num">
                  {t('records.kb', { value: Math.max(1, Math.round(a.sizeBytes / 1024)) })}
                </span>
              </span>
            )}
          </a>
          {canEdit && !compact && (
            <button
              type="button"
              onClick={() =>
                remove.mutate(
                  { id: a.id, deleted: true },
                  {
                    onSuccess: () =>
                      offerUndo(t('records.fileRemoved', { name: isolate(a.fileName) }), () =>
                        remove.mutateAsync({ id: a.id, deleted: false }),
                      ),
                  },
                )
              }
              aria-label={t('records.removeFile', { name: isolate(a.fileName) })}
              title={t('records.removeFile', { name: isolate(a.fileName) })}
              className="bg-surface-strong border-border text-muted hover:text-bad absolute -end-1.5 -top-1.5 grid size-6 place-items-center rounded-full border"
            >
              <X aria-hidden className="size-3.5" />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

/** "Attach files" and, on phones, "Take photo". Picked files wait in `files` until the form saves. */
export function FilePicker({
  files,
  onChange,
  busy,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  busy?: boolean;
}) {
  const { t } = useTranslation();
  const pick = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const [tooBig, setTooBig] = useState<string | null>(null);

  const add = (list: FileList | null) => {
    if (!list) return;
    const ok: File[] = [];
    for (const f of Array.from(list)) {
      if (f.size > MAX_MB * 1024 * 1024) setTooBig(f.name);
      else ok.push(f);
    }
    onChange([...files, ...ok]);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => pick.current?.click()}
          className="border-border-strong hover:bg-border inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs"
        >
          <Paperclip aria-hidden className="size-3.5" />
          {t('records.attach')}
        </button>
        <button
          type="button"
          onClick={() => camera.current?.click()}
          className="border-border-strong hover:bg-border inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs sm:hidden"
        >
          <Camera aria-hidden className="size-3.5" />
          {t('records.takePhoto')}
        </button>
        {busy && <Loader2 aria-hidden className="text-muted size-4 animate-spin self-center" />}
        <input
          ref={pick}
          type="file"
          multiple
          accept={ACCEPT}
          hidden
          data-testid="file-input"
          onChange={(e) => {
            add(e.target.files);
            e.target.value = '';
          }}
        />
        <input
          ref={camera}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => {
            add(e.target.files);
            e.target.value = '';
          }}
        />
      </div>
      <p className="text-muted text-xs">{t('records.fileLimits', { mb: MAX_MB })}</p>
      {tooBig && (
        <p role="alert" className="text-bad text-xs">
          {t('records.fileTooBig', { name: tooBig, mb: MAX_MB })}
        </p>
      )}
      {files.length > 0 && (
        <ul className="space-y-1 text-xs">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center gap-2">
              <Paperclip aria-hidden className="text-muted size-3.5" />
              <span className="min-w-0 flex-1 truncate">{f.name}</span>
              <button
                type="button"
                onClick={() => onChange(files.filter((_, j) => j !== i))}
                aria-label={t('records.removeFile', { name: isolate(f.name) })}
                title={t('records.removeFile', { name: isolate(f.name) })}
                className="text-muted hover:text-bad"
              >
                <X aria-hidden className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
