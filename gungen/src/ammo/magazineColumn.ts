import type { Vec2 } from '@skelly/engine/core/schema.ts';

export interface ColumnInput {
  /** Centreline from the feed face down to the bottom of the body, at least two points. */
  readonly centerline: readonly Vec2[];
  /** Lateral room between the two side walls. */
  readonly interiorWidth: number;
  /** Case-head diameter: the widest part of a round, so the one that sets the pitch. */
  readonly roundDiameter: number;
  /** Floor thickness at the bottom of the body, which the last round cannot use. */
  readonly floor: number;
  /** How far the top round's top stands above the feed face, held there by the feed lips. */
  readonly topProud: number;
}

interface ColumnRound {
  /** Round centre in the magazine plane. */
  readonly position: Vec2;
  /** Nose-up tilt in radians from +x, turning with the curve. */
  readonly angle: number;
  /** Lateral offset of the round's axis from the magazine centre plane. */
  readonly z: number;
  /** Distance from the feed face along the centreline; used to check actual body sections. */
  readonly distance: number;
}

export interface Column {
  readonly rounds: readonly ColumnRound[];
  /** Whole rounds that fit between the feed face and the floor. */
  readonly capacity: number;
  /** Centreline distance between consecutive rounds (which alternate sides). */
  readonly pitch: number;
  /** Lateral offset of each column's axis from the centre plane. */
  readonly lateralOffset: number;
  /** Centreline length from the feed face to the inside of the floor. */
  readonly interiorLength: number;
}

const segmentLengths = (line: readonly Vec2[]): number[] =>
  line.slice(1).map((point, index) => Math.hypot(point[0] - line[index]![0], point[1] - line[index]![1]));

/** Centreline distance; all coordinates use the caller's consistent length unit. */
export const polylineLength = (line: readonly Vec2[]): number => segmentLengths(line).reduce((a, b) => a + b, 0);

/** Position and tangent at distance `s`; negative distance extends the first segment backwards. */
const along = (
  line: readonly Vec2[],
  lengths: readonly number[],
  s: number,
): { readonly at: Vec2; readonly tangent: Vec2 } => {
  let index = 0;
  let start = 0;
  while (index < lengths.length - 1 && s > start + lengths[index]!) {
    start += lengths[index]!;
    index += 1;
  }
  const [a, b] = [line[index]!, line[index + 1]!];
  const length = lengths[index]!;
  const tangent: Vec2 = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
  const offset = s - start;
  return { at: [a[0] + tangent[0] * offset, a[1] + tangent[1] * offset], tangent };
};

const validateInput = ({ centerline, interiorWidth, roundDiameter, floor, topProud }: ColumnInput): void => {
  if (centerline.length < 2 || segmentLengths(centerline).some((length) => !Number.isFinite(length) || length <= 0)) {
    throw new Error('magazine centreline needs at least two distinct points');
  }
  if (![interiorWidth, roundDiameter, floor, topProud].every(Number.isFinite)) {
    throw new Error('magazine column dimensions must be finite');
  }
  if (interiorWidth <= 0 || roundDiameter <= 0 || floor < 0 || topProud < 0) {
    throw new Error('magazine column width and round diameter must be positive; floor and top proud non-negative');
  }
};

/**
 * Lay out a staggered two-column magazine along its generated centreline. Adjacent opposite-side rounds
 * must clear at their pitch; every other round is in the same column and must clear at twice that pitch.
 */
export const layoutColumn = (input: ColumnInput): Column => {
  validateInput(input);
  const { centerline, interiorWidth, roundDiameter: diameter, floor, topProud } = input;
  const lengths = segmentLengths(centerline);
  const totalLength = lengths.reduce((sum, length) => sum + length, 0);
  const lateralOffset = Math.max((interiorWidth - diameter) / 2, 0);
  const pitch = Math.max(diameter / 2, Math.sqrt(Math.max(diameter * diameter - 4 * lateralOffset * lateralOffset, 0)));
  const interiorLength = Math.max(totalLength - floor, 0);
  const capacity = Math.max(Math.floor((interiorLength - diameter) / pitch) + 1, 0);
  const first = diameter / 2 - topProud;
  const rounds = Array.from({ length: capacity }, (_, index): ColumnRound => {
    const { at, tangent } = along(centerline, lengths, first + index * pitch);
    return {
      position: at,
      angle: Math.atan2(tangent[0], -tangent[1]),
      distance: first + index * pitch,
      z: index % 2 === 0 ? lateralOffset : -lateralOffset,
    };
  });
  return { rounds, capacity, pitch, lateralOffset, interiorLength };
};
