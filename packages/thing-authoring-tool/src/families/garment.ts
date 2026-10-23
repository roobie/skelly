import type { BoxSolid } from '@skelly/engine/shapes/solid.ts';
import { type InferOutput, minValue, parse, picklist, pipe, strictObject } from 'valibot';
import { positive, scalar } from './shapes.ts';

const nonnegative = pipe(scalar, minValue(0));
const GarmentSchema = strictObject({
  style: picklist(['pants', 'top', 'vest']),
  width: positive,
  height: positive,
  depth: positive,
  sleeveLength: nonnegative,
  hoodDepth: nonnegative,
  pocketDepth: nonnegative,
  cargoDepth: nonnegative,
  legGap: nonnegative,
});
type Garment = InferOutput<typeof GarmentSchema>;
interface BoxOptions {
  id: string;
  size: readonly [number, number, number];
  y: number;
  z: number;
  x?: number;
  slot: string;
}
const box = ({ id, size: [width, height, depth], x = 0, y, z, slot }: BoxOptions): BoxSolid => ({
  id,
  kind: 'box',
  box: { center: [x, y + height / 2, z], half: [width / 2, height / 2, depth / 2] },
  slot,
});
const pants = (d: Garment): BoxSolid[] => {
  if (d.legGap >= d.width) {
    throw new Error('Garment leg gap exceeds width');
  }
  const legWidth = (d.width - d.legGap) / 2;
  const solids = [
    box({ id: 'left-leg', size: [legWidth, d.height, d.depth * 0.72], y: 0, z: d.depth * 0.36, slot: 'body' }),
    box({ id: 'right-leg', size: [legWidth, d.height, d.depth * 0.72], y: 0, z: -d.depth * 0.36, slot: 'body' }),
  ];
  if (d.cargoDepth > 0) {
    solids.push(
      box({
        id: 'left-cargo-pocket',
        size: [legWidth * 0.8, d.height * 0.55, d.cargoDepth],
        y: d.height * 0.2,
        z: d.depth * 0.42,
        slot: 'trim',
      }),
      box({
        id: 'right-cargo-pocket',
        size: [legWidth * 0.8, d.height * 0.55, d.cargoDepth],
        y: d.height * 0.2,
        z: -d.depth * 0.42,
        slot: 'trim',
      }),
    );
  }
  return solids;
};
const top = (d: Garment): BoxSolid[] => {
  const solids: BoxSolid[] = [];
  if (d.sleeveLength > 0) {
    for (const side of [-1, 1]) {
      solids.push(
        box({
          id: side < 0 ? 'left-sleeve' : 'right-sleeve',
          size: [d.sleeveLength, d.height * 0.55, d.depth],
          x: (side * (d.width + d.sleeveLength)) / 2,
          y: d.height * 0.23,
          z: 0,
          slot: 'body',
        }),
      );
    }
  }
  if (d.hoodDepth > 0) {
    solids.push(
      box({
        id: 'hood',
        size: [d.width * 0.48, d.height * 0.42, d.hoodDepth],
        y: d.height,
        z: d.depth * 0.22,
        slot: 'trim',
      }),
    );
  }
  if (d.pocketDepth > 0) {
    solids.push(
      box({
        id: 'front-pocket',
        size: [d.width * 0.68, d.height * 0.26, d.pocketDepth],
        y: d.height * 0.2,
        z: -d.depth / 2,
        slot: 'trim',
      }),
    );
  }
  return solids;
};
const vest = (d: Garment): BoxSolid[] =>
  [-1, 1].flatMap((side) =>
    [0.18, 0.58].map((height) =>
      box({
        id: `pouch-${side}-${height}`,
        size: [d.width * 0.3, d.height * 0.26, d.pocketDepth],
        x: side * d.width * 0.24,
        y: d.height * height,
        z: -d.depth / 2,
        slot: 'trim',
      }),
    ),
  );
export const foldedGarment = (params: Readonly<Record<string, string>>) => {
  const d = parse(GarmentSchema, params);
  const details = { pants, top, vest }[d.style](d);
  return [box({ id: 'body', size: [d.width, d.height, d.depth], y: 0, z: 0, slot: 'body' }), ...details];
};
