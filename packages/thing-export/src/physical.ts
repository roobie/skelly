import type { PartDef, Resolved } from '@skelly/engine/assembly/schema.ts';
import { add, applyPoint, extrusionPoint, scale, type Transform, type Vec3 } from '@skelly/engine/foundation/math.ts';
import {
  boundsOfPoints,
  clippedExtrudedPolygonPolyhedron,
  localSolidBounds,
  polyhedronMeasures,
} from '@skelly/engine/shapes/geometry.ts';
import type { Solid } from '@skelly/engine/shapes/solid.ts';
import { modelMassKg } from '@skelly/thing-core/mass';
import type { ModelBox, ModelParts } from '@skelly/thing-core/schema';
import { partNodeName } from './glb.ts';

interface VolumeProperties {
  readonly volume: number;
  readonly centre: Vec3;
}

const solidProperties = (solid: Solid): VolumeProperties => {
  if (solid.kind === 'box') {
    return { volume: 8 * solid.box.half[0] * solid.box.half[1] * solid.box.half[2], centre: solid.box.center };
  }
  if (solid.kind === 'extruded-polygon') {
    const shape = clippedExtrudedPolygonPolyhedron(solid);
    if (!shape) {
      return { volume: 0, centre: [0, 0, 0] };
    }
    const { volume, centroid } = polyhedronMeasures(shape);
    return { volume, centre: centroid };
  }
  let volume = 0;
  let moment = 0;
  for (let i = 0; i < solid.profile.length; i++) {
    const [a, r] = solid.profile[i]!;
    const [b, s] = solid.profile[(i + 1) % solid.profile.length]!;
    volume += ((b - a) * (r * r + r * s + s * s)) / 3;
    moment += ((b - a) * ((3 * a + b) * r * r + 2 * (a + b) * r * s + (a + 3 * b) * s * s)) / 12;
  }
  const axial = volume === 0 ? 0 : moment / volume;
  return {
    volume: Math.PI * Math.abs(volume),
    centre: add(solid.origin ?? [0, 0, 0], extrusionPoint(solid.axis ?? 'z', [0, 0], axial)),
  };
};

export interface PhysicalInputs {
  readonly part: PartDef;
  readonly massKg: number;
}

export const partProperties = (
  metresPerUnit: number,
  inputs: PhysicalInputs,
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
    const properties = solidProperties(solid);
    volume += properties.volume;
    moment = add(moment, scale(properties.centre, properties.volume));
  }
  const centreOfMass: Vec3 = volume === 0 ? [0, 0, 0] : scale(moment, metresPerUnit / volume);
  if (!centreOfMass.every(Number.isFinite)) {
    throw new Error('Invalid geometric centre');
  }
  return { massKg: inputs.massKg, centreOfMass };
};

/** One axis-aligned box per solid, around its placed bounds, in the model frame's metres. */
const collisionBoxes = (part: PartDef, placed: Transform, metresPerUnit: number): ModelBox[] =>
  part.solids.map((solid) => {
    const [min, max] = localSolidBounds(solid);
    const corners = [0, 1, 2, 3, 4, 5, 6, 7].map(
      (corner): Vec3 => [corner & 1 ? max[0] : min[0], corner & 2 ? max[1] : min[1], corner & 4 ? max[2] : min[2]],
    );
    const [low, high] = boundsOfPoints(corners.map((point) => applyPoint(placed, point)));
    return { min: scale(low, metresPerUnit), max: scale(high, metresPerUnit) };
  });

export const modelParts = (
  resolved: Resolved,
  inputsFor: (id: string, part: PartDef) => PhysicalInputs,
  { collision = false }: { readonly collision?: boolean } = {},
): ModelParts =>
  Object.fromEntries(
    [...resolved.defs].map(([id, part]) => {
      const placed = resolved.placed.get(id);
      const instance = resolved.assembly.parts[id];
      if (!(placed && instance)) {
        throw new Error(`No physical placement or instance for ${id}`);
      }
      const unit = resolved.domain.units.metresPerUnit;
      const physical = partProperties(unit, inputsFor(id, part));
      return [
        id,
        {
          node: partNodeName(id, instance.family),
          massKg: physical.massKg,
          centreOfMass: scale(applyPoint(placed, scale(physical.centreOfMass, 1 / unit)), unit),
          ...(collision ? { collision: collisionBoxes(part, placed, unit) } : {}),
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
