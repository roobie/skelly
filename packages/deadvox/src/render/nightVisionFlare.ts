import { type Camera, Vector3 } from 'three';
import type { Vec3 } from '../core/coords.ts';
import { raycast, type SolidAt } from '../core/raycast.ts';
import type { NightVision } from '../core/schema.ts';
import { type LightPool, NIGHT_VISION_HALOS } from './lightPool.ts';

/** A light the goggles may look into: its position in metres and its brightness. */
export interface FlareSource {
  readonly position: Vector3;
  readonly brightness: number;
}

/** A halo at a light's place on the picture (0 to 1 across and up) and how far it mixes towards white. */
export interface FlareHalo {
  readonly x: number;
  readonly y: number;
  readonly strength: number;
}

/** How far the whole view mixes towards white, and the brightest lights' halos. */
export interface NightVisionFlare {
  readonly washout: number;
  readonly halos: readonly FlareHalo[];
}

export const NO_FLARE: NightVisionFlare = { washout: 0, halos: [] };

// Below one display step a source can't show, so it isn't worth a ray.
const DISPLAY_STEP = 1 / 255;

const smoothstep = (from: number, to: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - from) / (to - from)));
  return t * t * (3 - 2 * t);
};

/**
 * The pool's lit sources, except those it skips, and the showing fireballs at `blastIntensity` times their life
 * left. A carried torch flares like a dropped one.
 */
export const flareSources = (
  pool: Pick<LightPool, 'lights' | 'flareSkipped'>,
  fireballs: Iterable<{ readonly position: Vector3; readonly remaining: number }>,
  blastIntensity: number,
): FlareSource[] => {
  const sources: FlareSource[] = [];
  for (const [index, light] of pool.lights.entries()) {
    if (light.intensity > 0 && !pool.flareSkipped[index]) {
      sources.push({ position: light.position, brightness: light.intensity });
    }
  }
  for (const { position, remaining } of fireballs) {
    sources.push({ position, brightness: blastIntensity * remaining });
  }
  return sources;
};

const inCamera = new Vector3();
const toSource = new Vector3();

/**
 * The flare through night-vision goggles from bright lights in view (`DESIGN.md`, "Light"). It rises at once to
 * a new peak and falls back from `last` with the view's recovery time over `dt` real seconds.
 */
export const nightVisionFlare = ({
  sources,
  camera,
  view,
  isSolid,
  blockSize,
  dt,
  last,
}: {
  readonly sources: Iterable<FlareSource>;
  readonly camera: Camera;
  readonly view: NightVision;
  readonly isSolid: SolidAt;
  readonly blockSize: number;
  readonly dt: number;
  readonly last: number;
}): NightVisionFlare => {
  const { flare, edge } = view;
  const eye: Vec3 = [camera.position.x / blockSize, camera.position.y / blockSize, camera.position.z / blockSize];
  let total = 0;
  const halos: FlareHalo[] = [];
  for (const { position, brightness } of sources) {
    const metres = position.distanceTo(camera.position);
    const near = brightness / (1 + (metres / flare.distanceMetres) ** 2);
    if (flare.strength * near <= DISPLAY_STEP) {
      continue;
    }
    // A light at the eye, such as a worn one that glows all round, fills the view and has no place for a halo.
    if (metres === 0) {
      total += near;
      continue;
    }
    inCamera.copy(position).applyMatrix4(camera.matrixWorldInverse);
    if (inCamera.z >= 0) {
      continue;
    }
    inCamera.applyMatrix4(camera.projectionMatrix);
    if (Math.abs(inCamera.x) > 1 || Math.abs(inCamera.y) > 1) {
      continue;
    }
    const x = inCamera.x * 0.5 + 0.5;
    const y = inCamera.y * 0.5 + 0.5;
    const strength = near * (1 - smoothstep(edge.inner, edge.outer, Math.hypot(x - 0.5, y - 0.5)));
    if (flare.strength * strength <= DISPLAY_STEP) {
      continue;
    }
    toSource.copy(position).sub(camera.position).divideScalar(metres);
    if (raycast(eye, [toSource.x, toSource.y, toSource.z], metres / blockSize, isSolid)) {
      continue;
    }
    total += strength;
    halos.push({ x, y, strength: 1 - Math.exp(-flare.strength * strength) });
  }
  halos.sort((a, b) => b.strength - a.strength).splice(NIGHT_VISION_HALOS);
  const now = 1 - Math.exp(-flare.strength * total);
  return { washout: Math.max(now, last * Math.exp(-dt / flare.recoverSeconds)), halos };
};
