// @vitest-environment node
import { describe, expect, it } from 'vitest';
import i18n from 'i18next';
import { RECORD_BODIES } from '@fleet-hub/shared';
import en from '@/i18n/en.json';
import he from '@/i18n/he.json';
import { buildWorkbook } from './exportXlsx';
import { KIND_UI, toBody, toForm, type FormatCtx } from './kinds';
import type { RecordRow } from './api';

async function ctxFor(lang: 'en' | 'he'): Promise<FormatCtx> {
  const inst = i18n.createInstance();
  await inst.init({
    showSupportNotice: false,
    lng: lang,
    resources: { en: { translation: en }, he: { translation: he } },
  });
  return {
    t: inst.t,
    lang,
    lookups: undefined,
    unit: 'HOURS',
    date: (iso) => iso.slice(0, 10),
    number: (n) => String(n),
    money: (n) => `₪${n}`,
  };
}

const fuelRow: RecordRow = {
  id: 'f1',
  createdById: null,
  createdBy: 'Test',
  attachments: [
    {
      id: 'a',
      fileName: 'pump.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 1,
      hasThumb: true,
      createdAt: '',
    },
  ],
  date: '2026-10-20T00:00:00.000Z',
  liters: 210.5,
  odometerKm: null,
  engineHours: 8_623,
  cost: 1_558,
  economy: 22.9,
  drop: true,
};

describe('record forms', () => {
  it('turn form values into the body the shared schema accepts', () => {
    const body = toBody(
      'service',
      { date: '2026-10-01', reading: '8100', description: ' Oil ', cost: '', vendor: '' },
      'HOURS',
      true,
    );
    expect(body).toMatchObject({
      engineHours: 8100,
      odometerKm: null,
      description: 'Oil',
      cost: null,
      vendor: null,
      nextServiceKm: null,
      nextServiceHours: null,
    });
    expect(RECORD_BODIES.service.safeParse(body).success).toBe(true);
  });

  it('leave out add-only fields when editing, and fill the form back from a row', () => {
    const body = toBody('service', { date: '2026-10-01', description: 'x' }, 'KM', false);
    expect(body).not.toHaveProperty('nextServiceDate');
    const values = toForm('fuel', fuelRow, 'HOURS');
    expect(values).toMatchObject({ liters: '210.5', reading: '8623', cost: '1558' });
  });

  it('only send the resolved date when the malfunction is resolved', () => {
    const open = toBody(
      'malfunctions',
      { reportedAt: '2026-10-01', state: 'OPEN', resolvedAt: '2026-10-02' },
      'KM',
      true,
    );
    expect(open).not.toHaveProperty('resolvedAt');
  });
});

describe('Excel export', () => {
  const spec = async (lang: 'en' | 'he') => {
    const ctx = await ctxFor(lang);
    return buildWorkbook({
      title: ctx.t('vehicle.records.fuel'),
      lines: ['EX-103'],
      columns: KIND_UI.fuel.columns,
      rows: [fuelRow],
      ctx,
      fileName: 'x.xlsx',
    });
  };

  it('writes translated headers with units, real dates and numbers, and file names', async () => {
    const ws = (await spec('en')).worksheets[0]!;
    expect(ws.views[0]?.rightToLeft).toBe(false);
    expect(ws.getRow(4).values).toEqual([
      undefined,
      'Date',
      'Litres (L)',
      'Odometer / engine hours (h)',
      'Economy (L/h)',
      'Sudden drop',
      'Cost (₪)',
      'Files',
    ]);
    const row = ws.getRow(5).values as unknown[];
    expect(row[1]).toBeInstanceOf(Date);
    expect(row.slice(2)).toEqual([210.5, 8_623, 22.9, 'Yes', 1_558, 'pump.jpg']);
  });

  it('sets Hebrew sheets right to left, in Hebrew', async () => {
    const ws = (await spec('he')).worksheets[0]!;
    expect(ws.views[0]?.rightToLeft).toBe(true);
    expect(ws.name).toBe('צריכת דלק');
    expect(ws.getRow(4).values).toEqual(expect.arrayContaining(['תאריך', 'עלות (₪)', 'קבצים']));
    expect((ws.getRow(5).values as unknown[])[5]).toBe('כן');
  });
});
