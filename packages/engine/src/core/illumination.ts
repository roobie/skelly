// How much light reaches a point (`packages/deadvox/DESIGN.md`, "Light"): sky, lights in the inventory's reach and powered
// fixtures, in the light units the renderer draws with, so what the player sees and what the rules read agree.

import { claimed } from './capabilities.ts';
import type { Vec3 } from './coords.ts';
import { coreMessage } from './coreText.ts';
import type { Inventory, Location } from './inventory.ts';
import type { LampReachCache } from './lampReach.ts';
import type { LightBody } from './lightGridRay.ts';
import { inventoryLightEntries, lightExposureFor } from './lights.ts';
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
  reach: Pick<LampReachCache, 'reachOf'>;
  blockSize: number;
  /** Where carried lights shine from, in blocks. */
  holder: Vec3;
}

/**
 * The renderer's point-light falloff (three.js `getDistanceAttenuation` as patched by
 * `packages/presentation/src/render/lightFalloff.ts`, `installNearFieldFalloff`), so both sides measure alike.
 */
const distanceAttenuation = (
  distanceMetres: number,
  radiusMetres: number,
  decay: number,
  nearFieldMetres: number,
): number => {
  const falloff = 1 / Math.max((distanceMetres + nearFieldMetres) ** decay, 0.01);
  const edge = Math.min(Math.max(1 - (distanceMetres / radiusMetres) ** 4, 0), 1);
  return falloff * edge * edge;
};

/** The rules own item-light reach positions; a drawn flame can move without creating a second wall answer. */
export const lightReachPosition = (
  location: Location,
  holder: Readonly<Vec3>,
  blockSize: number,
  renderLiftMetres: number,
): Vec3 => {
  if (location.kind === 'pile') {
    const [x, y, z] = location.pile.pos;
    return [x + 0.5, y + renderLiftMetres / blockSize, z + 0.5];
  }
  return [...holder];
};

interface PointSource {
  pos: Vec3;
  reachSource?: object;
  intensity: number;
  radius: number;
  decay: number;
  body?: LightBody;
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
        pos: lightReachPosition(location, scene.holder, scene.blockSize, renderLiftMetres),
        reachSource: item,
        intensity: light.intensity,
        radius: light.radius,
        decay: light.beam?.decay ?? pointDecay,
      };
    } else if (location.kind === 'pile' && !light.beam) {
      yield {
        pos: lightReachPosition(location, scene.holder, scene.blockSize, renderLiftMetres),
        reachSource: item,
        intensity: light.intensity,
        radius: light.radius,
        decay: pointDecay,
      };
    }
  }
  for (const fixture of scene.fixtures) {
    yield {
      pos: fixture.pos,
      intensity: fixture.intensity,
      radius: fixture.radius,
      decay: pointDecay,
      body: fixture.body,
    };
  }
}

/** Light reaching a point in blocks, in the renderer's light units. */
export const illuminationAt = (scene: IlluminationScene, point: Vec3): number => {
  const tuning = claimed(scene.inventory.registry.senses, 'player')!.light;
  const sky = skyAt(scene.gameHour, scene.cycle);
  let total = scene.sky.visibilityAt(point) * (sky.lightIntensity + sky.ambientIntensity);
  for (const source of pointSources(scene, tuning.illumination.pointDecay, tuning.groundLight.renderLiftMetres)) {
    const metres = Math.hypot(...source.pos.map((value, axis) => (value - point[axis]!) * scene.blockSize));
    const fraction = metres < source.radius ? scene.reach.reachOf(source)!.at(point) : 0;
    if (fraction > 0) {
      total +=
        fraction *
        source.intensity *
        distanceAttenuation(metres, source.radius, source.decay, tuning.illumination.nearFieldMetres);
    }
  }
  return total;
};

/** Whether a point has the light content says a page or sign needs to be read. */
export const litEnoughToRead = (scene: IlluminationScene, point: Vec3): boolean =>
  illuminationAt(scene, point) >=
  claimed(scene.inventory.registry.senses, 'player')!.light.illumination.readingThreshold;

/** Every readable admits through this one check, so paper and signs share one notion of "enough light". */
export const readingLightRefusal = (scene: IlluminationScene, point: Vec3): string | undefined =>
  litEnoughToRead(scene, point) ? undefined : coreMessage(scene.inventory.registry, 'tooDarkToRead');
