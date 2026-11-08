import type { Solid } from '../../iso';
import { extrude, model } from '../kit';

/**
 * A 3D model from a hand-made drawing's solids (side profiles pushed across the width), so every
 * type renders with real depth from the shapes already drawn; a type can then get a richer model
 * of its own, as the wheel loader has. Solids are in drawing units (render with unit 1).
 */
export const fromSolids = (solids: readonly Solid[]) =>
  model(
    ...solids.map((s) =>
      extrude(
        s.part,
        s.profile,
        s.y,
        // A detail line of more than two points is a closed outline, as the 2D drawings draw it.
        s.decals?.map((line) => (line.length > 2 ? [...line, line[0]!] : [...line])),
        s.smooth ?? false,
      ),
    ),
  );
