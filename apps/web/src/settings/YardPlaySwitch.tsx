import { useTranslation } from 'react-i18next';
import { useAppSettings, useSaveAppSettings } from '@/vehicle/records/api';
import { Panel } from './MySettings';

/** Admin switch for Yard play, the optional fling mini-game. Shown only when the build has it. */
export function YardPlaySwitch() {
  const { t } = useTranslation();
  const settings = useAppSettings();
  const save = useSaveAppSettings();
  if (settings.isPlaceholderData || !settings.data) return null;
  const on = settings.data.yardPlay;
  return (
    <Panel title={t('settings.yardPlay.title')} hint={t('settings.yardPlay.hint')}>
      <label className="flex items-center gap-2.5 text-sm">
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => save.mutate({ ...settings.data!, yardPlay: e.target.checked })}
          className="size-4 accent-[var(--fh-accent)]"
          data-testid="yard-play-switch"
        />
        {t('settings.yardPlay.on')}
      </label>
    </Panel>
  );
}
