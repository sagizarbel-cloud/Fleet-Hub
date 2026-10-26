import { useTranslation } from 'react-i18next';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { TriangleAlert } from 'lucide-react';
import type { UsageUnit } from '@fleet-hub/shared';
import { useFuelEconomy, type EconomyPoint } from './api';
import { useFormatCtx } from './format';
import type { FormatCtx } from './kinds';

interface Datum extends EconomyPoint {
  t: number;
}

const unitKey = (unit: UsageUnit) =>
  unit === 'KM' ? ('vehicle.units.KM_PER_L' as const) : ('vehicle.units.L_PER_HOUR' as const);

/** How much worse than its baseline a point is, as a signed percentage (worse is negative). */
const change = (p: EconomyPoint, unit: UsageUnit) =>
  p.baseline ? ((unit === 'KM' ? p.value / p.baseline : p.baseline / p.value) - 1) * 100 : 0;

function DropDot({
  cx,
  cy,
  payload,
  ctx,
  unit,
}: {
  cx?: number;
  cy?: number;
  payload?: Datum;
  ctx: FormatCtx;
  unit: UsageUnit;
}) {
  if (!payload?.drop || cx === undefined || cy === undefined) return null;
  return (
    <g data-drop={payload.id}>
      <circle
        cx={cx}
        cy={cy}
        r={6}
        fill="var(--fh-warn)"
        stroke="var(--fh-surface-strong)"
        strokeWidth={2}
      />
      <text
        x={cx}
        // Worse economy is lower in km/L and higher in L/h: put the label on the open side.
        y={unit === 'KM' ? cy + 20 : cy - 12}
        textAnchor="middle"
        className="fill-[var(--fh-text)] text-[11px] font-medium"
      >
        {ctx.t('records.chart.dropLabel', { pct: ctx.number(Math.abs(change(payload, unit))) })}
      </text>
    </g>
  );
}

function TooltipBody({
  active,
  payload,
  ctx,
  unit,
}: {
  active?: boolean;
  payload?: readonly { payload?: unknown }[];
  ctx: FormatCtx;
  unit: UsageUnit;
}) {
  const p = active ? (payload?.[0]?.payload as Datum | undefined) : undefined;
  if (!p) return null;
  const { t } = ctx;
  return (
    <div className="glass bg-surface-strong px-3 py-2 text-xs shadow-lg">
      <p className="text-muted num">{ctx.date(p.date)}</p>
      <p className="num text-sm font-medium">
        {t(unitKey(unit), { value: ctx.number(p.value, 2) })}
      </p>
      {p.baseline !== null && (
        <p className="text-muted">
          {t('records.chart.usual', {
            value: t(unitKey(unit), { value: ctx.number(p.baseline, 2) }),
          })}
        </p>
      )}
      {p.drop && (
        <p className="text-warn mt-1 inline-flex items-center gap-1 font-medium">
          <TriangleAlert aria-hidden className="size-3.5" />
          {t('records.chart.drop')}
        </p>
      )}
    </div>
  );
}

/**
 * Economy per fill-up (SPEC 5.3): km/L for road vehicles, L per engine hour for machines.
 * Fill-ups 25% or more worse than the five before them are marked, labelled and listed.
 */
export default function FuelChart({ serial, unit }: { serial: string; unit: UsageUnit }) {
  const { t, i18n } = useTranslation();
  const ctx = useFormatCtx(unit);
  const economy = useFuelEconomy(serial);
  const rtl = i18n.dir() === 'rtl';
  const points: Datum[] = (economy.data?.points ?? []).map((p) => ({
    ...p,
    t: new Date(p.date).getTime(),
  }));
  const drops = points.filter((p) => p.drop);
  const shortDate = (ms: number) =>
    new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit' }).format(ms);

  if (economy.isPending) return <div className="h-48" aria-hidden />;
  if (points.length < 2) {
    return <p className="text-muted py-4 text-center text-sm">{t('records.chart.notEnough')}</p>;
  }

  return (
    <figure className="space-y-1" data-testid="fuel-chart">
      <figcaption className="flex flex-wrap items-baseline gap-x-3 text-xs">
        <span className="text-sm font-medium">
          {t(unit === 'KM' ? 'records.chart.titleKm' : 'records.chart.titleHours')}
        </span>
        <span className="text-muted">
          {drops.length
            ? t('records.chart.dropsFound', { count: drops.length })
            : t('records.chart.noDrops')}
        </span>
      </figcaption>
      <div className="h-48" dir="ltr">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 22, right: 12, bottom: 4, left: 0 }}>
            <CartesianGrid stroke="var(--fh-border)" vertical={false} />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={['dataMin', 'dataMax']}
              // Time runs the reading direction: right to left in Hebrew.
              reversed={rtl}
              tickFormatter={shortDate}
              tick={{ fill: 'var(--fh-muted)', fontSize: 11 }}
              stroke="var(--fh-border-strong)"
              tickLine={false}
              minTickGap={24}
            />
            <YAxis
              orientation={rtl ? 'right' : 'left'}
              width={40}
              tick={{ fill: 'var(--fh-muted)', fontSize: 11 }}
              tickFormatter={(v: number) => ctx.number(v, 1)}
              axisLine={false}
              tickLine={false}
              domain={[
                (min: number) => Math.floor(min - 0.5),
                (max: number) => Math.ceil(max + 0.5),
              ]}
              allowDecimals={false}
            />
            <Tooltip
              content={(props) => (
                <TooltipBody
                  active={props.active}
                  payload={props.payload as readonly { payload?: unknown }[] | undefined}
                  ctx={ctx}
                  unit={unit}
                />
              )}
              cursor={{ stroke: 'var(--fh-border-strong)', strokeWidth: 1 }}
              isAnimationActive={false}
            />
            <Line
              type="linear"
              dataKey="value"
              stroke="var(--fh-accent-ink)"
              strokeWidth={2}
              dot={(props) => (
                <DropDot
                  key={`dot-${props.index}`}
                  cx={props.cx}
                  cy={props.cy}
                  payload={props.payload as Datum | undefined}
                  ctx={ctx}
                  unit={unit}
                />
              )}
              activeDot={{
                r: 5,
                fill: 'var(--fh-accent-ink)',
                stroke: 'var(--fh-surface-strong)',
                strokeWidth: 2,
              }}
              // No draw-in: the line's stroke would animate, and only transform/opacity may.
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
