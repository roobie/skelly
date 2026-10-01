import { GRID, type SizeClass } from '../../core/conventions.ts';
import type { PartDef, PartFamily, Solid, Vec2 } from '../../core/schema.ts';
import { choice, cls, NEG_X, octagonPrism, sizeParam, X, Y } from './common.ts';

/**
 * A large two-chamber arrowhead brake. It threads onto the barrel's muzzle port and widens to two swept
 * side wings; each wing is split into a rear and a front chamber by a 0.5u vent slot. In plan view the
 * wings and the bore core read as an arrowhead: widest at the barrel, narrowing toward the nose.
 */

/** Core of the brake: collar then nose. `split` is where the vent slot between the two chambers starts. */
const BRAKE_LENGTH: Readonly<Record<SizeClass, { readonly nose: number; readonly split: number }>> = {
  S: { nose: 7, split: 3.75 },
  M: { nose: 9, split: 4.75 },
  L: { nose: 11, split: 5.75 },
};
const BORE_RADIUS: Readonly<Record<SizeClass, number>> = { S: 0.75, M: 1, L: 1.25 };
const COLLAR_LENGTH = 1;
const VENT_SLOT = 0.5;
/** The collar is wider than the barrel by this much, so a brake always shoulders its barrel. */
const COLLAR_MARGIN = 0.25;
const WING_REACH = 2.5;
const WING_NOSE_REACH = 0.5;

/** Half across flats of the barrel's octagon (`barrel` family): the bore radius, 1.5× for a heavy profile, on the grid. */
export const barrelFlatRadius = (bore: SizeClass, profile: string | undefined): number =>
  Math.ceil((BORE_RADIUS[bore] * (profile === 'heavy' ? 1.5 : 1)) / GRID) * GRID;

/** One chamber of a wing: a convex trapezoid in plan (profile axes Z, X), extruded through the brake's height. */
interface WingShape {
  readonly coreHalf: number;
  readonly height: number;
  /** Half-width of the wing's swept outer edge at plan position x. */
  readonly edge: (x: number) => number;
}

const chamber = (wing: WingShape, id: string, side: 1 | -1, planX: readonly [number, number]): Solid => {
  const { coreHalf, height, edge } = wing;
  const [x0, x1] = planX;
  const outline: Vec2[] = [
    [coreHalf, x0],
    [edge(x0), x0],
    [edge(x1), x1],
    [coreHalf, x1],
  ];
  // Mirroring flips the winding, so the left wing is also reversed to stay counter-clockwise.
  const profile = side === 1 ? outline : outline.map(([z, x]): Vec2 => [-z, x]).reverse();
  return { id, kind: 'extruded-polygon', profile, axis: 'y', z: [-height, height] };
};

export const muzzleBrake: PartFamily = {
  name: 'muzzle-brake',
  // Bore and profile follow the barrel it is threaded on, like a front sight follows its barrel.
  params: {
    bore: { ...sizeParam, from: [{ port: 'base', param: 'bore' }] },
    profile: { ...choice('standard', 'heavy', 'pistol', 'revolver'), from: [{ port: 'base', param: 'profile' }] },
    length: sizeParam,
  },
  build(params): PartDef {
    const { nose, split } = BRAKE_LENGTH[cls(params, 'length')];
    const coreHalf = barrelFlatRadius(cls(params, 'bore'), params.profile) + COLLAR_MARGIN;
    const height = coreHalf + COLLAR_MARGIN;
    const reach = coreHalf + WING_REACH;
    const noseReach = coreHalf + WING_NOSE_REACH;
    const edge = (x: number): number => reach - ((reach - noseReach) * (x - COLLAR_LENGTH)) / (nose - COLLAR_LENGTH);
    const wing: WingShape = { coreHalf, height, edge };
    const rear: readonly [number, number] = [COLLAR_LENGTH, split];
    const front: readonly [number, number] = [split + VENT_SLOT, nose];
    return {
      family: 'muzzle-brake',
      solids: [
        octagonPrism('collar', coreHalf, [0, COLLAR_LENGTH]),
        octagonPrism('core', coreHalf, [COLLAR_LENGTH, nose]),
        chamber(wing, 'rear-chamber-right', 1, rear),
        chamber(wing, 'front-chamber-right', 1, front),
        chamber(wing, 'rear-chamber-left', -1, rear),
        chamber(wing, 'front-chamber-left', -1, front),
      ],
      ports: [{ id: 'base', mount: 'muzzle', gender: 'male', pos: [0, 0, 0], normal: NEG_X, up: Y, required: true }],
      keepOuts: [],
      axes: [{ kind: 'bore', origin: [0, 0, 0], dir: X }],
    };
  },
};
