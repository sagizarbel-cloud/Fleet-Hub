import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Copy, Eye, EyeOff, KeyRound } from 'lucide-react';
import { useSession } from '@/auth/session';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useRevealStartCode } from './data';

const COPIED_MS = 1500;
const REVEAL_MS = 30_000;
const MASK = '••••';

/** One identity number (Serial, VIN, License): large mono numerals, click to copy. */
export function CopyId({
  label,
  value,
  large,
}: {
  label: string;
  value: string | null;
  large?: boolean;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const timer = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = () => {
    if (!value) return;
    void navigator.clipboard?.writeText(value).then(() => {
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), COPIED_MS);
    });
  };

  return (
    <div className="min-w-0">
      <dt className="text-muted text-xs">{label}</dt>
      <dd>
        {value ? (
          <button
            type="button"
            onClick={copy}
            title={t('vehicle.copy')}
            aria-label={`${label}: ${value}. ${t('vehicle.copy')}`}
            className={cn(
              'group hover:text-accent-ink inline-flex max-w-full items-center gap-2 rounded-md text-start transition-colors',
              large ? 'num text-2xl font-medium sm:text-3xl' : 'num text-lg',
            )}
            data-copy={value}
          >
            <bdi dir="ltr" className="truncate">
              {value}
            </bdi>
            {copied ? (
              <Check aria-hidden className="text-ok size-4 shrink-0" />
            ) : (
              <Copy
                aria-hidden
                className="size-4 shrink-0 opacity-0 transition-opacity group-hover:opacity-60 group-focus-visible:opacity-60"
              />
            )}
          </button>
        ) : (
          <span className="text-muted text-lg">{t('dashboard.notSet')}</span>
        )}
        <span role="status" className="sr-only">
          {copied ? t('vehicle.copied') : ''}
        </span>
      </dd>
    </div>
  );
}

/**
 * The start code, masked. Users with the "view start codes" permission can reveal it; each
 * reveal is a fresh, audited request, and the code hides itself again after 30 seconds.
 */
export function StartCodeChip({ serial }: { serial: string }) {
  const { t } = useTranslation();
  const { data: user } = useSession();
  const reveal = useRevealStartCode(serial);
  const [code, setCode] = useState<string | null>(null);
  const timer = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);

  const show = () =>
    reveal.mutate(undefined, {
      onSuccess: (res) => {
        setCode(res.code);
        clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setCode(null), REVEAL_MS);
      },
    });
  const hide = () => {
    clearTimeout(timer.current);
    setCode(null);
  };

  const error =
    reveal.error instanceof ApiError && reveal.error.status === 429
      ? t('vehicle.startCode.tooMany')
      : reveal.error
        ? t('vehicle.startCode.failed')
        : null;

  return (
    <div className="min-w-0" data-testid="start-code">
      <dt className="text-muted text-xs">{t('vehicle.startCode.label')}</dt>
      <dd className="flex flex-wrap items-center gap-2">
        <span className="border-border-strong bg-surface-strong inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5">
          <KeyRound aria-hidden className="text-muted size-3.5" />
          <span className="num text-lg tracking-widest" data-testid="start-code-value">
            <bdi dir="ltr">{code ?? MASK}</bdi>
          </span>
        </span>
        {user?.canViewStartCodes &&
          (code ? (
            <button
              type="button"
              onClick={hide}
              className="text-muted hover:text-text inline-flex items-center gap-1 text-xs"
            >
              <EyeOff aria-hidden className="size-3.5" />
              {t('vehicle.startCode.hide')}
            </button>
          ) : (
            <button
              type="button"
              onClick={show}
              disabled={reveal.isPending}
              className="text-accent-ink inline-flex items-center gap-1 text-xs hover:underline disabled:opacity-50"
            >
              <Eye aria-hidden className="size-3.5" />
              {t('vehicle.startCode.reveal')}
            </button>
          ))}
        {error && (
          <span role="alert" className="text-bad text-xs">
            {error}
          </span>
        )}
      </dd>
    </div>
  );
}
