// biome-ignore-all lint/correctness/noNodejsModules: This command-line tool runs in Node.js.
// biome-ignore-all lint/correctness/noUndeclaredDependencies: @mobgen is a workspace source alias.
// Samples the actor pose seams of the commit it runs at over a fixed covering set and writes them as JSON
// to `--out`, so a round that replaces procedural poses with built clips can compare base against head
// with `tools/actor-pose-compare.ts`. It pins no values; `docs/deferred-assertions.md` says when to run it.
import { existsSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { templateByName } from '@mobgen/core/template.ts';
import { acidTemplate } from '@mobgen/mob/acidTemplate.ts';
import { type AttackClip, attackClipFor } from '@mobgen/mob/attack.ts';
import { flinchClipFor, HIT_FLINCH } from '@mobgen/mob/reactions.ts';
import { actorFigure } from '../src/core/actorFigureFiles.ts';
import { figureVariantOf } from '../src/core/actorModels.ts';
import { type ActorPoseInput, posedActor } from '../src/core/actorPose.ts';
import { posedFusedMassRegionBoxes, posedHumanoidRegionBoxes } from '../src/core/actorRegions.ts';
import { applyPoint, type Transform } from '../src/core/boneMath.ts';
import type { Bone } from '../src/core/bones.ts';
import { buildRegistry } from '../src/core/content.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { FUSED_MASS_FIGURE_SEED } from '../src/core/fusedMassFigure.ts';
import { admitPacks } from '../src/core/packAdmission.ts';
import { boneTransforms, type Pose } from '../src/core/pose.ts';
import type { ActorBody, ActorClips } from '../src/core/schema/actors.ts';
import type { ActorDef } from '../src/core/schema.ts';
import { corpseFallPose, deathClip } from '../src/render/corpsePose.ts';
import { MobActorMeshes } from '../src/render/mobActors.ts';
import { RagdollWorld, ragdollContent } from '../src/render/ragdoll.ts';
import { readBundledPacks, readStackActorFigureFiles } from './readBundledPacks.ts';

const STACK = 'skelly.deadvox';
// The covering set's sample points: idle clock times in seconds and shares of one stride. They choose
// where to look, not how the game behaves, so a baseline stays comparable across rounds.
const IDLE_TIMES = [0, 1.75, 3.5];
const STRIDE_SHARES = [1 / 6, 1 / 2, 5 / 6];
const ACID_DEATH_STRIDE_SHARES = [1 / 4, 3 / 4];
const FLINCH_ID = 1;

const packageRoot = fileURLToPath(new URL('..', import.meta.url));
const repositoryRoot = resolve(packageRoot, '../..');

const outArgument = process.argv.indexOf('--out');
const outPath = outArgument >= 0 ? process.argv[outArgument + 1] : undefined;
if (!outPath) {
  throw new Error('Usage: actor-pose-reference --out <file outside the repository>');
}
const out = resolve(outPath);
// Resolve the deepest existing ancestor, so a symlink cannot alias the output into the repository.
const realPath = (path: string): string => {
  let existing = path;
  while (!existsSync(existing)) {
    existing = dirname(existing);
  }
  return join(realpathSync(existing), relative(existing, path));
};
const inside = relative(realPath(repositoryRoot), realPath(out));
if (!(inside.split(sep)[0] === '..' || isAbsolute(inside))) {
  throw new Error(`--out must be outside the repository, not ${out}`);
}

const admitted = admitPacks(readBundledPacks(packageRoot, STACK));
if (admitted.issues.length > 0) {
  throw new Error(JSON.stringify(admitted.issues));
}
const { registry, issues } = buildRegistry(admitted.sources);
if (issues.length > 0) {
  throw new Error(JSON.stringify(issues));
}
const actorFigureFiles = readStackActorFigureFiles(packageRoot, STACK, registry);

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
  readonly model: string;
  readonly seed: number;
  readonly voxelMetres: number;
  readonly bones: Record<string, BoneRecord>;
  readonly anchors: Record<string, Vec3>;
  readonly regions?: Record<string, readonly BoxRecord[]>;
}

const scaleOf = (figure: object): number => ('scale' in figure && typeof figure.scale === 'number' ? figure.scale : 1);

/** Model-frame bone transforms and anchors in metres; facing and position are fixed so yaw is identity. */
const record = (
  key: string,
  model: string,
  seed: number,
  posed: { figure: ReturnType<typeof posedActor>['figure']; transforms: ReadonlyMap<string, Transform> },
): SampleRecord => {
  const scale = scaleOf(posed.figure);
  const { body, voxels } = posed.figure.realized;
  const bones = Object.fromEntries(
    [...posed.transforms].map(([id, transform]) => [
      id,
      { t: transform.t.map((value) => value * scale) as unknown as Vec3, r: [...transform.r] },
    ]),
  );
  const anchors = Object.fromEntries(
    Object.entries(body.anchors ?? {}).map(([name, anchor]) => [
      name,
      applyPoint(posed.transforms.get(anchor.bone)!, anchor.position).map((value) => value * scale) as Vec3,
    ]),
  );
  return { key, model, seed, voxelMetres: voxels.size * scale, bones, anchors };
};

const boxRecords = (
  boxes: Readonly<
    Record<string, readonly { bone: string; center: Vec3; halfSize: Vec3; rotation: readonly number[] }[]>
  >,
) =>
  Object.fromEntries(
    Object.entries(boxes).map(([region, list]) => [
      region,
      list.map(({ bone, center, halfSize, rotation }) => ({ bone, center, halfSize, rotation: [...rotation] })),
    ]),
  );

const living = (key: string, input: ActorPoseInput): SampleRecord => {
  const posed = posedActor(input);
  const regions = input.model === 'fused-mass' ? posedFusedMassRegionBoxes(input) : posedHumanoidRegionBoxes(input);
  return { ...record(key, input.model!, input.seed, posed), regions: boxRecords(regions) };
};

/** The clip key whose rotations are largest: the flinch's peak. */
const peakTime = (clip: AttackClip): number =>
  clip.keys.reduce(
    (best, key) => {
      const size = Object.values(key.rotations).reduce(
        (sum, rotation) => sum + Math.abs(rotation[0]) + Math.abs(rotation[1]) + Math.abs(rotation[2]),
        0,
      );
      return size > best.size ? { t: key.t, size } : best;
    },
    { t: 0, size: -1 },
  ).t;

const restInput = (type: ActorDef, seed: number): ActorPoseInput => ({
  figure: actorFigure(actorFigureFiles, type, seed),
  id: FLINCH_ID,
  seed,
  model: figureVariantOf(type),
  crawling: false,
  ...(type.bodyScale === undefined ? {} : { bodyScale: type.bodyScale }),
  position: [0, 0, 0],
  facing: [0, 0, -1],
  headYaw: 0,
  gaitPhase: 0,
  speed: 0,
  chasing: false,
  attackWindup: 0,
  attackWindupSeconds: type.attack?.windupSimSeconds ?? 0,
  idleTime: 0,
  stanceWeight: 0,
  severed: [],
  blockSize: 1,
});

/** Cooldown inputs that put an attack clip's time at `time`, through the cooldown path of `posedActor`. */
const attackAt = (type: ActorDef, elapsed: number): Pick<ActorPoseInput, 'attackWait' | 'attackCooldown'> => {
  const cooldown = type.attack?.cooldownSimSeconds;
  if (cooldown === undefined || !(cooldown > elapsed)) {
    throw new Error(`Actor ${type.id} has no attack cooldown longer than the sampled attack time`);
  }
  return { attackWait: cooldown - elapsed, attackCooldown: cooldown };
};

const samples: SampleRecord[] = [];
const acidBases: {
  key: string;
  seed: number;
  pose: Pose;
  figure: ReturnType<typeof posedActor>['figure'];
  clips: ActorClips;
}[] = [];

for (const type of registry.actors.values()) {
  const model = figureVariantOf(type);
  const seeds = type.model === 'fused-mass' ? [FUSED_MASS_FIGURE_SEED] : (type.figureSeeds ?? []);
  for (const seed of seeds) {
    const rest = restInput(type, seed);
    const at = (name: string, input: Partial<ActorPoseInput>) => {
      const key = `${type.id}/${model}/${seed}/${name}`;
      const full = { ...rest, ...input };
      samples.push(living(key, full));
      return { key, full };
    };
    if (type.model === 'fused-mass') {
      at('rest', {});
      at('flinch.peak', { hitFlinchTime: peakTime(HIT_FLINCH) });
      continue;
    }
    const wander = type.speed.wanderMetresPerSimSecond;
    const windup = rest.attackWindupSeconds;
    const stride = (share: number) => ({ gaitPhase: share * 2 * Math.PI, speed: wander });
    if (type.model === 'acid') {
      const { hitPeak } = acidTemplate.animation;
      const base = (name: string, input: Partial<ActorPoseInput>) => {
        const { key, full } = at(name, input);
        const posed = posedActor(full);
        acidBases.push({ key, seed, pose: posed.pose, figure: posed.figure, clips: full.figure.clips });
      };
      base('idle', {});
      for (const share of STRIDE_SHARES) {
        at(`walk.${share.toFixed(3)}`, stride(share));
      }
      for (const share of ACID_DEATH_STRIDE_SHARES) {
        base(`walk.${share.toFixed(3)}`, stride(share));
      }
      base('windup.half', { spitProgress: 0.5 });
      at('windup.full', { spitProgress: 1 });
      // The wind-up reaches the clip's peak as it ends.
      base('attack.peak', attackAt(type, windup));
      base('hit.peak', { hitFlinchTime: hitPeak });
      continue;
    }
    const template = templateByName(model);
    for (const time of IDLE_TIMES) {
      at(`idle.slack.${time}`, { idleTime: time, stanceWeight: 0 });
      at(`idle.aggravated.${time}`, { idleTime: time, stanceWeight: 1 });
    }
    for (const share of STRIDE_SHARES) {
      at(`walk.${share.toFixed(3)}`, stride(share));
    }
    const clip = attackClipFor(template);
    at('attack.hit', attackAt(type, Math.min(clip.hitTime, windup)));
    at('flinch.peak', {
      hitFlinchTime: peakTime(template.legCut === undefined ? flinchClipFor(template) : HIT_FLINCH),
    });
    if (template.legCut === undefined) {
      const crawl = type.speed.crawlMetresPerSimSecond;
      for (const share of STRIDE_SHARES) {
        at(`crawl.${share.toFixed(3)}`, { crawling: true, gaitPhase: share * 2 * Math.PI, speed: crawl });
      }
      at('crawl.hit', { crawling: true, hitFlinchTime: peakTime(HIT_FLINCH) });
    }
  }
}

// The renderer's fall is the figure's built death clip; each living base keeps its key so rounds stay comparable.
for (const base of acidBases) {
  for (const direction of [1, -1] as const) {
    const clip = deathClip(base.clips, direction);
    if (!clip) {
      throw new Error(`${base.key} bakes no death clip`);
    }
    for (const [name, elapsed] of [
      ['start', 0],
      ['half', clip.durationRealSeconds / 2],
      ['settled', clip.durationRealSeconds],
    ] as const) {
      const pose = corpseFallPose(clip, elapsed);
      samples.push(
        record(`${base.key}/death.${direction > 0 ? 'forward' : 'backward'}.${name}`, 'acid', base.seed, {
          figure: base.figure,
          transforms: boneTransforms(base.figure.realized.body.bones, pose),
        }),
      );
    }
  }
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

// The renderer owns the severable parts' rigid data; it is read the way its tests read it.
const meshes = new MobActorMeshes(1, 1, { actors: registry.actors, actorFigureFiles } as ConstructorParameters<
  typeof MobActorMeshes
>[2]);
const internal = meshes as unknown as {
  variants: readonly {
    body: ActorBody;
    bones: readonly Bone[];
    scale: number;
    rigidParts: ReadonlyMap<
      string,
      { mass: number; inertiaBody: readonly Vec3[]; corners: readonly Vec3[]; boneIndices: readonly number[] }
    >;
  }[];
  posedPartCenter: (
    variant: unknown,
    transforms: ReadonlyMap<number, Transform>,
    selected: ReadonlySet<number>,
  ) => Vec3;
};
const ragdolls = new RagdollWorld(0);
await ragdolls.ready;
const bodies: BodyRecord[] = [];
for (const variant of internal.variants) {
  const { body, bones, scale } = variant;
  const rest = boneTransforms(bones, { root: [0, 0, 0], rotations: {} });
  const restByIndex = new Map(
    bones.map((bone, index) => {
      const source = rest.get(bone.id)!;
      return [
        index,
        {
          r: source.r.map((value) => value * scale),
          t: source.t.map((value) => value * scale),
        } as unknown as Transform,
      ];
    }),
  );
  const parts = [...variant.rigidParts].map(([part, data]) => ({
    part,
    mass: data.mass,
    center: internal.posedPartCenter.call(meshes, variant, restByIndex, new Set(data.boneIndices)),
    inertia: data.inertiaBody.map((row) => [...row]),
    corners: data.corners,
  }));
  let ragdoll: RagdollRecord[] | undefined;
  if (ragdollContent.models.includes(body.model)) {
    const corpse = ragdolls.spawn({
      body,
      model: body.model,
      pose: { root: [0, 0, 0], rotations: {} },
      position: [0, 0, 0],
      yaw: 0,
      direction: 1,
      seed: body.seed,
      scale,
      ground: { blockSize: 1, isSolid: () => false },
    });
    // biome-ignore lint/performance/noAwaitInLoops: each corpse is built when the world is ready.
    await ragdolls.ready;
    ragdoll = corpse.parts.map((part) => {
      const t = part.body.translation();
      const half = part.body.collider(0).halfExtents();
      return {
        bones: [...part.sources.keys()].map((index) => bones[index]!.id),
        mass: part.body.mass(),
        center: [t.x, t.y, t.z],
        halfExtents: [half.x, half.y, half.z],
      };
    });
  }
  bodies.push({ model: body.model, seed: body.seed, parts, ...(ragdoll ? { ragdoll } : {}) });
}
ragdolls.dispose();

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify({ stack: STACK, samples, bodies })}\n`);
process.stdout.write(`${JSON.stringify({ out, samples: samples.length, bodies: bodies.length })}\n`);
