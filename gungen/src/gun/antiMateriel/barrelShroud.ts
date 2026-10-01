import type { SizeClass } from '../../core/conventions.ts';
import type { PartDef, PartFamily, PortDef, Solid } from '../../core/schema.ts';
import { box, cls, NEG_X, NEG_Y, NEG_Z, RUBBER, sizeParam, X, Y } from './common.ts';

/**
 * A long stamped-box upper that the barrel recoils inside. It continues the receiver's silhouette forward
 * (same height and width as the receiver front face) and leaves a cavity around the barrel; a bulkhead at
 * the front guides the barrel without touching it.
 *
 * The cooling holes are display-only: gungen's solids are convex, so a perforated wall would cost one
 * convex piece per hole and gives the rules nothing to check. Instead the walls are plain boxes and the
 * holes are dark panels laid on their outer faces (`displaySolids`), which the viewer and the glTF export
 * draw and the validator ignores.
 */
export const SHROUD_LENGTH: Readonly<Record<SizeClass, number>> = { S: 16, M: 22, L: 28 };

/** Receiver front face the shroud continues (standard receiver section): half height and half width. */
export const SHROUD_HALF_HEIGHT = 2.5;
export const SHROUD_HALF_WIDTH = 2;
const WALL = 0.5;
/** Cavity: the barrel's recoil room. 0.25u clear of an L-bore standard barrel, which is the largest that fits. */
const CAVITY_HALF_HEIGHT = SHROUD_HALF_HEIGHT - WALL;
const CAVITY_HALF_WIDTH = SHROUD_HALF_WIDTH - WALL;
const BULKHEAD_LENGTH = 1;
const BULKHEAD_OPENING = 1.5;
/** Where the bipod hangs, measured back from the shroud's front end. */
export const BIPOD_SETBACK = 3;
/** Where the carry handle's trunnion block bolts to the left wall, measured forward from the shroud's rear end. */
export const TRUNNION_SETBACK = 2.5;

const HOLE_ROWS = [-0.75, 0.75] as const;
const HOLE_PITCH = 2;
const HOLE_LENGTH = 1;
const HOLE_HEIGHT = 0.75;
/** The first and last holes stay this far from the shroud's ends. */
const HOLE_END_MARGIN = 2.5;
/** Panels stand this far proud of the wall so they read as holes without coplanar faces. */
const HOLE_RELIEF = 0.0625;

const perforations = (length: number): Solid[] => {
  const panels: Solid[] = [];
  for (const side of [-1, 1] as const) {
    const face = SHROUD_HALF_WIDTH * side;
    for (const row of HOLE_ROWS) {
      for (let x = HOLE_END_MARGIN; x <= length - HOLE_END_MARGIN; x += HOLE_PITCH) {
        const z = [face, face + HOLE_RELIEF * side].sort((a, b) => a - b) as [number, number];
        panels.push(
          box(
            `perforation-${side > 0 ? 'right' : 'left'}-${row > 0 ? 'upper' : 'lower'}-${x}`,
            [x - HOLE_LENGTH / 2, row - HOLE_HEIGHT / 2, z[0]],
            [x + HOLE_LENGTH / 2, row + HOLE_HEIGHT / 2, z[1]],
            { ...RUBBER, display: { bevel: false, outline: false } },
          ),
        );
      }
    }
  }
  return panels;
};

export const barrelShroud: PartFamily = {
  name: 'barrel-shroud',
  params: { length: sizeParam },
  build(params): PartDef {
    const length = SHROUD_LENGTH[cls(params, 'length')];
    const solids: Solid[] = [
      box('top', [0, CAVITY_HALF_HEIGHT, -SHROUD_HALF_WIDTH], [length, SHROUD_HALF_HEIGHT, SHROUD_HALF_WIDTH]),
      box('bottom', [0, -SHROUD_HALF_HEIGHT, -SHROUD_HALF_WIDTH], [length, -CAVITY_HALF_HEIGHT, SHROUD_HALF_WIDTH]),
      box('left', [0, -CAVITY_HALF_HEIGHT, -SHROUD_HALF_WIDTH], [length, CAVITY_HALF_HEIGHT, -CAVITY_HALF_WIDTH]),
      box('right', [0, -CAVITY_HALF_HEIGHT, CAVITY_HALF_WIDTH], [length, CAVITY_HALF_HEIGHT, SHROUD_HALF_WIDTH]),
      box(
        'bulkhead-top',
        [length - BULKHEAD_LENGTH, BULKHEAD_OPENING, -CAVITY_HALF_WIDTH],
        [length, CAVITY_HALF_HEIGHT, CAVITY_HALF_WIDTH],
      ),
      box(
        'bulkhead-bottom',
        [length - BULKHEAD_LENGTH, -CAVITY_HALF_HEIGHT, -CAVITY_HALF_WIDTH],
        [length, -BULKHEAD_OPENING, CAVITY_HALF_WIDTH],
      ),
    ];
    const ports: PortDef[] = [
      { id: 'rear', mount: 'handguard', gender: 'male', pos: [0, 0, 0], normal: NEG_X, up: Y, required: true },
      {
        id: 'rail',
        mount: 'rail',
        gender: 'female',
        pos: [2, SHROUD_HALF_HEIGHT, 0],
        normal: Y,
        up: X,
        slots: { count: (length - 4) / 2 + 1, pitch: 2 },
      },
      {
        id: 'bipod',
        mount: 'bipod',
        gender: 'female',
        pos: [length - BIPOD_SETBACK, -SHROUD_HALF_HEIGHT, 0],
        normal: NEG_Y,
        up: X,
      },
      {
        id: 'trunnion',
        mount: 'trunnion',
        gender: 'female',
        pos: [TRUNNION_SETBACK, 0, -SHROUD_HALF_WIDTH],
        normal: NEG_Z,
        up: Y,
      },
    ];
    return {
      family: 'barrel-shroud',
      solids,
      displaySolids: [...solids, ...perforations(length)],
      ports,
      keepOuts: [],
      axes: [],
    };
  },
};
