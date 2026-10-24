import { describe, expect, it } from 'vitest';
import { BlockEntities } from '../src/core/blockEntities.ts';
import { requireDayCycle } from '../src/core/content.ts';
import { CHUNK, toChunk, type Vec3 } from '../src/core/coords.ts';
import { type IlluminationScene, readingLightRefusal } from '../src/core/illumination.ts';
import { Inventory } from '../src/core/inventory.ts';
import { toggleLight } from '../src/core/lights.ts';
import { authoredSkyBoxes, SkyFields } from '../src/core/skyField.ts';
import { growSky, SKY_SHELL, skyDependencyBounds } from '../src/core/skySnapshot.ts';
import { playerTuning } from '../src/game/player.ts';
import { baseRegistry } from './baseRegistry.ts';
import { testHouseSite } from './testHouseSite.ts';

const registry = baseRegistry();
const NOON = 12;

describe('test house reading booth', () => {
  it('is too dark to read at noon until a held lamp is switched on', () => {
    const { scale, s, site, world, at, solid } = testHouseSite(registry);
    const booth = site.placements.find(({ template }) => template.id === 'test_house_reading_booth')!;
    const [box] = authoredSkyBoxes([booth]);
    const range = { bottom: scale.minCy * CHUNK, top: (scale.maxCy + 1) * CHUNK - 1 };
    const dependency = skyDependencyBounds(growSky(box!, SKY_SHELL), range.top);
    const entities = new BlockEntities(registry);
    for (let cz = toChunk(dependency.min[2]) - 1; cz <= toChunk(dependency.max[2]) + 1; cz++) {
      for (let cx = toChunk(dependency.min[0]) - 1; cx <= toChunk(dependency.max[0]) + 1; cx++) {
        at(cx * CHUNK, range.bottom, cz * CHUNK);
        for (const { spec } of site.furnitureIn(cx, cz)) {
          entities.add(spec);
        }
      }
    }
    // The reading cell sits beside the crate in the room at the end of the zigzag; the reader stands there.
    const [ox, oy, oz] = booth.origin;
    const holder: Vec3 = [ox + 4.5, oy + 1 + playerTuning(registry).eye / s, oz + 9.5];
    expect(solid(Math.floor(holder[0]), oy + 1, Math.floor(holder[2]))).toBe(false);
    const inventory = new Inventory(registry);
    const scene: IlluminationScene = {
      inventory,
      sky: new SkyFields({ world, entities, registry }, range, [box!]),
      gameHour: NOON,
      cycle: requireDayCycle(registry),
      fixtures: [],
      isBlocking: solid,
      blockSize: s,
      holder,
    };
    // The doorway reads by daylight, so the darkness inside is the booth's doing, not an unlit sky.
    const doorway: Vec3 = [ox + 5.5, holder[1], oz + 0.5];
    expect(readingLightRefusal({ ...scene, holder: doorway }, doorway)).toBeUndefined();
    expect(readingLightRefusal(scene, holder)).toBeDefined();
    const lamp = inventory.create('flashlight');
    expect(inventory.add(lamp, { kind: 'hand', side: 'right' })).toBe(true);
    expect(readingLightRefusal(scene, holder)).toBeDefined();
    expect(toggleLight(registry, lamp, 0)).toBeUndefined();
    expect(readingLightRefusal(scene, holder)).toBeUndefined();
  });
});
