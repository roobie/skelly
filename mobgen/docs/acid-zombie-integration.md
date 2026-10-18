---
read_if:
  - you build any round of the acid zombie's integration (m9)
  - you change mobgen's material, budget or carve contracts while the acid zombie lands
  - you add a non-humanoid mob that Deadvox must hit, sever, pose or light
  - you decide the far level of detail for per-bone meshes
---

# Acid zombie integration plan

The ground-up acid zombie from the m8 study is approved. The study built it in a standalone
copy of mobgen's core, so nothing of it is in skelly yet. This plan says how it lands and
why in that order. What the model must show stays in `deadvox/docs/acid-zombie.md`, "Model",
and its behaviour, including acid immunity and the leg-burning puddle, stays in that doc's
other sections.

## Body rules the plan starts from

These are settled, and every round below builds on them:

- **The sac is part of the torso.** It has no hit region of its own, and shooting it is a
  torso hit. It is cosmetic for this tier, and it stays a distinct bone because later tiers
  of the line may give it effects.
- **The sac bursts only on death, and only cosmetically.** No simulation outcome depends on
  it.
- **The wind-up brightens only the sac.** The eyes keep a fixed glow, so the sac alone
  carries the telegraph.
- **Size:** taller and bulkier than a shambler, between 1.1 and 1.25 times its size, so it
  stands out of a crowd at its range band.
- **One sac and no growths.** Being built from the ground up already sets it apart from
  shamblers, so it needs no further variation.
- **Its own heavier gait and look-at profile,** not the shambler's.
- **A crusted, hardened back,** which never severs.

Acid immunity also covers the puddle, so the acid body needs no handling of its own for leg
burns. Immunity is a property of the type's content, not of the body.

## Core delta

The study changed mobgen's core in five ways. Each one exists because the acid body could
not be expressed without it, and each one is general, so it belongs in core rather than in
an acid module:

- **Bone frames, joint limits and a disposition** (`fixed`, `sever`, `burst`) on `Bone`
  (`src/core/body.ts`). A sac that never falls off but bursts on death, and a crusted back that
  never severs, are body facts, not Deadvox special cases.
- **Materials as content.** The closed material list and the shared palette become a
  per-template material table with colour and glow. The acid glow and the sac
  colour are look tuning, which `PILLARS.md`, "Content forward compatibility" puts in content.
- **Per-plan budgets and limb bones** on `BodyPlanDef` (`src/core/generate.ts`). The old
  shared scaling assumed humanoid height and head proportions, and a regex picked limb
  segments by humanoid bone names. Neither holds for a hunched body with differently named
  bones.
- **Group budgets with fractions and bone patterns** (`src/core/rules.ts`). The acid body's
  identity floors (head, sac, drool) are shares of the whole, not fixed voxel counts.
- **Carve correctness** in `src/core/voxelize.ts`: carve noise gates now apply, a carve scoped
  with `onto` protects flesh it does not target, and a feature with an undeclared material
  is rejected instead of falling back to skin.

### Landing it without weakening other mobs' validation

The port changes contracts, not rules. No existing budget, limit or rule set is loosened to
make room. Each existing plan (humanoid, crawler, dog, amalgam) gets `budgets` and
`limbBones` hooks that reproduce its old scaling exactly, including the coarse cell margin.
The proof is that every existing mobgen test, validation run and Deadvox load passes with
no budget or fixture edits. A budget edit in that round signals a lost behaviour and is a FIX.

The material change has the widest reach because every palette consumer moves: the
humanoid, dog and amalgam builders, the mobgen viewer and CLI, Deadvox's amalgam flesh
renderer and session body. Moving them all in the same round is cheaper than a shim that
keeps the old palette, and `AGENTS.md`, "Project stage: pre-pre-alpha, no backwards
compatibility" rules out the shim anyway.

### Other mobs' outputs that can change

These are the only intended visible changes, and the round's PR must name which mobs each
one touched:

- **Carve noise now gates.** Existing carves that declare `noise` were cut solid until now:
  the humanoid's shirt, trouser and hair tears, a dog carve and the amalgam's scaled member
  carves. Tears become ragged as their authors intended, so shambler, runner, crawler, brute,
  dog and amalgam voxels change. This is a bug fix, so it gets a test that fails before the
  fix.
- **Scoped carves protect untargeted flesh.** A carve with `onto` that used to bite through
  neighbouring bones' flesh stops doing so.
- **Silhouette realization** builds the body at the genome's size and voxelizes the
  reference from a template-size build. Far-LOD silhouettes of every mob can shift. The
  silhouette rules must still pass unchanged. If they fail, keep the old path for
  existing plans and record why in `PROJECT.md` instead of loosening `SILHOUETTE_RULES`.
- **No skin fallback.** A builder that relied on an undeclared material now throws. That
  surfaces a latent content bug rather than changing any output silently.

Saves store model and seed, not voxels, so changed voxels re-realize on load. Deadvox
fingerprints that hash generated bodies move, and moving them is the expected
consequence, not a defect.

## Where the acid body lives

- **The plan** goes in a new acid module beside `src/mob/dog.ts` and `src/mob/crawler.ts`,
  because a body plan is construction logic, which stays in TypeScript under
  `PROJECT.md`, "Design boundaries".
- **The template** is a plain data template beside `src/mob/dogTemplate.ts`. It holds every
  proportion, the shape tunables the study kept in its template data, the material table,
  mass and the parameter ranges.
- **Content and logic split.** Content is what an author tunes to change the look without
  changing what the body is. Logic is what makes it an acid body: which bones exist and how
  they chain, the burst and sever dispositions, the drool strand stopping at the sac surface,
  and the measurement rules. That split keeps a later tier of the acid line a data change
  (`deadvox/docs/acid-zombie.md`, "Ability, not type").
- **The measurement module** `rasterizeFeatures` re-rasters at quarter-voxel resolution. It
  belongs in `src/core/voxelize.ts`, not the acid module, because any later body may need
  shape measurement independent of game voxel size.
- **Readiness.** The template enters as `comparison-only`
  (`PROJECT.md`, "Template readiness") until Deadvox can hit, sever and pose it. Readiness then flips in the round
  that makes Deadvox consume it, so the tag never claims more than the game supports.

### The study's gates become tests

`AGENTS.md`, "Tests" forbids seeded outputs and tuning numbers, so each gate becomes a
property checked on fixtures. The probe tests run on small hand-built shapes whose answer is
known by construction:

- **Shape probes** (chest and belly fill, chest aspect, back profile, joint slabs, arm
  taper): a long, low ellipsoid passes the back probe, while a two-voxel box stack and a flat
  back each fail it. A three-voxel joint width fails the joint-slab probe. The shared-frame
  joint rule gets one mutation proof, because it is an invariant about frames that a wrong
  sign passes silently.
- **Identity floors** are asserted as properties over a small covering array of genomes:
  the head, sac and drool budgets hold, and validation reports no issues.
- **Measured cost ranges and the IoU spread** are distributions, so they go behind
  `GUNGEN_SWEEPS`-style sweep gating in `test/sweeps.ts`, not the default run.
- **Material round-trip, carve inset, noise gating, scoped carves and undeclared-material
  rejection** come from the study's core tests and land with the core round, because they
  protect core contracts every mob uses.

Thresholds that are tuning (fill limits, slope bound in voxels, floor shares) live in the
template or plan constants, never in test literals. Those that can drift go in
`docs/deferred-assertions.md`.

## What Deadvox needs

Deadvox picks a model by id, resolves it through `consumableTemplate` and builds hit boxes
from bones listed per region. See `deadvox/src/core/schema.ts`, `ZOMBIE_MODEL`;
`src/mob/shamblerFigure.ts`, `zombieFigure` and `REGION_BONES`; and
`deadvox/src/core/zombieRegions.ts`. The acid body's bones have their own names (it has a
skull and maw, not head and jaw, and a belly and hips, not spine and pelvis), so the
humanoid lookup would find nothing.

- **Hit regions.** Region membership moves from the humanoid constant into the body plan,
  so each plan says which of its bones form head, torso and limbs. Renaming acid bones to
  humanoid names would hide that it is its own skeleton. The sac's bone is listed under
  torso, so no region or region name is added.
- **Severing.** Severable subtrees come from the bone disposition rather than
  `src/mob/dismember.ts`, `SEVERABLE_PARTS`. The crowd gore mask already sizes itself from
  the widest body (`deadvox/src/render/mobActors.ts` passes the bone count to
  `crowdTextureLayout`), so the acid bone count needs no encoding change. The severed item
  each region leaves (`deadvox/src/core/zombieRegionNames.ts`, `SEVERED_ITEM`) names
  shambler items, and what acid parts leave is an open choice (below).
- **Death burst.** On death the sac's voxels are removed without leaving a severed item and
  without any simulation consequence, so presentation reads death and the sac stays out of
  saves and fingerprints. Keeping it a disposition rather than a Deadvox special case lets a
  later tier attach an effect by data.
- **Poses and gait.** `deadvox/src/core/zombiePose.ts` and the mobgen pose modules address
  humanoid bones by name. The acid body needs its own idle, walk, attack, hit-reaction and
  death poses, written against its bones and limits as the dog and crawler did. Its spit
  wind-up pulls the head back, which is a pose, not a material change.
- **Gaze.** `src/mob/lookAtProfiles.ts`, `LOOK_AT_PROFILES` gets an acid entry turning
  `skull`. The mouth that releases a spit should come from the model, replacing the grab
  height stand-in (`deadvox/src/core/zombies.ts`, `AcidSpitRelease`), because line of sight
  is checked from the mouth.
- **Materials and glow.** Deadvox reads colour and glow from the body's material table. That
  keeps the glow a content value instead of a Deadvox list of glowing material names. How
  the glow renders is an open choice (below). The wind-up brightening is per-actor state
  that touches only the sac's material, so it rides the crowd data texture beside the
  severed mask rather than being baked into the mesh. The eyes have no per-actor channel.
- **Scale.** The study measured at its own voxel size. On-screen size comes from the
  template's proportions, Deadvox's `bodyScale` and the shipped voxel size together, and
  the result must land in the size range above. The template carries the proportions, so a
  later tier changes size by data.

### Far level of detail is its own later item

The per-bone far meshes from the study exceed the 400-triangle far cap. The cap is a
cross-mob draw-cost rule (`PROJECT.md`, "Design boundaries"), so the fix belongs to all
mobs, not the acid zombie. It is a separate item the lead mints after the Deadvox round.
Until then the acid zombie draws its near mesh at distance. That is acceptable only
because labs hold few of them (`deadvox/docs/acid-zombie.md`, "Spawning").

## Rounds

Each round is one PR. They run in order because each one depends on the contract the one
before it lands.

1. **Core delta and migration** (hard coder). Port the five core changes. Give every
   existing plan its budget and limb hooks, every template its material table, and move every
   palette consumer in mobgen and Deadvox. Done when: all existing mobgen and Deadvox tests
   pass with no budget or fixture loosening; the study's core tests are in; the PR lists
   which mobs' voxels changed and why; and Deadvox loads every shipped model.
2. **Acid body plan and template** (hard coder). Add the plan, template and
   measurement module as `comparison-only`, with the probe fixtures, identity properties and
   gated sweeps, plus a viewer entry. Done when: the viewer shows the approved body; the
   default run asserts no seeded output; and `consumableTemplate` refuses it.
3. **Acid poses, gait and gaze** (hard coder). Add the idle, walk, attack and wind-up,
   hit-reaction and death poses, the look-at profile, and the mouth anchor. Done when: the
   viewer plays each pose within joint limits with feet on the ground, and a gaze test turns
   the skull.
4. **Deadvox consumption** (hard coder). Add plan-owned region bones with the sac under
   torso, disposition-driven severing, the cosmetic death burst, the chosen glow path with
   the sac-only wind-up brightening, the `acid` model id and the content switch off the
   placeholder shambler body, and flip readiness. Done when: Deadvox validates and loads it;
   a shot on the sac counts as a torso hit, severs follow the dispositions, and death removes
   the sac without changing any simulation outcome, in a browser smoke flow extended (not
   added) per `AGENTS.md`, "Tests"; it stands in the ruled size range beside a shambler; and
   saves round-trip.
5. **Acid effects** (routine coder), timed by the open effects choice: falling drips and
   the death splash as presentation in `deadvox/src/render/acidEffects.ts`, `AcidEffects`.
   Done when: the effects play without changing any simulation outcome.

The far level of detail follows as its own item, cross-mob, with an owner the lead routes.

## PR #832

The recommendation is to close it unmerged. Its body reused the humanoid builder, and the
approved body is built from the ground up instead. Its Deadvox wiring targets the humanoid skeleton and the old palette, both
of which round 1 replaces. Its branch is far behind main, and carrying it forward would
cost more than rewriting it.

Two ideas survive as design, not code. Mobgen marks what glows and Deadvox drives the
brightness per actor through the crowd texture, which becomes the glow line in "What
Deadvox needs". Drips falling from the jaw are Deadvox presentation, not voxels, which is
round 5. Its acid body design doc is superseded by this plan.

## Open choices

Only these remain open, and nothing above decides them:

1. **Glow render path.** How the acid's glow is drawn. Round 4 builds whichever path is
   chosen.
2. **Effects timing.** When the drips and the death splash come, which decides whether
   round 5 runs now.
3. **Severed parts.** What a severed acid part leaves behind.
4. **Far level of detail.** How per-bone far meshes meet the triangle cap for every mob.
5. **PR #832.** Whether to close it unmerged as recommended.
