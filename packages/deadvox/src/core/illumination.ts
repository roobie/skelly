// How much light reaches a point (`DESIGN.md`, "Light"): sky, lights in the inventory's reach and powered
// fixtures, in the light units the renderer draws with, so what the player sees and what the rules read agree.

import { CORE_CONTENT_IDS } from './contentIds.ts';
import type { Vec3 } from './coords.ts';
import type { Inventory } from './inventory.ts';
import { inventoryLightEntries, lightExposureFor } from './lights.ts';
import { raycast, type SolidAt } from './raycast.ts';
import type { DayCycleDef } from './schema.ts';
import type { PoweredLight } from './sitePower.ts';
import { skyAt } from './sky.ts';
import type { SkyFields } from './skyField.ts';

export interface IlluminationScene {
  inventory: Inventory;
  sky: Pick<SkyFields, 'visibilityAt'>;
  /** Local solar hour in [0, 24). */
  gameHour: number;
  cycle: DayCycleDef;
  fixtures: readonly PoweredLight[];
  isBlocking: SolidAt;
  blockSize: number;
  /** Where carried lights shine from, in blocks. */
  holder: Vec3;
}

/** Shared punctual-light cap prevents close surfaces from blowing out when lights are tuned for reach. */
export const NEAR_FIELD_M = 4;

/**
 * The renderer's point-light falloff (three.js `getDistanceAttenuation` as patched by `src/render/lightFalloff.ts`,
 * `installNearFieldFalloff`), so both sides measure alike.
 */
const distanceAttenuation = (distanceMetres: number, radiusMetres: number, decay: number): number => {
  const falloff = 1 / Math.max((distanceMetres + NEAR_FIELD_M) ** decay, 0.01);
  const edge = Math.min(Math.max(1 - (distanceMetres / radiusMetres) ** 4, 0), 1);
  return falloff * edge * edge;
};

const cellOf = (point: Vec3): string => point.map(Math.floor).join(',');

/** A source reaches a point when no blocking cell lies between them; their own cells never block. */
const reaches = (from: Vec3, to: Vec3, isBlocking: SolidAt): boolean => {
  const delta: Vec3 = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
  const length = Math.hypot(...delta);
  if (length === 0) {
    return true;
  }
  const ends = new Set([cellOf(from), cellOf(to)]);
  const dir: Vec3 = [delta[0] / length, delta[1] / length, delta[2] / length];
  return !raycast(from, dir, length, (x, y, z) => !ends.has(`${x},${y},${z}`) && isBlocking(x, y, z));
};

interface PointSource {
  pos: Vec3;
  intensity: number;
  radius: number;
  decay: number;
}

function* pointSources(scene: IlluminationScene, pointDecay: number, renderLiftMetres: number): Generator<PointSource> {
  const { registry } = scene.inventory;
  for (const { item, location, path } of inventoryLightEntries(scene.inventory)) {
    const light = registry.items.get(item.type)?.light;
    const exposure = light && lightExposureFor(registry, item, location, path);
    if (!(light && exposure)) {
      continue;
    }
    // A carried beam is aimed at what its holder reads; a beam set down points somewhere unmodelled.
    if (exposure === 'carried') {
      yield {
        pos: scene.holder,
        intensity: light.intensity,
        radius: light.radius,
        decay: light.beam?.decay ?? pointDecay,
      };
    } else if (location.kind === 'pile' && !light.beam) {
      const [x, y, z] = location.pile.pos;
      yield {
        pos: [x + 0.5, y + renderLiftMetres / scene.blockSize, z + 0.5],
        intensity: light.intensity,
        radius: light.radius,
        decay: pointDecay,
      };
    }
  }
  for (const fixture of scene.fixtures) {
    yield { pos: fixture.pos, intensity: fixture.intensity, radius: fixture.radius, decay: pointDecay };
  }
}

/** Light reaching a point in blocks, in the renderer's light units. */
export const illuminationAt = (scene: IlluminationScene, point: Vec3): number => {
  const tuning = scene.inventory.registry.senses.get(CORE_CONTENT_IDS.player)!.light;
  const sky = skyAt(scene.gameHour, scene.cycle);
  let total = scene.sky.visibilityAt(point) * (sky.lightIntensity + sky.ambientIntensity);
  for (const source of pointSources(scene, tuning.illumination.pointDecay, tuning.groundLight.renderLiftMetres)) {
    const metres = Math.hypot(...source.pos.map((value, axis) => (value - point[axis]!) * scene.blockSize));
    if (metres < source.radius && reaches(source.pos, point, scene.isBlocking)) {
      total += source.intensity * distanceAttenuation(metres, source.radius, source.decay);
    }
  }
  return total;
};

/** Whether a point has the light content says a page or sign needs to be read. */
export const litEnoughToRead = (scene: IlluminationScene, point: Vec3): boolean =>
  illuminationAt(scene, point) >=
  scene.inventory.registry.senses.get(CORE_CONTENT_IDS.player)!.light.illumination.readingThreshold;
