// biome-ignore-all lint/style/useNamingConvention: three.js shader chunk names retain their exact spelling.
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
// Over the band from fog start to end the fog follows a power curve (`DistanceFogShape`, `curveExponent`) in place of
// three's smoothstep, so content decides how long far shapes keep their silhouette before the band closes.
//
// This relies on three.js internals: the exact text of its four fog chunks (0.186). The patch
// checks each line it replaces and throws if three changed it, like lightFalloff.ts.

import { ShaderChunk } from 'three';

const VARYING = 'varying float vFogDepth;';
const DEPTH = 'vFogDepth = - mvPosition.z;';
const FOG_VIEW = 'centroid varying vec3 vFogView;';
const SMOOTHSTEP = 'smoothstep( fogNear, fogFar, vFogDepth )';

/** How the distance fog is shaped: both are compiled into the shared fog chunks once. */
export interface DistanceFogShape {
  /** The camera's far plane as a multiple of where the fog ends. */
  farPlaneScale: number;
  /** The fog over its band is t ** curveExponent, t running 0 to 1 from fog start to end. */
  curveExponent: number;
}

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
  { farPlaneScale, curveExponent }: DistanceFogShape,
): Pick<typeof ShaderChunk, 'fog_pars_vertex' | 'fog_vertex' | 'fog_pars_fragment' | 'fog_fragment'> => {
  if (!(Number.isFinite(farPlaneScale) && farPlaneScale >= 1)) {
    throw new Error(`distanceFog: far-plane scale must be at least 1, got ${farPlaneScale}`);
  }
  if (!(Number.isFinite(curveExponent) && curveExponent > 0)) {
    throw new Error(`distanceFog: curve exponent must be positive, got ${curveExponent}`);
  }
  const curve = `pow( clamp( ( fogDistance() - fogNear ) / ( fogFar - fogNear ), 0.0, 1.0 ), ${curveExponent.toFixed(4)} )`;
  return {
    fog_pars_vertex: replaced(chunks.fog_pars_vertex, 'fog_pars_vertex', VARYING, FOG_VIEW),
    fog_vertex: replaced(chunks.fog_vertex, 'fog_vertex', DEPTH, 'vFogView = mvPosition.xyz;'),
    fog_pars_fragment: replaced(
      chunks.fog_pars_fragment,
      'fog_pars_fragment',
      VARYING,
      distanceFunction(farPlaneScale),
    ),
    fog_fragment: replaced(
      replaced(chunks.fog_fragment, 'fog_fragment', SMOOTHSTEP, curve),
      'fog_fragment',
      'vFogDepth',
      'fogDistance()',
    ),
  };
};

let installed: DistanceFogShape | undefined;

/** Patches three's shared fog chunks once, before any material compiles. Refuses a second, different shape. */
export const installDistanceFog = (shape: DistanceFogShape): void => {
  if (installed !== undefined) {
    if (installed.farPlaneScale !== shape.farPlaneScale || installed.curveExponent !== shape.curveExponent) {
      throw new Error(`distanceFog: already installed as ${JSON.stringify(installed)}, not ${JSON.stringify(shape)}`);
    }
    return;
  }
  Object.assign(ShaderChunk, withDistanceFog(ShaderChunk, shape));
  installed = { ...shape };
};
