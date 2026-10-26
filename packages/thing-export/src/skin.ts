import { applyPoint, compose, invert, type Transform, type Vec3 } from '@skelly/engine/foundation/math.ts';

export interface SkinJoint {
  readonly name: string;
  readonly parent?: string | undefined;
  /** Parent-local rest frame in metres, in the model's authored axes. */
  readonly rest: Transform;
}
export interface ExportSkin {
  readonly joints: readonly SkinJoint[];
  /** Evaluated on final vertices in model bind space, in metres. */
  readonly weights: (point: Vec3) => readonly { readonly joint: string; readonly weight: number }[];
}

export class SkinError extends Error {}

export const matrixOf = ({ r, t }: Transform): number[] => [
  r[0], r[3], r[6], 0, r[1], r[4], r[7], 0, r[2], r[5], r[8], 0, ...t, 1,
];

export const prepareSkin = (skin: ExportSkin) => {
  if (skin.joints.length === 0 || skin.joints.length > 65536) {
    throw new SkinError('Skin needs a nonempty unsigned-short joint palette');
  }
  const indices = new Map(skin.joints.map((joint, index) => [joint.name, index]));
  if (indices.size !== skin.joints.length || skin.joints.some(({ name }) => !name)) {
    throw new SkinError('Duplicate or empty joint name');
  }
  const frames = new Map<string, Transform>();
  const visiting = new Set<string>();
  const world = (name: string): Transform => {
    const cached = frames.get(name);
    if (cached) return cached;
    const index = indices.get(name);
    if (index === undefined || visiting.has(name)) throw new SkinError(`Unresolved or cyclic joint ${name}`);
    visiting.add(name);
    const joint = skin.joints[index]!;
    const { r, t } = joint.rest;
    // Rest frames are rigid; runtime poses may contain scale and shear.
    if (![...r, ...t].every(Number.isFinite) || r.some((_, i) => {
      const row = Math.floor(i / 3);
      const col = i % 3;
      return Math.abs([0, 1, 2].reduce((sum, k) => sum + r[row * 3 + k]! * r[col * 3 + k]!, 0) - Number(row === col)) > 1e-6;
    })) throw new SkinError(`Invalid rigid rest frame ${name}`);
    const frame = joint.parent === undefined ? joint.rest : compose(world(joint.parent), joint.rest);
    frames.set(name, frame);
    visiting.delete(name);
    return frame;
  };
  const inverseBinds = new Float32Array(skin.joints.flatMap(({ name }) => matrixOf(invert(world(name)))));
  const attributes = (points: readonly Vec3[]) => {
    const joints = new Uint16Array(points.length * 4);
    const weights = new Float32Array(points.length * 4);
    points.forEach((point, vertex) => {
      const influences = skin.weights(point);
      if (influences.length === 0 || influences.length > 4) throw new SkinError('Unassigned vertex or too many influences');
      const seen = new Set<string>();
      let total = 0;
      for (const { joint, weight } of influences) {
        if (!indices.has(joint) || seen.has(joint)) throw new SkinError(`Unresolved or duplicate influence ${joint}`);
        if (!Number.isFinite(weight) || weight < 0) throw new SkinError('Invalid skin weight');
        seen.add(joint);
        total += weight;
      }
      if (!(total > 0 && Number.isFinite(total))) throw new SkinError('Zero or invalid total skin weight');
      influences.forEach(({ joint, weight }, slot) => {
        joints[vertex * 4 + slot] = indices.get(joint)!;
        weights[vertex * 4 + slot] = weight / total;
      });
    });
    return { joints, weights };
  };
  return { inverseBinds, attributes };
};

export const skinPoints = (positions: Float32Array, placed: Transform): Vec3[] =>
  Array.from({ length: positions.length / 3 }, (_, i) => applyPoint(placed, [positions[i * 3]!, positions[i * 3 + 1]!, positions[i * 3 + 2]!]));
