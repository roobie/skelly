import { describe, expect, it } from 'vitest';
import { actionText, fillText } from '../src/core/actionText.ts';
import { AuthoredSite } from '../src/core/authoredSite.ts';
import { buildRegistry } from '../src/core/content.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { Inventory } from '../src/core/inventory.ts';
import { propCentre, type ShowroomProp, slotProps } from '../src/core/showroom.ts';
import { rectsOverlap } from '../src/core/site.ts';
import { cellsOf } from '../src/core/templates.ts';
import { availablePackInputs } from '../src/game/bundledContent.ts';
import { selectBundledMods } from '../src/game/bundledMods.ts';
import { configFromUrl } from '../src/game/config.ts';
import { playerStartFromWorld } from '../src/game/worldSetup.ts';
import { withReusedBuilds } from './bundledContentReuse.ts';
import { content as baseContent } from './fixtures/startupContent.ts';
import { testHouseSite } from './testHouseSite.ts';

const selected = withReusedBuilds(() => selectBundledMods(['skelly.deadvox.scenario.test-house.debug']));
const config = configFromUrl(new URLSearchParams('site=testHouse'), selected.content);
const { registry } = config.content;
const area = (authored: AuthoredSite) => {
  const { bounds } = registry.layouts.get('testHouse')!;
  const { rect } = authored.catalogue!;
  const metres = config.scale.blockSize;
  return {
    x0: Math.min(bounds.x0, rect.x0 * metres),
    z0: Math.min(bounds.z0, rect.z0 * metres),
    x1: Math.max(bounds.x1, rect.x1 * metres),
    z1: Math.max(bounds.z1, rect.z1 * metres),
  };
};
const { s, site, house, solid, furniture, walkable } = testHouseSite(registry, undefined, area);
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
  it('shows only furniture in loaded catalogue rows, not unlisted additions to content', () => {
    const layout = registry.layouts.get(config.site)!;
    const fixture = 'unlisted_showroom_fixture';
    const source = registry.furniture.values().next().value!;
    const extended = { ...registry, furniture: new Map(registry.furniture).set(fixture, { ...source, id: fixture }) };
    const authored = new AuthoredSite(7, extended, config.scale, layout);
    expect(authored.catalogue!.props.length).toBeGreaterThan(0);
    expect(new Set(authored.catalogue!.props.map(({ furniture: type }) => type))).toEqual(
      new Set([...registry.catalogueRows.values()].flatMap((row) => row.furniture)),
    );
    expect(authored.catalogue!.props.some(({ furniture: type }) => type === fixture)).toBe(false);
  });

  it('shows rows from other mods in load order, overridden in place, with no edge to the showroom host', () => {
    const listed = new Set([...registry.catalogueRows.values()].flatMap((row) => row.furniture));
    // Neither the showroom's host nor the host's dependency is an edge the fixture mods may lean on.
    const hosts = new Set(['skelly.deadvox.scenario.test-house.debug', 'skelly.deadvox.residual']);
    const ownerOf = (type: string) => {
      const origin = registry.contentOrigins.get(`furniture:${type}`)?.source;
      return availablePackInputs.find((pack) => origin?.startsWith(`${pack.source}/`))?.manifest.id;
    };
    // Each fixture mod brings its own furniture, copied from a plain piece whose owner it depends on.
    const source = [...registry.furniture.values()].find((def) => {
      const owner = ownerOf(def.id);
      return owner !== undefined && !hosts.has(owner) && !def.door && !def.power && !def.charger && !def.corpse;
    })!;
    const mod = (id: string, row: string, type: string, extra: { dependencies?: string[]; overrides?: object[] }) => ({
      id,
      data: {
        id,
        version: '1',
        tier: 'scenario',
        product: false,
        dependencies: [ownerOf(source.id)!, ...(extra.dependencies ?? [])],
        overrides: extra.overrides ?? [],
        furniture: [{ ...source, id: type }],
        catalogueRows: [{ id: row, furniture: [type] }],
      },
    });
    const mods = [
      mod('fixture.rows-a', 'fixture_row_a', 'fixture_furniture_a', {}),
      mod('fixture.rows-b', 'fixture_row_b', 'fixture_furniture_b', {}),
      mod('fixture.rows-b-override', 'fixture_row_b', 'fixture_furniture_c', {
        dependencies: ['fixture.rows-b'],
        overrides: [{ pack: 'fixture.rows-b', entry: 'catalogueRows:fixture_row_b' }],
      }),
    ];
    const withRows = withReusedBuilds(() => selectBundledMods(['skelly.deadvox.scenario.test-house.debug'], mods));
    expect(withRows.issues).toEqual([]);
    const rowsConfig = configFromUrl(new URLSearchParams('site=testHouse'), withRows.content);
    const rowsRegistry = rowsConfig.content.registry;
    const authored = new AuthoredSite(7, rowsRegistry, rowsConfig.scale, rowsRegistry.layouts.get('testHouse')!);
    const shown = authored.catalogue!.props.map(({ furniture: type }) => type);
    expect(shown.slice(-2)).toEqual(['fixture_furniture_a', 'fixture_furniture_c']);
    expect(shown).not.toContain('fixture_furniture_b');
    expect(new Set(shown.slice(0, -2))).toEqual(listed);
  });

  it('reports a catalogue row that names furniture missing from content', () => {
    const unknown = 'missing_catalogue_fixture';
    const { issues } = buildRegistry([
      { source: 'rows-fixture.json', data: { catalogueRows: [{ id: 'fixture_row', furniture: [unknown] }] } },
    ]);
    expect(issues).toContainEqual({
      source: 'rows-fixture.json',
      path: 'catalogueRows[0].furniture[0]',
      message: `no furniture "${unknown}"`,
    });
  });

  it('keeps vegetation grounded and out of the admitted catalogue floor', () => {
    expect(house.trees.length).toBeGreaterThan(0);
    for (const tree of house.trees) {
      expect(rectsOverlap(tree.bounds, catalogue.rect)).toBe(false);
      const [x, y, z] = tree.origin;
      expect(y).toBe(site.surface.height(x, z, 0) + 1);
    }
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

  it('keeps displaced looks behind spawn without shifting the packed row', () => {
    const showroom = house.showroom!;
    const packed = slotProps(registry, { ...showroom, slots: showroom.slots.filter(({ placement }) => !placement) });
    const displaced = slots.filter((_, i) => showroom.slots[i]!.placement);
    expect(displaced.length).toBeGreaterThan(0);
    for (const prop of displaced) {
      expect(aim(site.spawn.pos, site.spawn.yaw, propCentre(prop))).toBeLessThan(0);
    }
    expect(slots.filter((_, i) => !showroom.slots[i]!.placement)).toEqual(packed);
  });

  it('faces the newest slot from the default spawn', () => {
    expect(aim(site.spawn.pos, site.spawn.yaw, propCentre(slots.at(-1)!))).toBeGreaterThan(0.99);
  });

  it('falls back to the default spawn with a message for a focus the site does not show', () => {
    const normal = new AuthoredSite(
      7,
      baseContent.registry,
      config.scale,
      baseContent.registry.layouts.get(config.site)!,
    );
    const catalogueOnly = catalogue.props.find(
      ({ furniture: type }) => !slots.some((slot) => slot.furniture === type),
    )!;
    const setup = { spawn: normal.spawn, groundAt: () => 0, site: normal };
    const start = playerStartFromWorld(setup, config.scale, undefined, { focus: catalogueOnly.furniture });
    expect(start).toEqual({ ...playerStartFromWorld(setup, config.scale), unknownFocus: catalogueOnly.furniture });
    expect(fillText(actionText(registry).play.focusUnknown, { focus: start.unknownFocus! })).toContain(
      catalogueOnly.furniture,
    );
  });
});
