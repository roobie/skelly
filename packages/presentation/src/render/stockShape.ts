import type { FurnitureDef } from '@skelly/engine/content';
import type { BlockEntity } from '@skelly/engine/world';

export const stockShapeStep = (entity: BlockEntity, def: FurnitureDef): number => {
  const look = def.stockAppearance;
  if (!look) {
    return 0;
  }
  const count = (entity.pockets ?? []).flat().reduce((sum, { item }) => sum + item.count, 0);
  const share = Math.min(1, count / look.fullCount);
  return look.steps.findLastIndex(({ from }) => share >= from);
};
