import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { VEHICLE_STATUSES, VEHICLE_TYPE_CODES } from '@fleet-hub/shared';
import { VehicleVisual } from '@/drawings/VehicleVisual';
import { DRAWINGS } from '@/drawings/registry';
import { Button } from '@/components/ui/button';

/** Hidden review page (no nav link): every drawn type, in every view and status. */
export function DrawingsPage() {
  const { t } = useTranslation();
  const [round, setRound] = useState(0);
  const types = VEHICLE_TYPE_CODES.filter((code) => DRAWINGS[code]);

  useEffect(() => {
    document.title = `${t('drawings.title')} · ${t('app.name')}`;
  }, [t]);

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t('drawings.title')}</h1>
        <Button variant="outline" size="sm" onClick={() => setRound((r) => r + 1)}>
          {t('drawings.replay')}
        </Button>
      </div>
      {types.map((type) => (
        <div key={type} className="glass space-y-4 p-5" data-testid={`drawing-${type}`}>
          <h2 className="num text-muted text-sm">
            <bdi dir="ltr">{type}</bdi>
          </h2>
          <div className="grid gap-6 lg:grid-cols-[auto_auto_1fr]">
            <div className="flex items-end gap-4">
              {VEHICLE_STATUSES.map((s) => (
                <VehicleVisual key={s} type={type} view="top" status={s} size={72} />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <VehicleVisual type={type} view="iso" status="GREEN" size={110} />
              <VehicleVisual type={type} view="iso" status="RED" size={110} />
            </div>
            <div className="flex items-center">
              <VehicleVisual key={round} type={type} view="side" status="AMBER" size={420} draw />
            </div>
          </div>
        </div>
      ))}
    </section>
  );
}
