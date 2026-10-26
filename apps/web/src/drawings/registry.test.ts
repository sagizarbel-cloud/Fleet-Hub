import { describe, expect, it } from 'vitest';
import { VEHICLE_TYPE_CODES } from '@fleet-hub/shared';
import { DRAWINGS, drawingFor } from './registry';

describe('drawing registry', () => {
  it('has a drawing of its own for every type but the backhoe loader', () => {
    const missing = VEHICLE_TYPE_CODES.filter((code) => !DRAWINGS[code]);
    expect(missing).toEqual(['backhoe_loader']);
  });

  it('shows a type without its own drawing as the generic one, never as another machine', () => {
    expect(drawingFor('backhoe_loader')).toBe(DRAWINGS.other);
    expect(drawingFor('no_such_type')).toBe(DRAWINGS.other);
    expect(drawingFor('compressor')).not.toBe(DRAWINGS.other);
  });
});
