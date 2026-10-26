// Fog by horizontal distance from the camera, so the fogged range is a circle around the player
// that turning in place does not move. three fogs by depth along the view, which lets a surface at
// the screen's side show farther than one straight ahead.
//
// The distance is taken per fragment from the view-space position: interpolating it per vertex would
// fog the middle of a large face as if it were as far as its corners. A view-space offset's world
// height is its dot product with the view matrix's second column, the world up axis in view space.
// The position is `centroid`: under MSAA an edge pixel is shaded at its centre even outside the
// triangle, and an extrapolated position there would fog it wrong.
//
// The camera's far plane clips by depth, which never exceeds straight-line distance. So the fog
// also completes at straight-line distance over the far plane's scale (`fogFarPlaneScale`),
// which makes every surface the far plane clips fully fogged already. Only a surface far above or
// below the camera, nearly under or over it, reaches that bound before its horizontal one.
//
// This relies on three.js internals: the exact text of its four fog chunks (0.186). The patch
// checks each line it replaces and throws if three changed it, like lightFalloff.ts.

import { ShaderChunk } from 'three';

const VARYING = 'varying float vFogDepth;';
const DEPTH = 'vFogDepth = - mvPosition.z;';
const FOG_VIEW = 'centroid varying vec3 vFogView;';

const replaced = (chunk: string, name: string, from: string, to: string): string => {
  if (!chunk.includes(from)) {
    throw new Error(`distanceFog: "${from}" not found in three ${name} chunk`);
  }
  return chunk.replaceAll(from, to);
};

/** The fragment function giving a fragment's fog distance in metres. */
const distanceFunction = (farPlaneScale: number): string => `${FOG_VIEW}
	float fogDistance() {
		float rise = dot( viewMatrix[ 1 ].xyz, vFogView );
		float reach = dot( vFogView, vFogView );
		return max( sqrt( max( reach - rise * rise, 0.0 ) ), sqrt( reach ) / ${farPlaneScale.toFixed(4)} );
	}`;

/** three's four fog chunks with the depth replaced by `fogDistance()`. Throws if three changed a line. */
export const withDistanceFog = (
  chunks: Pick<typeof ShaderChunk, 'fog_pars_vertex' | 'fog_vertex' | 'fog_pars_fragment' | 'fog_fragment'>,
  farPlaneScale: number,
): Pick<typeof ShaderChunk, 'fog_pars_vertex' | 'fog_vertex' | 'fog_pars_fragment' | 'fog_fragment'> => {
  if (!(Number.isFinite(farPlaneScale) && farPlaneScale >= 1)) {
    throw new Error(`distanceFog: far-plane scale must be at least 1, got ${farPlaneScale}`);
  }
  return {
    fog_pars_vertex: replaced(chunks.fog_pars_vertex, 'fog_pars_vertex', VARYING, FOG_VIEW),
    fog_vertex: replaced(chunks.fog_vertex, 'fog_vertex', DEPTH, 'vFogView = mvPosition.xyz;'),
    fog_pars_fragment: replaced(chunks.fog_pars_fragment, 'fog_pars_fragment', VARYING, distanceFunction(farPlaneScale)),
    fog_fragment: replaced(chunks.fog_fragment, 'fog_fragment', 'vFogDepth', 'fogDistance()'),
  };
};

let installedScale: number | undefined;

/** Patches three's shared fog chunks once, before any material compiles. Refuses a second, different scale. */
export const installDistanceFog = (farPlaneScale: number): void => {
  if (installedScale !== undefined) {
    if (installedScale !== farPlaneScale) {
      throw new Error(`distanceFog: already installed with scale ${installedScale}, not ${farPlaneScale}`);
    }
    return;
  }
  Object.assign(ShaderChunk, withDistanceFog(ShaderChunk, farPlaneScale));
  installedScale = farPlaneScale;
};
