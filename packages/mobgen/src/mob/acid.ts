import type { Body, Bone, Feature, MaterialDef } from '../core/body.ts';
import { registerBodyPlan, sampleParams } from '../core/generate.ts';
import {
  add,
  cross,
  dot,
  lerp3,
  type Mat3,
  mulMM,
  mulMV,
  normalize,
  rotX,
  rotY,
  rotZ,
  scale,
  sub,
  transpose,
  type Vec3,
} from '../core/math.ts';
import { pick, range } from '../core/random.ts';
import { aabbOf, evalShape, type Shape, topOf } from '../core/sdf.ts';
import type { Genome } from '../core/template.ts';
import type { AcidTemplate } from './acidTemplate.ts';

export interface AcidFeature extends Feature {
  readonly anatomy?: 'palm' | 'digit';
}
interface AcidBody extends Body {
  readonly features: readonly AcidFeature[];
}

const sides = ['L', 'R'] as const;
const hosts = [
  'belly',
  'chest',
  'shoulder.L',
  'shoulder.R',
  'arm.L',
  'arm.R',
  'fore.L',
  'fore.R',
  'thigh.L',
  'thigh.R',
  'neck',
  'skull',
];
const rad = (degrees: number) => (degrees * Math.PI) / 180;
const dir = (pitch: number): Vec3 => [0, Math.cos(rad(pitch)), -Math.sin(rad(pitch))];
const down = (pitch: number, abduct = 0): Vec3 =>
  normalize([Math.sin(rad(abduct)), -Math.cos(rad(pitch)), -Math.sin(rad(pitch))]);
const tuple = (values: readonly number[]): Vec3 => [values[0]!, values[1]!, values[2]!];

export const frameOf = (head: Vec3, tail: Vec3) => {
  const y = normalize(sub(tail, head));
  const right: Vec3 = [1, 0, 0];
  const alongRight = dot(right, y);
  const reference: Vec3 = Math.abs(alongRight) > Math.cos(Math.PI / 4) ? [0, Math.sign(alongRight), 0] : right;
  const x = normalize(sub(reference, scale(y, dot(reference, y))));
  return { x, y, z: cross(x, y) };
};
const stopAtSac = (start: Vec3, sac: Extract<Shape, { kind: 'ellipsoid' }>, length: number): number => {
  const x = (start[0] - sac.center[0]) / sac.radii[0];
  const z = (start[2] - sac.center[2]) / sac.radii[2];
  if (x * x + z * z >= 1) {
    return length;
  }
  const surfaceY = sac.center[1] + sac.radii[1] * Math.sqrt(1 - x * x - z * z);
  return surfaceY < start[1] ? Math.min(length, start[1] - surfaceY) : length;
};

const matrixOf = ({ x, y, z }: ReturnType<typeof frameOf>): Mat3 => [
  x[0],
  y[0],
  z[0],
  x[1],
  y[1],
  z[1],
  x[2],
  y[2],
  z[2],
];

const buildAcid = (genome: Genome, template: AcidTemplate): AcidBody => {
  const n = (key: string) => {
    const value = genome.params[key];
    if (value === undefined || !Number.isFinite(value)) {
      throw new Error(`missing acid param ${key}`);
    }
    return value;
  };
  const g = template.geometry;
  const v = genome.voxelSize;
  const S = n('height');
  const G = S * n('girth') * n('breadth');
  const B = S * (g.jointScale[0]! + g.jointScale[1]! * n('girth'));
  const L = n('legFrac') * S;
  const H = n('headFrac') * S;
  const N = n('neckFrac') * S;
  const W = n('shoulderFrac') * S * n('breadth');
  const headRot = mulMM(rotZ(n('headRoll')), rotX(-n('headPitch')));
  const relativeSkullTail = mulMV(headRot, [0, H, 0]);
  const headHalf: Vec3 = [(H * n('headW')) / 2, (H * n('headH')) / 2, (H * n('headD')) / 2];
  const relativeHeadCenter = mulMV(headRot, [0, H / 2, -n('headFwd') * g.headOffset * H]);
  const headBox: Shape = {
    kind: 'box',
    center: relativeHeadCenter,
    half: headHalf,
    round: Math.min(...headHalf) * n('headRound'),
    rot: headRot,
  };
  const browHalf: Vec3 = [(g.browWidth * H) / 2, (g.browHeight * H) / 2, (g.browDepth * H) / 2];
  const relativeBrow: Shape = {
    kind: 'box',
    center: add(relativeHeadCenter, mulMV(headRot, [0, headHalf[1] - (g.browHeight * H) / 2, -headHalf[2]])),
    half: browHalf,
    round: Math.min(...browHalf) * g.rounding,
    rot: headRot,
  };
  const legDrop = (k: number) =>
    g.thighLength * L * Math.cos(rad(k)) + g.shinLength * L * Math.cos(rad(g.shinBackBend * k));
  const baseline = legDrop(n('kneeBend'));
  const P: Vec3 = [0, baseline + g.ankleHeight * L, 0];
  const neckPitch = n('lean') + n('hunch') + g.neckPitch;
  const trunkRise =
    g.hipsLength * Math.cos(rad(n('lean'))) +
    g.bellyLength * Math.cos(rad(n('lean') + g.bellyHunch * n('hunch'))) +
    g.chestLength * Math.cos(rad(n('lean') + n('hunch')));
  // Refitting the trunk's share preserves posture without rescaling breadth or the completed body.
  const headTop = Math.max(topOf(headBox), topOf(relativeBrow), relativeSkullTail[1]);
  const T = (S - P[1] - N * Math.cos(rad(neckPitch)) - headTop) / trunkRise;
  if (!(T > 0)) {
    throw new Error('acid proportions leave no standing trunk');
  }
  const bones: Bone[] = [];
  const features: AcidFeature[] = [];
  const crustSources: Feature[] = [];
  const byId = new Map<string, Bone>();
  const surfaces = new Map<string, { center: Vec3; radii: Vec3; rot: Mat3; shape: Shape }>();
  const bone = (
    id: string,
    parent: string | null,
    points: readonly [Vec3, Vec3],
    disposition: Bone['disposition'] = 'fixed',
  ) => {
    const [head, tail] = points;
    const kind = id.split('.')[0]!;
    const limits = template.limits[kind as keyof typeof template.limits];
    if (!limits) {
      throw new Error(`missing joint limits ${kind}`);
    }
    const flex: [number, number] = [limits[0]![0]!, limits[0]![1]!];
    if (kind === 'maw') {
      flex[0] = -n('jawGape');
    }
    if (kind === 'shin') {
      flex[0] = -n('kneeBend');
    }
    const abduct: [number, number] = [limits[1]![0]!, limits[1]![1]!];
    if (id.endsWith('.L')) {
      [abduct[0], abduct[1]] = [-abduct[1], -abduct[0]];
    }
    const result: Bone = {
      id,
      parent,
      head,
      tail,
      frame: frameOf(head, tail),
      limits: { flex, abduct, twist: [limits[2]![0]!, limits[2]![1]!] },
      disposition,
    };
    bones.push(result);
    byId.set(id, result);
    return result;
  };
  const get = (id: string) => {
    const result = byId.get(id);
    if (!result) {
      throw new Error(`missing bone ${id}`);
    }
    return result;
  };
  const feature = (
    id: string,
    material: string,
    shape: Shape,
    options: { op?: Feature['op']; blend?: number; anatomy?: NonNullable<AcidFeature['anatomy']> } = {},
  ) => {
    const f: AcidFeature = { bone: id, material, shape, op: 'add', ...options };
    features.push(f);
    return f;
  };
  const box = (
    id: string,
    center: Vec3,
    half: Vec3,
    options: { rot: Mat3; material?: string; rounding?: number; anatomy?: NonNullable<AcidFeature['anatomy']> },
  ) => {
    const shape: Shape = {
      kind: 'box',
      center,
      half,
      round: Math.min(...half) * (options.rounding ?? g.rounding),
      rot: options.rot,
    };
    feature(id, options.material ?? 'skin', shape, options.anatomy === undefined ? {} : { anatomy: options.anatomy });
    surfaces.set(id, { center, radii: half, rot: options.rot, shape });
    return shape;
  };
  const capsule = (id: string, points: readonly [Vec3, Vec3], radii: readonly [number, number], material = 'skin') => {
    const [a, b] = points;
    const [ra, rb] = radii;
    const shape: Shape = { kind: 'capsule', a, b, ra, rb };
    const f = feature(id, material, shape);
    surfaces.set(id, {
      center: lerp3(a, b, 0.5),
      radii: [ra, Math.hypot(...sub(b, a)) / 2 + ra, ra],
      rot: matrixOf(frameOf(a, b)),
      shape,
    });
    return f;
  };
  const ellipsoid = (
    id: string,
    center: Vec3,
    radii: Vec3,
    options: { material?: string; blend?: number; rot?: Mat3 } = {},
  ) => {
    const { material = 'skin', blend, rot } = options;
    return feature(
      id,
      material,
      { kind: 'ellipsoid', center, radii, ...(rot ? { rot } : {}) },
      blend === undefined ? {} : { blend },
    );
  };
  const mass = (b: Bone, center: Vec3, radii: Vec3, options: { blend?: number; rot?: Mat3 } = {}) =>
    ellipsoid(b.id, center, radii, { ...options, rot: options.rot ?? matrixOf(b.frame!) });
  const surfaceOf = (f: Feature) => {
    if (f.shape.kind !== 'ellipsoid') {
      throw new Error('station must be an ellipsoid');
    }
    const { center, radii, rot } = f.shape;
    surfaces.set(f.bone, { center, radii, rot: rot!, shape: f.shape });
  };
  const paint = (
    id: string,
    material: string,
    shape: Shape,
    options: { onto: string[]; threshold?: number; noiseScale?: number },
  ) => {
    features.push({
      bone: id,
      op: 'paint',
      material,
      shape,
      onto: options.onto,
      ...(options.threshold === undefined
        ? {}
        : { noise: { scale: options.noiseScale ?? g.patchNoiseVoxels * v, threshold: options.threshold } }),
    });
  };

  const buildTorso = () => {
    const hips = bone('hips', null, [P, add(P, scale(dir(n('lean')), g.hipsLength * T))]);
    const belly = bone('belly', 'hips', [
      hips.tail,
      add(hips.tail, scale(dir(n('lean') + g.bellyHunch * n('hunch')), g.bellyLength * T)),
    ]);
    const chest = bone('chest', 'belly', [
      belly.tail,
      add(belly.tail, mulMV(rotY(n('twist')), scale(dir(n('lean') + n('hunch')), g.chestLength * T))),
    ]);
    const neck = bone('neck', 'chest', [chest.tail, add(chest.tail, scale(dir(neckPitch), N))]);
    const skull = bone('skull', 'neck', [neck.tail, add(neck.tail, relativeSkullTail)], 'sever');
    const along = (b: Bone) => Math.hypot(...sub(b.tail, b.head)) * g.trunkAlong;
    const fleshWidth = (ratio: number) => ratio * W * n('girth');
    const pelvis = mass(hips, lerp3(hips.head, hips.tail, 0.5), [
      fleshWidth(g.pelvis[0]!),
      along(hips),
      g.pelvis[1]! * G,
    ]);
    mass(hips, hips.tail, [fleshWidth(g.waist[0]!), along(hips), g.waist[1]! * G]);
    mass(belly, belly.head, [fleshWidth(g.waist[0]!), along(belly), g.waist[1]! * G]);
    const gutDepth = g.gut[1]! * G * n('belly');
    const gut = mass(
      belly,
      add(lerp3(belly.head, belly.tail, 0.5), scale(belly.frame!.z, -g.gutForward * gutDepth)),
      [fleshWidth(g.gut[0]!) * n('belly'), along(belly), gutDepth],
      { blend: g.gutBlend },
    );
    mass(belly, belly.tail, [fleshWidth(g.midriff[0]!), along(belly), g.midriff[1]! * G]);
    const midriff = mass(chest, chest.head, [fleshWidth(g.midriff[0]!), along(chest), g.midriff[1]! * G], {
      rot: matrixOf(belly.frame!),
    });
    const ribcage = mass(chest, lerp3(chest.head, chest.tail, g.ribcageT), [
      fleshWidth(g.ribcage[0]!),
      along(chest),
      g.ribcage[1]! * G,
    ]);
    const hump = mass(
      chest,
      add(lerp3(chest.head, chest.tail, g.humpT), scale(chest.frame!.z, g.humpBack * g.ribcage[1]! * G)),
      [
        fleshWidth(g.humpWidth),
        Math.hypot(...sub(chest.tail, chest.head)) * g.humpAlong,
        G * (g.humpDepth.floor + (g.humpDepth.slope * (n('hunch') - g.humpDepth.hunchStart)) / g.humpDepth.hunchSpan),
      ],
      { blend: g.humpBlend },
    );
    mass(chest, chest.tail, [g.neckBaseRadius * G, along(chest), g.neckBaseRadius * G], { blend: g.neckBaseBlend });
    surfaceOf(pelvis);
    surfaceOf(gut);
    surfaceOf(ribcage);
    crustSources.push(ribcage, hump);
    capsule('neck', [neck.head, neck.tail], [g.neckRadius[0]! * G, g.neckRadius[1]! * G]);

    return { belly, chest, skull, midriff };
  };
  const { belly, chest, skull, midriff } = buildTorso();

  const buildHead = () => {
    const headCenter = add(skull.head, relativeHeadCenter);
    const headShape = box('skull', headCenter, headHalf, { rot: headRot, rounding: n('headRound') });
    const localHead = (local: Vec3) => add(headCenter, mulMV(headRot, local));
    box('skull', localHead([0, headHalf[1] - (g.browHeight * H) / 2, -headHalf[2]]), browHalf, { rot: headRot });
    surfaces.set('skull', { center: headCenter, radii: headHalf, rot: headRot, shape: headShape });
    const mouthCenter = localHead([
      0,
      (g.mouthLevel - 0.5) * H,
      -headHalf[2] + (g.mouthDepth * H) / 2 - (g.mouthRimVoxels * v) / 2,
    ]);
    const mouthHalf: Vec3 = [
      (g.mouthWidth * H) / 2,
      (g.mouthHeight * H) / 2,
      (g.mouthDepth * H) / 2 + (g.mouthRimVoxels * v) / 2,
    ];
    feature(
      'skull',
      'mouth',
      { kind: 'box', center: mouthCenter, half: mouthHalf, round: 0, rot: headRot },
      { op: 'carve' },
    );
    paint(
      'skull',
      'mouth',
      {
        kind: 'box',
        center: mouthCenter,
        half: tuple(mouthHalf.map((x) => x + g.mouthRimVoxels * v)),
        round: 0,
        rot: headRot,
      },
      { onto: ['skin'] },
    );
    for (const [index, side] of sides.entries()) {
      const sign = side === 'L' ? -1 : 1;
      const eye = localHead([sign * g.eyeOffset * H, (g.eyeHeight - 0.5) * H, -headHalf[2]]);
      const swollen = n('eyeState') === index + 1;
      const radius = g.eyeRadius * H * (swollen ? n('eyeSwell') : 1);
      features.push({
        bone: 'skull',
        material: 'mouth',
        shape: { kind: 'ellipsoid', center: eye, radii: [radius, radius, g.eyeDepth * H], rot: headRot },
        op: 'carve',
        onto: ['skin'],
      });
      if (!(n('eyeState') === 3 && n('burstSide') === index)) {
        ellipsoid('skull', eye, [radius, radius, radius], { material: 'acid' });
      }
    }
    const hinge = localHead([0, -g.hingeBelowCentre * H, headHalf[2] - g.hingeFromBack * H]);
    const jawRot = mulMM(headRot, rotX(-n('jawGape')));
    const jawLocal = (point: Vec3) => add(hinge, mulMV(jawRot, point));
    const jawDepth = g.jawDepth * H;
    const jawTail = jawLocal([0, (-g.jawHeight * H) / 2, -jawDepth]);
    bone('maw', 'skull', [hinge, jawTail], 'sever');
    box(
      'maw',
      jawLocal([0, (-g.jawHeight * H) / 2, -jawDepth / 2]),
      [(g.jawWidth * H) / 2, (g.jawHeight * H) / 2, jawDepth / 2],
      { rot: jawRot },
    );
    paint(
      'maw',
      'mouth',
      {
        kind: 'box',
        center: jawLocal([0, 0, -jawDepth / 2]),
        half: [(g.jawWidth * H) / 2, (g.jawHeight * H) / 2, jawDepth / 2],
        round: 0,
        rot: jawRot,
      },
      { onto: ['skin'] },
    );

    return { jawTail, jawLocal, jawDepth, mouth: localHead([0, (g.mouthLevel - 0.5) * H, -headHalf[2]]) };
  };
  const { jawTail, jawLocal, jawDepth, mouth } = buildHead();

  const buildArm = (side: 'L' | 'R') => {
    const sign = side === 'L' ? -1 : 1;
    const shoulder = bone(`shoulder.${side}`, 'chest', [
      chest.tail,
      add(
        chest.tail,
        mulMV(rotY(n('twist')), [(sign * W) / 2, -sign * n('shoulderDrop') * g.shoulderDropScale * S, 0]),
      ),
    ]);
    const shoulderOffset = tuple(g.shoulderOffset.map((value) => value * S));
    const trapezius = capsule(
      shoulder.id,
      [add(shoulder.head, shoulderOffset), add(shoulder.tail, shoulderOffset)],
      [g.shoulderRadius[0]! * G, g.shoulderRadius[1]! * G],
    );
    const shoulderJoint = g.shoulderRadius[1]! * G;
    ellipsoid(shoulder.id, shoulder.tail, [shoulderJoint, shoulderJoint, shoulderJoint]);
    const cloaked = sides[n('cloakSide')] === side;
    if (cloaked) {
      crustSources.push(trapezius);
    }
    const A = n('armFrac') * S * (1 + (sign * n('armAsym')) / 2);
    const armPitch = n(`armPitch.${side}`);
    const clearance = g.clawClearanceVoxels * v;
    let elbow = n('elbowBend');
    const handScale = n(`handScale.${side}`);
    const handLen = g.handLength * A;
    const armHead = shoulder.tail;
    const armTail = add(armHead, scale(down(armPitch, sign * g.armAbduct), g.upperArmLength * A));
    const terminal = (bend: number) =>
      add(
        add(armTail, scale(down(armPitch + bend), g.foreLength * A)),
        scale(down(armPitch + bend + g.handCurl), handLen),
      );
    while (
      terminal(elbow)[1] - g.fingerLength * handLen - n('clawLen') * g.clawLength * handLen < clearance &&
      elbow < 180 - armPitch - g.handCurl
    ) {
      elbow += 1;
    }
    const arm = bone(`arm.${side}`, shoulder.id, [armHead, armTail], 'sever');
    const fore = bone(
      `fore.${side}`,
      arm.id,
      [arm.tail, add(arm.tail, scale(down(armPitch + elbow), g.foreLength * A))],
      'sever',
    );
    const hand = bone(`hand.${side}`, fore.id, [fore.tail, terminal(elbow)], 'sever');
    capsule(arm.id, [arm.head, arm.tail], [g.armRadius[0]! * G, g.armRadius[1]! * B]);
    ellipsoid(arm.id, arm.head, [shoulderJoint, shoulderJoint, shoulderJoint]);
    const armLen = Math.hypot(...sub(arm.tail, arm.head));
    const foreLen = Math.hypot(...sub(fore.tail, fore.head));
    const deltoid = mass(arm, lerp3(arm.head, arm.tail, g.deltoid[0]!), [
      g.deltoid[1]! * G,
      g.deltoid[2]! * armLen,
      g.deltoid[3]! * G,
    ]);
    if (cloaked) {
      crustSources.push(deltoid);
    }
    mass(
      arm,
      lerp3(arm.head, arm.tail, g.upperMuscle[0]!),
      [g.upperMuscle[1]! * G, g.upperMuscle[2]! * armLen, g.upperMuscle[3]! * G],
      { blend: g.muscleBlend },
    );
    const elbowRadius = g.elbowRadius * B;
    const wristRadius = g.wristRadius * B;
    ellipsoid(arm.id, arm.tail, [elbowRadius, elbowRadius, elbowRadius]);
    ellipsoid(fore.id, fore.head, [elbowRadius, elbowRadius, elbowRadius]);
    capsule(fore.id, [fore.head, fore.tail], [g.foreRadius[0]! * B, g.foreRadius[1]! * B]);
    mass(
      fore,
      lerp3(fore.head, fore.tail, g.foreMuscle[0]!),
      [g.foreMuscle[1]! * G, g.foreMuscle[2]! * foreLen, g.foreMuscle[3]! * G],
      { blend: g.muscleBlend },
    );
    const olecranonRadius = g.olecranonRadius * B;
    ellipsoid(fore.id, add(fore.head, scale(fore.frame!.z, -olecranonRadius)), [
      olecranonRadius,
      olecranonRadius,
      olecranonRadius,
    ]);
    ellipsoid(fore.id, fore.tail, [wristRadius, wristRadius, wristRadius]);
    ellipsoid(hand.id, hand.head, [wristRadius, wristRadius, wristRadius]);
    const palmCenter = lerp3(hand.head, hand.tail, 0.5);
    box(hand.id, palmCenter, tuple(g.handHalf.map((value) => value * S * handScale)), {
      rot: matrixOf(hand.frame!),
      rounding: g.handRound,
      anatomy: 'palm',
    });
    const count = n(`clawCount.${side}`);
    const fingerRoot = add(palmCenter, scale(hand.frame!.y, g.handHalf[1]! * S * handScale));
    const buildDigit = (finger: number) => {
      const spread = count === 1 ? 0 : finger / (count - 1) - 0.5;
      const rootX = spread * 2 * (g.handHalf[0]! * S * handScale - g.fingerRadius * S);
      const tipX = spread * g.fingerFanSpan * S * handScale;
      const a = add(fingerRoot, scale(hand.frame!.x, rootX));
      const b = add(
        add(fingerRoot, scale(hand.frame!.x, tipX)),
        scale(down(armPitch + elbow + g.handCurl + g.fingerCurl), g.fingerLength * handLen),
      );
      const c = add(
        b,
        scale(down(armPitch + elbow + g.handCurl + g.fingerCurl + g.clawCurl), n('clawLen') * g.clawLength * handLen),
      );
      const digit = capsule(hand.id, [a, b], [g.fingerRadius * S, g.fingerRadius * S]);
      features[features.indexOf(digit)] = { ...digit, anatomy: 'digit' };
      const claw = capsule(hand.id, [b, c], [g.clawRadius * S, g.minThinVoxels * v], 'claw');
      features[features.indexOf(claw)] = { ...claw, anatomy: 'digit' };
    };
    for (let finger = 0; finger < count; finger++) {
      buildDigit(finger);
    }
  };
  const buildLeg = (side: 'L' | 'R', index: number) => {
    const sign = side === 'L' ? -1 : 1;
    let extra = n('limp') === index + 1 ? n('limpExtra') : 0;
    const footLen = g.footLen * S;
    while (baseline - legDrop(n('kneeBend') + extra) > footLen * Math.sin(rad(g.limpPitchCap))) {
      extra -= g.limpSolveStep;
    }
    const knee = n('kneeBend') + extra;
    const thighHead = add(P, [(sign * n('hipFrac') * W) / 2, 0, 0]);
    const thigh = bone(
      `thigh.${side}`,
      'hips',
      [thighHead, add(thighHead, scale(down(knee), g.thighLength * L))],
      'sever',
    );
    const shin = bone(
      `shin.${side}`,
      thigh.id,
      [thigh.tail, add(thigh.tail, scale(down(-g.shinBackBend * knee), g.shinLength * L))],
      'sever',
    );
    capsule(thigh.id, [thigh.head, thigh.tail], [g.thighRadius[0]! * G, g.thighRadius[1]! * G]);
    capsule(shin.id, [shin.head, shin.tail], [g.shinRadius[0]! * G, g.shinRadius[1]! * G]);
    const delta = baseline - legDrop(knee);
    const footPitch = (Math.asin(Math.max(0, delta) / footLen) * 180) / Math.PI;
    const footRot = rotX(-footPitch);
    const soleCorrection = g.ankleHeight * L * (1 - Math.cos(rad(footPitch)));
    const footLocal = (point: Vec3) => add(add(shin.tail, [0, -soleCorrection, 0]), mulMV(footRot, point));
    const ball = footLocal([0, -g.ankleHeight * L + (g.toeHeight * L) / 2, -g.footBall * footLen]);
    const toeTip = footLocal([0, -g.ankleHeight * L + (g.toeHeight * L) / 2, -footLen]);
    const foot = bone(`foot.${side}`, shin.id, [shin.tail, ball], 'sever');
    const toe = bone(`toe.${side}`, foot.id, [ball, toeTip]);
    box(
      foot.id,
      footLocal([0, (-g.ankleHeight * L) / 2, (-g.footBall * footLen) / 2]),
      [g.footHalfWidth * S, (g.ankleHeight * L) / 2, (g.footBall * footLen) / 2],
      { rot: footRot, rounding: 0 },
    );
    box(
      toe.id,
      footLocal([0, -g.ankleHeight * L + (g.toeHeight * L) / 2, -(g.footBall + g.toeLength / 2) * footLen]),
      [g.footHalfWidth * S, (g.toeHeight * L) / 2, (g.toeLength * footLen) / 2],
      { rot: footRot, rounding: 0 },
    );
    for (let cut = 1; cut <= g.toeCuts; cut++) {
      feature(
        toe.id,
        'skin',
        {
          kind: 'box',
          center: footLocal([
            (cut / (g.toeCuts + 1) - 0.5) * 2 * g.footHalfWidth * S,
            -g.ankleHeight * L + g.toeHeight * L,
            -footLen,
          ]),
          half: [(g.toeCutWidth * S) / 2, g.toeCutDepthVoxels * v, (g.toeLength * footLen) / 2],
          round: 0,
          rot: footRot,
        },
        { op: 'carve' },
      );
    }
  };
  for (const [index, side] of sides.entries()) {
    buildArm(side);
    buildLeg(side, index);
  }

  const buildSacAndDrool = () => {
    const sacRadii: Vec3 = [
      n('sacSize') * g.sacRadii[0]! * W,
      n('sacSize') * g.sacRadii[1]! * T,
      n('sacSize') * g.sacRadii[2]! * S,
    ];
    if (midriff.shape.kind !== 'ellipsoid') {
      throw new Error('midriff must be an ellipsoid');
    }
    const sacAnchor = add(chest.head, scale(belly.frame!.z, -midriff.shape.radii[2]));
    const normal = scale(belly.frame!.z, -1);
    const sacCenter = add(sacAnchor, scale(normal, sacRadii[2] * g.sacOutset));
    bone('sac.0', 'chest', [sacAnchor, sacCenter], 'burst');
    const sac: Extract<Shape, { kind: 'ellipsoid' }> = { kind: 'ellipsoid', center: sacCenter, radii: sacRadii };
    feature('sac.0', 'acid', sac, { blend: 0 });
    paint(
      'sac.0',
      'mottle',
      {
        ...sac,
        center: add(sacCenter, scale(normal, -g.sacRimInset * sacRadii[2])),
        radii: tuple(sacRadii.map((value) => value + g.sacRimVoxels * v)),
      },
      { onto: ['acid'], threshold: g.sacRimNoise },
    );
    const coarse = v > template.voxelSize * g.coarseDroolRatio;
    const strandCount = coarse ? 1 : n('droolStrands');
    const buildStrand = (strand: number) => {
      const start = strand === 0 ? jawTail : jawLocal([(g.mouthWidth * H) / 2, (-g.jawHeight * H) / 2, -jawDepth]);
      const tipClearance = Math.max(g.clawClearanceVoxels * v, g.droolClearanceHeight * S);
      let droolLength = stopAtSac(start, sac, n('droolLen') * Math.max(0, start[1] - tipClearance));
      const links = coarse ? 1 : Math.max(1, Math.ceil(droolLength / (g.droolLinkMax * S)));
      if (coarse) {
        droolLength = Math.min(droolLength, g.droolLinkMax * S);
      }
      const prefix = `drool.${['a', 'b'][strand]}`;
      const buildLink = (link: number) => {
        const id = `${prefix}.${link}`;
        const head = add(start, [0, (-droolLength * link) / links, 0]);
        const tail = add(start, [0, (-droolLength * (link + 1)) / links, 0]);
        bone(id, link === 0 ? 'maw' : `${prefix}.${link - 1}`, [head, tail]);
        const radiusAt = (t: number) =>
          Math.max(g.minThinVoxels * v, S * (g.droolRadius[0]! * (1 - t) + g.droolRadius[1]! * t));
        capsule(id, [head, tail], [radiusAt(link / links), radiusAt((link + 1) / links)], 'acid');
        if (link === links - 1) {
          ellipsoid(id, tail, tuple([1, 1, 1].map(() => g.dropRadius * radiusAt(1))), { material: 'acid' });
        }
      };
      for (let link = 0; link < links; link++) {
        buildLink(link);
      }
    };
    for (let strand = 0; strand < strandCount; strand++) {
      buildStrand(strand);
    }
  };
  buildSacAndDrool();

  const scatter = (index: number) => {
    const id = hosts[n(`mottleHost.${index}`)]!;
    const surface = surfaces.get(id)!;
    const angle = n(`mottleAngle.${index}`);
    const direction = mulMV(surface.rot, [Math.cos(angle), 0, Math.sin(angle)]);
    const origin = add(
      surface.center,
      mulMV(surface.rot, [0, (n(`mottleT.${index}`) - 0.5) * 2 * surface.radii[1], 0]),
    );
    let lo = 0;
    let hi = Math.max(...surface.radii) * 2;
    for (let iteration = 0; iteration < 32; iteration++) {
      const middle = (lo + hi) / 2;
      if (evalShape(surface.shape, add(origin, scale(direction, middle))) <= 0) {
        lo = middle;
      } else {
        hi = middle;
      }
    }
    const size = n(`mottleSize.${index}`) * S;
    paint(
      id,
      'mottle',
      { kind: 'ellipsoid', center: add(origin, scale(direction, lo)), radii: [size, size, size] },
      { onto: ['skin'], threshold: g.patchThreshold },
    );
  };
  const buildCrust = () => {
    const crustFeatures: Feature[] = crustSources.map((source) => {
      const { shape } = source;
      const grow = g.crustGrowVoxels * v;
      let grown: Shape;
      if (shape.kind === 'ellipsoid') {
        grown = { ...shape, radii: tuple(shape.radii.map((radius) => radius + grow)) };
      } else if (shape.kind === 'capsule') {
        grown = { ...shape, ra: shape.ra + grow, rb: shape.rb + grow };
      } else {
        grown = { ...shape, half: tuple(shape.half.map((half) => half + grow)) };
      }
      return { ...source, material: 'crust', shape: grown };
    });
    features.push(...crustFeatures);
    const chestRot = matrixOf(chest.frame!);
    const inverseChest = transpose(chestRot);
    const localBounds = crustFeatures.flatMap((f) => {
      const bounds = aabbOf(f.shape);
      return [bounds.min[0], bounds.max[0]].flatMap((x) =>
        [bounds.min[1], bounds.max[1]].flatMap((y) =>
          [bounds.min[2], bounds.max[2]].map((z) => mulMV(inverseChest, sub([x, y, z], chest.head))),
        ),
      );
    });
    const margin = Math.max(g.humpBlend, g.muscleBlend, g.neckBaseBlend) + v;
    const low = [0, 1, 2].map((axis) => Math.min(...localBounds.map((p) => p[axis]!)) - margin);
    const high = [0, 1, 2].map((axis) => Math.max(...localBounds.map((p) => p[axis]!)) + margin);
    const cut = (axis: number, from: number, to: number, noisy = false) => {
      const lo = [...low];
      const hi = [...high];
      lo[axis] = from;
      hi[axis] = to;
      if (to <= from) {
        return;
      }
      const localCenter = tuple(lo.map((value, index) => (value + hi[index]!) / 2));
      const shape: Shape = {
        kind: 'box',
        center: add(chest.head, mulMV(chestRot, localCenter)),
        half: tuple(lo.map((value, index) => (hi[index]! - value) / 2)),
        round: 0,
        rot: chestRot,
      };
      features.push({
        bone: 'chest',
        material: 'crust',
        shape,
        op: 'carve',
        onto: ['crust'],
        ...(noisy ? { noise: { scale: g.patchNoiseVoxels * v, threshold: g.crustNoiseThreshold } } : {}),
      });
    };
    cut(2, low[2]!, 0);
    if (n('cloakSide') === 0) {
      cut(0, 0, high[0]!);
    } else {
      cut(0, low[0]!, 0);
    }
    const edge = g.crustStart * Math.hypot(...sub(chest.tail, chest.head));
    cut(1, low[1]!, edge);
    cut(1, edge, edge + g.crustBandHeight * S, true);
    for (const f of crustFeatures) {
      paint(f.bone, 'skin', f.shape, { onto: ['crust'], threshold: g.crustCrackThreshold });
    }
  };
  buildCrust();

  for (const id of ['hips', ...sides.flatMap((side) => [`thigh.${side}`, `shin.${side}`])]) {
    const b = get(id);
    const surface = surfaces.get(id)!;
    const hem = id.startsWith('shin') ? n(`hem.${id.endsWith('L') ? 'L' : 'R'}`) : 1;
    const hemEdge = lerp3(b.head, b.tail, hem);
    const radius = Math.max(surface.radii[0], surface.radii[2]) + g.trouserGrowVoxels * v;
    paint(id, 'trousers', { kind: 'capsule', a: b.head, b: hemEdge, ra: radius, rb: radius }, { onto: ['skin'] });
    paint(
      id,
      'skin',
      { kind: 'ellipsoid', center: hemEdge, radii: [radius, g.hemNoiseVoxels * v, radius] },
      { onto: ['trousers'], threshold: g.hemNoiseThreshold, noiseScale: g.hemNoiseVoxels * v },
    );
  }
  for (let index = 0; index < n('mottleCount'); index++) {
    scatter(index);
  }
  for (const wound of genome.wounds) {
    const b = get(wound.bone);
    const surface = surfaces.get(b.id)!;
    const center = add(
      lerp3(b.head, b.tail, wound.t),
      mulMV(surface.rot, [
        Math.cos(rad(wound.angle)) * surface.radii[0],
        0,
        Math.sin(rad(wound.angle)) * surface.radii[2],
      ]),
    );
    feature(
      b.id,
      'gore',
      { kind: 'ellipsoid', center, radii: [wound.radius, wound.radius, wound.radius] },
      { op: 'carve' },
    );
    paint(
      b.id,
      'gore',
      { kind: 'ellipsoid', center, radii: tuple([1, 1, 1].map(() => wound.radius + g.woundRimVoxels * v)) },
      { onto: ['skin', 'mottle'] },
    );
  }
  const materials: Record<string, MaterialDef> = { ...template.materials };
  const skinA = template.materials.skin!.color;
  materials.skin = { ...template.materials.skin!, color: lerp3(skinA, tuple(template.skinB), n('skinTint')) };
  return {
    bones,
    features,
    materials,
    anchors: { mouth: { bone: 'skull', position: mouth } },
    jointAdjacencyPolicy: 'reserve-overlaps',
  };
};

registerBodyPlan('acid', {
  paramOrder: [
    'height',
    'breadth',
    'legFrac',
    'headFrac',
    'neckFrac',
    'shoulderFrac',
    'hipFrac',
    'armFrac',
    'armAsym',
    'girth',
    'belly',
    'lean',
    'hunch',
    'twist',
    'shoulderDrop',
    'kneeBend',
    'limp',
    'limpExtra',
    'elbowBend',
    'headPitch',
    'headRoll',
    'headFwd',
    'headW',
    'headH',
    'headD',
    'headRound',
    'jawGape',
    'eyeState',
    'eyeSwell',
    'droolStrands',
    'droolLen',
    'sacSize',
    'clawCount.L',
    'clawCount.R',
    'clawLen',
    'handScale.L',
    'handScale.R',
    'cloakSide',
    'hem.L',
    'hem.R',
    'mottleCount',
    'skinTint',
  ],
  woundBones: hosts,
  limbBones: sides.flatMap((side) => [`arm.${side}`, `fore.${side}`, `thigh.${side}`, `shin.${side}`]),
  sample(rng, generic) {
    const template = generic as AcidTemplate;
    const params = sampleParams(rng, template.params, Object.keys(template.params));
    params.mottleCount = Math.round(params.mottleCount!);
    params.burstSide = pick(rng, [0, 1]);
    const g = template.geometry;
    for (const side of sides) {
      params[`armPitch.${side}`] = range(rng, g.armPitchMin, g.armPitchMax);
    }
    for (let index = 0; index < params.mottleCount!; index++) {
      params[`mottleHost.${index}`] = Math.floor(rng() * hosts.length);
      params[`mottleAngle.${index}`] = rng() * 2 * Math.PI;
      params[`mottleT.${index}`] = range(rng, g.scatterT[0]!, g.scatterT[1]!);
      params[`mottleSize.${index}`] = range(rng, g.mottleRadius[0]!, g.mottleRadius[1]!);
    }
    return { params, wounds: [] };
  },
  build: (genome, template) => buildAcid(genome, template as AcidTemplate),
  budgets(genome, template) {
    const ratio = template.voxelSize / genome.voxelSize;
    const scaled = (bounds: { min: number; max: number }, power: number) => ({
      min: Math.max(1, Math.floor(bounds.min * ratio ** power)),
      max: Math.ceil(bounds.max * ratio ** power) + (ratio < 1 ? 1 : 0),
    });
    return {
      totalVoxels: scaled(template.budgets.totalVoxels, 3),
      totalTriangles: scaled(template.budgets.totalTriangles, 2),
      groups: Object.fromEntries(
        Object.entries(template.budgets.groups).map(([id, group]) => [id, { ...group, ...scaled(group, 3) }]),
      ),
    };
  },
});
