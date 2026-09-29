# mobgen maintainability review

Repo: /home/bjorn/devel/skelly, branch main at efd3e9f (2026-09-29). Read-only review; nothing in the repo was changed.

## 0. Derived inputs

All four inputs were left blank and are DERIVED from mobgen/PROJECT.md, mobgen/CHALLENGES.md and the root README.md.

**Lifespan: will evolve** (DERIVED). The docs describe a multi-phase plan in which milestone 1 is explicitly a foundation for later restructuring:

- PROJECT.md: "**Status:** in progress. Nothing below is built until this section says so." and "### 5. Later (not milestone 1)" listing deadvox integration, joint limits, dismemberment, more body plans.
- PROJECT.md Decisions: "Share code with gungen later, once the common parts (seeded RNG, template schema, validator harness) are clear".
- CHALLENGES.md §10: "**When.** After deadvox's body model exists (EPIC slice 3). Milestone 1 keeps the core browser-pure and per-bone so this stays possible."
- Root README.md subprojects table: mobgen is "milestone 1 in progress".

Not "throwaway" (it is the actor pipeline deadvox is meant to consume) and not yet "long-lived" (integration is expected to reshape the render/pose boundary, and code sharing with gungen is deferred). So per the method, both refactor findings and the knowledge check apply.

**Changes expected next** (DERIVED, four, in the order the docs give them):

1. **Joint limits as data plus a `joint-limits` rule across the walk.** CHALLENGES.md §7: "**When.** Joint limits and `joint-limits` right after milestone 1; `self-overlap` when there's more than the walk." PROJECT.md §2: "Planned next (CHALLENGES §7): joint limits per bone as data, a `joint-limits` rule across the walk".
2. **Getting actors into deadvox: one draw per actor, batching, distance LOD tiers that re-voxelize the genome coarser, a variety pool.** CHALLENGES.md §1: "**When.** Before actors go into deadvox (after milestone 1)." and "the background tier re-voxelizes the same genome at a coarser size (1/6 or 1/4 of a block) ... It comes from the same genome, so an actor's colours and proportions match between levels."
3. **Generation at spawn time in a worker, cached by genome, with the genome as the save format carrying runtime wounds.** CHALLENGES.md §9: "Generate in a Web Worker; the core is pure TypeScript with no DOM, so it runs there unchanged. Cache results by genome"; §10: "Runtime wounds are carve features added to the genome's wounds list, so they survive a save and reload"; §11: "The genome is the save format".
4. **More animation: at least three attacks and hit reactions, then uneven-ground foot placement.** PROJECT.md Open questions: "deadvox's notes ask for at least three attacks and hit reactions." CHALLENGES.md §4: "**Uneven ground later:** foot placement on steps and slopes (two-bone IK for the leg) when actors go into deadvox."

**Boundaries:** as instructed, projects are independent on purpose; cross-project duplication is not a finding. Code confirms the intent: mobgen/src/viewer/scene.ts "Box sizes and colours copied from deadvox/src/render/zombies.ts's BOXES constant (not imported: subprojects don't share code across the repo boundary)". Verified: no import in mobgen/src or mobgen/test resolves outside mobgen (grep for `../../` and sibling names found nothing).

**Main maintainer:** both (assumed, as instructed). Consistent with history: every commit is by one human author with "Co-Authored-By: Claude Opus 5.5" trailers.

## Step 1. History

`git log --merges --first-parent -- mobgen` yields only two merges: #54 (roobie/mobgen/milestone-1, 2026-09-28, 46 files, +9,478) and #64 (roobie/mobgen/stress, 2026-09-29, 18 files, +32,270 of which 30,178 is one snapshot file). So I used the 21 plain commits (19 touching code) that those PRs contain. The whole history is two calendar days.

**(a) Files touched by most code commits** (of 19; markdown, snapshots and lockfile excluded):

| File | Commits | Notes |
| --- | --- | --- |
| src/mob/gait.ts | 9 | 265 lines at creation, 1,067 now; +/- in almost every gait commit |
| test/gait.test.ts | 9 | grows with gait.ts; tolerances retuned in 4 of them |
| src/viewer/main.ts | 4 | |
| src/mob/attack.ts, src/mob/humanoid.ts, src/mob/templates.ts, src/core/pose.ts, src/viewer/stress.ts | 3 each | |
| src/mob/steps.ts, src/viewer/stressActors.ts, src/cli/bench.ts | 2 each | |

**(b) Features that needed follow-up fixes, and why** (from commit bodies; see method note in E):

- **Heel-toe roll (146a8da) -> handoff fix (3897678).** "The heel-toe roll ended stance with the foot pitched and the ankle lifted, but swing still started flat at rest height, so the leg snapped ~40-65 degrees in one frame at each handoff." Cause: stance and swing were authored as independent curves with no shared continuity contract.
- **Stride cap re-derived three times:** fbbbcb3 "up to 1.6 leg lengths", 146a8da "Stride is capped at 1.5 leg lengths", 773084b "The stride cap is now the longest stride whose hip drop stays within 12% of leg length, instead of a fixed 1.5 leg lengths". Cause: the cap was a tuning constant until it became a derived quantity (`strideCap` bisection).
- **Drunk shamble (fea7772) -> abduction fix (596311a).** "Hip abduction now accounts for the rig's inward-leaning leg bones, which had left sideways foot targets up to 16 cm short." Cause: an implicit assumption (nativeX = 0) in the IK, exposed only when lateral targets grew.
- **Jaw chatter (7d03e4d) -> slack jaw (e7b98e8).** "The jaw flapped 16 times per stride cycle (about 20 Hz), which read as a tremble." Cause: a frequency constant with no reviewable value in the docs; caught by eye.
- **Stress page (1d496e3) -> fps fix (7bd322f).** "The sweep divided 1000 by the simulation step in seconds, reporting fps 1000x too high, and the step's 50 ms clamp floored the 1% lows at 20 fps." Measurement bug in new code.
- **Posing cache (6fdc40c) -> per-actor caches (1da3048).** gait.ts comment: "a cache keyed on params alone, with one speed/window slot, thrashed on almost every call once more than one member referenced it". Cause: cache keyed on a shared object while the value depended on per-member state.
- **Builder (7d03e4d) -> hip trim (87d542f):** "A chest-owned bridge to each shoulder replaces a single repair voxel that the old hip bulge had been hiding, which also fixes rare floaters."

Pattern: every gait change in this history needed a continuity or reach fix in the next commit, and each fix widened or re-based a test tolerance ("The planted-foot test tolerance is tightened from 1 to 0.6 voxels" in 773084b, then "loosened to 0.8" in gait.test.ts). gait.ts is where the cost concentrates.

## Step 2. Tracing the expected changes

1. **Joint limits + `joint-limits` rule.** Touches core/rules.ts (new rule needs a posed context; `RuleContext` today has only `body, voxels, meshes, feet, budgets`), core/validate.ts, mob/gait.ts and mob/attack.ts (the poses to sample), mob/humanoid.ts or templates.ts (limits as data), and the golden snapshot. Depends on being able to read per-bone angles; today a `Pose` is only `Record<string, Mat3>` (finding B2). Silent failure mode: a limit rule that decomposes matrices with a different axis order than gait.ts composes them (`rotY ∘ rotZ ∘ rotX` for thighs, `rotZ ∘ rotY ∘ rotX` for attack keys) reports wrong angles without any error.
2. **deadvox integration (one draw per actor, LOD re-voxelize, variety pool).** Touches viewer/stressActors.ts (already a prototype of the skinned path), core/mesh.ts (per-bone meshes merged with skinIndex), core/generate.ts (a fourth copy of the valid-seed search unless generateValid returns the Realized; B4), and mob/humanoid.ts if a coarser LOD tier is voxelized from the same genome (B1). Silent failure mode: the coarse tier passes every rule but the head is twice as big in metres (B1).
3. **Worker generation, genome as save format.** Touches core/template.ts (Genome), mob/humanoid.ts (`genome.params as HumanoidParams`), gait.ts/steps.ts caches keyed on the params object (B3). Silent failure modes: a genome that crosses a worker/JSON boundary gets a new params identity and every frame misses the memo caches (B3); a genome missing a param builds NaN geometry without a throw (B5). Also the `mob/templates.ts` side-effect registration must be imported inside the worker or `templateByName` throws (that one at least errors).
4. **More attacks and hit reactions; uneven ground.** Touches mob/attack.ts (per-clip data, currently re-derived per call; B7), gait.ts (foot targets are hip-relative sagittal `y, z`; ground is assumed flat: `stanceFootTarget` returns `y: ankleRestY`), and the golden snapshot for every tweak (B6).

## A. Checks to add

All of these can run in CI as they are. Node is not installed on this machine (mise has only deno), so the code below is written against the repo's tsconfig/vitest/Biome versions but was not executed here.

### A1. Import boundary test (vitest, no new dependencies)

mobgen must not import from sibling projects; `src/core` must not import three, node, or from `mob`/`viewer`/`cli`. A test is the most certain enforcement (it does not depend on Biome option names). Put it in `mobgen/test/boundaries.test.ts`:

```ts
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..');
const SIBLINGS = ['deadvox', 'gungen', 'site'];

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : [];
  });

const specifiers = (file: string): string[] =>
  [...readFileSync(file, 'utf8').matchAll(/from\s+'([^']+)'|import\s+'([^']+)'/g)].map((m) => m[1] ?? m[2]!);

describe('import boundaries', () => {
  const files = [...walk(join(ROOT, 'src')), ...walk(join(ROOT, 'test'))];

  it('nothing in mobgen imports a sibling project', () => {
    for (const file of files) {
      for (const spec of specifiers(file)) {
        if (!spec.startsWith('.')) continue;
        const target = relative(ROOT, resolve(file, '..', spec));
        expect(target.startsWith('..'), `${relative(ROOT, file)} -> ${spec}`).toBe(false);
        expect(SIBLINGS.some((s) => target.startsWith(s)), `${relative(ROOT, file)} -> ${spec}`).toBe(false);
      }
    }
  });

  it('src/core is browser-pure and domain-agnostic (no three, node:, mob, viewer, cli)', () => {
    for (const file of files.filter((f) => f.includes('/src/core/'))) {
      for (const spec of specifiers(file)) {
        expect(spec.startsWith('three'), `${relative(ROOT, file)} -> ${spec}`).toBe(false);
        expect(spec.startsWith('node:'), `${relative(ROOT, file)} -> ${spec}`).toBe(false);
        expect(/\.\.\/(mob|viewer|cli)\//.test(spec), `${relative(ROOT, file)} -> ${spec}`).toBe(false);
      }
    }
  });
});
```

`node:` imports are allowed in `**/test/**` by biome.jsonc's existing override, so this file lints clean.

### A2. Biome: restrict imports in `mobgen/src/core`

Adds the same core-purity rule at lint time. Append to `overrides` in biome.jsonc (verify the `patterns` option shape against `node_modules/@biomejs/biome/configuration_schema.json` for 2.5.14; it could not be checked here):

```jsonc
{
  // mobgen's core is a pure library (mobgen/PROJECT.md "Core"): no three.js, no domain modules.
  "includes": ["**/mobgen/src/core/**"],
  "linter": {
    "rules": {
      "style": {
        "noRestrictedImports": {
          "level": "error",
          "options": {
            "paths": { "three": "core must not depend on three.js (PROJECT.md: runs in tests, workers and the game)" },
            "patterns": [
              { "group": ["../mob/**", "../viewer/**", "../cli/**"], "message": "core is domain-agnostic; mob/viewer/cli import core, not the reverse" }
            ]
          }
        }
      }
    }
  }
}
```

### A3. Type-level check that `src/core` compiles without the DOM lib

tsconfig.json gives every file `"lib": ["ES2023", "DOM", "DOM.Iterable"]` and `"types": ["node", "vite/client"]`, so a `document` or `performance` use in core would pass typecheck. Add `mobgen/tsconfig.core.json`:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "lib": ["ES2023"], "types": [] },
  "include": ["src/core"]
}
```

and change the script to `"typecheck": "tsc && tsc -p tsconfig.core.json"`. (`performance.now()` is used in cli/ and viewer/ only; core has none today, so this passes as-is.)

### A4. Template param keys must equal HUMANOID_PARAM_ORDER (pins the invariant behind B5b)

```ts
import { expect, it } from 'vitest';
import { HUMANOID_PARAM_ORDER } from '../src/mob/humanoid.ts';
import { TEMPLATES } from '../src/mob/templates.ts';

it('every template samples exactly the humanoid params (a misspelled override would otherwise be silently ignored)', () => {
  for (const t of TEMPLATES) {
    expect(Object.keys(t.params).sort()).toEqual([...HUMANOID_PARAM_ORDER].sort());
  }
});
```

### A5. Genome JSON round-trip is a fixed point (pins CHALLENGES §11 "The genome is the save format")

```ts
it('a genome survives JSON and realizes to the same voxels', () => {
  for (const t of TEMPLATES) {
    const genome = generate(t, 42);
    const again = JSON.parse(JSON.stringify(genome)) as Genome;
    expect(again).toEqual(genome);
    const a = realize(genome).voxels;
    const b = realize(again).voxels;
    expect([...b.owner]).toEqual([...a.owner]);
    expect([...b.color]).toEqual([...a.color]);
  }
});
```

### A6. Milestone targets as a test (PROJECT.md "Targets to measure")

generate.test.ts asserts `>= 0.5` valid over 100 seeds; the doc target is "at least 80%" valid and "at least 90%" distinct grids over 300 seeds. A test at the documented numbers (skip-able with an env var if it is too slow for the default run):

```ts
const N = 300;
for (const t of TEMPLATES) {
  it(`${t.name}: >= 80% valid and >= 90% distinct grids over ${N} seeds (PROJECT.md targets)`, () => {
    let valid = 0;
    const grids = new Set<string>();
    for (let seed = 0; seed < N; seed++) {
      const { voxels, report } = realize(generate(t, seed));
      if (report.ok) { valid += 1; grids.add(hashVoxels(voxels.owner, voxels.color)); }
    }
    expect(valid / N).toBeGreaterThanOrEqual(0.8);
    expect(grids.size / valid).toBeGreaterThanOrEqual(0.9);
  });
}
```

(`hashVoxels` already exists twice, in test/generate.test.ts and src/cli/stats.ts; either copy works.)

### A7. Head proportions independent of voxel size (a decision test for B1)

This test FAILS today; add it only once the team decides the LOD plan in CHALLENGES §1 is the contract. It pins "same genome, coarser voxels, same head in metres":

```ts
it('re-voxelizing a genome coarser keeps the head the same size in metres (CHALLENGES §1 LOD tier)', () => {
  const t = TEMPLATES.find((x) => x.name === 'shambler')!;
  const fine = build(generate(t, 7));
  const coarse = build(generate(t, 7, { voxelSize: 0.5 / 6 }));
  const skull = (b: Body) => b.features.find((f) => f.bone === 'head' && f.op === 'add' && f.shape.kind === 'ellipsoid')!.shape as { radii: Vec3 };
  expect(skull(coarse).radii[1]).toBeCloseTo(skull(fine).radii[1], 3);
});
```

### A8. Size budget on the golden snapshot (B6)

```ts
import { statSync } from 'node:fs';
it('the pose golden record stays reviewable', () => {
  const bytes = statSync(new URL('./__snapshots__/poseEquivalence.test.ts.snap', import.meta.url)).size;
  expect(bytes).toBeLessThan(2.5 * 1024 * 1024); // 2.2 MB today; a bigger sampling grid needs a hash-based record instead
});
```

## B. Judgement findings

Seven findings; each was sent to an independent subagent with only the ID, snippet and claim, with instructions to refute it. None was refuted; wording corrections from the verifiers are folded in. Zero findings were dropped.

### B1. `mobgen/src/mob/humanoid.ts#buildFaceLayout/lod-proportions`

```ts
const buildFaceLayout = (layout: JointLayout, p: HumanoidParams, voxelSize: number): FaceLayout => {
  const v = voxelSize;
  const hs = p.headScale;
  const headCenter = mid(layout.head.head, layout.head.tail);
  const skull: Vec3 = [2.3 * v * hs, 2.5 * v * hs, 1.9 * v * hs];
  const faceHalf: Vec3 = [2.1 * v * hs, 1.6 * v * hs, 0.85 * v * hs];
```

**Why it matters (planned change 2).** The skull, face plate, brow, nose, jaw and mouth are sized in voxel units ("Head: sized in voxel units, not just `h`"), while the head/jaw bones, ears and hair are sized from `height`. CHALLENGES §1 plans a background LOD tier that "re-voxelizes the same genome at a coarser size (1/6 or 1/4 of a block) ... so an actor's colours and proportions match between levels." With the code as is, the same genome at 1/6 of a block has a skull about 0.42 m tall against 0.21 m at 1/12, outgrowing its own hair cap and ears. No rule sees it: `budget`'s head group counts voxels (60-130) and a 5-voxel-wide head stays in range at any voxel size; no test passes a voxel-size override. The viewer's "Voxel size" select and `generate --voxel` (non-`--valid` path only) already take this path, so it is reachable today.

**Remedy.** Decide which contract wins and pin it (A7). If LOD tiers share a genome: size skull/face/jaw radii from `height` (as `REF` does for joints) and keep only the *placement* snapping (`snapRow`/`snapCol`, eye columns at `±v`) in voxel units; the head-voxel budget then needs a per-voxel-size expectation. If instead heads are always 5 voxels wide: write that in PROJECT.md's LOD bullet and have the LOD tier keep the template's voxel size for the head, or drop re-voxelizing as the LOD strategy. **Effort: M** (the face layout is the one place that mixes the two unit systems; the retune shows up in every generate snapshot).

### B2. `mobgen/src/mob/gait.ts#legAndFootRotations/joint-limits-access`

```ts
    const thighR = mulMM(mulMM(rotY(-ctx.yawDeg), rotZ(abductionDeg - ctx.pelvisZRollDeg)), rotX(thighDelta));
    const shinR = rotX(shinDelta);
    ...
    out[`thigh.${side}`] = thighR;
    out[`shin.${side}`] = shinR;
    out[`foot.${side}`] = footR;
```

**Why it matters (past cost + planned change 1).** A `Pose` is `Readonly<Record<string, Mat3>>`; the angles the walk is built from (`thighDelta`, `shinDelta`, `abductionDeg`, `footPitchDeg`, `pelvisRollDeg`, `yawDeg`, `pelvisZRollDeg`, `trunkLeanDeg`, arm swing) are locals of non-exported functions. The planned `joint-limits` rule ("each bone gets allowed rotation ranges", checked "across sampled phases of every animation") has to recover per-axis angles from matrices whose composition order differs by bone (thigh `rotY∘rotZ∘rotX`; attack keys "composed as rotZ(z) ∘ rotY(y) ∘ rotX(x)"). The tests already pay this: gait.test.ts and attack.test.ts each define `rotAngleDeg` (acos of trace) and can only assert a scalar step angle, which is why the gait follow-ups (3897678's "snapped ~40-65 degrees", 596311a's "16 cm short") were found by eye and then bounded, not asserted per axis. Attack clips are authored in degrees (`AttackKey.rotations`), so limits can be checked on clip data directly; only the walk is opaque.

**Remedy.** Have `legAndFootRotations`/`walkPose` also return the angles they compose from, as an optional `angles?: Readonly<Record<string, readonly [number, number, number]>>` on `Pose` (or a parallel `WalkDebug` return) in the same per-bone axis order the matrices use. The joint-limits rule and the gait tests then read the same numbers the walk uses, and the composition-order question disappears. The golden record is unaffected (matrices unchanged). **Effort: M.**

### B3. `mobgen/src/mob/gait.ts#strideCapCache/identity-keyed-caches` (also `steps.ts#stepPlanCaches`)

```ts
const strideCapCache = new WeakMap<HumanoidParams, StrideCapEntry>();
...
  const cached = strideCapCache.get(params);
  if (cached !== undefined && geomMatches(cached.geom, geom)) {
    return cached.value;
  }
```
```ts
const stepPlanCaches = new WeakMap<HumanoidParams, StepPlanCache>();
...
  const existing = stepPlanCaches.get(params);
  if (existing && existing.seed === seed) {
    return existing.entries;
  }
```

**Why it matters (past cost + planned change 3).** Both memos are keyed on the identity of `genome.params`; the stored geometry signature and seed are validators, not fallback keys. In-repo every `WalkActor` reuses the one `genome.params` object (verified: no `structuredClone`, `postMessage`, `JSON.parse` or `{ ...params }` in src), so nothing misses today. The planned worker generation and genome-as-save-format break that: a genome re-parsed per spawn, or one that crossed a worker boundary, presents a fresh params object every time, and the 30-iteration bisection over a 128-sample scan plus the mulberry32 step plans (recursively back to step 0 via `stepPlanFor(seed, stepIndex - 1, params)`) re-run every frame, with no error and no failing test. This is the same class of mistake as 6fdc40c's footfallPeak cache, which "thrashed on almost every call" and was moved onto the per-actor `GaitCache` the next day. Two actors sharing a params object with different seeds also evict each other's step plans.

**Remedy.** Move both memos into `GaitCache` (already per actor and already threaded through `walkPose`), and write the remaining identity invariant ("`params` must be the same object for a WalkActor's lifetime") on `WalkActor`. **Effort: S.**

### B4. `mobgen/src/core/generate.ts#generateValid/duplicated-valid-search`

```ts
export const generateValid = (template: Template, seed: number, maxAttempts = 100): ValidGeneration | undefined => {
  for (let i = 0; i < maxAttempts; i++) {
    const genome = generate(template, seed + i);
    const { report } = realize(genome);
    if (report.ok) {
      return { genome, report, seed: seed + i, attempts: i + 1 };
    }
  }
```
stressActors.ts: "duplicated rather than imported because main.ts inlines it too (core/generate.ts's generateValid does the same search but doesn't hand back the Realized it built along the way)."

**Why it matters (planned change 2/3).** The "seed, seed+1, ... until PASS" search exists four times (core/generate.ts, viewer/main.ts inline with `dir` and voxel override, viewer/stressActors.ts, cli/bench.ts), and callers that need the body re-realize the winning seed anyway: bench.ts:107, cli/view.ts:75, test/generate.test.ts:91, and gait.test.ts/attack.test.ts (`build` then `voxelize` again). The variety pool and worker generation for deadvox are a fifth copy unless the core function returns what it computed. Nothing in the code states a reason it cannot.

**Remedy.** Return the `Realized` from `generateValid` (`{ genome, realized, seed, attempts }`; `report` is `realized.report`), add optional `{ overrides, direction }` so main.ts's loop can use it, and delete the three copies. Four call sites change shape (`found.report` -> `found.realized.report`). **Effort: S.**

### B5. `mobgen/src/mob/humanoid.ts#buildHumanoid/unchecked-genome`

```ts
export const buildHumanoid = (genome: Genome): Body => {
  const p = genome.params as HumanoidParams;
  const layout = jointLayout(p);
```
```ts
  for (const name of order) {
    const spec = params[name];
    if (spec === undefined) {
      throw new Error(`template is missing param "${name}"`);
    }
```

**Why it matters (planned change 3).** (a) A genome that arrives as JSON (the planned save format, with runtime wounds appended) is never checked. With `height` missing, `jointLayout` computes NaN positions, `voxelize` builds a zero-length grid (`new Float32Array(NaN)` is length 0), `meshBones` returns nothing, and every rule reports an empty body; nothing throws. Worse, `buildHumanoid` never reads `armSwing, armRaise, limp, strideFactor, pelvisSway, spineTwist, headLoll, jawChatter, footLift` or the colour params, so a genome missing one of those realizes with `report.ok === true` and only `walkPose` goes NaN (`... * params.strideFactor`), which `advanceClock`'s `|| 1e-6` partly hides. Wound bone ids are checked against the body's bones (`humanoid: unknown wound bone`), but not against `WOUNDABLE_BONES`, and `t/angle/radius` are unchecked. (b) The sampler iterates `HUMANOID_PARAM_ORDER`, not the template, and `Template.params` is a string index signature, so a misspelled override key in `runner`/`brute` (which spread `...shamblerParams`) is silently ignored and the shambler's value applies; no test compares key sets.

**Remedy.** Add `checkGenome(template, genome)` in core (every key of the body plan's order present and finite; wound fields finite and bone ids allowed) and call it from `build`; add test A4 for the template side. **Effort: S.**

### B6. `mobgen/test/poseEquivalence.test.ts#golden-record/snapshot-size`

```ts
const SEEDS = [1, 2, 3];
const SPEEDS = [0.8, 1.4, 2.8];
const DISTANCES = [0, 0.2, 0.5, 0.9, 1.5, 2.3];
const ATTACK_TIMES = [0, 0.2, 0.45, 0.7, 0.9];
...
      expect(record).toMatchSnapshot();
```
Header: "A snapshot change here means the walk itself changed: check that's intentional (and regenerate with `vitest -u`), don't just accept the diff."

**Why it matters (past cost + planned changes 1 and 4).** The record is 9 snapshots x 144 entries of full per-bone matrices: 2,245,944 bytes, 30,178 lines, added in one commit (6fdc40c). It is keyed per bone, so a leaf-only change (jaw) is a ~1,100-line diff that names the bone; but any leg, pelvis or root change, which is what joint limits, uneven-ground IK and every gait retune in this history are, cascades through walkPose, all five attackPose records and every descendant in boneTransforms, i.e. tens of thousands of lines. At that size the header's "check that's intentional" can only mean "look at the gallery, then `vitest -u`", and nothing stops the diff being accepted blind. Biome already excludes `__snapshots__`; there is no `.gitattributes` marking it generated for review.

**Remedy.** Keep the 1e-9 guarantee but make the file reviewable: snapshot one FNV hash per `(template, seed, speed, kind)` group of the rounded record (a few hundred lines), plus the full record for one (template, seed) so a diff still names the bone that moved. Add A8 as the budget. Mark the file `linguist-generated` in `.gitattributes`. **Effort: S.**

### B7. `mobgen/src/mob/attack.ts#sampleVec3/per-frame-allocation`

```ts
const sampleVec3 = (clip: AttackClip, boneId: string, t: number): readonly [number, number, number] => {
  const times = clip.keys.map((k) => k.t);
  const axis = (i: 0 | 1 | 2): number =>
    evalCurve(
      times,
      clip.keys.map((k) => k.rotations[boneId]?.[i] ?? 0),
      t,
    );
```

**Why it matters (past cost + planned change 4).** Two commits (6fdc40c, 1da3048) made the walk allocation-light to hit CHALLENGES §1's "about 20 µs per actor" target; attack.ts was not touched and has no perf comment. Per `attackPose` call: the touched-bone `Set` is rebuilt from every key, `sampleVec3` runs 10 times for LUNGE_GRAB (spine and chest twice, once for `torsoPitchX` and again in the loop) at 5 arrays each, `legGeometryFor` runs twice (each a fresh `boneMap`), and `groundOffset` runs a second full allocating `boneTransforms` pass with `corners()` allocations, on top of the one `walkPose` already did. Bench and stress use `ATTACKER_FRACTION = 0.1` with a 0.9 s clip every 2-5 s, so about 2-4% of actors are in a clip at any instant and the cost is invisible in the measured numbers. "At least three attacks and hit reactions" (PROJECT.md) puts most of a horde in a clip at once.

**Remedy.** Compile each clip once (`times`, per-bone per-axis value arrays, touched-bone list) at module load or on first use; compute `avgLegLen` once per actor (it only depends on bones/extents); and have `attackPose` reuse `walkBase.root[1]` when no clip-touched bone is below the pelvis (true for LUNGE_GRAB, which lists no leg bones), skipping the second `groundOffset`. Pinned by the existing golden record. **Effort: S.**

## C. Knowledge at risk

### C1. Comments cite a document that does not exist

18 comments in gait.ts, steps.ts, attack.ts, stress.ts, bench.ts and gait.test.ts cite "mobgen's report" for measured evidence, e.g. gait.ts: "0.99 left legAndFootRotations right at the edge of it, where per-step jitter's tiny sample-to-sample reach changes produced multi-degree snaps (see mobgen's report); 0.92 keeps the same 'never visibly locks straight' intent with real margin." and gait.test.ts: "loosened to 0.8 because a lurch step's longer-than-normal length very slightly outpaces the heel/toe roll's pivot cancellation ... (see mobgen's report)." No file matching report/notes/journal was ever committed under mobgen (`git log --all --diff-filter=A`); the only hit is the unrelated deadvox/src/bench/report.ts. The evidence lived in a coding-agent session and is gone. Remedy: replace each citation with the one-sentence fact, or collect them under a "Measured" heading in CHALLENGES.md as §1 already does for the stress numbers.

### C2. Docs and code disagree

| Topic | Doc says | Code says |
| --- | --- | --- |
| Head budget | PROJECT.md §2 rules table: "`budget` ... per-bone voxel counts are within the template's limits, e.g. head and jaw together around 50" | templates.ts: `groups: { head: { bones: ['head', 'jaw'], min: 60, max: 130 } }` (PROJECT.md's own targets table already says "60–130 (raised from 35–80 ...)") |
| Eye sockets | CHALLENGES.md §2: "eye sockets are carved only at 3.5 cm voxels or smaller" | humanoid.ts: "Eyes: carved into a socket at every voxel size now (mobgen user feedback: at 4+ cm voxels the old 'carve only ≤3.5 cm' rule meant eyes were never more than an invisible paint smear" (PROJECT.md agrees with the code) |
| LOD tiers | CHALLENGES.md §1: "the background tier re-voxelizes the same genome at a coarser size ... an actor's colours and proportions match between levels" | humanoid.ts sizes the skull in voxel units (B1) |
| Status | PROJECT.md: "**Status:** in progress. Nothing below is built until this section says so." | Everything in the scope list exists, plus attack clips, drunk-shamble steps, a stress page, a pose bench and a text viewer that the scope never mentions |
| Animation beyond the walk | PROJECT.md Open questions: "Keyframed poses on the same forward kinematics, or procedural like the walk?" | Decided: attack.ts "Attacks are keyframed clips layered over the walk" (commit af2df6a) |
| Planted-foot tolerance | CHALLENGES.md §4: "the planted foot moves less than one voxel horizontally, at 0.8 and 2.8 m/s" | gait.test.ts: `expect(worstHeelDrift).toBeLessThan(0.8 * found.voxels.size)` (tighter, but the doc does not say 0.8, and the comment says it was 0.6 before) |
| Browser determinism | CHALLENGES.md §11: "check the same hashes in a browser before relying on exactness" | No browser hash check exists; only Node snapshots in generate.test.ts |
| Shambler boxes source | scene.ts: "copied from deadvox/src/render/zombies.ts's BOXES constant" | deadvox moved them to `FIGURE_BOXES` in deadvox/src/render/figure.ts (values still match) |
| CLIs | PROJECT.md "Running it" lists generate, stats, dev | package.json also has `view` and `bench` |
| Seeded RNG | PROJECT.md: "Seeded RNG (mulberry32)" in core/random.ts | steps.ts carries a second private `mulberry32` ("Combines the genome seed and a step index"), so there are two RNG implementations to keep equivalent |

### C3. Design facts that exist only in the code

- **Stride and cadence.** gait.ts: "0.6 + 0.95·speed targets human walking data", `MAX_BOB_FRAC = 0.15` ("largest peak hip drop (fraction of leg length)"), `REACH_MARGIN = 0.92`, `STEP_REACH_FRAC = 0.85`, `HEEL_FRAC = 0.15`, `TOE_FRAC = 0.2`, `HEEL_ROLL_MAX_DEG = 25`, `TOE_ROLL_MAX_DEG = 35`, `MAX_YAW_DEG = 6`, `GROUND_SMOOTHING = 0.006`, `chaseBlend` = 0 at 0.8 m/s and 1 at 2.8 m/s. CHALLENGES §4 describes the mechanism but none of the numbers.
- **Drunk shamble.** steps.ts: four styles with weights `normal: 6, stagger: 0.6 + pelvisSway/6, drag: 0.6 + limp*2.5, lurch: 0.6 + ...`, "Looks back exactly one step ... to avoid repeating an odd style twice running", jitter "length +-15%". Not in either doc.
- **Sampling-order invariant.** humanoid.ts `HUMANOID_PARAM_ORDER` is "sampled in this fixed order"; wounds are drawn *after* params (`sampleHumanoid`). So inserting a param anywhere changes every seed's body, and even appending one shifts every seed's wounds. The docs say only "samples them in a fixed order from the seed".
- **Sign conventions.** gait.ts: "a hanging limb (pointing -Y) swinging forward rotates positively about +X"; attack.ts: "For an *upright* bone (spine, chest, head), +rotX tips it backward and -rotX pitches it forward instead". Only in comments.
- **Registration by import side effect.** templates.ts: "Registering a template (a side effect of importing this module) is what lets core/template.ts's templateByName ... dispatch by name alone." A worker that imports only `core/generate.ts` throws `unknown template` (at least loudly).
- **Treadmill contract.** gait.test.ts: "walkPose never moves root.z itself (a caller, e.g. the viewer, is expected to advance the *world* by the same distance externally, treadmill-style)". PROJECT.md says "the planted foot stays fixed while the root advances", which reads as the opposite.
- **deadvox constants copied by hand.** gait.ts (0.8/2.8 m/s), main.ts `ATTACK_COOLDOWN_S = 1.5`, attack.ts "0.9 s, under the 1.5 s cooldown", scene.ts boxes: all mirror deadvox/src/content/base/zombies.json (`"wander": 0.8, "chase": 2.8`, `"cooldown": 1.5`). Drift is silent and, per the boundary rule, cannot be enforced by import.
- **Flesh calibration.** humanoid.ts `FLESH_SCALE = 0.65` "scales total flesh volume down to match mobgen/reference/README.md's voxel counts"; `fillTolerance = 0.15·v` (this one is in PROJECT.md).
- **Attack timing.** `LUNGE_GRAB` duration 0.9 s, `hitTime` 0.45 s, `FADE_FRACTION = 0.2`; hunch scales torso keys by `1 + hunch/100`.

## D. What a coding agent with no context would get wrong

1. **Hunt for "mobgen's report".** 18 comments send it to a document that is not in the repo (C1). Prevented by replacing the citations with the facts.
2. **Add a sampled param "safely" at the end of `HUMANOID_PARAM_ORDER`**, see every generate snapshot change, and either revert a correct change or `vitest -u` a wrong one. Prevented by a sentence in PROJECT.md §3 (params then wounds share one RNG stream; any new param changes every seed's wounds) and by keeping the gallery review rule from CHALLENGES §12.
3. **Treat the voxel-size override as a pure LOD knob** (it is offered in the viewer and CLI) and build the deadvox background tier on it, shipping 40 cm heads. Prevented by A7 or a written decision in the LOD bullet (B1).
4. **Compute joint angles by decomposing `Pose.rotations`** with a single Euler convention, when thighs are `rotY∘rotZ∘rotX` and attack keys `rotZ∘rotY∘rotX`. Prevented by exposing the angles (B2) and by a one-line convention note in pose.ts.
5. **Make `walkPose` advance `root.z`** to "fix" the figure not moving, breaking the treadmill contract that the viewer, stress page and planted-foot tests rely on. Prevented by stating the contract on `walkPose`'s doc comment (it is currently only in a test helper's comment).
6. **Regenerate the 2.2 MB golden record without looking**, because the diff cannot be read. Prevented by B6/A8.
7. **Import `core/generate.ts` in a worker without `mob/templates.ts`** and get `unknown template "shambler" (has it been imported and registered?)`. The error text already prevents a long hunt; a line in PROJECT.md's Core row would prevent the attempt.
8. **Copy `params` (`{ ...params }`, `structuredClone`, JSON) into a new WalkActor per frame** and lose every memo silently (B3). Prevented by moving the caches onto `GaitCache` or documenting the identity invariant on `WalkActor`.
9. **Run `npx biome` inside mobgen/** and get a clean exit from the wrong package. The root README already warns; mobgen's PROJECT.md "Running it" does not mention lint at all.
10. **Add a template override with a misspelled key** and never notice (B5b). Prevented by A4.

## E. Method notes

- **"Last ~15 merged PRs" does not exist here.** Two merges cover the whole project, two days old, one author. I fell back to the 19 code commits; the diff-stat comparison was done per commit. Churn numbers are therefore about one intensive build-out, not a steady state, and "files touched by most changes" partly measures "the file that was being built" (gait.ts). Weigh (a) accordingly; (b) is more informative.
- **"Fix commits in the next few commits that touched the same files" misfired.** Nearly every commit touches gait.ts and gait.test.ts, so file overlap says nothing. What worked was the commit bodies: they state the defect being fixed ("snapped ~40-65 degrees", "16 cm short", "1000x too high", "thrashed"). I used those, plus the in-code comments that narrate fixes ("see mobgen bugfix", "tried first: ...").
- **"Don't count markdown"** was right here: 2 of 21 commits are pure CHALLENGES.md updates recording measurements.
- **The toolchain could not be run.** Node/npm are not installed on this machine (mise lists only deno), so `npm test`, `npm run typecheck` and `biome check` were not executed and the Biome `noRestrictedImports` option shape in A2 is from memory of Biome 2.x, flagged for verification. The test code in A is written against the repo's conventions but untested.
- **The finding cap of 8 was about right**; I used 7 and moved one candidate (the phantom "report" citations) to C because it is a knowledge problem, not a refactor.
- **Verification by refutation worked, but all seven subagents came back "stands" with corrections**, and two of those corrections materially changed a finding (B3 is latent, not current; B7's biggest cost is `groundOffset`, not the small arrays). Asking each verifier for "corrections to the wording" was more valuable than the binary verdict; the prompt's "drop if refuted" rule never triggered.
- **Deriving the inputs was easy**; the docs are unusually explicit about "When" per challenge. The only judgement call was lifespan (will evolve vs long-lived), settled by the docs' own deferral of code sharing and integration.
- **The boundary rule ("duplication across projects is not a finding") hid one real risk**: hand-copied deadvox constants (speeds, cooldown, boxes) that drift silently. I listed it under C rather than B to respect the rule.
