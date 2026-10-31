// The recipe operators (see core/recipe.ts). Registering them is a side effect of importing this module.
// Each operator is a pure Body -> Body map; feasibility stays with the validator, so an operator may
// produce a body that fails and generateValid simply moves to the next seed.

import type { Body, Bone, Feature } from '../core/body.ts';
import {
  add,
  cross,
  IDENTITY_M,
  type Mat3,
  mulMM,
  mulMV,
  normalize,
  rotX,
  rotY,
  rotZ,
  scale,
  sub,
  type Vec3,
} from '../core/math.ts';
import type { Rng } from '../core/random.ts';
import { type RecipeStep, registerRecipeOp } from '../core/recipe.ts';
import { aabbOf, type Shape, transformShape, union } from '../core/sdf.ts';
import type { Template } from '../core/template.ts';

// ---- Step config ----

const configError = (step: RecipeStep, message: string): Error =>
  new Error(`recipe step "${step.id}" (${step.op}): ${message}`);

const stringList = (step: RecipeStep, key: string): readonly string[] => {
  const value = step[key];
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== 'string')) {
    throw configError(step, `"${key}" must be a non-empty list of strings`);
  }
  return value as string[];
};

const text = (step: RecipeStep, key: string): string => {
  const value = step[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw configError(step, `"${key}" must be a non-empty string`);
  }
  return value;
};

const optionalNumber = (step: RecipeStep, key: string, fallback: number): number => {
  const value = step[key] ?? fallback;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw configError(step, `"${key}" must be a finite number`);
  }
  return value;
};

const knownMaterial = (step: RecipeStep, template: Template, key: string): void => {
  const material = text(step, key);
  if (!template.materials[material]) {
    throw configError(step, `material "${material}" is not declared by template "${template.name}"`);
  }
};

/** A bone pattern is an exact id, or a prefix followed by `*`. */
const matches = (pattern: string, id: string): boolean =>
  pattern.endsWith('*') ? id.startsWith(pattern.slice(0, -1)) : id === pattern;

/** The bones a step's `bones` patterns select, refusing a pattern that selects nothing: a selector that
 * silently misses would leave a recipe step doing nothing with no sign of why. */
const selectBones = (body: Body, step: RecipeStep): Set<string> => {
  const selected = new Set<string>();
  for (const pattern of stringList(step, 'bones')) {
    const hits = body.bones.filter((bone) => matches(pattern, bone.id));
    if (hits.length === 0) {
      throw configError(step, `bone pattern "${pattern}" matches no bone`);
    }
    for (const bone of hits) {
      selected.add(bone.id);
    }
  }
  return selected;
};

const addFeaturesOn = (body: Body, bones: ReadonlySet<string>): Feature[] =>
  body.features.filter((feature) => feature.op === 'add' && bones.has(feature.bone));

// ---- swell: scale the flesh of selected bones about each shape's own centre ----

const swellShape = (shape: Shape, factor: number): Shape => {
  switch (shape.kind) {
    case 'capsule':
      // Endpoints stay on the bone, so a swollen limb gets thicker, not longer.
      return { ...shape, ra: shape.ra * factor, rb: shape.rb * factor };
    case 'ellipsoid':
      return { ...shape, radii: scale(shape.radii, factor) };
    case 'box':
      return { ...shape, half: scale(shape.half, factor), round: shape.round * factor };
    default:
      throw new Error(`unknown shape kind "${(shape as Shape).kind}"`);
  }
};

registerRecipeOp('swell', {
  params: ['factor'],
  check: (step) => {
    stringList(step, 'bones');
  },
  apply: (body, step, { params }) => {
    const bones = selectBones(body, step);
    return {
      ...body,
      features: body.features.map((feature) =>
        feature.op === 'add' && bones.has(feature.bone)
          ? { ...feature, shape: swellShape(feature.shape, params.factor!) }
          : feature,
      ),
    };
  },
});

// ---- scatter: blobs on the flesh surface of selected bones (pustules, tumours, eyes, teeth) ----

const perpendicular = (axis: Vec3): Vec3 => normalize(cross(axis, Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));

/** A random point on a shape's surface and its outward normal. Boxes are treated as their inscribed
 * ellipsoid, which is close enough for a decoration's footing. */
const surfacePoint = (shape: Shape, rng: Rng): { readonly point: Vec3; readonly normal: Vec3 } => {
  if (shape.kind === 'capsule') {
    const axis = sub(shape.b, shape.a);
    const u = perpendicular(axis);
    const v = normalize(cross(normalize(axis), u));
    const t = rng();
    const angle = rng() * 2 * Math.PI;
    const normal = add(scale(u, Math.cos(angle)), scale(v, Math.sin(angle)));
    const radius = shape.ra + (shape.rb - shape.ra) * t;
    return { point: add(add(shape.a, scale(axis, t)), scale(normal, radius)), normal };
  }
  const radii = shape.kind === 'ellipsoid' ? shape.radii : shape.half;
  const rot: Mat3 = shape.rot ?? IDENTITY_M;
  const z = rng() * 2 - 1;
  const phi = rng() * 2 * Math.PI;
  const ring = Math.sqrt(1 - z * z);
  const direction: Vec3 = [ring * Math.cos(phi), ring * Math.sin(phi), z];
  const local: Vec3 = [direction[0] * radii[0], direction[1] * radii[1], direction[2] * radii[2]];
  const localNormal = normalize([direction[0] / radii[0], direction[1] / radii[1], direction[2] / radii[2]]);
  return { point: add(shape.center, mulMV(rot, local)), normal: mulMV(rot, localNormal) };
};

registerRecipeOp('scatter', {
  // lift: 0 sinks a blob's centre onto the surface, 1 sits it on top.
  params: ['count', 'radius', 'lift'],
  check: (step, template) => {
    stringList(step, 'bones');
    knownMaterial(step, template, 'material');
  },
  apply: (body, step, { params, rng }) => {
    const hosts = addFeaturesOn(body, selectBones(body, step));
    if (hosts.length === 0) {
      throw configError(step, 'selected bones carry no flesh to scatter on');
    }
    const material = text(step, 'material');
    const blend = optionalNumber(step, 'blend', 0.01);
    const blobs: Feature[] = [];
    for (let i = 0; i < Math.round(params.count!); i++) {
      const host = hosts[Math.floor(rng() * hosts.length)]!;
      const { point, normal } = surfacePoint(host.shape, rng);
      // A little per-blob size jitter so a cluster does not read as stamped.
      const radius = params.radius! * (0.7 + rng() * 0.6);
      blobs.push({
        bone: host.bone,
        op: 'add',
        shape: {
          kind: 'ellipsoid',
          center: add(point, scale(normal, radius * params.lift!)),
          radii: [radius, radius, radius],
        },
        material,
        blend,
      });
    }
    return { ...body, features: [...body.features, ...blobs] };
  },
});

// ---- paint: noise-gated material over the selected bones' region ----

registerRecipeOp('paint', {
  // coverage: the share of the region's noise field painted, 0..1. grain: metres per noise cell.
  params: ['coverage', 'grain'],
  check: (step, template) => {
    stringList(step, 'bones');
    knownMaterial(step, template, 'material');
    for (const material of stringList(step, 'onto')) {
      if (!template.materials[material]) {
        throw configError(step, `"onto" material "${material}" is not declared by template "${template.name}"`);
      }
    }
  },
  apply: (body, step, { params }) => {
    const bones = selectBones(body, step);
    const flesh = addFeaturesOn(body, bones);
    if (flesh.length === 0) {
      throw configError(step, 'selected bones carry no flesh to paint');
    }
    const box = union(flesh.map((feature) => aabbOf(feature.shape)));
    const center = scale(add(box.min, box.max), 0.5);
    const half = scale(sub(box.max, box.min), 0.5);
    return {
      ...body,
      features: [
        ...body.features,
        {
          // Paint tests every filled voxel by position; the bone is bookkeeping only.
          bone: flesh[0]!.bone,
          op: 'paint',
          shape: { kind: 'box', center, half, round: 0 },
          material: text(step, 'material'),
          noise: { scale: params.grain!, threshold: params.coverage! },
          onto: stringList(step, 'onto'),
        },
      ],
    };
  },
});

// ---- graft: copy a bone subtree, with its flesh, onto another bone ----

const subtreeOf = (bones: readonly Bone[], root: string): Set<string> => {
  const ids = new Set([root]);
  // Parents-first order means one pass sees every parent before its children.
  for (const bone of bones) {
    if (bone.parent !== null && ids.has(bone.parent)) {
      ids.add(bone.id);
    }
  }
  return ids;
};

registerRecipeOp('graft', {
  // Offsets are metres; rotations are degrees about the copied root's head; scale is uniform.
  params: ['offsetX', 'offsetY', 'offsetZ', 'rotateX', 'rotateY', 'rotateZ', 'scale'],
  check: (step) => {
    text(step, 'root');
    text(step, 'parent');
    text(step, 'prefix');
  },
  apply: (body, step, { params }) => {
    const rootId = text(step, 'root');
    const parentId = text(step, 'parent');
    const prefix = text(step, 'prefix');
    const root = body.bones.find((bone) => bone.id === rootId);
    if (!root) {
      throw configError(step, `root bone "${rootId}" is absent`);
    }
    if (!body.bones.some((bone) => bone.id === parentId)) {
      throw configError(step, `parent bone "${parentId}" is absent`);
    }
    const ids = subtreeOf(body.bones, rootId);
    const rename = (id: string): string => `${prefix}${id}`;
    for (const id of ids) {
      if (body.bones.some((bone) => bone.id === rename(id))) {
        throw configError(step, `grafted bone id "${rename(id)}" already exists`);
      }
    }
    const factor = params.scale!;
    const rotation = mulMM(rotY(params.rotateY!), mulMM(rotZ(params.rotateZ!), rotX(params.rotateX!)));
    const offset: Vec3 = [params.offsetX!, params.offsetY!, params.offsetZ!];
    const pivot = root.head;
    const point = (p: Vec3): Vec3 => add(add(mulMV(rotation, scale(sub(p, pivot), factor)), pivot), offset);
    const bones: Bone[] = body.bones
      .filter((bone) => ids.has(bone.id))
      .map((bone) => ({
        ...bone,
        id: rename(bone.id),
        parent: bone.id === rootId ? parentId : rename(bone.parent!),
        head: point(bone.head),
        tail: point(bone.tail),
        ...(bone.frame
          ? {
              frame: {
                x: mulMV(rotation, bone.frame.x),
                y: mulMV(rotation, bone.frame.y),
                z: mulMV(rotation, bone.frame.z),
              },
            }
          : {}),
      }));
    const features: Feature[] = body.features
      .filter((feature) => ids.has(feature.bone))
      .map((feature) => ({
        ...feature,
        bone: rename(feature.bone),
        shape: transformShape(feature.shape, point, rotation, factor),
        ...(feature.blend === undefined ? {} : { blend: feature.blend * factor }),
        ...(feature.noise ? { noise: { ...feature.noise, scale: feature.noise.scale * factor } } : {}),
      }));
    // Appending keeps bones parents-first: the graft's parent already precedes it.
    return {
      ...body,
      bones: [...body.bones, ...bones],
      features: [...body.features, ...features],
    };
  },
});
