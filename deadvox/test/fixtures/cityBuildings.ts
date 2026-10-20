import type { CityGrid, CityPlan } from '../../src/core/cityPlan.ts';
import type { Registry } from '../../src/core/content.ts';
import { admittedCandidates, lootSpawnPoint } from '../../src/core/loot.ts';
import { Rng } from '../../src/core/random.ts';
import type { MapAssemblyDef } from '../../src/core/schema.ts';
import { lootSourcesOf } from '../../src/core/site.ts';
import { STAIR_BODY_HALF_WIDTH } from '../../src/core/stairFlight.ts';
import { templateReachableStandingPositions } from '../../src/core/templateSpatial.ts';
import { type CompiledTemplate, compileAssembly, kitSlotChoices } from '../../src/core/templates.ts';

export const cityBuildingDraws = (plan: CityPlan, grid: CityGrid, seed: number) => {
  const ordinals = new Map<string, number>();
  return plan.placements.map((placement) => {
    const i = Math.floor(placement.origin[0] / (grid.street + grid.blockX));
    const j = Math.floor(placement.origin[2] / (grid.street + grid.blockZ));
    const row = placement.turn === 0 ? 0 : 1;
    const key = `${i},${j},${row}`;
    const k = ordinals.get(key) ?? 0;
    ordinals.set(key, k + 1);
    return {
      id: placement.template.id,
      draw: Rng.stream(seed, `city:${i},${j}/row:${row}/building:${k}/type`).next(),
      remaining: (i + 1) * (grid.street + grid.blockX) - grid.pad - placement.origin[0],
    };
  });
};

const tableItems = (registry: Registry, root: string): string[] => {
  const pending = [root];
  const seen = new Set<string>();
  const items: string[] = [];
  while (pending.length > 0) {
    const table = pending.pop()!;
    if (seen.has(table)) {
      continue;
    }
    seen.add(table);
    for (const entry of registry.loot.get(table)!.entries) {
      if (entry.table) {
        pending.push(entry.table);
      }
      if (entry.item) {
        items.push(entry.item);
      }
    }
  }
  return items;
};

export const buildingLootEvidence = (registry: Registry, template: CompiledTemplate) => {
  const reachable = templateReachableStandingPositions(registry, template);
  const sources = lootSourcesOf(registry, 'building_contract', { template, origin: [0, 0, 0], turn: 0 });
  return {
    standing: reachable.length,
    sources: sources.map((source) => {
      const piece = template.pieces.find(({ pos }) => pos.join(',') === source.anchor.join(','))!;
      const [x, feet, z] = piece.pos;
      const accessible = reachable.some(
        ([px, py, pz]) =>
          py === feet &&
          Math.hypot(Math.max(x - px, 0, px - (x + piece.size[0])), Math.max(z - pz, 0, pz - (z + piece.size[2]))) <=
            STAIR_BODY_HALF_WIDTH + 0.5,
      );
      const point = lootSpawnPoint(source);
      const candidates = point.supply.kind === 'table' ? tableItems(registry, point.supply.table) : [];
      const items = admittedCandidates(
        registry,
        point,
        candidates.map((type) => ({ type, weight: 1 })),
      ).map(({ type }) => type);
      return {
        label: `${template.id}: ${piece.furniture}`,
        stocked: point.supply.kind === 'fixed',
        onStorey: template.access?.storeys.some(({ floor }) => floor === feet) ?? false,
        accessible,
        items,
      };
    }),
  };
};

export const buildingVariants = (registry: Registry, assembly: MapAssemblyDef): CompiledTemplate[] => {
  const alternatives = Math.max(1, ...assembly.slots.map((slot) => kitSlotChoices(registry, slot).length));
  return Array.from({ length: alternatives }, (_, variant) =>
    compileAssembly(
      registry,
      {
        ...assembly,
        slots: assembly.slots.map(({ pool: _pool, ...slot }) => {
          const choices = kitSlotChoices(registry, { ...slot, pool: _pool });
          return { ...slot, choices: [choices[variant % choices.length]!] };
        }),
      },
      { seed: 1, siteId: 'building_contract' },
    ),
  );
};
