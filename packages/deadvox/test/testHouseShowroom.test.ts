import { describe, expect, it } from 'vitest';
import { actionText, fillText } from '../src/core/actionText.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { Inventory } from '../src/core/inventory.ts';
import { propCentre, type ShowroomProp } from '../src/core/showroom.ts';
import { cellsOf } from '../src/core/templates.ts';
import { DebugTestHouseSite, playerStartFromWorld } from '../src/game/worldSetup.ts';
import { configFromUrl } from './fixtures/startupContent.ts';
import { testHouseSite } from './testHouseSite.ts';

const config = configFromUrl(new URLSearchParams('site=testHouse&debug=1'));
const { registry } = config.content;
const wrapped = (authored: ConstructorParameters<typeof DebugTestHouseSite>[2]) =>
  new DebugTestHouseSite(config, registry, authored);
// The catalogue floor lies outside the lot, so gather furniture over both.
const area = (debug: DebugTestHouseSite) => {
  const { bounds } = registry.layouts.get('testHouse')!;
  const { rect } = debug.catalogue!;
  const metres = config.scale.blockSize;
  return {
    x0: Math.min(bounds.x0, rect.x0 * metres),
    z0: Math.min(bounds.z0, rect.z0 * metres),
    x1: Math.max(bounds.x1, rect.x1 * metres),
    z1: Math.max(bounds.z1, rect.z1 * metres),
  };
};
const { s, site, house, solid, furniture, walkable } = testHouseSite(registry, wrapped, area);
const catalogue = site.catalogue!;
const { slots } = house;

const cellsOfProp = ({ pos, size }: Pick<ShowroomProp, 'pos' | 'size'>): Vec3[] =>
  [...cellsOf(size)].map(([dx, dy, dz]): Vec3 => [pos[0] + dx, pos[1] + dy, pos[2] + dz]);
const furnitureCells = new Set(furniture.flatMap(({ spec }) => cellsOfProp(spec).map((cell) => cell.join())));
const blocks = (metres: readonly number[]): Vec3 => metres.map((value) => Math.floor(value / s)) as Vec3;
/** How squarely a yaw looks at a point from where the player stands; 1 is dead ahead. */
const aim = (from: readonly number[], yaw: number, target: readonly number[]): number => {
  const dx = target[0]! - from[0]!;
  const dz = target[2]! - from[2]!;
  return (-Math.sin(yaw) * dx - Math.cos(yaw) * dz) / Math.hypot(dx, dz);
};

describe('test house showroom', () => {
  it('shows every content furniture piece in the catalogue', () => {
    expect(new Set(catalogue.props.map(({ furniture: type }) => type))).toEqual(new Set(registry.furniture.keys()));
  });

  it('stands every slot and catalogue prop on its deck or floor, clear of structure and of each other', () => {
    expect(slots.length).toBeGreaterThan(0);
    const occupied = new Map<string, string>();
    for (const { spec } of furniture) {
      for (const cell of cellsOfProp(spec)) {
        expect(occupied.get(cell.join()), `${spec.type} overlaps at ${cell}`).toBeUndefined();
        occupied.set(cell.join(), spec.type);
      }
    }
    for (const prop of [...slots, ...catalogue.props]) {
      expect(
        furniture.some(({ spec }) => spec.type === prop.furniture && spec.pos.join() === prop.pos.join()),
        `${prop.furniture} is spawned`,
      ).toBe(true);
      for (const [x, y, z] of cellsOfProp(prop)) {
        expect(solid(x, y, z), `${prop.furniture} buried at ${[x, y, z]}`).toBe(false);
        if (y === prop.pos[1]) {
          expect(solid(x, y - 1, z), `${prop.furniture} unsupported at ${[x, z]}`).toBe(true);
        }
      }
    }
  });

  it('starts a focus in front of its prop, on walkable ground, looking at it', () => {
    const shown = new Map<string, ShowroomProp>();
    for (const prop of [...catalogue.props, ...slots]) {
      shown.set(prop.furniture, prop); // A slot wins, as it does for focus.
    }
    for (const [type, prop] of shown) {
      const pose = site.focus(type)!;
      const [x, y, z] = blocks(pose.pos);
      expect(walkable(x, y, z), `${type} focus stands on walkable ground`).toBe(true);
      expect(
        [0, 1, 2, 3].some((dy) => furnitureCells.has([x, y + dy, z].join())),
        `${type} focus stands clear of furniture`,
      ).toBe(false);
      expect(aim(pose.pos, pose.yaw, propCentre(prop)), `${type} focus looks at its prop`).toBeGreaterThan(0.99);
    }
  });

  it('fits every staged surface item on its furniture', () => {
    const inventory = new Inventory(registry);
    for (const spawn of furniture) {
      inventory.furnish(spawn.spec, spawn.loot, spawn.surfaceLoot, spawn.fixedCount);
    }
  });

  it('faces the newest slot from the default spawn', () => {
    expect(aim(site.spawn.pos, site.spawn.yaw, propCentre(slots.at(-1)!))).toBeGreaterThan(0.99);
  });

  it('falls back to the default spawn with a message for a focus the site does not show', () => {
    // Normal mode has no catalogue, so a piece only the catalogue shows is not a focus there.
    const catalogueOnly = catalogue.props.find(
      ({ furniture: type }) => !slots.some((slot) => slot.furniture === type),
    )!;
    const setup = { spawn: house.spawn, groundAt: () => 0, site: house };
    const start = playerStartFromWorld(setup, config.scale, undefined, { focus: catalogueOnly.furniture });
    expect(start).toEqual({ ...playerStartFromWorld(setup, config.scale), unknownFocus: catalogueOnly.furniture });
    expect(fillText(actionText(registry).play.focusUnknown, { focus: start.unknownFocus! })).toContain(
      catalogueOnly.furniture,
    );
  });
});
