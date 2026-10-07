---
read_if:
  - you're changing mobgen body plans or the boss amalgam
  - you're reviewing the m1 boss first-look scope or its open design questions
---

# mobgen — procedural mob generator

A skelly subproject that procedurally generates "mobile actors" (zombies and
other NPCs) for deadvox. Where deadvox's baseline shambler
(`deadvox/src/render/zombies.ts`) is six boxes, a mobgen actor is built from
voxels small enough for a head of about 50.

The hard problems, and how we'll know they're solved, are in
[CHALLENGES.md](CHALLENGES.md).

## Aim

Take a template and a seed to a detailed, connected, standing voxel humanoid
with a walk cycle that follows its speed. It works the same way gungen takes a
template and a seed to a firearm that fits together: the generator only makes
choices, and a validator with named rules decides what's feasible.

### Creature range (BR, 2026-09-29)

mobgen's actors are monsters, not people. Their proportions are stylized
(the heads are oversized so the face fits), and planned enemies range from
rabbit-sized to huge, including ones that are neither humanoid nor
proportional. Shared systems (physics, animation, rules) must not assume
human anatomy or a density-true mass. The specifics belong in per-template
data, and the defaults must work for any body plan.

### Non-goals

- Smooth or skinned meshes, textures, or realistic rendering. Voxel colour
  carries the look.
- Anatomical or medical accuracy. Proportions are plausible, not measured.
- Reproducing specific existing characters or assets. The reference assets
  are for calibration only.
- A general-purpose character creator. Templates serve the game.

### Out of scope for milestone 1

- Getting actors into deadvox: export format, batched rendering, level of
  detail (CHALLENGES §1, §9).
- Gameplay-ready body plans other than the humanoid. The separate m1 boss
  feature adds a static amalgam first-look body; it does not add a gameplay
  gait or Deadvox dismemberment integration.
- Runtime wounds, gameplay dismemberment, and animations other than the walk.
- Checking poses other than the rest pose (CHALLENGES §7).

## Boss amalgam (m1)

Issue #308 calls for “an amalgamation of several shamblers - an enemy the
size of a car” and says “it makes it end with something new and exciting”.
BR's 2026-10-07 11:27 ruling on how it is beaten was “(c)”: firearms and
melee, with constituent shamblers as severable parts that each weaken it.
This is the reason for an amalgam body plan rather than several independent
actors: a severable member must be a subtree in one connected body, while the
shared trunk remains a distinct, non-severable core.

BR, 2026-10-07 13:16, requested: “good start - but can we make it procedural
how many shamblers are part of it? Not all needs to be in contact with floor -
it can be more random. And actually - the body parts can be randomy distributed
too - like a leg from a shambler can be pointing straight up, while it's head
is at floor, like a foot” / “think of John Carpenter's "The Thing" kind of”

The first-look generator samples three to five complete shambler members per
seed. This is an initial BR-tunable range: at least three distinct bodies give
the car-scale enemy the requested mass and grotesque multiplicity, while the
upper bound keeps the fused body within the template's voxel and triangle
budgets. Members are independently scaled, anchored around the core, lifted by
seeded gaps, and turned in quarter-turn orientations on all three axes, so a
head or hand may bear weight and other members may hang. The first look keeps
each module a complete shambler rather than adding partial-body variants; the
resolved member subtrees remain individually severable. The core includes the
shared floor-bearing base, so severing any member leaves a valid, supported
body.

The m1 mobgen contribution is the generated body, its resolved part/region
manifest, support bones derived from the actual ground-contact voxel owners,
and a static first-look viewer. See `src/mob/amalgam.ts` for the body-plan
and manifest, `src/core/generate.ts` for contact-derived support bones,
`src/core/rules.ts` for the declared-support grounding contract, and
`src/viewer/main.ts` for the static view. The manifest separates geometry
ownership from the effects and tuning that a later Deadvox round owns. The
seeded composition and member-count range are first-look proposals for BR's
visual judgment, not encounter-count or gameplay-tuning decisions.

To keep this viewer-only first look out of Deadvox's simulation fingerprint,
the viewer imports `src/mob/bossTemplate.ts` (`VIEWER_TEMPLATES`) rather than
registering the boss in `src/mob/templates.ts`, which Deadvox reaches through
`src/mob/shamblerFigure.ts`. This boundary lasts until the Deadvox boss
integration (#308): `deadvox/test/simulationFingerprint.test.ts` checks the
separation, and that integration round changes the contract.

The static view is useful before animation or game integration. Open it with
`?template=boss&seed=N&shot=1` to inspect a deterministic arrangement. The part
manifest is independent of later systems, but look-at-player, boss gait, and
Deadvox integration must follow #325 because it changes the rig and model
interfaces this feature will extend. The open design questions from #308
remain open until BR rules on them:

- Does the procedural, full-shambler composition read as a grotesque fusion,
  or should the silhouette use partial members or a different arrangement?
- Is the initial member-count range appropriate for the car-scale silhouette?

- How does it move, and what does it sense? Which motion should the rig
  animate?
- What can it break: fences, doors, containers, or other world objects?
- What does it sound like?
- Is the camp appearance guaranteed, or can boss instances roam? What encounter
  count/placement behavior is wanted?

## Decisions

| Decision | Choice |
| --- | --- |
| Language | TypeScript (strict), same toolchain as gungen |
| Toolchain | Standalone subproject: Vite, three.js, Vitest, Biome (repo-wide `biome.jsonc`). Share code with gungen later, once the common parts (seeded RNG, template schema, validator harness) are clear |
| Core | Pure library in `src/core`: no DOM, three.js or Node imports, so it runs in tests, workers and the game. Domain-agnostic: bones, shapes, voxels, rules. The humanoid lives in `src/mob` |
| Conventions | Metres, +Y up, right-handed. Figures face −Z (left is −X), matching deadvox, where yaw 0 faces −Z. Ground at y = 0. Voxel centres at x = i·v, y = (j + 0.5)·v, z = k·v: the midline is a voxel centre, so symmetric bodies give exactly symmetric voxels, and the ground is a voxel face |
| Voxel size | Set per template, and templates may differ (a coarser brute next to finer shamblers is accepted). Default 1/12 of a deadvox block (0.5 m / 12 ≈ 4.17 cm): the reference voxelization found this gives a head of about 50 voxels and a 1.75 m figure of about 800. The viewer and CLI can override it; coarser LOD re-voxelizes the same genome, preserving metric proportions while fine details may disappear (CHALLENGES §1) |
| Face / LOD scale | BR ruling (2026-09-29): skull, face plate, brow, nose, jaw and mouth dimensions use `height × headScale`, calibrated at the median template height; voxel size only controls sampling and placement snapping. See the root [maintainable-choice-wins pillar](../README.md#the-maintainable-choice-wins-churn-is-expected) |
| Source of truth | Template + seed → **Genome**, a plain JSON record of the sampled params and wounds that carries its seed. Everything after it is a deterministic function of the genome: builder → **Body** → voxelizer → mesher → validator |
| Body | A skeleton of bones plus shape features, as signed distance shapes (tapered capsules, ellipsoids, rounded boxes). A feature adds flesh, carves it away, or paints colour without changing the shape |
| Humanoid | 18 bones: pelvis (root), spine, chest, neck, head, jaw, and left and right upperArm, forearm, hand, thigh, shin, foot. Default joint positions come from the CC0 `fgc_skeleton` rig in `reference/`, converted from Blender's Z-up, −Y-forward axes |
| Voxelization | Every voxel is owned by exactly one bone: the one whose flesh is nearest. "Marrow" is rasterized as a face-connected path along every bone and always filled, so each bone is connected to its parent however thin its flesh. Amalgams reserve repaired joint voxel pairs because overlapping body modules can otherwise let a later repair erase an earlier connection; see `src/mob/amalgam.ts`, `buildAmalgam`, and `src/core/voxelize.ts`, `repairOverlappingJointAdjacency`. A carve that cuts marrow leaves it in place, coloured as exposed bone |
| Paint and carve | Clothing, hair, bruises and the mouth are paint. Wounds carve, with a gore rim. Eye socket dimensions are metric, with grid-snapped centers; sub-voxel details may disappear at coarse LOD. Face dimensions are height-relative, while eye columns and feature placement remain snapped to the grid |
| Colour | 10 materials × 4 shades (palette index = material × 4 + shade), with base colours chosen per actor. Shade comes from low-frequency noise, so neighbouring voxels tend to agree and faces still merge. The look, from deadvox's notes: sickly and fleshy, not a swamp monster |
| Meshing | Greedy, per bone, merging faces of the same colour. Faces between voxels of different bones are kept, so each bone's mesh is closed: a bent joint shows a cut face, not a hole into the body. Seams at bent joints are expected (CHALLENGES §3) |
| Bones are rigid | No skinning: each voxel moves with its one bone. Joints are made round about their pivot to hide seams |
| Animation | Forward kinematics: each bone has a rotation about its head, applied down the chain from the pelvis. The walk is driven by speed: stride and pace come from the speed, the genome's gait params and leg length, and the phase advances with distance travelled. During stance the planted foot stays fixed while the root advances; the root's height is solved per phase so the lowest foot is on the ground. Speed 0 is a standing pose |
| Validation | Named rules, each with a readable message. The generator never checks feasibility itself. `full` is the default and retains per-bone attachment and declared-support grounding contracts; callers may explicitly select `silhouette` for far LOD |
| Budgets | Full-profile voxel bounds scale with inverse voxel volume and actor height; head groups additionally scale with `headScale`. Triangle bounds scale with inverse voxel surface area and actor height. Coarse full-profile voxel maxima allow one boundary-quantization cell (`src/core/generate.ts`). Silhouette LOD has no total-voxel or group-voxel budget at any size: voxel occupancy is not draw cost, and mandatory connected marrow is about one cell per bone (18 bones). Its minimum triangle budget is 1. At 1/2 block (0.25 m), the per-actor triangle maximum is the fixed 400-triangle draw budget; the 2026-09-30 100-seed worst was 336 (brute, seed 89). Any future cap increase is deliberate and must cite fresh measurements and rationale; larger templates may need a higher cap. At other sizes the maximum is the m1-scaled upper bound, with no floor or margin |
| Far LOD validation | The recommended far tier is 1/2 block (0.25 m) with the explicit silhouette profile; 1/4 block remains supported/tested but is not a separate recommended far level. `generateValid` searches only at the template's full-detail resolution. `realizeLod` derives coarser voxels from a full-valid genome and checks whole-body connectivity, ground contact and balance, the size-specific triangle cap, and height/width within one cell at each grid's resolution. It re-voxelizes the full-detail body with the ordinary coarse-cell fill tolerance; it does not silently change the default profile |
| Profile recommendation | `recommendedProfileFor(genome, voxelSize)` measures the thinnest full-detail upper-arm/forearm/thigh/shin flesh feature in cells; below 1.5 cells it recommends `silhouette`. For BR's roughly 10 cm limb, 1/2 block (25 cm) is 0.4 cells, 1/6 block (8.33 cm) is 1.2 cells, and 1/12 block (4.17 cm) is 2.4 cells. This is advisory only; callers choose and pass the profile explicitly |
| Determinism | Seeded RNG (mulberry32), never `Math.random`. The same genome gives the same voxels on the same JavaScript engine; engines may differ in the last digit of `Math.sin` and similar, which can flip a voxel on a shape's edge (CHALLENGES §11) |
| Mass | Each template declares a total body mass (`bodyMassKg`). A part's mass is that total times its fraction: by default its share of the body's voxel volume; a template may override the fraction per part (the humanoids use anatomical values for the severable parts). The centre of mass and the shape of the inertia come from the part's voxels, scaled to the assigned mass. Being worked on in sk1 (severed-limb physics) |
| Templates (milestone 1) | `shambler` (1/12), `runner` (1/12), `brute` (1/10) |
| Tests | Vitest |
| CI | `.github/workflows/mobgen.yml`: typecheck, tests, viewer build |
| Hosting | GitHub Pages (`.github/workflows/pages.yml`), at <https://roobie.github.io/skelly/mobgen/> once the viewer exists |

Broad population assertions remain out of the default local test run because they measure distribution quality rather than individual contracts; CI and an explicit sweep run still exercise them. See `test/generate.test.ts`, `sweepGroup`, and `test/sweeps.ts`, `runSweeps`.

## Design areas

### 1. Voxelizing a body

Each bone's flesh is the smooth union of its add features. A voxel is filled
when the nearest bone's flesh is within 0.15 voxels of its centre (a slight
dilation, so shapes about one voxel thick survive), then carves remove
voxels. Silhouette LOD builds the body at full-detail settings, then samples
those metric shapes on the coarse grid; the usual 0.15-coarse-cell tolerance applies. Marrow is filled last. A voxel's colour comes from the nearest add
feature of its bone, then every paint feature that covers it, in order. A
paint can be limited to some materials (bruises only on skin) and broken up
by noise (torn clothes, patchy hair).

### 2. Rules

The caller selects `full` (default) or `silhouette` explicitly. `full` remains the default because gameplay-resolution actors still need the existing skeleton contracts, and omission must not silently change any current caller. Full retains the existing attached-per-bone and declared-support grounding checks. Silhouette instead checks all-cell connectivity, that the body's lowest occupied layer meets y=0, and the existing whole-body support/balance test; it does not require bone ownership or support-bone ownership. A template declares its ground-contact bones through `src/core/template.ts`, `Template.supportBones`. Silhouette budgets enforce global upper bounds scaled at the requested voxel size with no floor or margin; minima are 1, and there are no per-bone group counts. Its X width and Y height must match the full-detail reference within one cell per grid's resolution. A full-detail valid genome is the source for `realizeLod`; `generateValid` never searches at a coarse voxel size.

| Rule id | Checks |
| --- | --- |
| `floaters` | All voxels form one face-connected piece. Carves and small features such as ears can leave islands |
| `attached` | Every bone owns at least one voxel, and at least one of them touches a voxel of its parent. Marrow makes this hold by construction, so it guards against builder bugs |
| `grounded` | The lowest voxel layer is at y = 0, and every voxel in it belongs to a declared support bone (a humanoid's feet) |
| `balance` | In the rest pose, the centre of mass, seen from above, is within the rectangle around the ground-layer voxels, widened by one voxel |
| `budget` | Full: total voxels, triangles and per-bone voxel counts are within the template's limits, e.g. head and jaw together around 50. Silhouette: total voxel/triangle budgets only; group counts depend on bone ownership and are excluded |
| `silhouette` | Coarse X width and Y height, measured between outer occupied-cell centres, each differ by at most one coarse cell plus the reference grid's quantization allowance |

Planned next (CHALLENGES §7): joint limits per bone as data, a
`joint-limits` rule across the walk, and a `self-overlap` rule for bones
passing through each other.

### 3. Templates and seeding

A template fixes a body plan, a voxel size, budgets, its declared support bones (a humanoid's feet; see `src/core/template.ts`, `Template.supportBones`),
and a range or list of choices per param (proportions, posture, clothing,
colours, wounds, gait). The generator samples them in a fixed order from the
seed. `generateValid` tries seed, seed + 1, … until a build passes, as in
gungen.

### 4. The viewer (phase B)

three.js, with: a template picker; the previous or next seed, and skip to
the next valid one; a voxel-size override; walk on or off with a speed
setting; layers for the flesh, the skeleton and colour by bone; the deadvox
shambler at the same scale for comparison; and stats plus validator issues.
Query parameters are `?template=<name>&seed=<n>`, as in gungen.

### 5. Later (not milestone 1)

- Getting actors into deadvox: one draw per actor, batching, level of
  detail, generating in a worker (CHALLENGES §1, §9).
- Joint limits and pose rules (CHALLENGES §7).
- Wounds during play and dismemberment (CHALLENGES §10).
- More body plans: crawler, skeleton.
- Per-vertex ambient occlusion.
- A voxelized reference figure as a viewer layer, for calibration.

## Milestone 1: seeded humanoids and a walk cycle

**Goal:** given a template and a seed, generate a detailed voxel humanoid
that passes every rule and walks at a given speed without sliding its feet.
It can be inspected from the command line and in a viewer, next to the
deadvox shambler.

**Status:** in progress. Nothing below is built until this section says so.

**Scope:**

- Genome schema and sampler.
- Core: shapes, voxelizer with marrow, greedy mesher per bone, forward
  kinematics, the five rules.
- Humanoid builder: the 18-bone skeleton, flesh, clothes, hair, face, wounds.
- Speed-driven walk cycle with planted feet.
- Templates: `shambler`, `runner` (1/12), `brute` (1/10).
- CLIs: `generate` and `stats`.
- Viewer (§4).
- Tests: determinism (same seed, same genome and voxels), small hand-built
  bodies that each break one rule, every template valid for at least half
  of the seeds, head voxel counts, and feet that stay planted at 0.8 and
  2.8 m/s.

**Targets to measure** (`npm run stats`):

| Metric | Target |
| --- | --- |
| Head and jaw voxels (`shambler`) | 60–130 (raised from 35–80 so the face has room for eyes, brow, nose and mouth) |
| Time to generate one figure | under 50 ms |
| Valid builds per template | at least 80% |
| Distinct voxel grids among valid builds | at least 90% |
| Triangles per actor | recorded, to set a budget for deadvox |

## Running it

```sh
cd mobgen
npm install
npm test               # unit tests
npm run typecheck
npm run generate -- --template shambler --seed 7          # print a generated genome
npm run generate -- --template shambler --seed 7 --valid  # skip to the next valid seed
npm run generate -- --template brute --seed 3 --voxel 0.04 --out brute-3.json
npm run stats          # generator metrics over many seeds per template
npm run dev            # the viewer (phase B)
```

The reference scripts need Blender; see [reference/README.md](reference/README.md).

## Open questions

- **How actors get into deadvox.** glTF, a compact voxel format, or the
  genome alone, generated in the game. The genome alone is smallest and
  keeps wounds editable, but costs generation time at spawn (CHALLENGES §9).
- **Animation beyond the walk.** deadvox's notes ask for at least three
  attacks and hit reactions. Keyframed poses on the same forward kinematics,
  or procedural like the walk?
- **Do the figures fit the world?** 4 cm actors among 0.5 m blocks may look
  out of place (CHALLENGES §2).
- **What to share with gungen.** The seeded RNG, template schema and
  validator harness look reusable. Deferred until both sides' needs are
  clear.
