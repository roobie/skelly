import type { BlockEntity, DoorPanelBox } from './blockEntities.ts';
import type { FurnitureDef } from './content.ts';
import type { Vec3 } from './coords.ts';
import { rotationOf } from './orientation.ts';
import type { BoardingDef } from './schema.ts';

export interface WindowState {
  open: boolean;
  latched: boolean;
  pane: 'intact' | 'missing';
  damage: number;
  frameRemnants: boolean;
}

export interface WindowPart {
  kind: 'frame' | 'sash' | 'pane' | 'board';
  box: DoorPanelBox;
}

/**
 * All boxes share the same hinge frame, so rendering, picking, light and passage cannot disagree about a swung pane
 * or the boards across a frame. `boarding` is the definition of the window's boards, when it has any.
 */
export const windowParts = (
  entity: BlockEntity,
  definition: FurnitureDef,
  blockSize: number,
  boarding: BoardingDef | undefined,
): WindowPart[] => {
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
  const add = (
    kind: WindowPart['kind'],
    [x, y, w, h]: readonly [number, number, number, number],
    thickness = (kind === 'pane' ? spec.glass.thicknessBlocks : spec.thicknessBlocks) * blockSize,
    depth = 0,
  ): void => {
    const fixed = kind === 'frame' || kind === 'board' || !entity.window!.open;
    parts.push({
      kind,
      box: {
        pivot,
        center: [x + w / 2 - (high ? width : 0), y + h / 2, depth],
        size: [w, h, thickness],
        rotationY: heading + (fixed ? 0 : spec.openTurnRadians * (high ? -1 : 1)),
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
  if (entity.boarding && boarding) {
    const thickness = boarding.thicknessBlocks * blockSize;
    // The hinge frame's local -z is the window's front face.
    const depth =
      (entity.boarding.side === 'front' ? -1 : 1) * ((spec.thicknessBlocks * blockSize) / 2 + thickness / 2);
    for (const board of boarding.boards) {
      add('board', [0, board.from * height, width, board.height * height], thickness, depth);
    }
  }
  return parts;
};
