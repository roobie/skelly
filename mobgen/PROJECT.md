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
- Body plans other than the humanoid, dismemberment, and animations other
  than the walk.
- Checking poses other than the rest pose (CHALLENGES §7).

## Decisions

| Decision | Choice |
| --- | --- |
| Language | TypeScript (strict), same toolchain as gungen |
| Toolchain | Standalone subproject: Vite, three.js, Vitest, Biome (repo-wide `biome.jsonc`). Share code with gungen later, once the common parts (seeded RNG, template schema, validator harness) are clear |
| Core | Pure library in `src/core`: no DOM, three.js or Node imports, so it runs in tests, workers and the game. Domain-agnostic: bones, shapes, voxels, rules. The humanoid lives in `src/mob` |
| Conventions | Metres, +Y up, right-handed. Figures face −Z (left is −X), matching deadvox, where yaw 0 faces −Z. Ground at y = 0. Voxel centres at x = i·v, y = (j + 0.5)·v, z = k·v: the midline is a voxel centre, so symmetric bodies give exactly symmetric voxels, and the ground is a voxel face |
| Voxel size | Set per template, and templates may differ (a coarser brute next to finer shamblers is accepted). Default 1/12 of a deadvox block (0.5 m / 12 ≈ 4.17 cm): the reference voxelization found this gives a head of about 50 voxels and a 1.75 m figure of about 800. At 1/6 a realistic body falls apart, since limbs are thinner than a voxel. The viewer and CLI can override it |
| Source of truth | Template + seed → **Genome**, a plain JSON record of the sampled params and wounds that carries its seed. Everything after it is a deterministic function of the genome: builder → **Body** → voxelizer → mesher → validator |
| Body | A skeleton of bones plus shape features, as signed distance shapes (tapered capsules, ellipsoids, rounded boxes). A feature adds flesh, carves it away, or paints colour without changing the shape |
| Humanoid | 18 bones: pelvis (root), spine, chest, neck, head, jaw, and left and right upperArm, forearm, hand, thigh, shin, foot. Default joint positions come from the CC0 `fgc_skeleton` rig in `reference/`, converted from Blender's Z-up, −Y-forward axes |
| Voxelization | Every voxel is owned by exactly one bone: the one whose flesh is nearest. "Marrow" is rasterized along every bone and always filled, so each bone is connected to its parent however thin its flesh. A carve that cuts marrow leaves it in place, coloured as exposed bone |
| Paint and carve | Clothing, hair, bruises, eyes and mouth are paint. Wounds carve, with a gore rim. Eye sockets are carved only at voxels of 3.5 cm or smaller; above that, eyes are painted |
| Colour | 10 materials × 4 shades (palette index = material × 4 + shade), with base colours chosen per actor. Shade comes from low-frequency noise, so neighbouring voxels tend to agree and faces still merge. The look, from deadvox's notes: sickly and fleshy, not a swamp monster |
| Meshing | Greedy, per bone, merging faces of the same colour. Faces between voxels of different bones are kept, so each bone's mesh is closed: a bent joint shows a cut face, not a hole into the body. Seams at bent joints are expected (CHALLENGES §3) |
| Bones are rigid | No skinning: each voxel moves with its one bone. Joints are made round about their pivot to hide seams |
| Animation | Forward kinematics: each bone has a rotation about its head, applied down the chain from the pelvis. The walk is driven by speed: stride and pace come from the speed, the genome's gait params and leg length, and the phase advances with distance travelled. During stance the planted foot stays fixed while the root advances; the root's height is solved per phase so the lowest foot is on the ground. Speed 0 is a standing pose |
| Validation | Named rules, each with a readable message. The generator never checks feasibility itself |
| Determinism | Seeded RNG (mulberry32), never `Math.random`. The same genome gives the same voxels on the same JavaScript engine; engines may differ in the last digit of `Math.sin` and similar, which can flip a voxel on a shape's edge (CHALLENGES §11) |
| Templates (milestone 1) | `shambler` (1/12), `runner` (1/12), `brute` (1/10) |
| Tests | Vitest |
| CI | `.github/workflows/mobgen.yml`: typecheck, tests, viewer build |
| Hosting | GitHub Pages (`.github/workflows/pages.yml`), at <https://roobie.github.io/skelly/mobgen/> once the viewer exists |

## Design areas

### 1. Voxelizing a body

Each bone's flesh is the smooth union of its add features. A voxel is filled
when the nearest bone's flesh is within 0.15 voxels of its centre (a slight
dilation, so shapes about one voxel thick survive), then carves remove
voxels. Marrow is filled last. A voxel's colour comes from the nearest add
feature of its bone, then every paint feature that covers it, in order. A
paint can be limited to some materials (bruises only on skin) and broken up
by noise (torn clothes, patchy hair).

### 2. Rules

| Rule id | Checks |
| --- | --- |
| `floaters` | All voxels form one face-connected piece. Carves and small features such as ears can leave islands |
| `attached` | Every bone owns at least one voxel, and at least one of them touches a voxel of its parent. Marrow makes this hold by construction, so it guards against builder bugs |
| `grounded` | The lowest voxel layer is at y = 0, and every voxel in it belongs to a foot |
| `balance` | In the rest pose, the centre of mass, seen from above, is within the rectangle around the ground-layer voxels, widened by one voxel |
| `budget` | Total voxels, triangles and per-bone voxel counts are within the template's limits, e.g. head and jaw together around 50 |

Planned next (CHALLENGES §7): joint limits per bone as data, a
`joint-limits` rule across the walk, and a `self-overlap` rule for bones
passing through each other.

### 3. Templates and seeding

A template fixes a body plan, a voxel size, budgets, which bones are feet,
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
| Head and jaw voxels (`shambler`) | 35–80 |
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
