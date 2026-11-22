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

export type WindowOperation = 'open' | 'close' | 'latch' | 'unlatch' | 'openCurtain' | 'closeCurtain';

export interface WindowPart {
  kind: 'frame' | 'sash' | 'pane' | 'board' | 'batten' | 'curtain';
  box: DoorPanelBox;
}

/**
 * All boxes share the same hinge frame, so rendering, picking, light and passage cannot disagree about a swung pane
 * or the cover across a frame. `boarding` is the definition of the window's cover, when it has one.
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
    const fixed = kind !== 'sash' && kind !== 'pane';
    parts.push({
      kind,
      box: {
        pivot,
        center: [x + w / 2 - (high ? width : 0), y + h / 2, depth],
        size: [w, h, thickness],
        rotationY: heading + (fixed || !entity.window!.open ? 0 : spec.openTurnRadians * (high ? -1 : 1)),
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
    addCover(add, { entity, boarding, frameThickness: spec.thicknessBlocks * blockSize, width, height, blockSize });
  }
  return parts;
};

type AddPart = (
  kind: WindowPart['kind'],
  rect: readonly [number, number, number, number],
  thickness: number,
  depth: number,
) => void;

/** A cover's boxes on its face of the frame: battens first, then the boards or curtain standing on them. */
const addCover = (
  add: AddPart,
  {
    entity,
    boarding,
    frameThickness,
    width,
    height,
    blockSize,
  }: {
    entity: BlockEntity;
    boarding: BoardingDef;
    frameThickness: number;
    width: number;
    height: number;
    blockSize: number;
  },
): void => {
  // The hinge frame's local -z is the window's front face; each layer stands proud of the one beneath it.
  const outward = entity.boarding!.side === 'front' ? -1 : 1;
  let face = frameThickness / 2;
  const layer = (extent: number): number => {
    face += extent;
    return outward * (face - extent / 2);
  };
  if (boarding.battens) {
    const battens = boarding.battens.thicknessBlocks * blockSize;
    const depth = layer(battens);
    for (const strip of boarding.battens.strips) {
      add('batten', [strip.from * width, 0, strip.width * width, height], battens, depth);
    }
  }
  const thickness = boarding.thicknessBlocks * blockSize;
  const depth = layer(thickness);
  const gathered = boarding.curtain && entity.boarding!.open ? boarding.curtain.gatheredShare * width : undefined;
  // An open curtain's halves gather at the frame's sides, so the opening between them shows.
  const spans: [number, number][] =
    gathered === undefined
      ? [[0, width]]
      : [
          [0, gathered],
          [width - gathered, gathered],
        ];
  for (const board of boarding.boards) {
    for (const [x, w] of spans) {
      add(boarding.curtain ? 'curtain' : 'board', [x, board.from * height, w, board.height * height], thickness, depth);
    }
  }
};
