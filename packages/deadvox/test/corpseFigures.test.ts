import { Box3, Color, Mesh, type MeshStandardMaterial, type Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import type { BlockEntity } from '../src/core/blockEntities.ts';
import { type ContentSource, validateContent } from '../src/core/content.ts';
import { rotatedSize, rotationOf } from '../src/core/orientation.ts';
import { FIGURE_LIMBS, type FurnitureDef } from '../src/core/schema.ts';
import type { Facing } from '../src/core/templates.ts';
import { baseSources } from '../src/game/bundledContent.ts';
import { CorpseFigures } from '../src/render/corpseFigures.ts';
import type { ModelLibrary } from '../src/render/models.ts';
import { baseRegistry } from './baseRegistry.ts';
import { buildFixtureRegistry, FIXTURE_MATERIAL } from './economyFixtures.ts';
import { loadFigureModels } from './figureModels.ts';

const registry = baseRegistry();
const BLOCK_SIZE = 0.5;
const models = { version: 1, ...(await loadFigureModels(registry)) } as unknown as ModelLibrary;
const deadHumans = [...registry.furniture.values()].filter((def) => def.corpse);

const entityOf = (def: FurnitureDef, facing: Facing): BlockEntity =>
  ({
    uid: 1,
    type: def.id,
    origin: [10, 3, 20],
    pos: [10, 3, 20],
    size: rotatedSize(def.size, rotationOf({ facing })),
    facing,
    carried: false,
    searched: false,
    open: false,
  }) as BlockEntity;

/** Each exported material slot in `root` and the colour it is drawn in. */
const slotColours = (root: Object3D): Map<string, string> => {
  const found = new Map<string, string>();
  root.traverse((object) => {
    if (object instanceof Mesh && typeof object.geometry.userData.slot === 'string') {
      found.set(object.geometry.userData.slot, (object.material as MeshStandardMaterial).color.getHexString());
    }
  });
  return found;
};

/** The undressed colour of every slot across the player figure's models. */
const figureSlotColours = (): Map<string, string> => {
  const figure = registry.figures.get('player')!;
  const ids = new Set([figure.body.model, ...FIGURE_LIMBS.map((limb) => figure.limbs[limb].model)]);
  return new Map([...ids].flatMap((id) => [...slotColours(models.part(id)!)]));
};
/** Taken before any corpse is built, so a corpse that repaints the shared models can't move it. */
const UNDRESSED = figureSlotColours();

describe('dead human bodies', () => {
  it('has dead humans to draw', () => {
    expect(deadHumans.length).toBeGreaterThan(0);
  });

  it('lies each dead human as its figure on the floor and within its piece, whichever way it faces', () => {
    const corpses = new CorpseFigures(BLOCK_SIZE, registry, models);
    for (const def of deadHumans) {
      for (const facing of ['n', 'e'] as const) {
        const entity = entityOf(def, facing);
        const figure = corpses.figure(entity, def);
        expect(figure.visible, def.id).toBe(true);
        const box = new Box3().setFromObject(figure);
        const [x, y, z] = entity.pos.map((cells) => cells * BLOCK_SIZE);
        const [width, , depth] = entity.size.map((cells) => cells * BLOCK_SIZE);
        expect(box.min.y, `${def.id} rests on the floor`).toBeCloseTo(y!, 6);
        const size = box.getSize(box.max.clone());
        expect(size.y, `${def.id} lies down`).toBeLessThan(Math.max(size.x, size.z) / 2);
        expect(box.min.x, def.id).toBeGreaterThanOrEqual(x!);
        expect(box.max.x, def.id).toBeLessThanOrEqual(x! + width!);
        expect(box.min.z, def.id).toBeGreaterThanOrEqual(z!);
        expect(box.max.z, def.id).toBeLessThanOrEqual(z! + depth!);
      }
    }
  });

  it("dresses each dead human in its outfit's colours and leaves the shared models undressed", () => {
    const corpses = new CorpseFigures(BLOCK_SIZE, registry, models);
    for (const def of deadHumans) {
      const outfit = registry.figures.get(def.corpse!.figure)!.outfits[def.corpse!.outfit]!;
      const drawn = slotColours(corpses.figure(entityOf(def, 'n'), def));
      expect(drawn.size, def.id).toBeGreaterThan(0);
      for (const [slot, colour] of drawn) {
        const expected = Object.hasOwn(outfit, slot) ? new Color(outfit[slot]).getHexString() : UNDRESSED.get(slot);
        expect(colour, `${def.id} ${slot}`).toBe(expected);
      }
    }
    expect(figureSlotColours()).toEqual(UNDRESSED);
  });

  it('names only slots the figure models carry in every outfit', () => {
    for (const figure of registry.figures.values()) {
      for (const [id, outfit] of Object.entries(figure.outfits)) {
        for (const slot of Object.keys(outfit)) {
          expect(UNDRESSED.has(slot), `${figure.id} outfit ${id} slot ${slot}`).toBe(true);
        }
      }
    }
  });
});

describe('the content check for dead humans', () => {
  const body = { ...deadHumans[0]!, id: 'corpse_check_body', material: FIXTURE_MATERIAL };
  const baseSource = (name: string) => baseSources.find(({ source }) => source.endsWith(name))!;
  /** The figure and its own models only, so the check runs without building the whole pack. */
  const figureSources = (): ContentSource[] => {
    const modelRows = (baseSource('models-items.json').data as { models: { id: string }[] }).models;
    const figure = registry.figures.get(body.corpse!.figure)!;
    const ids = new Set([figure.body.model, ...FIGURE_LIMBS.map((limb) => figure.limbs[limb].model)]);
    return [
      baseSource('figures-player.json'),
      { source: 'corpse-models.json', data: { models: modelRows.filter(({ id }) => ids.has(id)) } },
    ];
  };

  it('refuses a body whose figure has no such outfit and accepts one in an outfit it has', () => {
    const unknown = { ...body, id: 'corpse_check_unknown', corpse: { ...body.corpse!, outfit: 'no_such_outfit' } };
    const { issues } = buildFixtureRegistry([
      ...figureSources(),
      { source: 'corpse-check.json', data: { furniture: [body, unknown] } },
    ]);
    expect(issues.filter(({ source }) => source === 'corpse-check.json').map(({ path }) => path)).toEqual([
      'furniture[1].corpse.outfit',
    ]);
  });

  it('refuses a body that is also drawn as a shape', () => {
    const shaped = { ...body, shape: [{ position: [0, 0, 0], size: [1, 1, 1] }] };
    expect(validateContent({ source: 'corpse-check.json', data: { furniture: [shaped] } })).not.toEqual([]);
  });
});
