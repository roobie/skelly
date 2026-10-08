---
read_if:
  - you're prioritizing mobgen's design risks and milestone scope
  - you're measuring or changing mobgen actor budgets
---

# mobgen — challenges

The hard problems between mobgen and actors that work in deadvox, roughly in
order of risk. For each: why it's hard, what we plan to do, when we'll deal
with it, and how we'll know it's solved. Numbers marked *measure* are
estimates to check before we rely on them.

Design context is in [PROJECT.md](PROJECT.md); the reference measurements are
in [reference/README.md](reference/README.md). deadvox's own targets are in
[deadvox/CHALLENGES.md](../deadvox/CHALLENGES.md).

## 1. Many detailed actors in a browser

**Why it's hard.** deadvox targets 60 active and 300 background zombies at
60 fps on an Iris Xe laptop, and the box shambler draws six boxes as six
instanced meshes shared by every zombie. A mobgen actor is different on every
count:

- **Draw calls.** One mesh per bone is 18 draws per actor: about 1,080 for 60
  actors, before the 300 in the background. That's more than the whole
  world's budget.
- **No instancing.** Every actor has its own geometry, because variety is the
  point, so the instancing trick doesn't apply.
- **Triangles.** About 800 voxels at 1/12 of a block gives an estimated
  2,000–4,000 triangles per actor after merging. That's roughly 120,000–240,000
  for 60 actors, and far too many for 300. *Measure.*

**Plan.**

- **One draw per actor.** Merge an actor's bones into one geometry with a
  bone index per vertex, and pose it in the vertex shader from a small array
  of bone matrices. This is rigid skinning with one bone per vertex, so it
  costs almost nothing.
- **Batching.** Draw many actors from one three.js `BatchedMesh`, or one
  geometry buffer with per-actor bone matrices in a texture.
- **Level of detail.** Near actors use the template's voxel size; the
  far tier re-voxelizes the same genome at 1/2 block (0.25 m) or falls back to
  box figures. A 1/4-block size remains available for testing, not as a separate
  recommended far level. It comes from the same genome, so an actor's colours
  and proportions match between levels.

  Face dimensions are metric, proportional to `height × headScale`, and
  independent of voxel size; calibration uses the median template height.
  Placement remains grid-snapped, so sub-voxel details may disappear in the
  background tier. Voxel budgets scale with inverse cell volume and actor
  height (head groups also use `headScale`); triangle budgets scale with inverse
  cell surface area and height. `src/core/generate.ts` rounds the scaled
  intervals and allows one extra voxel at coarse resolutions for boundary
  quantization. This follows the root [maintainable-choice-wins pillar](../README.md#the-maintainable-choice-wins-churn-is-expected).

  Keep `full` as the default for gameplay detail, including 1/12 and 1/16
  tests; expose `full` and `silhouette` as explicit caller-selected validation
  profiles. `generateValid` searches only at the template's full-detail size.
  Far LOD is 1/2 block (0.25 m) with silhouette validation; 1/4 remains
  supported and tested but is not a separate recommended far level. Derive it
  from an already full-valid genome, re-voxelizing the full-detail body rather
  than searching/generating a new coarse actor.

  The silhouette contract checks one connected body, whole-body ground contact and balance, and X width/Y height within one cell at each grid's resolution. It enforces triangle cost only: no total-voxel or group-voxel budget at any size, because voxel occupancy is not draw cost for a 20–30 voxel far actor. The connected marrow requirement is about one cell per bone (18 bones), already consuming a large share of an inverse-volume budget. Before removing that budget, the 1/2-block 100-seed sweep measured shambler 18–24 voxels against maxima 7–13, runner 19–26 against 8–12, and brute 25–32 against 16–24. At 1/4 block, shambler and runner passed; brute measured 100–180 against maxima 125–189 and exceeded the bound on 12/100 seeds. These quantized mandatory occupancies make voxel-count budgets unsuitable for far-LOD draw cost.

  Triangle minimum remains 1. At 1/2 block use the named fixed per-actor draw budget `FAR_LOD_HALF_BLOCK_TRIANGLE_CAP = 400`; the measured worst on 2026-09-30 was 336 triangles (brute, seed 89). Any future increase is a deliberate change that must state fresh measurements and rationale; larger templates may need a higher cap, and BR may revisit it to raise the cap. At other coarse sizes (including 1/6 and 1/4) use m1's inverse-surface-area/height-scaled upper bound with no floor or margin. The `full` profile and its budgets remain unchanged. The viewer offers 1/2, 1/4 and 1/6 block sizes plus an explicit profile selector. `recommendedProfileFor` uses the thinnest full-detail upper-arm/forearm/thigh/shin flesh diameter in cells and recommends silhouette below 1.5 cells; a roughly 10 cm limb is 0.4 cells at 1/2 block, 1.2 at 1/6, and 2.4 at 1/12. It never overrides the caller's choice. Exercise every template's full-valid actors over 100 seeds at 1/6, 1/4 and 1/2; retain the pinned 1/4 full-profile foot-resolution failures and verify silhouette passes.

- **A variety pool.** Generate a few dozen variants per template and reuse
  them, rather than one per zombie.

**When.** Before actors go into deadvox (after milestone 1). Milestone 1 only
measures triangles and voxels per actor (`npm run stats`).

**How we'll know.** deadvox's benchmark with mobgen actors: 60 active and 300
background at 60 fps on the reference laptop, with actor rendering inside
the frame budget. *Measure.*

**Measured** (2026-09-28, `stress.html` sweep on the reference laptop, 11th
gen Intel with Iris Xe; actors walking on flat ground, no game running):

| Actors | One mesh per bone: CPU ms (pose + render), fps | One skinned mesh per actor: CPU ms, fps |
| --- | --- | --- |
| 60 | 4.3 + 3.5, 60 | 4.6 + 1.5, 60 |
| 120 | 8.4 + 7.7, 56.5 | 8.1 + 3.0, 59.8 |
| 240 | 18.0 + 16.9, 28.5 | 18.2 + 6.3, 30.1 |

The GPU is not the limit: 365k triangles in 121 draws held 60 fps. One draw
per actor cuts render CPU by about 2.5×. The limit is posing in JavaScript,
about 75 µs per actor per frame, so 60 actors take about 6 ms of the frame
before the game does anything. Next: make posing allocation-free, pose far
actors less often, and cache per-step work, aiming for about 20 µs per actor.

After that work (2026-09-29, same laptop, distance LOD on: re-pose every 2nd
frame beyond 15 m, every 3rd beyond 30 m):

| Actors | One mesh per bone: CPU ms (pose + render), fps | One skinned mesh per actor: CPU ms, fps |
| --- | --- | --- |
| 60 | 1.2 + 6.0, 60 | 1.1 + 1.9, 60 |
| 120 | 1.7 + 9.2, 60 | 2.6 + 5.2, 60 |
| 240 | 3.5 + 21.4, 39.6 | 3.9 + 9.1, 43.1 |

Posing 60 skinned actors fell from 4.6 ms to 1.1 ms, so 60 actors now cost
about 3 ms of CPU in all. Render CPU is now the larger share, and at 240
actors the frame no longer fits even though the CPU work does (13 ms): the
GPU (731k triangles) or unmeasured browser work is the limit there. The
skinned 240 run also had a 1% low of 2.2 fps, one long stall that is not yet
explained.

A later run (same day) had skinned losing to one mesh per bone at 240 (40
against 53 fps) with the same kind of stall at 120 and 240, so a third
path was added. **Crowd**: one `InstancedMesh` per variant, every actor's
bone matrices in one shared float texture uploaded once per frame, and one
matrix fetch per vertex (three.js skinning does four). With it
(2026-09-29, same laptop, LOD on, 12 variants):

| Actors | One mesh per bone | One skinned mesh per actor | Crowd |
| --- | --- | --- | --- |
| 60 | 1.2 + 5.3, 60 | 1.4 + 2.3, 60 | 1.4 + 0.6, 60 |
| 120 | 1.5 + 6.5, 60 | 2.2 + 3.6, 60 | 2.2 + 0.7, 60 |
| 240 | 2.2 + 12.1, 60 | 2.7 + 5.7, 60 | 3.8 + 0.8, 60 |

Crowd draws 13 calls at any count, and its render CPU stays under 1 ms, so
240 actors cost under 5 ms of CPU and posing is again the larger share. In
this run all three paths held 60 fps and no frame took over 100 ms, so the
laptop was faster than in the run before, and the stalls can't be credited
to the crowd path; the long-frame log will say where they come from if they
return. Crowd is the path for deadvox: it's the only one whose render cost
doesn't grow with the number of actors.

## 2. Reading well at game distance

**Why it's hard.** 1/12 of a block gives a head of about 50 voxels up close,
but deadvox is about sightlines: at 20 m a 1.75 m figure is a few dozen
pixels tall, and at night it's in fog. A one-voxel nose, eyes and mouth only
read up close. The figures also stand among 0.5 m blocks, 12 times coarser
than they are, so they may look out of place. The reference settled the
voxel count, not the look.

**Plan.**

- **Silhouette and colour first.** Posture (hunch, reach, limp) and big colour
  areas (skin against clothes, blood) carry the read at distance. Face detail
  is a bonus for close range.
- **Features made for the grid.** Features that are smaller than a voxel at
  the template's size are painted, not carved: eye sockets are carved only at
  3.5 cm voxels or smaller.
- **Test in the game's scene.** Place actors in deadvox lighting (day, dusk,
  night with fog, flashlight) at 5, 15 and 40 m, next to the old box shambler.
- **Per-vertex ambient occlusion,** as deadvox's chunks have, if faces read
  flat.

**When.** A viewer layer with deadvox's sky presets in milestone 1 if cheap;
in-game screenshots before integration.

**How we'll know.** Side-by-side screenshots at 5, 15 and 40 m, judged by
eye: the figure reads as a person at 40 m and as a particular zombie at 5 m.

## 3. Joints with rigid bones

**Why it's hard.** Each voxel belongs to exactly one bone, and bones rotate
as rigid blocks, with no skinning. When an elbow, knee, shoulder or hip
bends, the outside of the joint opens a crack and the inside pushes voxels
into each other. Faces between bones are kept, so a crack shows the bone's
closed cut face rather than a hole, but the seam still shows. The hip and
shoulder have the widest range, and the zombie reach raises the arms high.

**Plan.**

- **Round joints.** Put flesh at the joint centre so the parent and child
  surfaces are round about the pivot: rotating a sphere about its own centre
  opens no crack.
- **Joint limits** as data per bone (see §7), so no animation bends further
  than the flesh can hide.
- **Blend at the joint** only if the above isn't enough: vertices near a joint
  get two bone weights on the merged mesh (§1).

**When.** Round joints and limits in milestone 1 (they shape the body
builder); blending later, if needed.

**How we'll know.** In the viewer, at the walk cycle's extremes and the
largest poses allowed, no crack wider than one voxel is visible from outside.
Later, a measured "seam area" per pose. *Measure.*

## 4. A walk that follows speed

**Why it's hard.** If the stride doesn't match how fast the body moves, feet
slide, and sliding feet are the first thing that looks wrong. deadvox moves
shamblers at 0.8 m/s wandering and 2.8 m/s chasing, and its chase adds
sway, lurches (speed × 0.6–1.2) and stumbles, so speed changes all the time.
Proportions differ per actor (leg length, knee bend, limp), and the ground
has half-metre steps and slopes.

**Plan.**

- **Stride and pace from speed,** the genome's gait params and leg length.
  The phase advances with distance travelled, not with time, so a speed
  change never makes the feet jump or slide.
- **Planted feet:** during stance the foot stays fixed in world space while
  the root advances at the given speed; the root height is solved per phase
  so the lowest foot is on the ground.
- **Standing still** at speed 0, and a smooth blend into and out of walking.
- **Uneven ground later:** foot placement on steps and slopes (two-bone IK
  for the leg) when actors go into deadvox.

**When.** Speed-driven gait and planted feet in milestone 1; blending, steps
and slopes with deadvox integration.

**How we'll know.** A test: during stance, the planted foot moves less than
one voxel horizontally, at 0.8 and 2.8 m/s, for every template.

## 5. Thin features and sampling

**Why it's hard.** At 4 cm voxels, a wrist, neck, ear or finger is about one
voxel across. Sampling a shape at voxel centres can make a limb vanish, split
into pieces, or come out lumpy, and a small change in a param can add or
remove a whole row of voxels. Carves (wounds, eye sockets) make it worse:
they can cut a limb in two or leave islands.

**Plan.**

- **Marrow:** every bone's segment is rasterized and always filled, so each
  bone is connected to its parent however thin its flesh is.
- **A slight dilation** (a voxel is filled within 0.15 voxels of the surface)
  so shapes near a voxel thick don't disappear.
- **Midline on a voxel centre,** so a symmetric body gives exactly symmetric
  voxels.
- **Rules:** `floaters` catches islands, and per-bone budgets in `budget`
  catch a bone that's too thin or too fat.

**When.** Milestone 1.

**How we'll know.** `npm run stats`: floaters are rare, and no bone falls
below its minimum voxel count over 300 seeds per template.

## 6. Validity and variety

**Why it's hard.** The generator only makes choices, and the validator
decides. Params interact: a deep hunch, bent knees and arms reaching forward
move the centre of mass off the feet. A template that is always valid may
have too little variety, and one with lots of variety may fail too often.
Counting variety by genome overstates it: two genomes can look the same
(gungen's "distinct builds are counted by file, not shape" gap).

**Plan.**

- `npm run stats`: valid rate, failures by rule, and distinct *voxel grids*
  (a hash of owner and colour arrays), not distinct genomes.
- Tune template ranges from the stats, not by hand-picking seeds.
- If valid rates get low, sample the params that interact in a set order and
  narrow later ranges from earlier choices (still in the generator, as
  choices).

**When.** Milestone 1.

**How we'll know.** Every template at least 80% valid, with at least 90% of
valid builds distinct as voxel grids over 300 seeds. *Measure.*

## 7. Poses beyond the rest pose

**Why it's hard.** Milestone 1's rules only check the rest pose. During the
walk an arm can swing through the torso, a knee can bend the wrong way, a
hand can pass through a thigh, and the jaw can open through the chest when
the head hangs down. Attacks, hit reactions and dismemberment come later and
make it worse.

**Plan.**

- **Joint limits as data:** each bone gets allowed rotation ranges. This is
  skelly's shared direction: a joint is a port with degrees of freedom.
- **A `joint-limits` rule** checked across sampled phases of every animation.
- **A `self-overlap` rule:** pose the voxels at sampled phases and count
  overlaps between bones that aren't parent and child.

**When.** Joint limits and `joint-limits` right after milestone 1;
`self-overlap` when there's more than the walk.

**How we'll know.** Both rules pass for every template's walk at 0.8 and
2.8 m/s over 300 seeds.

## 8. Colour variety against merging

**Why it's hard.** Greedy meshing only merges faces of the same colour.
Mottled skin, bruises, torn clothes and shading noise give the look, but
every extra shade breaks merges and adds triangles. deadvox had the same
problem with per-block colour jitter and moved it into the shader.

**Plan.**

- Materials with 4 shades each (palette index = material × 4 + shade),
  picked by low-frequency noise so neighbouring voxels tend to agree.
- Measure triangles per actor with 1 and 4 shades.
- If shades cost too much, keep material colours in the mesh and add the
  shading in the fragment shader from a hash of the voxel position, as
  deadvox's chunks do.

**When.** Measured in milestone 1; the shader route with deadvox
integration if needed.

**How we'll know.** Triangle counts in `npm run stats`, with and without
shades. *Measure.*

## 9. Generating at spawn time

**Why it's hard.** Generating one actor (voxelize and mesh) is expected to
take tens of milliseconds, so a frame's budget is gone at one or two. deadvox
turns hordes into individual zombies when their area loads, which can mean
dozens at once.

**Plan.**

- Generate in a Web Worker; the core is pure TypeScript with no DOM, so it
  runs there unchanged.
- Cache results by genome, and use the variety pool (§1).
- A per-frame spawn budget: a zombie shows as a box figure until its mesh is
  ready.

**When.** With deadvox integration. Milestone 1 reports the time per figure.

**How we'll know.** Under 50 ms per figure in `npm run stats` (*measure*),
and no frame over 16 ms while a horde loads.

## 10. Damage, wounds and dismemberment

**Why it's hard.** deadvox plans a body model (wounds, bleeding, fractures)
and dismemberment "when hit hard enough". That needs hit locations on the
actor, wounds carved during play, and limbs that come off and fall. If each
change regenerates the whole actor, that's too slow and changes the look.

**Plan.**

- **One mesh per bone at generation,** so a wound re-meshes only the bone it
  hits, and a severed limb is the subtree of bones below the cut, already its
  own geometry.
- **Hits from voxel ownership:** a ray hitting a voxel names the bone it hit,
  which maps to a body part.
- **Runtime wounds** are carve features added to the genome's wounds list,
  so they survive a save and reload.

**When.** After deadvox's body model exists (EPIC slice 3). Milestone 1
keeps the core browser-pure and per-bone so this stays possible.

**How we'll know.** A demo: shooting an arm carves a wound in that arm, and
a hard hit takes the forearm off, in under a frame.

## 11. Determinism

**Why it's hard.** The genome is the save format: deadvox would store a
template and seed, not voxels. The generator uses a seeded RNG, never
`Math.random`, but `Math.sin`, `Math.cos` and `Math.exp` aren't guaranteed to
give the same last digit in every JavaScript engine. A voxel right at a
shape's edge can flip between browsers. That's cosmetic, until hit locations
or saved wounds depend on the exact voxels.

**Plan.**

- The genome is the source of truth. Same engine, same voxels, guaranteed
  and tested.
- A snapshot of voxel-grid hashes for known seeds in the tests, run in Node;
  check the same hashes in a browser before relying on exactness.
- If exactness across engines is needed, use our own polynomial sin/cos in
  the generator, or save the voxels of damaged actors.

**When.** Hash snapshots in milestone 1; the rest when saves exist.

**How we'll know.** The same hashes in Node, Chrome and Firefox.

## 12. Testing how it looks

**Why it's hard.** The rules check structure, not whether a figure reads as
a sickly human rather than a lump or a swamp monster. Looks can only be
judged by eye, and a small change to the builder can change every seed.

**Plan.**

- A gallery of known-good seeds per template in the viewer, reviewed when
  the builder changes.
- Snapshot tests of genomes and voxel-grid hashes for those seeds: a change
  means "look again", as with gungen's snapshots.
- The colour direction from deadvox's notes: sickly, fleshy, not a swamp
  monster. Pale grey-yellow-pink skin with low saturation, bruises in muted
  purple, and dirty, muted clothes.

**When.** Milestone 1.

**How we'll know.** Every snapshot change comes with a look at the gallery.

## 13. Scope

**Why it's hard.** Procedural characters invite endless detail: fingers,
toes, teeth, hair strands, clothing layers, more body plans. Most of it
doesn't show at 4 cm voxels and 20 m.

**Plan.**

- Only model what shows at the template's voxel size and game distance
  (§2).
- One body plan (humanoid) until actors are in deadvox and the game says
  what it needs next.
- Keep the core domain-agnostic (bones, shapes, voxels, rules), so later
  body plans such as a crawler, a skeleton or a four-legged animal are data
  and builder code, not core changes.

**When.** Always.

**How we'll know.** Every feature added has a reason that can be seen at
game distance.
