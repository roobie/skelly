import {
  array,
  finite,
  type InferOutput,
  literal,
  minLength,
  minValue,
  number,
  optional,
  parse,
  pipe,
  record,
  strictObject,
  string,
  tuple,
  url,
  variant,
} from 'valibot';
import { allowanceBand, calibrateMmPerPixel, compareScales, featureSpans } from './trace.ts';
import { parseTraceSvg } from './traceSvg.ts';

const Text = pipe(string(), minLength(1));
const Finite = pipe(number(), finite());
const Positive = pipe(Finite, minValue(Number.MIN_VALUE));
const Source = pipe(Text, url());
const SourcedMeasure = strictObject({ kind: literal('sourced'), value: Finite, source: Source });
const DerivedMeasure = strictObject({ kind: literal('derived'), value: Finite, reason: Text });
const KnownMeasure = variant('kind', [SourcedMeasure, DerivedMeasure]);
const Measure = variant('kind', [
  SourcedMeasure,
  DerivedMeasure,
  strictObject({ kind: literal('unknown'), reason: Text }),
]);
const Point = tuple([Finite, Finite]);
const DatumPixels = strictObject({ kind: literal('derived'), value: tuple([Point, Point]), reason: Text });
const Datum = strictObject({
  pixels: DatumPixels,
  lengthMm: KnownMeasure,
});
const TraceRecord = strictObject({
  title: Text,
  document: Text,
  values: record(Text, Measure),
  reference: optional(
    strictObject({
      id: Text,
      svg: Text,
      calibration: strictObject({ pixels: DatumPixels, lengthMm: SourcedMeasure }),
      allowancePercent: strictObject({ kind: literal('derived'), value: pipe(Finite, minValue(0)), reason: Text }),
      comparisons: record(Text, Datum),
      landmarks: record(
        Text,
        strictObject({ kind: literal('derived'), value: pipe(array(Point), minLength(1)), reason: Text }),
      ),
      features: record(Text, strictObject({ kind: literal('derived'), paths: pipe(array(Text), minLength(1)) })),
    }),
  ),
});

export type TraceRecordData = InferOutput<typeof TraceRecord>;
export const parseTraceRecord = (raw: unknown): TraceRecordData => parse(TraceRecord, raw);

export const resolveTraceReference = (reference: NonNullable<TraceRecordData['reference']>, svg: string) => {
  const parsed = parseTraceSvg(svg);
  const scale = (datum: InferOutput<typeof Datum>) =>
    calibrateMmPerPixel(...datum.pixels.value, parse(Positive, datum.lengthMm.value));
  const mmPerPixel = scale(reference.calibration);
  const used = new Set<string>();
  const features = Object.fromEntries(
    Object.entries(reference.features).map(([name, feature]) => {
      const points = feature.paths.flatMap((id) => {
        const path = parsed.paths.get(id);
        if (!path) {
          throw new Error(`Feature ${name} refers to missing SVG path ${id}`);
        }
        used.add(id);
        return path;
      });
      const spans = featureSpans(points, mmPerPixel);
      return [
        name,
        {
          kind: feature.kind,
          ...spans,
          widthAllowanceMm: allowanceBand(spans.widthMm, reference.allowancePercent.value),
          heightAllowanceMm: allowanceBand(spans.heightMm, reference.allowancePercent.value),
        },
      ];
    }),
  );
  for (const id of parsed.paths.keys()) {
    if (!used.has(id)) {
      throw new Error(`SVG path ${id} has no record feature`);
    }
  }
  return {
    mmPerPixel,
    features,
    comparisons: Object.fromEntries(
      Object.entries(reference.comparisons).map(([id, datum]) => {
        const candidateMmPerPixel = scale(datum);
        return [id, { mmPerPixel: candidateMmPerPixel, ...compareScales(mmPerPixel, candidateMmPerPixel) }];
      }),
    ),
  };
};
