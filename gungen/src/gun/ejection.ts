import { applyPoint, type Vec3 } from '../core/math.ts';
import type { Resolved } from '../core/resolve.ts';
import type { PartDef } from '../core/schema.ts';

/** The case leaves at the near/right-hand face of the authored ejection keep-out. */
export const localEjectionPoint = (part: PartDef): Vec3 | undefined => {
  const volume = part.keepOuts.find(({ id }) => id === 'ejection');
  return volume ? [volume.box.center[0], volume.box.center[1], volume.box.center[2] - volume.box.half[2]] : undefined;
};

export const ejectionPoint = (resolved: Resolved): Vec3 | undefined => {
  for (const [id, part] of resolved.defs) {
    const local = localEjectionPoint(part);
    const placed = resolved.placed.get(id);
    if (local && placed) {
      return applyPoint(placed, local);
    }
  }
  return undefined;
};
