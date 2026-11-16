// The actor data contract. The fixture cases cover the hand-made fixture this repo owns; the pinned-pair cases alone
// cover what the pinned producer exports in the packs skelly ships, the only ones setup installs; the stack cases
// cover the figures the stack admits, read as deadvox reads them. The composer twin case holds the game's clip
// composer to the producer's, because every consumer must compose the same clips the same way: see
// `docs/decisions/0010-asset-pipelines-in-skelly-assets.md`, "One format, pose".
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, it } from 'node:test';
import {
  ActorBodySchema,
  ActorClipsSchema,
  actorClipIssues,
  actorFigureFileIssues,
  buildRegistry,
  clipBoneIssues,
  JointDeltaClipSchema,
  PoseClipSchema,
} from '@skelly/engine/content';
import {
  applyHeadYaw,
  applyJointDelta,
  applyMotion,
  applyOverlay,
  applyPoint,
  bodySkeleton,
  boneTransforms,
  decodeFrame,
  groundFit,
  idleBase,
  sampleClip,
  slerpQuat,
  standingFit,
  walkCursor,
  walkToIdle,
} from '@skelly/engine/pose';
import {
  packFileBytes,
  packFileOrigin,
  readAvailablePacks,
  readBundledPacks,
  readStackContentSources,
} from '../packages/deadvox/tools/readBundledPacks.ts';
import { temporalKeyFindings } from '../packages/deadvox/tools/time-lint.mjs';
import {
  applyHeadYaw as twinApplyHeadYaw,
  applyJointDelta as twinApplyJointDelta,
  applyMotion as twinApplyMotion,
  applyOverlay as twinApplyOverlay,
  decodeFrame as twinDecodeFrame,
  sampleClip as twinSampleClip,
  walkToIdle as twinWalkToIdle,
} from '../packages/skelly-assets/tools/actorCompose.mjs';
import { boneTransforms as twinBoneTransforms } from '../packages/skelly-assets/tools/packages/mobgen/src/core/pose.ts';
import { PACKAGE_ROOT } from './model-export-sync.mjs';

const deadvoxRequire = createRequire(new URL('../packages/deadvox/package.json', import.meta.url));
const { GLTFLoader } = await import(deadvoxRequire.resolve('three/addons/loaders/GLTFLoader.js'));
const { Box3 } = deadvoxRequire('three');
const { parse, safeParse } = await import(deadvoxRequire.resolve('valibot'));
const fixture = (name) => new URL(`../packages/deadvox/test/fixtures/actors/${name}`, import.meta.url);
const readJson = (name) => JSON.parse(readFileSync(fixture(name), 'utf8'));

const rawBody = readJson('fixture.body.json');
const rawClips = readJson('fixture.clips.json');
const body = parse(ActorBodySchema, rawBody);
const clips = parse(ActorClipsSchema, rawClips);
const finitePose = parse(PoseClipSchema, readJson('fixture.finite-pose.json'));
const jointDelta = parse(JointDeltaClipSchema, readJson('fixture.joint-delta.json'));
const { standing, crawling } = clips;

const TOLERANCE = 1e-9;
/** A GLB stores positions as float32, the body its height as a double. */
const HEIGHT_TOLERANCE = 1e-5;
const near = (a, b) => a.length === b.length && a.every((value, i) => Math.abs(value - b[i]) <= TOLERANCE);
const apart = (label, a, b) => `${label}: [${a}] vs [${b}]`;
const bitEqual = (a, b) => a.length === b.length && a.every((value, i) => value === b[i]);
const finite = (transform) => [...transform.r, ...transform.t].every(Number.isFinite);

describe('actor fixture acceptance', () => {
  it('accepts the body, the clips and the standalone clips with no body issues', () => {
    assert.ok(body.bones.length > 0);
    assert.deepEqual(actorClipIssues(body, clips), []);
    assert.deepEqual(clipBoneIssues(body, finitePose), []);
    assert.deepEqual(clipBoneIssues(body, jointDelta), []);
  });
});

describe('actor fixture rejection', () => {
  const schemaIssues = (schema, value) => safeParse(schema, value).issues?.length ?? 0;
  const mutated = (value, edit) => {
    const copy = structuredClone(value);
    edit(copy);
    return copy;
  };
  const bone = (copy, id) => copy.bones.find((entry) => entry.id === id);
  const bodyRows = [
    [
      'a parent naming a later bone',
      (copy) => {
        copy.bones.splice(1, 0, ...copy.bones.splice(2, 1));
      },
    ],
    [
      'a hull centre not among the voxels',
      (copy) => {
        bone(copy, 'head').hull.push([9, 9, 9]);
      },
    ],
    [
      'a ground contact bone without voxels',
      (copy) => {
        const { voxels: _voxels, hull: _hull, ...bare } = bone(copy, 'upperArm.R');
        copy.bones = copy.bones.map((entry) => (entry.id === bare.id ? bare : entry));
      },
    ],
    [
      'a body mass of zero',
      (copy) => {
        copy.bodyMassKg = 0;
      },
    ],
    [
      'a mass fraction above one',
      (copy) => {
        copy.massFractions['arm.L'] = 1.5;
      },
    ],
  ];
  for (const [name, edit] of bodyRows) {
    it(`rejects a body with ${name}`, () => {
      assert.ok(schemaIssues(ActorBodySchema, mutated(rawBody, edit)) > 0);
    });
  }

  it('reports issues for a body with no bones instead of throwing', () => {
    assert.ok(schemaIssues(ActorBodySchema, { ...rawBody, bones: [] }) > 0);
  });

  it('rejects a fused-mass body whose animation carries attackPeakAtSimSeconds', () => {
    // Other fused-mass checks fail on this rig too, so the row counts the animation check's issue over a control.
    const asFusedMass = (copy) => {
      copy.bodyPlan = 'fused-mass';
      copy.animation = { flinch: { peakAtSimSeconds: 0.1, durationSimSeconds: 0.2, pitch: 1, roll: 1 } };
    };
    const control = schemaIssues(ActorBodySchema, mutated(rawBody, asFusedMass));
    const withPeak = mutated(rawBody, (copy) => {
      asFusedMass(copy);
      copy.animation = { ...rawBody.animation };
    });
    assert.ok(schemaIssues(ActorBodySchema, withPeak) > control);
  });

  const clipRows = [
    [
      'a non-unit quaternion',
      (copy) => {
        copy.standing.walk.frames[0].rotations.chest = [0, 0, 0.5, 1];
      },
    ],
    [
      'a hitAtSimSeconds beyond the duration',
      (copy) => {
        copy.standing.attack.hitAtSimSeconds = copy.standing.attack.durationSimSeconds * 2;
      },
    ],
  ];
  for (const [name, edit] of clipRows) {
    it(`rejects clips with ${name}`, () => {
      assert.ok(schemaIssues(ActorClipsSchema, mutated(rawClips, edit)) > 0);
    });
  }

  const issueRows = [
    [
      'a walk blend bone naming no bone',
      (copy) => {
        copy.standing.attack.walkBlendBones.push('tail');
      },
    ],
    [
      'no crawling flinch',
      (copy) => {
        const { flinch: _flinch, ...rest } = copy.crawling;
        copy.crawling = rest;
      },
    ],
  ];
  for (const [name, edit] of issueRows) {
    it(`reports clips with ${name}`, () => {
      const parsed = parse(ActorClipsSchema, mutated(rawClips, edit));
      assert.ok(actorClipIssues(body, parsed).length > 0);
    });
  }

  it('reports a creature attack that loops', () => {
    const creature = { ...body, bodyPlan: 'quadruped' };
    const creatureClips = (loop) => {
      const attack = { ...structuredClone(readJson('fixture.finite-pose.json')), hitAtSimSeconds: 0.3, loop };
      const idle = { ...structuredClone(rawClips.crawling.idle), periodSimSeconds: 1 };
      return parse(ActorClipsSchema, { standing: { idle, walk: structuredClone(rawClips.standing.walk), attack } });
    };
    assert.deepEqual(actorClipIssues(creature, creatureClips(false)), []);
    assert.ok(actorClipIssues(creature, creatureClips(true)).length > 0);
  });
});

describe('actor clip composition over the fixture', () => {
  const slack = decodeFrame(standing.idle.slack.base);

  it('decodes a stored root into the root bone translation', () => {
    const [still, , moving] = standing.walk.frames;
    const atRest = boneTransforms(body.bones, decodeFrame(still));
    const moved = boneTransforms(body.bones, decodeFrame(moving));
    assert.ok([...moved.values()].every(finite));
    assert.deepEqual(moved.get('root').t, moving.root);
    assert.deepEqual(
      moved.get('root').t.map((value, axis) => value - atRest.get('root').t[axis]),
      moving.root,
    );
    const crawl = boneTransforms(body.bones, decodeFrame(crawling.idle.frames[0]));
    assert.equal(crawl.size, body.bones.length);
    assert.ok([...crawl.values()].every(finite));
  });

  const flinchAt = (side) =>
    applyOverlay(body, slack, standing.flinch, standing.flinch.peakAtSimSeconds, side, 'standing');

  it('scales only a flinch z angle by the side', () => {
    const [right, left] = [flinchAt(1), flinchAt(-1)];
    for (const { id } of body.bones) {
      const [a, b] = [right.rotations[id] ?? [], left.rotations[id] ?? []];
      if (id === 'chest') {
        assert.ok(!near(a, b), 'chest must differ by side');
      } else {
        assert.ok(near(a, b), apart(id, a, b));
      }
    }
    const attackAt = (side) =>
      applyOverlay(body, slack, standing.attack, standing.attack.hitAtSimSeconds, side, 'standing');
    const [attackRight, attackLeft] = [attackAt(1), attackAt(-1)];
    for (const { id } of body.bones) {
      const [a, b] = [attackRight.rotations[id] ?? [], attackLeft.rotations[id] ?? []];
      assert.ok(near(a, b), apart(id, a, b));
    }
    assert.ok(near(attackRight.root, attackLeft.root), apart('root', attackRight.root, attackLeft.root));
  });

  it('carries a parent rotation to its child through the bone chain', () => {
    const [right, left] = [flinchAt(1), flinchAt(-1)];
    assert.ok(
      near(right.rotations.head, left.rotations.head),
      apart('head local', right.rotations.head, left.rotations.head),
    );
    const [rightHead, leftHead] = [right, left].map((pose) => boneTransforms(body.bones, pose).get('head'));
    assert.ok(!near([...rightHead.r, ...rightHead.t], [...leftHead.r, ...leftHead.t]), 'head world must differ');
  });

  it('refits the root to the ground for each stance', () => {
    const base = idleBase(standing.idle, 0);
    const hit = applyOverlay(body, base, standing.attack, standing.attack.hitAtSimSeconds, 0, 'standing');
    assert.equal(hit.root[0], base.root[0]);
    assert.equal(hit.root[2], base.root[2]);
    const standingY = standingFit(body, hit.rotations) - standing.attack.frames[1].dropMetres;
    assert.notEqual(standingY, base.root[1]);
    assert.ok(near([hit.root[1]], [standingY]), apart('standing root y', [hit.root[1]], [standingY]));

    const crawlBase = decodeFrame(crawling.idle.frames[0]);
    const flinch = applyOverlay(body, crawlBase, crawling.flinch, crawling.flinch.peakAtSimSeconds, 1, 'crawling');
    const probe = { root: [crawlBase.root[0], 0, crawlBase.root[2]], rotations: flinch.rotations };
    const crawlY = -groundFit(body, probe, body.groundContactBones).lowest;
    assert.ok(Math.abs(crawlY - crawlBase.root[1]) > TOLERANCE, 'the flinch must move the crawl fit');
    assert.ok(near([flinch.root[1]], [crawlY]), apart('crawling root y', [flinch.root[1]], [crawlY]));
  });

  it('returns a grounded base unchanged at an overlay endpoint and refits an ungrounded one', () => {
    const grounded = standingFit(body, slack.rotations);
    assert.ok(near([slack.root[1]], [grounded]), apart('grounding precondition', [slack.root[1]], [grounded]));
    const start = applyOverlay(body, slack, standing.attack, 0, 0, 'standing');
    for (const [id, rotation] of Object.entries(slack.rotations)) {
      assert.ok(bitEqual(start.rotations[id], rotation), id);
    }
    assert.ok(near(start.root, slack.root), apart('root', start.root, slack.root));

    const stride = decodeFrame(standing.walk.frames[2]);
    const refit = applyOverlay(body, stride, standing.attack, 0, 0, 'standing');
    for (const [id, rotation] of Object.entries(stride.rotations)) {
      assert.ok(bitEqual(refit.rotations[id], rotation), id);
    }
    const fit = standingFit(body, stride.rotations);
    assert.notEqual(fit, stride.root[1]);
    const expected = [stride.root[0], fit, stride.root[2]];
    assert.ok(near(refit.root, expected), apart('refit root', refit.root, expected));
  });

  it('wraps a looping clip from its last frame to frame zero', () => {
    const { frames } = standing.walk;
    const late = sampleClip(standing.walk, walkCursor(2 * Math.PI * (7 / 8), 1));
    const halfRoot = frames[3].root.map((value) => value / 2);
    assert.ok(near(late.root, halfRoot), apart('root', late.root, halfRoot));
    const midChest = slerpQuat(frames[3].rotations.chest, frames[0].rotations.chest, 1 / 2);
    assert.ok(near(late.rotations.chest, midChest), apart('chest', late.rotations.chest, midChest));
    late.root.forEach((value, axis) => {
      const [low, high] = [0, frames[3].root[axis]].sort((a, b) => a - b);
      assert.ok(value > low && value < high, `root[${axis}] strictly between`);
    });
    assert.deepEqual(sampleClip(standing.walk, walkCursor(2 * Math.PI, 1)), frames[0]);
  });

  it('holds a finite clip at its last frame and samples between frames', () => {
    const { durationSimSeconds: duration, frames } = finitePose;
    assert.equal(sampleClip(finitePose, duration), frames[2]);
    assert.equal(sampleClip(finitePose, 2 * duration), frames[2]);
    assert.equal(sampleClip(finitePose, duration / 2), frames[1]);
    const between = sampleClip(finitePose, (3 / 4) * duration).rotations.chest;
    const [low, high] = [frames[1].rotations.chest[0], frames[2].rotations.chest[0]];
    assert.ok(between[0] > low && between[0] < high, `chest x ${between[0]} strictly between ${low} and ${high}`);
  });
});

/**
 * Each body and clips pair the pinned producer exports that a shipped pack declares, as stored and as the game's schemas
 * admit it. A pack may take only some of a build's mobs, and the game loads no pair its pack leaves out.
 */
const pinnedPairs = () => {
  const built = new URL('../packages/skelly-assets/built/', import.meta.url);
  const { models } = JSON.parse(readFileSync(new URL('manifest.json', built), 'utf8'));
  const declared = new Set(
    readAvailablePacks(PACKAGE_ROOT).flatMap(({ manifest }) =>
      manifest.files.filter(({ kind }) => kind === 'json').map(({ path }) => `${manifest.id}/${path}`),
    ),
  );
  const read = (path) => JSON.parse(readFileSync(new URL(path, built), 'utf8'));
  return models
    .filter(
      (row) =>
        row.body !== undefined &&
        row.clips !== undefined &&
        declared.has(`${row.pack}/${row.body}`) &&
        declared.has(`${row.pack}/${row.clips}`),
    )
    .map((row) => {
      const [bodyFile, clipsFile] = [`${row.pack}/${row.body}`, `${row.pack}/${row.clips}`];
      const [stored, storedClips] = [read(bodyFile), read(clipsFile)];
      return {
        bodyFile,
        clipsFile,
        stored: { body: stored, clips: storedClips },
        admitted: { body: parse(ActorBodySchema, stored), clips: parse(ActorClipsSchema, storedClips) },
      };
    });
};

describe('pinned producer exports', () => {
  it('pinned producer exports parse and agree', () => {
    const pairs = pinnedPairs();
    assert.ok(pairs.length > 0, 'the manifest lists no body and clips pair');
    for (const { bodyFile, clipsFile, admitted } of pairs) {
      assert.deepEqual(actorClipIssues(admitted.body, admitted.clips), [], `${bodyFile} with ${clipsFile}`);
    }
  });
});

/** The game's composer and the producer's twin, each with its own bone chain, as the game and the producer pose. */
const COMPOSERS = {
  game: {
    applyHeadYaw,
    applyJointDelta,
    applyMotion,
    applyOverlay,
    decodeFrame,
    sampleClip,
    walkToIdle,
    transforms: (figureBody, pose) => boneTransforms(bodySkeleton(figureBody), pose),
  },
  twin: {
    applyHeadYaw: twinApplyHeadYaw,
    applyJointDelta: twinApplyJointDelta,
    applyMotion: twinApplyMotion,
    applyOverlay: twinApplyOverlay,
    decodeFrame: twinDecodeFrame,
    sampleClip: twinSampleClip,
    walkToIdle: twinWalkToIdle,
    transforms: (figureBody, pose) => twinBoneTransforms(figureBody.bones, pose),
  },
};
/**
 * Where each layer is sampled, as a fraction of its span, with the walk speed, flinch side and head yaw: a covering of
 * clip endpoints and between-frame cursors; rest, partial and full speed for speed-weighted deltas and, as a share of
 * the walk's idle blend speed, for the walk-to-idle cross-fade; both sides; and no head turn, turns either way and
 * one past a framed head's limits.
 */
const COMPOSE_ROWS = [
  { at: 0, speed: 1, side: 1, headYaw: 0.6 },
  { at: 0.37, speed: 0.6, side: -1, headYaw: -1.4 },
  { at: 0.81, speed: 0, side: 1, headYaw: 0 },
  { at: 1, speed: 1, side: -1, headYaw: 2.2 },
];
const COMPOSE_SEED = 7;
/** How a composed pose's label names the head yaw layer and a walk's cross-fade into an idle. */
const HEAD_YAW = 'head yaw';
const FADES_TO = 'fades to';

/** A clip's cursor at `at` of its span: a looping pose clip is sampled normalised, any other on its own clock. */
const cursorOf = (clip, at) => {
  if (clip.kind === 'pose' && clip.loop) {
    return at;
  }
  const span = clip.cursor === 'gaitPhase' ? 2 * Math.PI : (clip.durationSimSeconds ?? clip.durationRealSeconds ?? 1);
  return at * span;
};

/** A stance idle's slack and aggravated poses at `at`, each moved by its own oscillators. */
const stanceIdlePoses = (composer, name, idle, at) =>
  ['slack', 'aggravated'].map((weight) => {
    const { base, motion } = idle[weight];
    const time = at * Math.max(0, ...motion.map(({ periodSimSeconds }) => periodSimSeconds));
    return [`${name} ${weight}`, composer.applyMotion(composer.decodeFrame(base), motion, time, COMPOSE_SEED)];
  });

/**
 * The poses a stance set's idles, walks and deaths give at `at`, and each walk that fades into the idle cross-faded
 * into both stance idles at `speed` of its idle blend speed: the bases its overlays and deltas compose onto.
 */
const basePoses = (composer, set, { at, speed }) => {
  const idles = Object.entries(set).flatMap(([name, entry]) =>
    entry.slack ? stanceIdlePoses(composer, name, entry, at) : [],
  );
  const sampledClips = Object.entries(set).flatMap(([name, entry]) => {
    if (entry.slack) {
      return [];
    }
    const sampled = (clip) => composer.decodeFrame(composer.sampleClip(clip, cursorOf(clip, at)));
    if (entry.kind === undefined) {
      return Object.entries(entry).map(([direction, clip]) => [`${name} ${direction}`, sampled(clip)]);
    }
    if (entry.kind !== 'pose') {
      return [];
    }
    const walk = sampled(entry);
    const faded =
      entry.idleBlendSpeed === undefined
        ? []
        : idles.map(([idleLabel, idle]) => [
            `${name} ${FADES_TO} ${idleLabel}`,
            composer.walkToIdle(walk, idle, speed * entry.idleBlendSpeed, entry.idleBlendSpeed),
          ]);
    return [[name, walk], ...faded];
  });
  return [...idles, ...sampledClips];
};

/**
 * Each base, then the head yaw and each overlay and joint delta of the set layered on in stored order, with the
 * layers it carries. The head turns first, so the action layers after it compose onto a turned head, as a flinch
 * or hit does in the game.
 */
const composedPoses = (composer, { body: figureBody, clips: figureClips }, row) =>
  Object.entries(figureClips).flatMap(([stance, set]) => {
    const { at, speed, side, headYaw } = row;
    const actions = Object.entries(set)
      .filter(([, clip]) => clip.kind === 'overlay' || clip.kind === 'jointDelta')
      .map(([name, clip]) => [
        name,
        (below) =>
          clip.kind === 'overlay'
            ? composer.applyOverlay(figureBody, below, clip, cursorOf(clip, at), side, stance)
            : composer.applyJointDelta(figureBody, below, clip, cursorOf(clip, at), { speed, side }),
      ]);
    // The game poses a fused mass from its rest and its body's flinch, with no head to turn.
    const turns = headYaw !== 0 && figureBody.bodyPlan !== 'fused-mass';
    const turn = turns ? [[HEAD_YAW, (below) => composer.applyHeadYaw(figureBody, below, headYaw)]] : [];
    const layers = [...turn, ...actions];
    return basePoses(composer, set, row).flatMap(([label, base]) => {
      const out = [{ label: `${stance} ${label}`, pose: base, layers: 0 }];
      for (const [name, layer] of layers) {
        const { label: under, pose: below, layers: depth } = out.at(-1);
        out.push({ label: `${under} > ${name}`, pose: layer(below), layers: depth + 1 });
      }
      return out;
    });
  });

/** The largest difference between two bone transform maps, or infinity where they pose different bones. */
const transformGap = (a, b) => {
  if (a.size !== b.size || [...a.keys()].some((id) => !b.has(id))) {
    return Number.POSITIVE_INFINITY;
  }
  const values = (map) => [...a.keys()].flatMap((id) => [...map.get(id).r, ...map.get(id).t]);
  const [ours, theirs] = [values(a), values(b)];
  return Math.max(0, ...ours.map((value, i) => Math.abs(value - theirs[i])));
};

describe('actor composer twin', () => {
  // biome-ignore lint/style/noDoneCallback: Node's TestContext prints the comparison count, not a done callback.
  it('composes every pinned figure the way the producer twin does, layer by layer', (t) => {
    const comparisons = pinnedPairs().flatMap(({ bodyFile, stored, admitted }) =>
      COMPOSE_ROWS.flatMap((row) => {
        const game = composedPoses(COMPOSERS.game, admitted, row);
        const twin = composedPoses(COMPOSERS.twin, stored, row);
        assert.deepEqual(
          game.map(({ label }) => label),
          twin.map(({ label }) => label),
        );
        return game.map(({ label, pose, layers }, i) => ({
          where: `${bodyFile} at ${row.at}: ${label}`,
          layers,
          gap: transformGap(
            COMPOSERS.game.transforms(admitted.body, pose),
            COMPOSERS.twin.transforms(stored.body, twin[i].pose),
          ),
        }));
      }),
    );
    const count = (keep) => comparisons.filter(keep).length;
    const layered = count(({ layers }) => layers > 0);
    const turned = count(({ where }) => where.includes(`> ${HEAD_YAW}`));
    const faded = count(({ where }) => where.includes(` ${FADES_TO} `));
    assert.ok(layered > 0, 'no pinned figure layered an overlay or joint delta');
    assert.ok(turned > 0, 'no pinned figure turned its head');
    assert.ok(faded > 0, 'no pinned walk faded into an idle');
    t.diagnostic(
      `${comparisons.length} composed poses compared, ${layered} of them layered, ${turned} with a turned head, ${faded} on a faded walk`,
    );
    // The game's arithmetic is its own copy in its own operation order, so the two agree to rounding, not bit for bit.
    assert.deepEqual(
      comparisons.filter(({ gap }) => !(gap <= TOLERANCE)).map(({ where, gap }) => `${where} differs by ${gap}`),
      [],
    );
  });
});

/** What a fused mass's cell index attribute disagrees with in the body's cells: it must name a filled cell per vertex. */
const cellIssues = ({ uv3: cell }, count, cells) => {
  if (cell?.count !== count) {
    return [`cell index does not cover the ${count} vertices`];
  }
  const filled = new Set(cells.filled.map(([index]) => index));
  for (let i = 0; i < count; i++) {
    if (!filled.has(cell.getX(i))) {
      return [`vertex ${i} names cell ${cell.getX(i)}, which is not filled`];
    }
  }
  return [];
};

/**
 * What an actor GLB's one bone-tabled mesh disagrees with in `figureBody`: the table must name the bones in order, every
 * vertex attribute cover every vertex, each vertex's bone index be a table index and each triangle index a vertex; a
 * fused mass's cell index must name a filled cell. Also returns the bone indices that carry vertices, the scene's
 * vertical span and the bone-tabled geometry.
 */
const boneMesh = async (bytes, figureBody) => {
  const { bones } = figureBody;
  const loaded = await new GLTFLoader().parseAsync(Uint8Array.from(bytes).buffer, '');
  const tabled = [];
  loaded.scene.traverse((visited) => {
    if (visited.userData.bones) {
      tabled.push(visited);
    }
  });
  const box = new Box3().setFromObject(loaded.scene);
  const result = { issues: [], skinned: [], span: box.max.y - box.min.y, geometry: undefined };
  if (tabled.length !== 1) {
    result.issues.push(`${tabled.length} bone-tabled meshes`);
    return result;
  }
  const [node] = tabled;
  const ids = bones.map(({ id }) => id);
  if (node.userData.bones.join() !== ids.join()) {
    result.issues.push(`bone table [${node.userData.bones}] vs body bones [${ids}]`);
  }
  const { attributes, index } = node.geometry;
  const { count } = attributes.position;
  for (const name of ['normal', 'color', 'uv1', 'uv2'].filter((attribute) => attributes[attribute]?.count !== count)) {
    result.issues.push(`${name} does not cover the ${count} vertices`);
  }
  const skinned = new Set();
  for (let i = 0; i < count; i++) {
    skinned.add(attributes.uv1.getX(i));
  }
  result.skinned = [...skinned].sort((a, b) => a - b);
  if (!result.skinned.every((i) => Number.isInteger(i) && i >= 0 && i < bones.length)) {
    result.issues.push(`bone indices [${result.skinned}] outside the table`);
  }
  if (!Array.from(index.array).every((vertex) => vertex < count)) {
    result.issues.push('a triangle index beyond the vertices');
  }
  if (figureBody.cells) {
    result.issues.push(...cellIssues(attributes, count, figureBody.cells));
  }
  result.geometry = node.geometry;
  return result;
};

describe('actor fixture GLB', () => {
  it('decodes with the bone table and per-vertex bone indices', async () => {
    const { issues } = await boneMesh(readFileSync(fixture('fixture.glb')), body);
    assert.deepEqual(issues, []);
  });
});

/** Hull-bearing bones: what a stance's voxels can rest on. */
const hulled = (figureBody) => figureBody.bones.filter(({ hull }) => hull).map(({ id }) => id);

/**
 * A stance idle stands where the reader's standing fit puts it: the fit is grounded by the extents, so its voxels may
 * rest less than a voxel above the ground. A frame idle stores its own grounding: its lowest voxel is at the ground.
 */
const standingIssues = (figureBody, stand) => {
  if (!stand.idle.slack) {
    return stand.idle.frames
      .map((frame) => groundFit(figureBody, decodeFrame(frame), hulled(figureBody)).lowest)
      .filter((lowest) => !near([lowest], [0]))
      .map((lowest) => `standing idle lowest voxel ${lowest}`);
  }
  return [stand.idle.slack.base, stand.idle.aggravated.base].map(decodeFrame).flatMap((base) => {
    const fit = standingFit(figureBody, base.rotations);
    const { lowest } = groundFit(figureBody, base, hulled(figureBody));
    return [
      ...(Number.isFinite(fit) && near([base.root[1]], [fit])
        ? []
        : [apart('standing root y vs fit', [base.root[1]], [fit])]),
      ...(lowest >= -TOLERANCE && lowest < figureBody.voxelSize ? [] : [`standing lowest voxel ${lowest}`]),
    ];
  });
};

/** A crawling idle rests its lowest ground contact at the ground. */
const crawlingIssues = (figureBody, crawl) => {
  const contacts = figureBody.groundContactBones ?? [];
  const { lowest } = groundFit(figureBody, decodeFrame(crawl.idle.frames[0]), contacts);
  return near([lowest], [0]) ? [] : [`crawling lowest contact ${lowest} over [${contacts}]`];
};

/** Where a figure's stored idles leave the ground the reader fits, per stance it has. */
const groundIssues = ({ body: figureBody, clips: { standing: stand, crawling: crawl } }) => [
  ...(stand || crawl ? [] : ['no stance']),
  ...(stand ? standingIssues(figureBody, stand) : []),
  ...(crawl ? crawlingIssues(figureBody, crawl) : []),
];

/** The stored idle poses of each stance a figure has. */
const idlePoses = ({ standing: stand, crawling: crawl }) =>
  [stand, crawl]
    .filter(Boolean)
    .flatMap(({ idle }) => (idle.slack ? [idle.slack.base, idle.aggravated.base] : [idle.frames[0]]))
    .map(decodeFrame);

/**
 * Where a figure's GLB, posed through each vertex's bone, leaves the ground its hull fits: in every idle pose the lowest
 * posed vertex must lie within one voxel of the lowest hull voxel.
 */
const posedIssues = ({ body: figureBody, clips: figureClips }, { attributes: { position, uv1 } }) =>
  idlePoses(figureClips).flatMap((pose) => {
    const transforms = boneTransforms(figureBody.bones, pose);
    const byIndex = figureBody.bones.map(({ id }) => transforms.get(id));
    let lowest = Number.POSITIVE_INFINITY;
    for (let i = 0; i < position.count; i++) {
      const vertex = [position.getX(i), position.getY(i), position.getZ(i)];
      lowest = Math.min(lowest, applyPoint(byIndex[uv1.getX(i)], vertex)[1]);
    }
    const fit = groundFit(figureBody, pose, hulled(figureBody)).lowest;
    return Math.abs(lowest - fit) <= figureBody.voxelSize ? [] : [`posed lowest vertex ${lowest} vs hull fit ${fit}`];
  });

describe('stack actor figures', () => {
  const { registry, issues } = buildRegistry(readStackContentSources(PACKAGE_ROOT, 'skelly.deadvox'));
  const packs = readBundledPacks(PACKAGE_ROOT, 'skelly.deadvox');
  const { models } = JSON.parse(
    readFileSync(new URL('../packages/skelly-assets/built/manifest.json', import.meta.url), 'utf8'),
  );
  /**
   * Each admitted figure row with its pinned pack and GLB, and the files it names read as JSON through the reader. A
   * row is matched by the body file it names, since a build may key its model row by mob id while the figure row
   * carries the seed too.
   */
  const rows = [...registry.actorFigures.values()].map((row) => {
    const pinned = models.filter((model) => model.body === row.body);
    const pack = pinned.length === 1 ? packs.find(({ manifest }) => manifest.id === pinned[0].pack) : undefined;
    const read = (path) => JSON.parse(packFileBytes(PACKAGE_ROOT, pack, path).toString('utf8'));
    return pack
      ? { ...row, pack, glb: pinned[0].path, bodyData: read(row.body), clipsData: read(row.clips) }
      : { ...row, missing: `${pinned.length} pinned model rows, or a pack outside the stack` };
  });
  /** The figures as the game's schemas admit their bytes. */
  const figures = rows
    .filter(({ pack }) => pack)
    .map((row) => ({
      ...row,
      bodyFile: row.body,
      clipsFile: row.clips,
      body: parse(ActorBodySchema, row.bodyData),
      clips: parse(ActorClipsSchema, row.clipsData),
    }));

  // biome-ignore lint/style/noDoneCallback: Node's TestContext prints the figure listing, not a done callback.
  it('admits a non-empty set of stack figures whose declared files agree with their rows and types', (t) => {
    assert.deepEqual(issues, []);
    assert.ok(rows.length > 0, 'the stack admits no actor figure');
    assert.deepEqual(
      rows.flatMap((row) =>
        row.missing
          ? [`${row.id}: ${row.missing}`]
          : actorFigureFileIssues(registry, row.id, row.bodyData, row.clipsData).map(
              ({ path, message }) => `${row.id}${path}: ${message}`,
            ),
      ),
      [],
    );
    for (const { id } of rows) {
      t.diagnostic(`actor figure ${id}`);
    }
  });

  it('names a clock and unit in every timing key of each figure body and clips file', () => {
    assert.ok(figures.length > 0);
    assert.deepEqual(
      figures.flatMap(({ id, bodyFile, clipsFile, bodyData, clipsData }) => [
        ...temporalKeyFindings(`${id} ${bodyFile}`, bodyData),
        ...temporalKeyFindings(`${id} ${clipsFile}`, clipsData),
      ]),
      [],
    );
  });

  /** What one figure's pinned GLB, body and clips, read as deadvox reads them, disagree with in its admitted body. */
  const glbIssues = async (figure) => {
    const { id, pack, glb, bodyFile, clipsFile, body: figureBody } = figure;
    const found = [glb, bodyFile, clipsFile]
      .filter((path) => packFileOrigin(PACKAGE_ROOT, pack, path) !== 'external')
      .map((path) => `${path} is not read from the external root`);
    const mesh = await boneMesh(packFileBytes(PACKAGE_ROOT, pack, glb), figureBody);
    found.push(...mesh.issues);
    if (mesh.issues.length === 0) {
      found.push(...posedIssues(figure, mesh.geometry));
    }
    const voxelled = figureBody.bones.flatMap(({ voxels }, i) => ((voxels?.length ?? 0) > 0 ? [i] : []));
    if (mesh.skinned.join() !== voxelled.join()) {
      found.push(`bones with vertices [${mesh.skinned}] vs bones with voxels [${voxelled}]`);
    }
    if (!(Math.abs(mesh.span - figureBody.height) <= HEIGHT_TOLERANCE)) {
      found.push(`GLB height ${mesh.span} vs body height ${figureBody.height}`);
    }
    return found.map((issue) => `${id}: ${issue}`);
  };

  it('reads each figure GLB from the external root with the body bone table, filled cells and hull-fitted geometry', async () => {
    assert.ok(figures.length > 0);
    assert.deepEqual((await Promise.all(figures.map(glbIssues))).flat(), []);
  });

  it('grounds each figure in its standing and crawling stances', () => {
    assert.ok(figures.length > 0);
    assert.deepEqual(
      figures.flatMap((figure) => groundIssues(figure).map((issue) => `${figure.id}: ${issue}`)),
      [],
    );
  });
});
