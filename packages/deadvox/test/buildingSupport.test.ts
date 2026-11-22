// An intact briefed building must hold under the support rule on natural ground, since support and collapse let a
// cell held only by luck fall in a later cascade (`docs/building-pathway.md`, "Fit check").
import type { Registry } from '@skelly/engine/content';
import type { Vec3 } from '@skelly/engine/internal/core/coords.ts';
import type { ContentFile } from '@skelly/engine/internal/core/schema.ts';
import { createSupport } from '@skelly/engine/internal/core/structureSupport.ts';
import { compileAssembly, placedBlockAt } from '@skelly/engine/internal/core/templates.ts';
import { type PackInput, selectBundledMods } from '@skelly/engine/packs';
import { expect, it } from 'vitest';
import { productModIntake } from '../src/product/mods.ts';
import { withReusedBuilds } from './bundledContentReuse.ts';

/**
 * Briefed buildings known not to hold, skipped by name until they do: issue #2031, briefed buildings that do not hold.
 * A skipped building that holds, or that no pack declares, fails the test, so the list cannot go stale.
 */
const KNOWN_UNSUPPORTED: ReadonlySet<string> = new Set([
  'boarded_door_look_house',
  'boarded_window_look_boards',
  'boarded_window_look_glass',
  'condition_pavilion_intact',
  'condition_pavilion_nested',
  'condition_pavilion_worn',
  'gauntlet_city_1',
  'gauntlet_city_1_cellar',
  'gauntlet_city_2',
  'gauntlet_city_2_cellar',
  'gauntlet_city_3',
  'gauntlet_city_3_cellar',
  'gauntlet_city_villa',
  'rural_flat_roof_house',
  'rural_flat_roof_house_cellar',
  'rural_flat_roof_house_wc',
  'rural_flat_roof_house_wc_cellar',
  'rural_plot_privy',
  'rural_plot_privy_cellar',
  'rural_plot_privy_garage',
  'rural_plot_privy_garage_cellar',
  'rural_plot_wc',
  'rural_plot_wc_cellar',
  'rural_plot_wc_garage',
  'rural_plot_wc_garage_cellar',
  'village_shop',
]);

const declaresBriefed = ({ files }: PackInput): boolean =>
  files.some(({ data }) => (data as ContentFile).mapAssemblies?.some(({ brief }) => brief !== undefined) === true);

/** The defaults, and each opt-in pack that declares a briefed building, as the game loads it on the defaults. */
const selections = (): string[][] => {
  const { availablePackInputs } = productModIntake.content;
  return [
    [],
    ...availablePackInputs
      .filter((pack) => pack.manifest.optIn && declaresBriefed(pack))
      .map(({ manifest }) => [manifest.id]),
  ];
};

/**
 * The solid cells of an assembly set whole on natural ground that the support rule drops. Every alternative of a slot
 * has the same solid cells, so one draw stands for every variant's structure.
 */
const unsupported = (registry: Registry, id: string): Vec3[] => {
  const assembly = registry.mapAssemblies.get(id)!;
  const template = compileAssembly(registry, assembly, { seed: 0, siteId: `support:${id}` });
  const placement = { template, origin: [0, 0, 0] as Vec3, turn: 0 as const };
  const surface = template.groundLayer ?? 0;
  const ground = registry.blocks.findIndex(({ solid }) => solid);
  const stamped = (x: number, y: number, z: number) => placedBlockAt(placement, [x, y, z]);
  const natural = (x: number, y: number, z: number) => stamped(x, y, z) === undefined && y <= surface;
  const support = createSupport(registry, {
    minY: -2,
    maxY: template.size[1] + 1,
    block: (x, y, z) => stamped(x, y, z) ?? (natural(x, y, z) ? ground : 0),
    natural,
  });
  const [sx, sy, sz] = template.size;
  const dropped: Vec3[] = [];
  for (let y = 0; y < sy; y++) {
    for (let z = 0; z < sz; z++) {
      for (let x = 0; x < sx; x++) {
        const block = stamped(x, y, z);
        if (block !== undefined && registry.blocks[block]?.solid && !support.holds([x, y, z])) {
          dropped.push([x, y, z]);
        }
      }
    }
  }
  return dropped;
};

it('holds every building that answers a brief, intact on natural ground, under the support rule', () => {
  const checked = new Set<string>();
  const failing: Record<string, number> = {};
  const stillFailing = new Set<string>();
  for (const ids of selections()) {
    const { registry } = withReusedBuilds(() => selectBundledMods(productModIntake, ids)).content;
    for (const assembly of registry.mapAssemblies.values()) {
      if (assembly.brief === undefined || checked.has(assembly.id)) {
        continue;
      }
      checked.add(assembly.id);
      const dropped = unsupported(registry, assembly.id).length;
      if (dropped === 0) {
        continue;
      }
      if (KNOWN_UNSUPPORTED.has(assembly.id)) {
        stillFailing.add(assembly.id);
      } else {
        failing[assembly.id] = dropped;
      }
    }
  }
  expect(checked.size, 'some building answers a brief').toBeGreaterThan(0);
  expect(failing).toEqual({});
  expect(
    [...KNOWN_UNSUPPORTED].filter((id) => !stillFailing.has(id)),
    'skipped buildings that hold or that no pack declares; drop them from KNOWN_UNSUPPORTED',
  ).toEqual([]);
});
