// A cut is a run of blows a carried tool lands on a terrain cell. The cell's resistance decides which tools cut it, and
// the damage the cell retains is the cut's only progress, so a stopped cut resumes with any tool that cuts it.

import { bashBlock } from './blockDamage.ts';
import type { Blow } from './blow.ts';
import type { Registry } from './content.ts';
import type { Vec3 } from './coords.ts';
import { coreMessage } from './coreText.ts';
import type { Inventory } from './inventory.ts';
import { defOf, type Item } from './items.ts';
import { standingRubble } from './rubble.ts';
import type { BlockMaterialDef } from './schema.ts';
import type { SoundId } from './soundEvents.ts';
import { NOT_LOADED, type TerrainRead } from './terrainRead.ts';
import { fuelCovers, fuelRefusal, workFuel } from './torch.ts';
import type { World } from './world.ts';

export type CutWorld = TerrainRead & Pick<World, 'blockDamage'>;

export type CellCutPlan =
  | {
      ok: true;
      tool: Item;
      blow: Blow;
      /** Sim seconds between strikes. */
      strikeInterval: number;
      strikeSound: SoundId;
      /** Canister fill one strike spends from `tool`. */
      strikeFuel: number;
    }
  /** `dry`: a carried tool cuts the cell but holds too little fuel for one strike. */
  | { ok: false; reason: string; dry?: true };

/** The solid block a blow meets at a cell, by its material and the damage it retains; rubble and air meet none. */
const cutTarget = (
  world: CutWorld,
  registry: Registry,
  cell: Readonly<Vec3>,
): { material: BlockMaterialDef; damage: number } | undefined => {
  const id = world.getBlock(...cell);
  const block = id === NOT_LOADED ? undefined : registry.blocks[id];
  const material = block?.solid ? registry.blockMaterials.get(block.material) : undefined;
  return material && !standingRubble(world, registry, cell)
    ? { material, damage: world.blockDamage.get(cell)?.damage ?? 0 }
    : undefined;
};

const strikeOf = (registry: Registry, tool: Item) => {
  const cut = defOf(registry, tool.type).tool?.cut;
  return (
    cut && {
      blow: { strength: cut.strength, kind: cut.damageKind },
      strikeInterval: cut.strikeIntervalSimSeconds,
      strikeSound: cut.strikeSound,
      strikeFuel: workFuel(registry, tool, cut.strikeIntervalSimSeconds),
    }
  );
};

/** The carried tool that cuts the cell now, or why none does; `toolUid` pins the tool a resumed cut asks for. */
export const cellCutPlan = (
  inventory: Inventory,
  world: CutWorld,
  cell: Readonly<Vec3>,
  toolUid?: number,
): CellCutPlan => {
  const { registry } = inventory;
  const refuse = (key: 'broken' | 'gone' | 'tooFar' | 'nothingToCut'): CellCutPlan => ({
    ok: false,
    reason: coreMessage(registry, key),
  });
  const target = cutTarget(world, registry, cell);
  if (!target) {
    return refuse(standingRubble(world, registry, cell) ? 'broken' : 'gone');
  }
  if (!inventory.canReachCell(cell)) {
    return refuse('tooFar');
  }
  const capable = inventory
    .carriedTools()
    .filter((item) => toolUid === undefined || item.uid === toolUid)
    .flatMap((tool) => {
      const strike = strikeOf(registry, tool);
      return strike && bashBlock(target, strike.blow).outcome !== 'resisted' ? [{ tool, ...strike }] : [];
    });
  const usable = capable.find(({ tool, strikeFuel }) => fuelCovers(registry, tool, strikeFuel));
  if (usable) {
    return { ok: true, ...usable };
  }
  return capable.length > 0
    ? {
        ok: false,
        reason: fuelRefusal(
          registry,
          capable.map(({ tool }) => tool),
        ),
        dry: true,
      }
    : refuse('nothingToCut');
};
