import { describe, expect, it } from 'vitest';
import { wiggleItems, wiggleProblems, wiggleScale } from './wiggle';

describe('wiggle test checklists (Sagi, 2026-11-08)', () => {
  it('loaders check each camera; excavators add the front-down camera', () => {
    expect(wiggleItems('loader')).toEqual([
      'steering',
      'cameraFront',
      'cameraBack',
      'cameraLeft',
      'cameraRight',
      'cameraCab',
      'lidars',
      'imus',
      'signal',
      'instruments',
      'fluids',
      'mechanical',
      'hydraulicTools',
    ]);
    for (const p of ['excavator', 'wheeledExcavator'] as const) {
      expect(wiggleItems(p)).toContain('cameraFrontDown');
      expect(wiggleItems(p)).not.toContain('cameraCab');
    }
    expect(wiggleItems('skidSteer')).not.toContain('cameraFrontDown');
  });

  it('fluids read full / missing, mechanical and hydraulic tools functional / attention', () => {
    expect(wiggleScale('fluids')).toBe('fluid');
    expect(wiggleScale('mechanical')).toBe('condition');
    expect(wiggleScale('hydraulicTools')).toBe('condition');
    expect(wiggleScale('cameraCab')).toBe('vx');
  });

  it('names what is missing and what is not on the list', () => {
    const { missing, extra } = wiggleProblems('skidSteer', { steering: 'PASS', cameraCab: 'PASS' });
    expect(missing).toContain('cameras');
    expect(extra).toEqual(['cameraCab']);
  });
});
