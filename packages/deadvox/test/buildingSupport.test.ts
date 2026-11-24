// An intact briefed building must hold under the support rule on natural ground, since support and collapse let a
// cell held only by luck fall in a later cascade (`docs/building-pathway.md`, "Fit check").
import type { Registry } from '@skelly/engine/content';
import { rootStyles } from '@skelly/engine/internal/core/buildingBriefs.ts';
import type { Vec3 } from '@skelly/engine/internal/core/coords.ts';
import type { ContentFile, KitRef, MapAssemblyDef } from '@skelly/engine/internal/core/schema.ts';
import { createSupport } from '@skelly/engine/internal/core/structureSupport.ts';
import {
  type CompiledTemplate,
  cellsOf,
  compileAssembly,
  compileMapPiece,
  kitSlotChoices,
  placedBlockAt,
  placedCell,
  type Turn,
} from '@skelly/engine/internal/core/templates.ts';
import { type PackInput, selectBundledMods } from '@skelly/engine/packs';
import { expect, it } from 'vitest';
import { compileJsonnetFile } from '../../../tools/jsonnet/index.mjs';
import { productModIntake } from '../src/product/mods.ts';
import { baseRegistry, overlayContent } from './baseRegistry.ts';
import { withReusedBuilds } from './bundledContentReuse.ts';

/**
 * Briefed buildings known not to hold, skipped by name until they do: issue #2031, briefed buildings that do not hold.
 * A skipped building that holds, or that no pack declares, fails the test, so the list cannot go stale.
 */
const KNOWN_UNSUPPORTED: ReadonlySet<string> = new Set([
  'condition_pavilion_intact',
  'condition_pavilion_nested',
  'condition_pavilion_worn',
  'gauntlet_city_2_cellar',
  'gauntlet_city_3_cellar',
  'rural_flat_roof_house_cellar',
  'rural_flat_roof_house_wc_cellar',
  'rural_plot_privy_cellar',
  'rural_plot_privy_garage_cellar',
  'rural_plot_wc_cellar',
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

interface Frame {
  readonly size: Vec3;
  readonly origin: Vec3;
  readonly turn: Turn;
}

/**
 * For each root cell that some slot alternative builds solid, the block of least span any alternative builds there,
 * walking every alternative at any depth in its inherited style as the fit check does
 * (`packages/engine/src/core/buildingBriefs.ts`, `slotVariants`).
 */
const weakestBlocks = (registry: Registry, root: MapAssemblyDef, style: string | undefined): Map<string, number> => {
  const spanOf = (block: number) => registry.blockMaterials.get(registry.blocks[block]!.material)?.span ?? 0;
  const weakest = new Map<string, number>();
  const walk = (assembly: MapAssemblyDef, frames: readonly Frame[], inherited: string | undefined): void => {
    const slots = [
      ...assembly.slots.map((slot) => ({ at: slot.at, turn: slot.turn, choices: kitSlotChoices(registry, slot) })),
      ...assembly.joins.map(({ seam }) => ({
        at: seam.at,
        turn: seam.turn,
        choices: [{ ref: { kind: 'piece', id: seam.piece } as KitRef }],
      })),
    ];
    for (const { at: origin, turn, choices } of slots) {
      for (const { ref } of choices) {
        const inner = ref.style ?? inherited;
        if (ref.kind === 'assembly') {
          const nested = registry.mapAssemblies.get(ref.id)!;
          walk(nested, [{ size: nested.size, origin, turn }, ...frames], inner);
          continue;
        }
        const piece = compileMapPiece(registry, registry.mapPieces.get(ref.id)!, {
          seed: 0,
          siteId: `support:${root.id}`,
          ...(inner === undefined ? {} : { style: inner }),
        });
        const lift: Frame[] = [{ size: piece.size, origin, turn }, ...frames];
        [...cellsOf(piece.size)].forEach((cell, index) => {
          const block = piece.blocks[index]!;
          if (piece.ownership?.[index] === 0 || piece.ground?.[index] || !registry.blocks[block]?.solid) {
            return;
          }
          const key = lift.reduce((lifted, frame) => placedCell(frame, lifted), cell).join(',');
          const known = weakest.get(key);
          if (known === undefined || spanOf(block) < spanOf(known)) {
            weakest.set(key, block);
          }
        });
      }
    }
  };
  walk(root, [], style);
  return weakest;
};

/** An assembly compiled in one style it is placed in, with the draw the support proof stamps. */
const built = (registry: Registry, id: string, style: string | undefined): CompiledTemplate =>
  compileAssembly(registry, registry.mapAssemblies.get(id)!, {
    seed: 0,
    siteId: `support:${id}`,
    ...(style === undefined ? {} : { style }),
  });

/**
 * The solid cells of an assembly, built in one style it is placed in and set whole on natural ground, that the support
 * rule drops in its weakest variant. A slot's alternatives agree on which cells are solid
 * (`packages/engine/src/core/templates.ts`, `resolveSlot`) but not on how far their materials span, so each solid cell takes the least span any alternative
 * gives it. A shorter span never lets more cells hold, so when that holds every variant does; it may fail cells no one
 * draw weakens together, never pass one a draw drops. A style changes the blocks, so each style is built.
 */
const unsupported = (
  registry: Registry,
  id: string,
  style: string | undefined,
  template = built(registry, id, style),
): Vec3[] => {
  const assembly = registry.mapAssemblies.get(id)!;
  const placement = { template, origin: [0, 0, 0] as Vec3, turn: 0 as const };
  const surface = template.groundLayer ?? 0;
  const ground = registry.blocks.findIndex(({ solid }) => solid);
  const weakest = weakestBlocks(registry, assembly, style);
  const stamped = (x: number, y: number, z: number) => placedBlockAt(placement, [x, y, z]);
  const natural = (x: number, y: number, z: number) => stamped(x, y, z) === undefined && y <= surface;
  const support = createSupport(registry, {
    minY: -2,
    maxY: template.size[1] + 1,
    block: (x, y, z) => {
      const block = stamped(x, y, z);
      if (block === undefined) {
        return natural(x, y, z) ? ground : 0;
      }
      return registry.blocks[block]?.solid ? (weakest.get(`${x},${y},${z}`) ?? block) : block;
    },
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

it('drops a building whose undrawn slot alternative has the same solid cells but spans too short to hold', () => {
  const fixture = JSON.parse(
    compileJsonnetFile('packages/deadvox/test/fixtures/jsonnet/weak-joist-stores.jsonnet'),
  ) as ContentFile;
  const registry = overlayContent(baseRegistry(), [{ source: 'weak-joist-stores', data: fixture }]);
  const { id } = fixture.mapAssemblies![0]!;
  const drawn: KitRef[] = [];
  compileAssembly(registry, registry.mapAssemblies.get(id)!, {
    seed: 0,
    siteId: `support:${id}`,
    onDraw: (path, ref) => (path.endsWith('/shell') ? drawn.push(ref) : undefined),
  });
  expect(
    drawn.map(({ style }) => style),
    'the draw builds the shell that holds',
  ).toEqual([undefined]);
  expect(unsupported(registry, id, undefined)).not.toEqual([]);
});

/** Each briefed building, once per style it is placed in, with the first registry that places it there. */
const briefedBuilds = (): Map<string, { registry: Registry; id: string; style: string | undefined }> => {
  const builds = new Map<string, { registry: Registry; id: string; style: string | undefined }>();
  for (const ids of selections()) {
    const { registry } = withReusedBuilds(() => selectBundledMods(productModIntake, ids)).content;
    for (const assembly of [...registry.mapAssemblies.values()].filter(({ brief }) => brief !== undefined)) {
      // An opt-in pack may place a default building in a style of its own, so each style is checked once.
      for (const style of rootStyles(registry, assembly)) {
        const key = style === undefined ? assembly.id : `${assembly.id} in style ${style}`;
        if (!builds.has(key)) {
          builds.set(key, { registry, id: assembly.id, style });
        }
      }
    }
  }
  return builds;
};

/**
 * How many solid cells drop, or undefined for a style the building cannot be built in, which validate's styles rule
 * reports. Only the compile is excused; an error in the support proof itself is the test's to report.
 */
const droppedCells = (registry: Registry, id: string, style: string | undefined): number | undefined => {
  let template: CompiledTemplate;
  try {
    template = built(registry, id, style);
  } catch {
    return undefined;
  }
  return unsupported(registry, id, style, template).length;
};

it('holds every building that answers a brief, intact on natural ground, under the support rule', () => {
  const unskipped: string[] = [];
  const failing: Record<string, number> = {};
  const stillFailing = new Set<string>();
  const errors: Record<string, string> = {};
  for (const [key, { registry, id, style }] of briefedBuilds()) {
    let dropped: number | undefined;
    try {
      dropped = droppedCells(registry, id, style);
    } catch (error) {
      errors[key] = error instanceof Error ? error.message : String(error);
      continue;
    }
    if (dropped === undefined) {
      continue;
    }
    if (!KNOWN_UNSUPPORTED.has(id)) {
      unskipped.push(key);
      if (dropped > 0) {
        failing[key] = dropped;
      }
    } else if (dropped > 0) {
      stillFailing.add(id);
    }
  }
  expect(errors, 'support proofs that threw, by building and style').toEqual({});
  expect(unskipped.length, 'some building that is not skipped is checked').toBeGreaterThan(0);
  expect(failing).toEqual({});
  expect(
    [...KNOWN_UNSUPPORTED].filter((id) => !stillFailing.has(id)),
    'skipped buildings that hold or that no pack declares; drop them from KNOWN_UNSUPPORTED',
  ).toEqual([]);
});
