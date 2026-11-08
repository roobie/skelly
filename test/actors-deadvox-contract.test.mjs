// The actor data contract. The fixture cases cover the hand-made fixture this repo owns; the pinned-pair case alone
// covers what the pinned producer exports. The stack cases (enumeration through `buildRegistry` and GLB agreement per
// admitted body) are added when deadvox loads baked actors.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, it } from 'node:test';
import {
  applyOverlay,
  decodeFrame,
  groundFit,
  idleBase,
  sampleClip,
  standingFit,
  walkCursor,
} from '../packages/deadvox/src/core/actorClips.ts';
import { slerpQuat } from '../packages/deadvox/src/core/boneMath.ts';
import { boneTransforms } from '../packages/deadvox/src/core/pose.ts';
import {
  ActorBodySchema,
  ActorClipsSchema,
  actorClipIssues,
  clipBoneIssues,
  JointDeltaClipSchema,
  PoseClipSchema,
} from '../packages/deadvox/src/core/schema/actors.ts';

const deadvoxRequire = createRequire(new URL('../packages/deadvox/package.json', import.meta.url));
const { GLTFLoader } = await import(deadvoxRequire.resolve('three/addons/loaders/GLTFLoader.js'));
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
      const idle = { ...structuredClone(rawClips.crawling.idle), period: 1 };
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

describe('pinned producer exports', () => {
  it('pinned producer exports parse and agree', () => {
    const built = new URL('../packages/skelly-assets/built/', import.meta.url);
    const { models } = JSON.parse(readFileSync(new URL('manifest.json', built), 'utf8'));
    const pairs = models
      .filter((row) => row.body !== undefined && row.clips !== undefined)
      .map((row) => ({ body: `${row.pack}/${row.body}`, clips: `${row.pack}/${row.clips}` }));
    assert.ok(pairs.length > 0, 'the manifest lists no body and clips pair');
    for (const pair of pairs) {
      const read = (path) => JSON.parse(readFileSync(new URL(path, built), 'utf8'));
      const pinnedBody = parse(ActorBodySchema, read(pair.body));
      const pinnedClips = parse(ActorClipsSchema, read(pair.clips));
      assert.deepEqual(actorClipIssues(pinnedBody, pinnedClips), [], `${pair.body} with ${pair.clips}`);
    }
  });
});

describe('actor fixture GLB', () => {
  it('decodes with the bone table and per-vertex bone indices', async () => {
    const loaded = await new GLTFLoader().parseAsync(Uint8Array.from(readFileSync(fixture('fixture.glb'))).buffer, '');
    const tabled = [];
    loaded.scene.traverse((visited) => {
      if (visited.userData.bones) {
        tabled.push(visited);
      }
    });
    assert.equal(tabled.length, 1);
    const [node] = tabled;
    assert.deepEqual(
      node.userData.bones,
      body.bones.map(({ id }) => id),
    );
    const { attributes, index } = node.geometry;
    const { count } = attributes.position;
    for (const name of ['normal', 'color', 'uv1', 'uv2']) {
      assert.equal(attributes[name]?.count, count, name);
    }
    for (let i = 0; i < count; i++) {
      const boneIndex = attributes.uv1.getX(i);
      assert.ok(Number.isInteger(boneIndex) && boneIndex >= 0 && boneIndex < body.bones.length);
    }
    assert.ok(Array.from(index.array).every((vertex) => vertex < count));
  });
});
