// Result shapes that geometry, revolve and mesh all produce or consume. They live apart from those
// modules so none of them has to import another just for a type.

import type { Vec3 } from '../foundation/math.ts';

export interface ConvexPolyhedron {
  readonly vertices: readonly Vec3[];
  /** Each face is a cyclic list of vertex indices. */
  readonly faces: readonly (readonly number[])[];
}

export interface TriangleMesh {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly indices: Uint32Array;
  readonly triangleCount: number;
}
