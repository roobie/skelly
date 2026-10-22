import type { PartDef, Resolved } from '@skelly/engine/assembly/schema.ts';
import { add, applyPoint, scale, type Transform, type Vec3 } from '@skelly/engine/foundation/math.ts';
import { boundsOfPoints } from '@skelly/engine/shapes/geometry.ts';
import type { Solid } from '@skelly/engine/shapes/solid.ts';
import { modelMassKg } from '@skelly/thing-core/mass';
import type { ModelBox, ModelParts } from '@skelly/thing-core/schema';
import { authoredMeasure, type DrawnGeometry, drawnGeometry, type SolidMeasure } from './drawn.ts';
import { partNodeName } from './glb.ts';

export interface PhysicalInputs {
  readonly part: PartDef;
  readonly massKg: number;
}

/** Mass and centre of a part; `measureOf` gives each solid's volume and centre, the drawn ones in a model export. */
export const partProperties = (
  metresPerUnit: number,
  inputs: PhysicalInputs,
  measureOf: (solid: Solid) => Pick<SolidMeasure, 'volume' | 'centre'> = authoredMeasure,
): { massKg: number; centreOfMass: Vec3 } => {
  if (!(Number.isFinite(inputs.massKg) && inputs.massKg >= 0)) {
    throw new Error(`Missing or invalid authored mass for ${inputs.part.family}`);
  }
  if (!(Number.isFinite(metresPerUnit) && metresPerUnit > 0)) {
    throw new Error('Physical placement needs a positive finite scale');
  }
  let volume = 0;
  let moment: Vec3 = [0, 0, 0];
  for (const solid of inputs.part.solids) {
    const properties = measureOf(solid);
    volume += properties.volume;
    moment = add(moment, scale(properties.centre, properties.volume));
  }
  const centreOfMass: Vec3 = volume === 0 ? [0, 0, 0] : scale(moment, metresPerUnit / volume);
  if (!centreOfMass.every(Number.isFinite)) {
    throw new Error('Invalid geometric centre');
  }
  return { massKg: inputs.massKg, centreOfMass };
};

/** One axis-aligned box per solid, around its placed drawn bounds, in the model frame's metres. */
const collisionBoxes = (
  part: PartDef,
  placed: Transform,
  metresPerUnit: number,
  measureOf: (solid: Solid) => SolidMeasure,
): ModelBox[] =>
  part.solids.map((solid) => {
    const { min, max } = measureOf(solid);
    const corners = [0, 1, 2, 3, 4, 5, 6, 7].map(
      (corner): Vec3 => [corner & 1 ? max[0] : min[0], corner & 2 ? max[1] : min[1], corner & 4 ? max[2] : min[2]],
    );
    const [low, high] = boundsOfPoints(corners.map((point) => applyPoint(placed, point)));
    return { min: scale(low, metresPerUnit), max: scale(high, metresPerUnit) };
  });

/**
 * Physical data per part. `drawn` is the export's drawn geometry (see `drawn.ts`), so collision boxes and centres of
 * mass follow the voxels in the file; by default they follow the authored solids, as an unvoxelized file draws them.
 */
export const modelParts = (
  resolved: Resolved,
  inputsFor: (id: string, part: PartDef) => PhysicalInputs,
  {
    collision = false,
    drawn = drawnGeometry(resolved),
  }: { readonly collision?: boolean; readonly drawn?: DrawnGeometry } = {},
): ModelParts =>
  Object.fromEntries(
    [...resolved.defs].map(([id, part]) => {
      const placed = resolved.placed.get(id);
      const instance = resolved.assembly.parts[id];
      if (!(placed && instance)) {
        throw new Error(`No physical placement or instance for ${id}`);
      }
      const unit = resolved.domain.units.metresPerUnit;
      const measureOf = (solid: Solid) => drawn.measure(id, solid);
      const physical = partProperties(unit, inputsFor(id, part), measureOf);
      const grain = collision ? drawn.grain(id) : undefined;
      return [
        id,
        {
          node: partNodeName(id, instance.family),
          massKg: physical.massKg,
          centreOfMass: scale(applyPoint(placed, scale(physical.centreOfMass, 1 / unit)), unit),
          ...(collision ? { collision: collisionBoxes(part, placed, unit, measureOf) } : {}),
          ...(grain === undefined ? {} : { voxelGrain: grain }),
        },
      ];
    }),
  );

export const assemblyProperties = (parts: ModelParts): { massKg: number; centreOfMass: Vec3 } => {
  const massKg = modelMassKg({ parts });
  const moment = Object.values(parts).reduce((sum, part) => add(sum, scale(part.centreOfMass, part.massKg)), [
    0, 0, 0,
  ] as Vec3);
  return { massKg, centreOfMass: massKg === 0 ? [0, 0, 0] : scale(moment, 1 / massKg) };
};
