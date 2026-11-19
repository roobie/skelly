import { array, finite, literal, nonEmpty, number, optional, pipe, record, strictObject, tuple } from 'valibot';
import { Color, Count, Id, Name, NonNegative, Positive, PositiveSimSeconds } from './primitives.ts';

const Coordinate = pipe(number(), finite());
const Position = tuple([Coordinate, Coordinate, Coordinate]);
const Dimensions = tuple([Positive, Positive, Positive]);
const Box = strictObject({ position: Position, size: Dimensions, color: Color });

/** Positions are blocks from the origin cell's centre, in the housing's own axes. */
export const PlantInstrumentsSchema = strictObject({
  kind: literal('plant'),
  offset: Position,
  panel: pipe(array(Box), nonEmpty()),
  labels: array(strictObject({ text: Name, position: Position, size: tuple([Positive, Positive]), color: Color })),
  run: strictObject({
    position: Position,
    size: Dimensions,
    color: Color,
    emissive: Positive,
    intensity: Positive,
    radius: Positive,
  }),
  dial: strictObject({
    pivot: Position,
    steps: pipe(array(Coordinate), nonEmpty()),
    bands: record(Name, Count),
    stoppedStep: Count,
    stoppedColor: Color,
    tickBands: record(Id, Name),
    symbols: optional(record(Id, Name)),
    tickRadius: Positive,
    tickSize: Dimensions,
    tickDepth: Coordinate,
    pin: pipe(array(Box), nonEmpty()),
    swayAmplitudeDegrees: NonNegative,
    swayPeriodSimSeconds: PositiveSimSeconds,
  }),
  /** On a housing with slot anchors, a flag's boxes are local to its slot anchor's flag mount instead. */
  flags: array(strictObject({ slot: Id, raised: pipe(array(Box), nonEmpty()), dropped: pipe(array(Box), nonEmpty()) })),
  /** The housing's power switch, posed by its switch intent; a housing with one is switched only there. */
  switch: optional(strictObject({ on: pipe(array(Box), nonEmpty()), off: pipe(array(Box), nonEmpty()) })),
});
