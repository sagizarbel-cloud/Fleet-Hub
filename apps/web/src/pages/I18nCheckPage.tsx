import { useTranslation } from 'react-i18next';
import en from '@/i18n/en.json';
import he from '@/i18n/he.json';
import { flatten, missingHebrew } from '@/i18n/flatten';

/** Hidden page (no nav link): lists translation keys that still need a Hebrew value. */
export function I18nCheckPage() {
  const { t } = useTranslation();
  const missing = missingHebrew(en, he);
  const enFlat = flatten(en);
  const total = Object.keys(enFlat).length;

  return (
    <section className="glass space-y-4 p-6">
      <h1 className="text-xl font-semibold">{t('i18nCheck.title')}</h1>
      {missing.length === 0 ? (
        <p className="text-ok" data-testid="i18n-ok">
          {t('i18nCheck.allGood', { count: total })}
        </p>
      ) : (
        <>
          <p className="text-warn">{t('i18nCheck.missingCount', { count: missing.length })}</p>
          <table className="w-full text-start text-sm">
            <thead className="text-muted">
              <tr>
                <th className="py-2 text-start">{t('i18nCheck.key')}</th>
                <th className="py-2 text-start">{t('i18nCheck.english')}</th>
              </tr>
            </thead>
            <tbody>
              {missing.map((key) => (
                <tr key={key} className="border-border border-t">
                  <td className="num py-2">
                    <bdi dir="ltr">{key}</bdi>
                  </td>
                  <td className="py-2">{String(enFlat[key])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
