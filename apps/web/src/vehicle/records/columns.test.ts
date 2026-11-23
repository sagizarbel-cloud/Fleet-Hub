import { describe, expect, it } from 'vitest';
import { DEFAULT_APP_SETTINGS, type AppSettings, type CustomFieldDef } from '@fleet-hub/shared';
import { kindColumns } from './columns';

const withFields = (service: CustomFieldDef[]): AppSettings => ({
  ...DEFAULT_APP_SETTINGS,
  recordFields: { service },
});
const keys = (s: AppSettings) => kindColumns('service', s).map((c) => c.key);

describe('extra field columns', () => {
  it('a header leads after the first column; one placed after a field follows it', () => {
    const k = keys(
      withFields([
        { key: 'c1', labelEn: 'Type', labelHe: 'סוג', type: 'text', header: true },
        { key: 'c2', labelEn: 'Permit', labelHe: 'היתר', type: 'text', after: 'vendor' },
        { key: 'c3', labelEn: 'Escort', labelHe: 'ליווי', type: 'text', after: 'c2' },
        { key: 'c4', labelEn: 'Other', labelHe: 'אחר', type: 'text' },
      ]),
    );
    expect(k[1]).toBe('custom.c1');
    expect(k.indexOf('custom.c2')).toBe(k.indexOf('vendor') + 1);
    expect(k.indexOf('custom.c3')).toBe(k.indexOf('custom.c2') + 1);
    expect(k).toContain('custom.c4');
  });
});
