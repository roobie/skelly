// Where rounds sit inside a magazine (roobie/skelly#109, spike). Pure geometry: it takes the magazine's
// centreline and interior width and lays the rounds out as a staggered double column along that line.
// It knows nothing about guns or rendering; the caller derives the centreline from the generated part.
//
// Frame: the centreline is a polyline of (x, y) points in the magazine's own plane, starting at the feed
// face and running down the body. z is the lateral axis (the magazine's width). Lengths are in whatever
// unit the caller uses (gun units), as long as all inputs share it.

import type { Vec2 } from '../core/schema.ts';

export interface ColumnInput {
  /** Centreline from the feed face down to the bottom of the body, at least two points. */
  readonly centerline: readonly Vec2[];
  /** Lateral room between the two side walls. */
  readonly interiorWidth: number;
  /** Case head diameter: the widest part of a round, so the one that sets the pitch. */
  readonly roundDiameter: number;
  /** Floor thickness at the bottom of the body, which the last round cannot use. */
  readonly floor: number;
  /** How far the top round's top stands above the feed face, held there by the feed lips. */
  readonly topProud: number;
}

export interface ColumnRound {
  /** Round centre in the magazine plane. */
  readonly position: Vec2;
  /** Direction of the round's axis (toward the nose), in radians from +x, turning with the curve. */
  readonly angle: number;
  /** Lateral offset of the round's axis from the magazine's centre plane. */
  readonly z: number;
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
  line.slice(1).map((p, i) => Math.hypot(p[0] - line[i]![0], p[1] - line[i]![1]));

/** Centreline length. */
export const polylineLength = (line: readonly Vec2[]): number => segmentLengths(line).reduce((a, b) => a + b, 0);

/**
 * Position and downward tangent at distance `s` along the polyline. A distance before the start
 * continues the first segment backwards, which is where a round standing proud of the lips sits.
 */
const along = (line: readonly Vec2[], lengths: readonly number[], s: number): { at: Vec2; tangent: Vec2 } => {
  let index = 0;
  let start = 0;
  while (index < lengths.length - 1 && s > start + lengths[index]!) {
    start += lengths[index]!;
    index += 1;
  }
  const [a, b] = [line[index]!, line[index + 1]!];
  const length = lengths[index]!;
  const tangent: Vec2 = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
  const t = s - start;
  return { at: [a[0] + tangent[0] * t, a[1] + tangent[1] * t], tangent };
};

/**
 * Rounds lie across the magazine with their noses forward, so a round's axis is the downward tangent
 * turned a quarter turn toward +x, and consecutive rounds alternate between the two columns.
 *
 * Pitch: two rounds in opposite columns touch when the distance between their centres is one diameter,
 * so along the line they are sqrt(D^2 - (2c)^2) apart, where c is the lateral offset of a column. Two
 * rounds in the same column are twice the pitch apart and must clear each other, so the pitch is at
 * least D / 2. Where the walls are wide enough for the columns not to interlock at all, that floor is
 * the pitch.
 */
export const layoutColumn = (input: ColumnInput): Column => {
  const { centerline, interiorWidth, roundDiameter: d, floor, topProud } = input;
  const lengths = segmentLengths(centerline);
  const lateralOffset = Math.max((interiorWidth - d) / 2, 0);
  const pitch = Math.max(d / 2, Math.sqrt(Math.max(d * d - 4 * lateralOffset * lateralOffset, 0)));
  const interiorLength = lengths.reduce((a, b) => a + b, 0) - floor;
  const capacity = Math.max(Math.floor((interiorLength - d) / pitch) + 1, 0);
  const first = d / 2 - topProud;
  const rounds = Array.from({ length: capacity }, (_, k): ColumnRound => {
    const { at, tangent } = along(centerline, lengths, first + k * pitch);
    return {
      position: at,
      angle: Math.atan2(tangent[0], -tangent[1]),
      z: k % 2 === 0 ? lateralOffset : -lateralOffset,
    };
  });
  return { rounds, capacity, pitch, lateralOffset, interiorLength };
};
