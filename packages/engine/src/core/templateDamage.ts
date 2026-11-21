import type { GeneratedBlockDamage } from './blockDamage.ts';
import type { CanonicalTerrain } from './canonicalTerrain.ts';
import { templateCondition } from './conditionDistribution.ts';
import type { Registry } from './content.ts';
import { toChunk, type Vec3 } from './coords.ts';
import type { BlockBox } from './structure.ts';
import { cellsOf, footprint, turned, unturned } from './templates.ts';
import type { TerrainPlacement } from './terrainPlan.ts';
import { NOT_LOADED, type TerrainRead } from './terrainRead.ts';

type Stage = { kind: 'placement'; placement: TerrainPlacement } | { kind: 'box'; box: BlockBox };
const columnKey = (x: number, z: number): string => `${toChunk(x)},${toChunk(z)}`;
const placementCell = (placement: TerrainPlacement, cell: Readonly<Vec3>) => {
  const { template, origin, turn } = placement;
  const [x, z] = unturned(template.size, turn, cell[0] - origin[0], cell[2] - origin[2]);
  const local: Vec3 = [x, cell[1] - origin[1], z];
  if (!local.every((value, axis) => value >= 0 && value < template.size[axis]!)) {
    return;
  }
  const index = x + template.size[0] * (z + template.size[2] * local[1]);
  if (template.ownership?.[index] === 0 || template.ground?.[index]) {
    return;
  }
  return { placement, local, block: template.blocks[index]! };
};
const stageBounds = (stage: Stage): { min: Vec3; max: Vec3 } => {
  if (stage.kind === 'box') {
    return stage.box;
  }
  const { origin, template } = stage.placement;
  const [width, depth] = footprint(stage.placement);
  return { min: origin, max: [origin[0] + width, origin[1] + template.size[1], origin[2] + depth] };
};

const stageCell = (stage: Stage, cell: Readonly<Vec3>): ReturnType<typeof placementCell> | false => {
  if (stage.kind === 'placement') {
    return placementCell(stage.placement, cell);
  }
  return cell.every((value, axis) => value >= stage.box.min[axis]! && value < stage.box.max[axis]!) ? false : undefined;
};

/** Derived defaults never enter the changed-cell ledger, even when rendering enumerates them. */
export const templateDamageSource = (
  canonical: CanonicalTerrain,
  registry: Registry,
  read: TerrainRead,
): GeneratedBlockDamage => {
  const { plan } = canonical.terrain;
  const { site } = plan;
  const placements = site.kind === 'authored' || site.kind === 'city' ? site.placements : [];
  const stages: Stage[] = [
    ...placements.map((placement) => ({ kind: 'placement' as const, placement })),
    ...(site.stamps ?? []).flatMap<Stage>((stage) =>
      stage.kind === 'placements'
        ? stage.placements.map((placement) => ({ kind: 'placement' as const, placement }))
        : stage.boxes.map((box) => ({ kind: 'box' as const, box })),
    ),
  ];
  const conditioned = stages.flatMap((stage) =>
    stage.kind === 'placement' && stage.placement.template.condition ? [stage.placement] : [],
  );
  const byColumn = new Map<string, Stage[]>();
  if (conditioned.length > 0) {
    for (const stage of stages) {
      const { min, max } = stageBounds(stage);
      for (let cz = toChunk(min[2]); cz <= toChunk(max[2] - 1); cz++) {
        for (let cx = toChunk(min[0]); cx <= toChunk(max[0] - 1); cx++) {
          const key = `${cx},${cz}`;
          const rows = byColumn.get(key) ?? [];
          rows.push(stage);
          byColumn.set(key, rows);
        }
      }
    }
  }
  const at = (cell: Readonly<Vec3>): ReturnType<typeof placementCell> => {
    const rows = byColumn.get(columnKey(cell[0], cell[2])) ?? [];
    for (let i = rows.length - 1; i >= 0; i--) {
      const authored = stageCell(rows[i]!, cell);
      if (authored === false) {
        return;
      }
      if (authored !== undefined) {
        return authored.placement.template.condition ? authored : undefined;
      }
    }
    return undefined;
  };
  return {
    has: (cell) => {
      const authored = at(cell);
      return authored !== undefined && registry.blocks[authored.block]?.solid === true;
    },
    get: (cell) => {
      const authored = at(cell);
      if (!authored) {
        return;
      }
      const id = read.getBlock(...cell);
      if (id === NOT_LOADED || authored.block !== id) {
        return;
      }
      const block = registry.blocks[id];
      const material = block?.solid ? registry.blockMaterials.get(block.material) : undefined;
      if (!material) {
        return;
      }
      return (1 - templateCondition(plan.seed, authored.placement, authored.local)) * material.durability;
    },
    *cells() {
      const seen = new Set<string>();
      for (const placement of conditioned) {
        const { template, origin, turn } = placement;
        for (const local of cellsOf(template.size)) {
          const index = local[0] + template.size[0] * (local[2] + template.size[2] * local[1]);
          if (!registry.blocks[template.blocks[index]!]?.solid) {
            continue;
          }
          const [x, z] = turned(template.size, turn, local[0], local[2]);
          const cell: Vec3 = [origin[0] + x, origin[1] + local[1], origin[2] + z];
          const key = cell.join(',');
          if (!seen.has(key)) {
            seen.add(key);
            yield cell;
          }
        }
      }
    },
    ensure: (cell) => canonical.ensureCell(...cell),
  };
};
