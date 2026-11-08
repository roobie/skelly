// biome-ignore-all lint/correctness/noNodejsModules: This command-line tool runs in Node.js.
// Compares two `tools/actor-pose-reference.ts` files, base then head, and prints each sample's largest
// differences, marking those above the tolerances in `tools/actor-pose-tolerance.json`. It reports and never
// fails on a difference; `docs/deferred-assertions.md` says how a round reads its output.
import { readFileSync } from 'node:fs';
import process from 'node:process';
import tolerance from './actor-pose-tolerance.json' with { type: 'json' };

type Vec3 = readonly [number, number, number];
interface BoneRecord {
  readonly t: Vec3;
  readonly r: readonly number[];
}
interface BoxRecord {
  readonly bone: string;
  readonly center: Vec3;
  readonly halfSize: Vec3;
  readonly rotation: readonly number[];
}
interface SampleRecord {
  readonly key: string;
  readonly voxelMetres: number;
  readonly bones: Record<string, BoneRecord>;
  readonly anchors: Record<string, Vec3>;
  readonly regions?: Record<string, readonly BoxRecord[]>;
}
interface PartRecord {
  readonly part: string;
  readonly mass: number;
  readonly center: Vec3;
  readonly inertia: readonly (readonly number[])[];
  readonly corners: readonly Vec3[];
}
interface RagdollRecord {
  readonly bones: readonly string[];
  readonly mass: number;
  readonly center: Vec3;
  readonly halfExtents: Vec3;
}
interface BodyRecord {
  readonly model: string;
  readonly seed: number;
  readonly parts: readonly PartRecord[];
  readonly ragdoll?: readonly RagdollRecord[];
}
interface Reference {
  readonly samples: readonly SampleRecord[];
  readonly bodies: readonly BodyRecord[];
}

const [basePath, headPath] = process.argv.slice(2);
if (!(basePath && headPath)) {
  throw new Error('Usage: actor-pose-compare <base.json> <head.json>');
}
const read = (path: string): Reference => JSON.parse(readFileSync(path, 'utf8')) as Reference;
const base = read(basePath);
const head = read(headPath);

const lines: string[] = [];
let marked = 0;
const mark = (over: boolean): string => {
  if (over) {
    marked += 1;
  }
  return over ? ' ABOVE' : '';
};

const distance = (a: readonly number[], b: readonly number[]): number =>
  Math.hypot(...a.map((value, index) => value - b[index]!));
/** Angle in degrees of the rotation taking `a` to `b`, both row-major 3×3. */
const angle = (a: readonly number[], b: readonly number[]): number => {
  let trace = 0;
  for (let i = 0; i < 3; i++) {
    for (let k = 0; k < 3; k++) {
      trace += a[k * 3 + i]! * b[k * 3 + i]!;
    }
  }
  return (Math.acos(Math.max(-1, Math.min(1, (trace - 1) / 2))) * 180) / Math.PI;
};
const largest = <T>(entries: readonly [string, T][], measure: (value: T) => number): [string, number] =>
  entries.reduce<[string, number]>(
    (best, [name, value]) => {
      const size = measure(value);
      return size > best[1] ? [name, size] : best;
    },
    ['-', 0],
  );
const missing = (what: string, names: Iterable<string>, other: ReadonlySet<string>): void => {
  for (const name of names) {
    if (!other.has(name)) {
      marked += 1;
      lines.push(`${what} ${name}: only in one file ABOVE`);
    }
  }
};

const headSamples = new Map(head.samples.map((sample) => [sample.key, sample]));
const baseSamples = new Map(base.samples.map((sample) => [sample.key, sample]));
missing('sample', baseSamples.keys(), new Set(headSamples.keys()));
missing('sample', headSamples.keys(), new Set(baseSamples.keys()));
for (const [key, b] of baseSamples) {
  const h = headSamples.get(key);
  if (!h) {
    continue;
  }
  const voxel = b.voxelMetres * tolerance.positionVoxels;
  const boneIds = Object.keys(b.bones).filter((id) => id in h.bones);
  missing(`${key} bone`, Object.keys(b.bones), new Set(Object.keys(h.bones)));
  missing(`${key} bone`, Object.keys(h.bones), new Set(Object.keys(b.bones)));
  const moved = boneIds.map((id) => [id, distance(b.bones[id]!.t, h.bones[id]!.t)] as [string, number]);
  const turned = boneIds.map((id) => [id, angle(b.bones[id]!.r, h.bones[id]!.r)] as [string, number]);
  const [movedBone, movedBy] = largest(moved, (value) => value);
  const [turnedBone, turnedBy] = largest(turned, (value) => value);
  lines.push(
    `${key}: position ${movedBy.toExponential(3)} m at ${movedBone}${mark(movedBy > voxel)}; rotation ${turnedBy.toFixed(4)} deg at ${turnedBone}${mark(turnedBy > tolerance.rotationDegrees)}`,
  );
  for (const [id, by] of moved) {
    if (by > voxel && id !== movedBone) {
      lines.push(`  bone ${id} position ${by.toExponential(3)} m${mark(true)}`);
    }
  }
  for (const [id, by] of turned) {
    if (by > tolerance.rotationDegrees && id !== turnedBone) {
      lines.push(`  bone ${id} rotation ${by.toFixed(4)} deg${mark(true)}`);
    }
  }
  missing(`${key} anchor`, Object.keys(b.anchors), new Set(Object.keys(h.anchors)));
  for (const [name, point] of Object.entries(b.anchors)) {
    const other = h.anchors[name];
    if (other) {
      const by = distance(point, other);
      lines.push(`  anchor ${name} ${by.toExponential(3)} m${mark(by > voxel)}`);
    }
  }
  for (const [region, boxes] of Object.entries(b.regions ?? {})) {
    const others = new Map((h.regions?.[region] ?? []).map((box) => [box.bone, box]));
    missing(
      `${key} region ${region} box`,
      boxes.map((box) => box.bone),
      new Set(others.keys()),
    );
    for (const box of boxes) {
      const other = others.get(box.bone);
      if (!other) {
        continue;
      }
      const shift = distance(box.center, other.center);
      const size = distance(box.halfSize, other.halfSize);
      const turn = angle(box.rotation, other.rotation);
      lines.push(
        `  region ${region} ${box.bone}: centre ${shift.toExponential(3)} m${mark(shift > voxel)}, half-size ${size.toExponential(3)} m${mark(size > voxel)}, rotation ${turn.toFixed(4)} deg${mark(turn > tolerance.rotationDegrees)}`,
      );
    }
  }
}

// Mass agreement: |q - r| <= massRelative * (1 + |r|), with r the base value.
const agrees = (q: number, r: number): boolean => Math.abs(q - r) <= tolerance.massRelative * (1 + Math.abs(r));
const outside = (later: readonly number[], earlier: readonly number[]): number =>
  earlier.filter((value, index) => !agrees(later[index]!, value)).length;
const bodyKey = (body: BodyRecord): string => `${body.model}/${body.seed}`;
const headBodies = new Map(head.bodies.map((body) => [bodyKey(body), body]));
const baseBodies = new Map(base.bodies.map((body) => [bodyKey(body), body]));
missing('body', baseBodies.keys(), new Set(headBodies.keys()));
missing('body', headBodies.keys(), new Set(baseBodies.keys()));
for (const [key, b] of baseBodies) {
  const h = headBodies.get(key);
  if (!h) {
    continue;
  }
  const groups = (body: BodyRecord) => new Map((body.ragdoll ?? []).map((group) => [group.bones.join(','), group]));
  const baseGroups = groups(b);
  const headGroups = groups(h);
  missing(`${key} ragdoll group`, baseGroups.keys(), new Set(headGroups.keys()));
  missing(`${key} ragdoll group`, headGroups.keys(), new Set(baseGroups.keys()));
  for (const [bones, group] of baseGroups) {
    const other = headGroups.get(bones);
    if (!other) {
      continue;
    }
    const equal =
      group.mass === other.mass &&
      group.center.every((value, index) => value === other.center[index]) &&
      group.halfExtents.every((value, index) => value === other.halfExtents[index]);
    lines.push(`${key} ragdoll ${bones.split(',')[0]}: mass and bounds ${equal ? 'equal' : 'differ'}${mark(!equal)}`);
  }
  const parts = (body: BodyRecord) => new Map(body.parts.map((part) => [part.part, part]));
  const baseParts = parts(b);
  const headParts = parts(h);
  missing(`${key} part`, baseParts.keys(), new Set(headParts.keys()));
  missing(`${key} part`, headParts.keys(), new Set(baseParts.keys()));
  for (const [name, part] of baseParts) {
    const other = headParts.get(name);
    if (!other) {
      continue;
    }
    const mass = agrees(other.mass, part.mass) ? 0 : 1;
    const center = outside(other.center, part.center);
    const inertia = outside(other.inertia.flat(), part.inertia.flat());
    const corners =
      outside(other.corners.flat(), part.corners.flat()) + Math.abs(other.corners.length - part.corners.length);
    lines.push(
      `${key} part ${name}: components outside agreement mass ${mass}, centre ${center}, inertia ${inertia}, corners ${corners}${mark(mass + center + inertia + corners > 0)}`,
    );
  }
}

lines.push(`marked above tolerance: ${marked}`);
process.stdout.write(`${lines.join('\n')}\n`);
