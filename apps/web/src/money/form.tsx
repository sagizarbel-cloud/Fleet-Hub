import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';

export const INPUT =
  'border-border-strong bg-surface h-9 w-full rounded-md border px-2.5 text-sm focus-visible:outline-2 focus-visible:outline-[var(--fh-accent)] aria-[invalid=true]:border-bad';

export type Errors = Record<string, string>;

/** Schema issues as message keys, by the first part of their path (e.g. "lines.0.item" → "lines.0.item"). */
export function issuesToErrors(
  issues: readonly { path: readonly PropertyKey[]; code: string; message?: string }[],
  isEmpty: (field: string) => boolean,
  messages: Record<string, string> = {},
): Errors {
  const out: Errors = {};
  for (const issue of issues) {
    const field = issue.path.map(String).join('.');
    if (out[field]) continue;
    out[field] = isEmpty(field)
      ? 'records.error.required'
      : (messages[issue.message ?? ''] ??
        (issue.message === 'future'
          ? 'records.error.future'
          : issue.code === 'too_small'
            ? 'records.error.tooSmall'
            : issue.code === 'too_big'
              ? 'records.error.tooBig'
              : 'records.error.invalid'));
  }
  return out;
}

/** A label, the control, and its error underneath. */
export function Labeled({
  id,
  label,
  required,
  error,
  hint,
  className,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className={cn('space-y-1', className)}>
      <label htmlFor={id} className="block text-xs font-medium">
        {label}
        {required && (
          <span aria-hidden className="text-bad ms-0.5">
            *
          </span>
        )}
      </label>
      {children}
      {hint && !error && <p className="text-muted text-xs">{hint}</p>}
      {error && (
        <p id={`${id}-error`} className="text-bad text-xs">
          {t(error as never)}
        </p>
      )}
    </div>
  );
}

/** aria props for a control under `Labeled`. */
export const errorProps = (id: string, error?: string) => ({
  id,
  'aria-invalid': !!error || undefined,
  'aria-describedby': error ? `${id}-error` : undefined,
});
