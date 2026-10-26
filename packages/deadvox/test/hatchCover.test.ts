import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { BlockEntity } from '../src/core/blockEntities.ts';
import { buildRegistry, validateContent } from '../src/core/content.ts';
import { CORE_CONTENT_IDS } from '../src/core/contentIds.ts';
import { toChunk, type Vec3 } from '../src/core/coords.ts';
import { type FurnitureMover, movableRefusal, placement } from '../src/core/furnitureMove.ts';
import { pickFurniture } from '../src/core/furniturePick.ts';
import { GauntletSite } from '../src/core/gauntlet.ts';
import { Inventory } from '../src/core/inventory.ts';
import { decodeSave } from '../src/core/saveFormat.ts';
import { makeScale } from '../src/core/scale.ts';
import { cellsOf, footprint, pieceSize } from '../src/core/templates.ts';
import { FIXTURE_MATERIAL, fixtureBreach, fixtureMaterials, fixtureSounds } from './economyFixtures.ts';
import { GAUNTLET_SITE_MS } from './siteTimeouts.ts';
import {
  capture,
  contentLookup,
  createRuntime,
  encodeFixture,
  formatVersion,
  registry,
} from './snapshotTestSupport.ts';

const messages = registry.ui.get(CORE_CONTENT_IDS.coreUi)!.furnitureMoveMessages;
const { blockSize } = makeScale(0.5);
const coverDef = registry.furniture.get('rug')!;
const hatchDef = [...registry.furniture.values()].find((def) => def.door?.hatch)!;
const ladderDef = [...registry.furniture.values()].find((def) => def.climbable)!;
const hatchSize = pieceSize(hatchDef.size, 'w');
const hatchPos: Vec3 = [10, 2, 10];

const cellOf = (pos: Vec3, offset: Vec3): Vec3 => [pos[0] + offset[0], pos[1] + offset[1], pos[2] + offset[2]];

/** A floor, a hatch above a ladder, and a player within reach of the hatch's top. */
const scene = () => {
  const inventory = new Inventory(registry);
  const hatch = inventory.furnish({ type: hatchDef.id, pos: hatchPos, size: hatchSize, facing: 'w' })!;
  inventory.furnish({ type: ladderDef.id, pos: [11, 1, 10], size: pieceSize(ladderDef.size, 'w'), facing: 'w' });
  const mover: FurnitureMover = {
    inventory,
    terrainSolid: (_x, y) => y < 1,
    blockSize,
    player: { pos: [16, 1, 10.5], vel: [0, 0, 0], halfWidth: 0.4, height: 3.6, onGround: true },
    others: [],
    stamina: 100,
  };
  return { inventory, hatch, mover };
};

/** Takes a new piece of `type` in hand, as if lifted from elsewhere. */
const carry = (inventory: Inventory, type: string): BlockEntity => {
  const def = registry.furniture.get(type)!;
  const piece = inventory.furnish({ type, pos: [40, 1, 40], size: def.size, facing: 'n' })!;
  inventory.entities.lift(piece);
  return piece;
};

type Spec = ReturnType<GauntletSite['furnitureIn']>[number]['spec'];

/** Every piece the generator furnishes inside the placements' footprints, once each. */
const specsOf = (city: GauntletSite, placements: GauntletSite['plan']['placements']): Spec[] => {
  const specs = new Map<string, Spec>();
  for (const area of placements) {
    const [x0, , z0] = area.origin;
    const [width, depth] = footprint(area);
    for (let cx = toChunk(x0); cx <= toChunk(x0 + width - 1); cx++) {
      for (let cz = toChunk(z0); cz <= toChunk(z0 + depth - 1); cz++) {
        for (const { spec } of city.furnitureIn(cx, cz)) {
          specs.set(`${spec.type}@${spec.pos}`, spec);
        }
      }
    }
  }
  return [...specs.values()];
};

const cells = (spec: { pos: Vec3; size: Vec3 }): string[] =>
  [...cellsOf(spec.size)].map((cell) => cellOf(spec.pos, cell as Vec3).join(','));

/** Whether `top` rests on `hatch`, sharing a column with it. */
const lies = (top: Spec, hatch: Spec): boolean => {
  const column = (spec: Spec) =>
    new Set(
      cells(spec).map((key) =>
        key
          .split(',')
          .filter((_, i) => i !== 1)
          .join(','),
      ),
    );
  const under = column(hatch);
  return hatch.pos[1] + hatch.size[1] === top.pos[1] && [...column(top)].some((key) => under.has(key));
};

const aimedAtHatch: Vec3 = [11, hatchPos[1] + 1, 10];

describe('a cover over a hatch', () => {
  it('may be put down on a shut hatch', () => {
    const { inventory, mover } = scene();
    carry(inventory, coverDef.id);
    expect(placement(mover, aimedAtHatch)).toEqual({ pos: expect.any(Array) });
  });

  it('is refused for a solid piece, and for a flat piece that is not a cover', () => {
    const flat = [...registry.furniture.values()].find(
      (def) => def.solid === false && !def.cover && !def.door && !def.climbable && !def.mount && def.size[1] === 1,
    );
    if (!flat) {
      throw new Error('Fixture needs a flat loose non-cover');
    }
    for (const type of ['crate', flat.id]) {
      const { inventory, mover } = scene();
      carry(inventory, type);
      expect(placement(mover, aimedAtHatch)).toEqual({ refusal: messages.coversHatch });
    }
  });

  it('is refused over an open hatch', () => {
    const { inventory, hatch, mover } = scene();
    expect(inventory.entities.setOpen(hatch, true)).toBeUndefined();
    carry(inventory, coverDef.id);
    expect(placement(mover, aimedAtHatch)).toEqual({ refusal: messages.coversHatch });
  });

  it('blocks neither walking nor sight where it lies', () => {
    const { inventory, mover } = scene();
    const cover = carry(inventory, coverDef.id);
    const result = placement(mover, aimedAtHatch);
    if ('refusal' in result) {
      throw new Error(result.refusal);
    }
    inventory.entities.place(cover, result.pos);
    for (const cell of cellsOf(cover.size)) {
      expect(inventory.entities.isSolid(...cellOf(cover.pos, cell))).toBe(false);
    }
  });

  it('is what a pick from above hits while it lies there, and the hatch once it is lifted', () => {
    const { inventory, hatch, mover } = scene();
    const cover = carry(inventory, coverDef.id);
    const result = placement(mover, aimedAtHatch);
    if ('refusal' in result) {
      throw new Error(result.refusal);
    }
    inventory.entities.place(cover, result.pos);
    const fromAbove = () =>
      pickFurniture({
        entities: inventory.entities,
        origin: [11.5, hatchPos[1] + 6, 10.5],
        direction: [0, -1, 0],
        maxDistance: 20,
        blockSize,
        isSolid: (_x, y) => y < 1,
      });
    expect(fromAbove()).toBe(cover);
    inventory.entities.lift(cover);
    expect(fromAbove()).toBe(hatch);
  });

  it('leaves the hatch what a climber below picks, cover or not', () => {
    const { inventory, hatch, mover } = scene();
    const cover = carry(inventory, coverDef.id);
    const result = placement(mover, aimedAtHatch);
    if ('refusal' in result) {
      throw new Error(result.refusal);
    }
    inventory.entities.place(cover, result.pos);
    const fromLadder = pickFurniture({
      entities: inventory.entities,
      origin: [11.5, hatchPos[1] - 0.3, 11],
      direction: [0, 1, 0],
      maxDistance: 8,
      blockSize,
      isSolid: (_x, y) => y < 1,
      throughLadders: true,
    });
    expect(fromLadder).toBe(hatch);
  });

  it('keeps the hatch shut from above and from a ladder below while it lies there, and not once lifted', () => {
    const { inventory, hatch, mover } = scene();
    const cover = carry(inventory, coverDef.id);
    const result = placement(mover, aimedAtHatch);
    if ('refusal' in result) {
      throw new Error(result.refusal);
    }
    inventory.entities.place(cover, result.pos);
    const above: Vec3 = [11.5, hatchPos[1] + 1, 10.5];
    const below: Vec3 = [11.5, hatchPos[1] - 0.3, 11];
    expect(inventory.entities.doorRefusal(hatch, 'open', [], above)).toBe(messages.hatchCovered);
    expect(inventory.entities.doorRefusal(hatch, 'open', [], below)).toBe(messages.hatchCovered);
    expect(inventory.entities.setOpen(hatch, true)).toBe(messages.hatchCovered);
    expect(hatch.open).toBeFalsy();

    inventory.entities.lift(cover);
    expect(inventory.entities.setOpen(hatch, true)).toBeUndefined();
    expect(hatch.open).toBe(true);
  });

  it('stays where it was put down through a save and load', async () => {
    const runtime = createRuntime();
    const cover = runtime.inventory.furnish({
      type: coverDef.id,
      pos: [3, 1, 3],
      size: coverDef.size,
      facing: 'n',
    })!;
    runtime.entities.lift(cover);
    const putDown: Vec3 = [3 + coverDef.size[0], 1, 3];
    runtime.entities.place(cover, putDown);

    const decoded = await decodeSave(await encodeFixture(capture(runtime)), { version: formatVersion, contentLookup });
    const loaded = createRuntime(decoded.snapshot);
    const covers = [...loaded.entities.all].filter((entity) => entity.type === coverDef.id);
    expect(covers).toHaveLength(1);
    expect(covers[0]).toMatchObject({ pos: putDown, carried: false });
    expect(loaded.inventory.furnish({ type: coverDef.id, pos: [3, 1, 3], size: coverDef.size, facing: 'n' })).toBe(
      undefined,
    );
  });
});

describe('the secret house', () => {
  it(
    'has one cover lying over every cell of its hatch, which can be lifted',
    () => {
      const scenario = [...registry.scenarios.values()].find((candidate) => candidate.composition)!;
      const city = new GauntletSite({ seed: 73, registry, scale: makeScale(0.5), scenario });
      const [house] = city.plan.placements.filter(({ template }) => template.id === 'gauntlet_city_cellar_secret');
      const all = specsOf(city, [house!]);
      const hatches = all.filter((spec) => registry.furniture.get(spec.type)?.door?.hatch);
      const covers = all.filter(
        (spec) => registry.furniture.get(spec.type)?.cover && hatches.some((hatch) => lies(spec, hatch)),
      );
      expect(covers.length).toBeGreaterThan(0);
      const [cover] = covers;
      const under = hatches.filter((hatch) => lies(cover!, hatch));
      expect(under.length).toBeGreaterThan(0);
      const covered = new Set(
        [...cellsOf(cover!.size)].map((cell) => `${cell[0] + cover!.pos[0]},${cell[2] + cover!.pos[2]}`),
      );
      for (const cell of cellsOf(under[0]!.size)) {
        expect(covered.has(`${cell[0] + under[0]!.pos[0]},${cell[2] + under[0]!.pos[2]}`)).toBe(true);
      }

      const inventory = new Inventory(registry);
      const piece = inventory.furnish(cover!)!;
      expect(movableRefusal(inventory, piece, blockSize)).toBeUndefined();
    },
    GAUNTLET_SITE_MS,
  );
});

describe('the content check for covers', () => {
  const cover = {
    id: 'cover_test',
    name: 'Cover',
    size: [2, 1, 2],
    color: '#445566',
    massKg: 1,
    solid: false,
    cover: true,
    breach: fixtureBreach(),
    material: FIXTURE_MATERIAL,
  };
  const issuesFor = (furniture: object) =>
    validateContent({ source: 'cover-test.json', data: { furniture: [furniture] } }).map(({ path }) => path);

  it('accepts a flat, non-solid, loose piece', () => {
    expect(issuesFor(cover)).toEqual([]);
  });

  it('refuses a cover that is solid or taller than one block', () => {
    expect(issuesFor({ ...cover, solid: true })).not.toEqual([]);
    expect(issuesFor({ ...cover, size: [2, 2, 2] })).not.toEqual([]);
  });

  it('refuses a cover placed as fitted', () => {
    const data = {
      furnitureMaterials: fixtureMaterials(),
      sounds: fixtureSounds(),
      furniture: [cover],
      templates: [
        {
          id: 'cover_test_room',
          size: [2, 1, 2],
          lootContext: { usage: [], tier: 'Tier1' },
          palette: { C: { furniture: cover.id, fixed: true } },
          layers: [['CC', 'CC']],
        },
      ],
    };
    const { issues } = buildRegistry([{ source: 'cover-test.json', data }]);
    expect(issues.some(({ message }) => message.includes('cannot be fitted'))).toBe(true);
    const loose = { ...data, templates: [{ ...data.templates[0]!, palette: { C: { furniture: cover.id } } }] };
    expect(buildRegistry([{ source: 'cover-test.json', data: loose }]).issues).toEqual([]);
  });
});

const BASE = 'src/content/base';

interface Slotted {
  id: string;
  choices?: { ref: { id: string } }[];
}

/** The content with every yard slot offering only the tarp yard, so the city is sure to hold tarps. */
const onlyTarpYards = (data: { mapAssemblies?: { slots: Slotted[] }[] }) => ({
  ...data,
  ...(data.mapAssemblies && {
    mapAssemblies: data.mapAssemblies.map((assembly) => ({
      ...assembly,
      slots: assembly.slots.map((slot) =>
        slot.choices?.some(({ ref }) => ref.id === 'gauntlet_yard_tarp')
          ? { ...slot, choices: slot.choices.filter(({ ref }) => ref.id === 'gauntlet_yard_tarp') }
          : slot,
      ),
    })),
  }),
});

describe('tarps', () => {
  it(
    'never lie over a hatch and keep clear of doors and ladders',
    () => {
      const built = buildRegistry(
        readdirSync(BASE)
          .filter((file) => file.endsWith('.json'))
          .sort()
          .map((file) => ({ source: file, data: onlyTarpYards(JSON.parse(readFileSync(join(BASE, file), 'utf8'))) })),
      );
      expect(built.issues).toEqual([]);
      const tarpYards = built.registry;
      const scenario = [...tarpYards.scenarios.values()].find((candidate) => candidate.composition)!;
      const city = new GauntletSite({ seed: 73, registry: tarpYards, scale: makeScale(0.5), scenario });
      const all = specsOf(city, city.plan.placements);
      const tarps = all.filter((spec) => spec.type === 'tarp');
      expect(tarps.length).toBeGreaterThan(0);
      const reserved = all.filter((spec) => {
        const def = registry.furniture.get(spec.type);
        return def?.door || def?.climbable;
      });
      const aboveHatches = new Set(
        all
          .filter((spec) => registry.furniture.get(spec.type)?.door?.hatch)
          .flatMap((hatch) =>
            cells({ pos: [hatch.pos[0], hatch.pos[1] + hatch.size[1], hatch.pos[2]], size: hatch.size }),
          ),
      );
      const reservedCells = new Set(reserved.flatMap(cells));
      for (const tarp of tarps) {
        for (const key of cells(tarp)) {
          expect(aboveHatches.has(key)).toBe(false);
          expect(reservedCells.has(key)).toBe(false);
        }
      }
    },
    GAUNTLET_SITE_MS,
  );
});
