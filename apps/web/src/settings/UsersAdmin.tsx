import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Copy, KeyRound, Link2, MessageCircle, Plus } from 'lucide-react';
import { ROLES, userBody, type Role } from '@fleet-hub/shared';
import { useSession } from '@/auth/session';
import { Sheet } from '@/components/Sheet';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { prefersReducedMotion } from '@/lib/motion';
import { useDateFormat } from '@/fleet/FleetGrid';
import { errorProps, INPUT, issuesToErrors, Labeled, type Errors } from '@/money/form';
import {
  useCreateUser,
  useResetLink,
  useUpdateUser,
  useUsers,
  type AdminUser,
  type ResetLink,
} from './api';
import { SettingsSkeleton } from './SettingsPage';

const COPIED_MS = 1500;
const WHATSAPP = 'https://wa.me/';

/** Users and roles (SPEC 5.9, admins only). Users are turned off, never deleted. */
export function UsersAdmin() {
  const { t } = useTranslation();
  const { data: me } = useSession();
  const users = useUsers();
  const update = useUpdateUser();
  const resetLink = useResetLink();
  const [adding, setAdding] = useState(false);
  const [link, setLink] = useState<{ user: AdminUser; link: ResetLink; isNew: boolean } | null>(
    null,
  );
  const [reduced] = useState(prefersReducedMotion);
  const [failed, setFailed] = useState<string | null>(null);

  const change = (user: AdminUser, body: Partial<AdminUser>) => {
    setFailed(null);
    update.mutate({ id: user.id, body }, { onError: () => setFailed('records.error.save') });
  };
  const newLink = (user: AdminUser) => {
    setFailed(null);
    resetLink.mutate(user.id, {
      onSuccess: (l) => setLink({ user, link: l, isNew: false }),
      onError: () => setFailed('settings.users.linkFailed'),
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-muted me-auto text-sm">{t('settings.users.hint')}</p>
        <Button size="sm" onClick={() => setAdding(true)}>
          <Plus aria-hidden />
          {t('settings.users.add')}
        </Button>
      </div>
      {failed && (
        <p role="alert" className="text-bad text-sm">
          {t(failed as never)}
        </p>
      )}
      {users.isPending ? (
        <SettingsSkeleton />
      ) : users.isError ? (
        <div className="glass grid gap-3 p-6 text-center">
          <p>{t('settings.loadFailed')}</p>
          <Button
            variant="outline"
            size="sm"
            className="mx-auto"
            onClick={() => void users.refetch()}
          >
            {t('dashboard.retry')}
          </Button>
        </div>
      ) : (
        <ul className="grid gap-2" data-testid="users">
          {users.data.items.map((u) => {
            const self = u.id === me?.id;
            return (
              <li
                key={u.id}
                className={cn(
                  'glass flex flex-wrap items-center gap-x-4 gap-y-2 p-3',
                  !u.active && 'opacity-70',
                )}
                data-user={u.email}
              >
                <div className="min-w-0 flex-1 basis-56">
                  <div className="truncate font-medium">
                    {u.name}
                    {self && (
                      <span className="text-muted ms-2 text-xs">{t('settings.users.you')}</span>
                    )}
                  </div>
                  <div className="text-muted truncate text-xs">
                    <bdi dir="ltr">{u.email}</bdi>
                  </div>
                </div>
                <label className="flex items-center gap-2 text-xs">
                  <span className="text-muted">{t('settings.users.role')}</span>
                  <select
                    value={u.role}
                    disabled={self}
                    onChange={(e) => change(u, { role: e.target.value as Role })}
                    className={cn(INPUT, 'h-8 w-auto')}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {t(`user.role.${r}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={u.canViewStartCodes}
                    onChange={() => change(u, { canViewStartCodes: !u.canViewStartCodes })}
                    className="accent-[var(--fh-accent)]"
                  />
                  <KeyRound aria-hidden className="text-muted size-3.5" />
                  {t('settings.users.startCodes')}
                </label>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={u.active}
                    disabled={self}
                    onChange={() => change(u, { active: !u.active })}
                    className="accent-[var(--fh-accent)]"
                  />
                  {t(u.active ? 'settings.users.active' : 'settings.users.off')}
                </label>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!u.active || resetLink.isPending}
                  onClick={() => newLink(u)}
                  title={t('settings.users.resetHint')}
                >
                  <Link2 aria-hidden />
                  {t('settings.users.resetLink')}
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      {adding && (
        <AddUser
          reduced={reduced}
          onClose={() => setAdding(false)}
          onCreated={(user, l) => {
            setAdding(false);
            setLink({ user, link: l, isNew: true });
          }}
        />
      )}
      {link && <LinkSheet {...link} reduced={reduced} onClose={() => setLink(null)} />}
    </div>
  );
}

const USER_MESSAGES = { taken: 'settings.users.emailTaken' };
const NAME_ID = 'u-name';
const EMAIL_ID = 'u-email';

function AddUser({
  reduced,
  onClose,
  onCreated,
}: {
  reduced: boolean;
  onClose: () => void;
  onCreated: (user: AdminUser, link: ResetLink) => void;
}) {
  const { t } = useTranslation();
  const create = useCreateUser();
  const [values, setValues] = useState({
    name: '',
    email: '',
    role: 'VIEWER' as Role,
    canViewStartCodes: false,
  });
  const [errors, setErrors] = useState<Errors>({});
  const [failed, setFailed] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFailed(null);
    const parsed = userBody.safeParse(values);
    if (!parsed.success) {
      setErrors(issuesToErrors(parsed.error.issues, (f) => values[f as 'name' | 'email'] === ''));
      return;
    }
    try {
      const res = await create.mutateAsync(parsed.data);
      onCreated(res.user, res.link);
    } catch (err) {
      if (err instanceof ApiError && err.issues.length)
        setErrors(
          Object.fromEntries(
            err.issues.map((i) => [
              i.path,
              USER_MESSAGES[i.code as keyof typeof USER_MESSAGES] ?? 'records.error.invalid',
            ]),
          ),
        );
      else setFailed('records.error.save');
    }
  };

  return (
    <Sheet
      title={t('settings.users.addTitle')}
      onClose={onClose}
      reduced={reduced}
      footer={
        <div className="flex items-center gap-2">
          {failed && (
            <p role="alert" className="text-bad me-auto text-xs">
              {t(failed as never)}
            </p>
          )}
          <Button variant="ghost" className="ms-auto" type="button" onClick={onClose}>
            {t('records.cancel')}
          </Button>
          <Button type="submit" form="user-form" disabled={create.isPending}>
            {t('settings.users.create')}
          </Button>
        </div>
      }
    >
      <form id="user-form" onSubmit={onSubmit} className="space-y-3" noValidate>
        <Labeled id={NAME_ID} label={t('settings.users.name')} required error={errors.name}>
          <input
            {...errorProps(NAME_ID, errors.name)}
            value={values.name}
            onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
            className={INPUT}
          />
        </Labeled>
        <Labeled id={EMAIL_ID} label={t('login.email')} required error={errors.email}>
          <input
            {...errorProps(EMAIL_ID, errors.email)}
            type="email"
            dir="ltr"
            value={values.email}
            onChange={(e) => setValues((v) => ({ ...v, email: e.target.value }))}
            className={INPUT}
          />
        </Labeled>
        <Labeled id="u-role" label={t('settings.users.role')} required>
          <select
            id="u-role"
            value={values.role}
            onChange={(e) => setValues((v) => ({ ...v, role: e.target.value as Role }))}
            className={INPUT}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {t(`user.role.${r}`)}
              </option>
            ))}
          </select>
        </Labeled>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={values.canViewStartCodes}
            onChange={() => setValues((v) => ({ ...v, canViewStartCodes: !v.canViewStartCodes }))}
            className="accent-[var(--fh-accent)]"
          />
          {t('settings.users.startCodes')}
        </label>
        <p className="text-muted text-xs">{t('settings.users.addHint')}</p>
      </form>
    </Sheet>
  );
}

/** The one-time link, ready to copy or send by WhatsApp (there is no email server). */
function LinkSheet({
  user,
  link,
  isNew,
  reduced,
  onClose,
}: {
  user: AdminUser;
  link: ResetLink;
  isNew: boolean;
  reduced: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const formatDate = useDateFormat();
  const [copied, setCopied] = useState(false);
  const timer = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);
  const url = `${window.location.origin}${link.path}`;
  const expires = `${formatDate(link.expiresAt)} ${new Date(link.expiresAt).toLocaleTimeString(
    undefined,
    { hour: '2-digit', minute: '2-digit' },
  )}`;
  const message = t(isNew ? 'settings.users.messageNew' : 'settings.users.messageReset', {
    name: user.name,
    app: t('app.name'),
    url,
  });

  const copy = () =>
    void navigator.clipboard?.writeText(url).then(() => {
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), COPIED_MS);
    });

  return (
    <Sheet
      title={t(isNew ? 'settings.users.createdTitle' : 'settings.users.linkTitle', {
        name: user.name,
      })}
      onClose={onClose}
      reduced={reduced}
      footer={
        <div className="flex justify-end">
          <Button onClick={onClose}>{t('settings.users.done')}</Button>
        </div>
      }
    >
      <div className="space-y-4" data-testid="reset-link">
        <p className="text-sm">{t('settings.users.linkHint', { expires })}</p>
        <div className="border-border-strong bg-surface flex items-center gap-2 rounded-md border p-2">
          <bdi dir="ltr" className="num min-w-0 flex-1 truncate text-xs" data-testid="reset-url">
            {url}
          </bdi>
          <Button variant="ghost" size="sm" onClick={copy}>
            {copied ? <Check aria-hidden className="text-ok" /> : <Copy aria-hidden />}
            {t(copied ? 'vehicle.copied' : 'vehicle.copy')}
          </Button>
        </div>
        <Button asChild className="w-full">
          <a
            href={`${WHATSAPP}?text=${encodeURIComponent(message)}`}
            target="_blank"
            rel="noreferrer"
          >
            <MessageCircle aria-hidden />
            {t('settings.users.whatsapp')}
          </a>
        </Button>
        <p className="text-muted text-xs">{t('settings.users.linkOnce')}</p>
      </div>
    </Sheet>
  );
}
