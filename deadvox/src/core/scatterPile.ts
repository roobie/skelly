// Deterministic, presentation-only scatter for items whose pile display is "scatter".

import type { Registry } from './content.ts';
import type { Vec3 } from './coords.ts';
import type { Pile } from './inventory.ts';
import type { Item } from './items.ts';
import { Rng } from './random.ts';
import { PILE_DISPLAY_KIND } from './schema.ts';

export const SPENT_CASE_SCATTER_CAP = 48;

export interface SpentCaseInstance {
  readonly position: Vec3;
  readonly rotation: Vec3;
}

export interface SpentCaseScatterInput {
  readonly worldSeed: number;
  readonly pilePos: Vec3;
  readonly count: number;
  readonly blockSize: number;
  readonly key?: string;
}

/** Stable from world seed, pile anchor and count; after the cap, the layout stays unchanged. */
export const spentCaseScatter = ({
  worldSeed,
  pilePos,
  count,
  blockSize,
  key = '',
}: SpentCaseScatterInput): SpentCaseInstance[] => {
  const shown = Math.min(Math.max(0, Math.floor(count)), SPENT_CASE_SCATTER_CAP);
  if (shown === 0) {
    return [];
  }
  const rng = Rng.stream(worldSeed, `spent-case-pile:${pilePos.join(',')}:${key}`);
  const phase = rng.range(0, 2 * Math.PI);
  const spread = blockSize * (0.12 + 0.3 * Math.sqrt((shown - 1) / (SPENT_CASE_SCATTER_CAP - 1)));
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const [x, y, z] = pilePos;
  return Array.from({ length: shown }, (_, index) => {
    const radius = spread * Math.sqrt((index + 0.5) / shown);
    const angle = phase + index * goldenAngle;
    return {
      position: [
        (x + 0.5) * blockSize + Math.cos(angle) * radius,
        y * blockSize + 0.006,
        (z + 0.5) * blockSize + Math.sin(angle) * radius,
      ],
      rotation: [rng.range(0, Math.PI), rng.range(0, 2 * Math.PI), rng.range(0, Math.PI)],
    };
  });
};

export interface PileScatterPlacement extends SpentCaseInstance {
  readonly item: Item;
}

/** Returns the visible scatter instances, with the same placement used by the renderer. */
export const pileScatterPlacements = (options: {
  readonly registry: Registry;
  readonly pile: Pile;
  readonly worldSeed: number;
  readonly blockSize: number;
}): PileScatterPlacement[] => {
  const { registry, pile, worldSeed, blockSize } = options;
  const byType = new Map<string, Item[]>();
  for (const { item } of pile.items) {
    if (registry.items.get(item.type)?.pileDisplay !== PILE_DISPLAY_KIND.scatter) {
      continue;
    }
    const items = byType.get(item.type) ?? [];
    items.push(item);
    byType.set(item.type, items);
  }

  const placements: PileScatterPlacement[] = [];
  let shown = 0;
  for (const [itemType, unsortedItems] of [...byType].sort(([a], [b]) => a.localeCompare(b))) {
    const items = [...unsortedItems].sort((a, b) => a.uid - b.uid);
    const count = items.reduce((sum, item) => sum + item.count, 0);
    const visibleCount = Math.min(count, SPENT_CASE_SCATTER_CAP - shown);
    if (visibleCount === 0) {
      break;
    }
    const instances = spentCaseScatter({
      worldSeed,
      pilePos: pile.pos,
      count: visibleCount,
      blockSize,
      key: itemType,
    });
    let instanceIndex = 0;
    for (const item of items) {
      const itemCount = Math.min(item.count, visibleCount - instanceIndex);
      for (let index = 0; index < itemCount; index++) {
        placements.push({ item, ...instances[instanceIndex]! });
        instanceIndex += 1;
      }
      if (instanceIndex === visibleCount) {
        break;
      }
    }
    shown += visibleCount;
  }
  return placements;
};
