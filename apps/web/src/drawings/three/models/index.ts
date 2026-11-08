import type * as THREE from 'three';
import { wheelLoader3d } from './wheel-loader';

/** Every type drawn from a 3D model, by type code. */
export const MODELS: Record<string, () => THREE.Group> = {
  wheel_loader: wheelLoader3d,
};
