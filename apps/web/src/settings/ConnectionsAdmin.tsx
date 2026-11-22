import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Check, Copy, KeyRound, Plus, Power, Radio } from 'lucide-react';
import { connectionBody, type ConnectionBody } from '@fleet-hub/shared';
import { Sheet } from '@/components/Sheet';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { prefersReducedMotion } from '@/lib/motion';
import { useFuel } from '@/fleet/fuel/data';
import { useFuelAge } from '@/fleet/fuel/format';
import { errorProps, INPUT, Labeled } from '@/money/form';
import { SettingsSkeleton } from './SettingsPage';

interface Connection {
  id: string;
  name: string;
  tokenHint: string;
  active: boolean;
  lastSeenAt: string | null;
  createdAt: string;
  revokedAt: string | null;
  serial: string | null;
}
interface WithToken {
  connection: Connection;
  token: string;
}

const KEY = ['settings', 'connections'] as const;
const COPIED_MS = 1500;
export const INGEST_PATH = '/api/telematics/v1/readings';

function useConnections() {
  return useQuery({ queryKey: KEY, queryFn: () => api<Connection[]>('/telematics/connections') });
}

function useConnectionAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      a: { kind: 'create'; body: ConnectionBody } | { kind: 'token' | 'off'; id: string },
    ): Promise<WithToken | Connection> =>
      a.kind === 'create'
        ? api<WithToken>('/telematics/connections', { method: 'POST', json: a.body })
        : a.kind === 'token'
          ? api<WithToken>(`/telematics/connections/${encodeURIComponent(a.id)}/token`, {
              method: 'POST',
            })
          : api<Connection>(`/telematics/connections/${encodeURIComponent(a.id)}`, {
              method: 'DELETE',
            }).then((connection): WithToken | Connection => connection),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

/**
 * Live data connections (2026-11-15, admins): each connected vehicle, or the telematics provider's
 * server, gets its own token to post readings with. The token is shown once.
 */
export function ConnectionsAdmin() {
  const { t } = useTranslation();
  const list = useConnections();
  const action = useConnectionAction();
  const age = useFuelAge();
  const [reduced] = useState(prefersReducedMotion);
  const [adding, setAdding] = useState(false);
  const [shown, setShown] = useState<WithToken | null>(null);
  const [failed, setFailed] = useState(false);
  const [now] = useState(Date.now);

  const run = (a: { kind: 'token' | 'off'; id: string }) => {
    setFailed(false);
    action.mutate(a, {
      onSuccess: (res) => {
        if (a.kind === 'token') setShown(res as WithToken);
      },
      onError: () => setFailed(true),
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-muted me-auto max-w-prose text-sm">{t('settings.live.hint')}</p>
        <Button size="sm" onClick={() => setAdding(true)}>
          <Plus aria-hidden />
          {t('settings.live.add')}
        </Button>
      </div>
      <div className="glass space-y-1 p-3 text-xs">
        <p className="text-muted">{t('settings.live.endpoint')}</p>
        <p>
          <span className="num me-2 font-semibold">POST</span>
          <bdi dir="ltr" className="num break-all" data-testid="ingest-url">
            {window.location.origin}
            {INGEST_PATH}
          </bdi>
        </p>
        <p className="text-muted">{t('settings.live.docs')}</p>
      </div>
      {failed && (
        <p role="alert" className="text-bad text-sm">
          {t('records.error.save')}
        </p>
      )}
      {list.isPending ? (
        <SettingsSkeleton rows={3} />
      ) : list.isError ? (
        <div className="glass grid gap-3 p-6 text-center">
          <p>{t('settings.loadFailed')}</p>
        </div>
      ) : list.data.length === 0 ? (
        <p className="glass text-muted p-6 text-center text-sm">{t('settings.live.none')}</p>
      ) : (
        <ul className="grid gap-2" data-testid="connections">
          {list.data.map((c) => (
            <li
              key={c.id}
              className={cn(
                'glass flex flex-wrap items-center gap-x-4 gap-y-2 p-3',
                !c.active && 'opacity-70',
              )}
              data-connection={c.name}
            >
              <div className="min-w-0 flex-1 basis-56">
                <div className="flex items-center gap-2 truncate font-medium">
                  <Radio
                    aria-hidden
                    className={cn('size-4 shrink-0', c.active ? 'text-ok' : 'text-muted')}
                  />
                  <bdi className="truncate">{c.name}</bdi>
                </div>
                <div className="text-muted mt-0.5 flex flex-wrap gap-x-3 text-xs">
                  <span>
                    {c.serial ? (
                      <>
                        {t('settings.live.vehicle')}{' '}
                        <bdi dir="ltr" className="num">
                          {c.serial}
                        </bdi>
                      </>
                    ) : (
                      t('settings.live.gateway')
                    )}
                  </span>
                  <span>
                    {t('settings.live.tokenEnds')}{' '}
                    <bdi dir="ltr" className="num">
                      …{c.tokenHint}
                    </bdi>
                  </span>
                  <span>
                    {c.active
                      ? c.lastSeenAt
                        ? t('settings.live.lastSeen', { when: age(c.lastSeenAt, now) })
                        : t('settings.live.neverSeen')
                      : t('settings.live.off')}
                  </span>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={action.isPending}
                onClick={() => run({ kind: 'token', id: c.id })}
                title={t('settings.live.newTokenHint')}
              >
                <KeyRound aria-hidden />
                {t('settings.live.newToken')}
              </Button>
              {c.active && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={action.isPending}
                  onClick={() => run({ kind: 'off', id: c.id })}
                >
                  <Power aria-hidden />
                  {t('settings.live.turnOff')}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {adding && (
        <AddConnection
          reduced={reduced}
          onClose={() => setAdding(false)}
          onCreated={(res) => {
            setAdding(false);
            setShown(res);
          }}
        />
      )}
      {shown && <TokenSheet {...shown} reduced={reduced} onClose={() => setShown(null)} />}
    </div>
  );
}

const NAME_ID = 'conn-name';
const VEHICLE_ID = 'conn-vehicle';
const REQUIRED = 'records.error.required';

function AddConnection({
  reduced,
  onClose,
  onCreated,
}: {
  reduced: boolean;
  onClose: () => void;
  onCreated: (res: WithToken) => void;
}) {
  const { t } = useTranslation();
  const action = useConnectionAction();
  const vehicles = useFuel();
  const [name, setName] = useState('');
  const [serial, setSerial] = useState('');
  const [error, setError] = useState(false);
  const [failed, setFailed] = useState(false);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setFailed(false);
    const parsed = connectionBody.safeParse({ name, serial: serial || null });
    if (!parsed.success) {
      setError(true);
      return;
    }
    action.mutate(
      { kind: 'create', body: parsed.data },
      { onSuccess: (res) => onCreated(res as WithToken), onError: () => setFailed(true) },
    );
  };

  return (
    <Sheet
      title={t('settings.live.addTitle')}
      onClose={onClose}
      reduced={reduced}
      footer={
        <div className="flex items-center gap-2">
          {failed && (
            <p role="alert" className="text-bad me-auto text-xs">
              {t('records.error.save')}
            </p>
          )}
          <Button variant="ghost" className="ms-auto" type="button" onClick={onClose}>
            {t('records.cancel')}
          </Button>
          <Button type="submit" form="conn-form" disabled={action.isPending}>
            {t('settings.live.create')}
          </Button>
        </div>
      }
    >
      <form id="conn-form" onSubmit={onSubmit} className="space-y-3" noValidate>
        <Labeled
          id={NAME_ID}
          label={t('settings.live.name')}
          required
          hint={t('settings.live.nameHint')}
          error={error ? REQUIRED : undefined}
        >
          <input
            {...errorProps(NAME_ID, error ? REQUIRED : undefined)}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={INPUT}
          />
        </Labeled>
        <Labeled id={VEHICLE_ID} label={t('settings.live.reportsFor')}>
          <select
            id={VEHICLE_ID}
            value={serial}
            onChange={(e) => setSerial(e.target.value)}
            className={INPUT}
          >
            <option value="">{t('settings.live.gatewayOption')}</option>
            {vehicles.data?.map((v) => (
              <option key={v.serial} value={v.serial}>
                {v.serial} · {v.make} {v.model}
              </option>
            ))}
          </select>
        </Labeled>
        <p className="text-muted text-xs">{t('settings.live.reportsForHint')}</p>
      </form>
    </Sheet>
  );
}

/** The token, once: copy it into the vehicle's tracker or the provider's settings. */
function TokenSheet({
  connection,
  token,
  reduced,
  onClose,
}: WithToken & { reduced: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <Sheet
      title={t('settings.live.tokenTitle', { name: connection.name })}
      onClose={onClose}
      reduced={reduced}
      footer={
        <div className="flex justify-end">
          <Button onClick={onClose}>{t('settings.users.done')}</Button>
        </div>
      }
    >
      <div className="space-y-4" data-testid="connection-token">
        <p className="text-sm">{t('settings.live.tokenOnce')}</p>
        <CopyRow label={t('settings.live.token')} value={token} testId="token-value" />
        <CopyRow
          label={t('settings.live.endpoint')}
          value={`${window.location.origin}${INGEST_PATH}`}
        />
        <p className="text-muted text-xs">{t('settings.live.docs')}</p>
      </div>
    </Sheet>
  );
}

function CopyRow({ label, value, testId }: { label: string; value: string; testId?: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const timer = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = () =>
    void navigator.clipboard?.writeText(value).then(() => {
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), COPIED_MS);
    });
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium">{label}</p>
      <div className="border-border-strong bg-surface flex items-center gap-2 rounded-md border p-2">
        <bdi dir="ltr" className="num min-w-0 flex-1 text-xs break-all" data-testid={testId}>
          {value}
        </bdi>
        <Button variant="ghost" size="sm" onClick={copy}>
          {copied ? <Check aria-hidden className="text-ok" /> : <Copy aria-hidden />}
          {t(copied ? 'vehicle.copied' : 'vehicle.copy')}
        </Button>
      </div>
    </div>
  );
}
