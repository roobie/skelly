import type { BlockEntity, DoorPanelBox } from './blockEntities.ts';
import type { FurnitureDef } from './content.ts';
import type { Vec3 } from './coords.ts';
import { rotationOf } from './orientation.ts';

export interface WindowState {
  open: boolean;
  latched: boolean;
  pane: 'intact' | 'missing';
  damage: number;
  frameRemnants: boolean;
}

export interface WindowPart {
  kind: 'frame' | 'sash' | 'pane';
  box: DoorPanelBox;
}

/** All boxes share the same hinge frame, so rendering and picking cannot disagree about a swung pane. */
export const windowParts = (entity: BlockEntity, definition: FurnitureDef, blockSize: number): WindowPart[] => {
  const spec = definition.window;
  if (!(spec && entity.window)) {
    return [];
  }
  const alongX = entity.facing === 'n' || entity.facing === 's';
  const width = entity.size[alongX ? 0 : 2] * blockSize;
  const height = entity.size[1] * blockSize;
  const frame = spec.frameWidthBlocks * blockSize;
  const sash = spec.sashWidthBlocks * blockSize;
  const high = spec.hinge === 'high';
  const [axis] = rotationOf(entity);
  const hingeOffset = high ? width / 2 : -width / 2;
  const pivot: Vec3 = [
    (entity.pos[0] + entity.size[0] / 2) * blockSize + axis[0] * hingeOffset,
    entity.pos[1] * blockSize,
    (entity.pos[2] + entity.size[2] / 2) * blockSize + axis[2] * hingeOffset,
  ];
  const heading = { n: 0, e: -Math.PI / 2, s: Math.PI, w: Math.PI / 2 }[entity.facing];
  const parts: WindowPart[] = [];
  const add = (kind: WindowPart['kind'], [x, y, w, h]: readonly [number, number, number, number]): void => {
    const thickness = (kind === 'pane' ? spec.glass.thicknessBlocks : spec.thicknessBlocks) * blockSize;
    parts.push({
      kind,
      box: {
        pivot,
        center: [x + w / 2 - (high ? width : 0), y + h / 2, 0],
        size: [w, h, thickness],
        rotationY: heading + (kind === 'frame' || !entity.window!.open ? 0 : spec.openTurnRadians * (high ? -1 : 1)),
      },
    });
  };
  const rim = (kind: 'frame' | 'sash', inset: number, rail: number): void => {
    add(kind, [inset, inset, rail, height - 2 * inset]);
    add(kind, [width - inset - rail, inset, rail, height - 2 * inset]);
    add(kind, [inset + rail, inset, width - 2 * (inset + rail), rail]);
    add(kind, [inset + rail, height - inset - rail, width - 2 * (inset + rail), rail]);
  };
  rim('frame', 0, frame);
  rim('sash', frame, sash);
  if (entity.window.pane === 'intact') {
    const inset = frame + sash;
    add('pane', [inset, inset, width - 2 * inset, height - 2 * inset]);
  }
  return parts;
};
