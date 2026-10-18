---
read_if:
  - you build any round of the acid zombie's integration
  - you change mobgen's material, budget or carve contracts while the acid zombie lands
  - you add a non-humanoid mob that Deadvox must hit, sever, pose or light
  - you build the cross-mob far level of detail for per-bone meshes
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
- **Shambler height, brute-like breadth,** at the shambler's voxel size. It shares the
  brute's bulk but not its height, so the two read apart by height and not by bulk alone.
  Any size variation widens or narrows the build and never changes the height.
- **One sac and no growths.** Being built from the ground up already sets it apart from
  shamblers, so it needs no further variation.
- **Its own heavier gait and look-at profile,** not the shambler's.
- **A crusted, hardened back,** which never severs.

Acid immunity also covers the puddle, so the acid body needs no handling of its own for leg
burns. Immunity is a property of the type's content, not of the body.

## Core delta

These contracts belong in core because they express body facts independently of any acid
module. Their owners are `src/core/body.ts`, `Bone` and `MaterialDef`;
`src/core/template.ts`, `Template`; `src/core/generate.ts`, `BodyPlanDef`;
`src/core/rules.ts`, `GroupBudget`; and `src/core/voxelize.ts`, `voxelize`:

- **Bone frames, joint limits and a disposition** (`fixed`, `sever`, `burst`) on `Bone`
  (`src/core/body.ts`). A sac that never falls off but bursts on death, and a crusted back that
  never severs, are body facts, not Deadvox special cases.
- **Materials as content.** Per-template colour and glow are look tuning, which
  `PILLARS.md`, "Content forward compatibility" puts in content. See
  `src/mob/materialTemplates.jsonnet` and `src/mob/materials.ts`, `resolveMaterials`.
- **Per-plan budgets and limb bones** on `BodyPlanDef` (`src/core/generate.ts`). The old
  shared scaling assumed humanoid height and head proportions, and a regex picked limb
  segments by humanoid bone names. Neither holds for a hunched body with differently named
  bones.
- **Group budgets with fractions and bone patterns** (`src/core/rules.ts`). The acid body's
  identity floors (head, sac, drool) are shares of the whole, not fixed voxel counts.
- **Carve correctness.** Ragged cuts need noise gating, and scoped cuts must preserve
  untargeted blended flesh rather than damaging neighbouring anatomy. Missing material
  declarations must fail rather than silently changing the look. See
  `src/core/voxelize.ts`, `markCarved` and `voxelize`.

### Landing it without weakening other mobs' validation

The port changes contracts, not rules. No existing budget, limit or rule set is loosened to
make room. Each existing plan (humanoid, crawler, dog, amalgam) gets `budgets` and
`limbBones` hooks that reproduce its old scaling exactly, including the coarse cell margin.
The proof is that every existing mobgen test, validation run and Deadvox load passes with
no budget or fixture edits. A budget edit in that round signals a lost behaviour and is a
defect.

Materials cross the builder, viewer, CLI and Deadvox boundary. Consumers decode through
the voxel grid's local table rather than a shared palette, because a compatibility shim
would keep two competing material contracts. See `src/core/voxelize.ts`, `materialOf`;
`src/viewer/scene.ts`, `vertexColors`; `src/cli/view.ts`, `printView`; and
`deadvox/src/render/amalgamFlesh.ts`, `mergeBoneMeshes`. Declarative material dependencies
also enter the generated-body fingerprint; see `deadvox/tools/simulationFingerprint.ts`,
`collectSimulationSourceGraph`.

### Other mobs' outputs that can change

These are the only intended visible changes, and the round's PR must name which mobs each
one touched:

- **Scoped carves protect untargeted flesh.** A carve with `onto` that used to bite through
  neighbouring bones' flesh stops doing so.
- **Silhouette realization** builds the body at the genome's size and voxelizes the
  reference from a template-size build. Far-LOD silhouettes of every mob can shift. The
  silhouette rules must still pass unchanged. If they fail, keep the old path for
  existing plans and record why in `PROJECT.md` instead of loosening `SILHOUETTE_RULES`.
- **No skin fallback.** A builder that relied on an undeclared material now throws. That
  surfaces a latent content bug rather than changing any output silently.

The carve noise gate is not among them: no existing carve declares noise (the tears, hair
and bruises that do are paints), so it changes no shipped mob. Its test is a fixture carve
with noise that is cut solid before the fix.

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
  mobgen's sweep flag (`test/sweeps.ts`, `runSweeps`, which the `test:sweeps` script in
  `mobgen/package.json` sets), not the default run.
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
  `crowdTextureLayout`), so the acid bone count needs no encoding change. A severed acid
  part drops the shambler's severed-part item for its region
  (`deadvox/src/core/zombieRegionNames.ts`, `SEVERED_ITEM`), and no new item content is
  added. That mapping is keyed by region, and the acid bones map into the same regions, so
  it needs no acid entry.
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
  it renders is in "Glow render path" below. The wind-up brightening is per-actor state
  that touches only the sac's material, so it rides the crowd data texture beside the
  severed mask rather than being baked into the mesh. The eyes have no per-actor channel.
- **Scale.** The study measured at its own voxel size; the acid body ships at the
  shambler's. Its height and breadth come from the template's proportions, so a later tier
  changes its build by data, and no uniform scale applies because one would change the
  height.

### Glow render path

The sac and eyes use an emissive material: they give off their own light, and the wind-up
raises the sac's emission. The glow also lights the surroundings by borrowing slots from the
renderer's existing point-light pool (`deadvox/src/render/lightPool.ts`, `LightPool`), which
item lights also use. The nearest glowing actors take the slots first, and their light casts
no shadows.

Emission is chosen over a colour change because a recoloured sac is still shaded by the
scene's lighting, so it darkens with its surroundings instead of reading as a light source.
Emission costs no more and feeds the existing bloom without a pass of its own. It is chosen
over a translucent sac because translucency adds a transparent draw for every crowd variant
even when few actors glow, cannot order overlapping sacs correctly within a crowd batch, and
would need further geometry to show the sac's contents.

Borrowed slots are chosen over a light path built for crowds. Such a path is costly: its cost
grows with the number of glowing actors and the light's reach, and it costs something even
when nothing glows. It would also still need occlusion, receiver coverage and a world-domain
policy before it could ship. Borrowed slots add no draws, passes or shader paths, and a lab
storey holds few acid zombies (`deadvox/docs/acid-zombie.md`, "Spawning"), so lighting only the
nearest of them loses little.

### Far level of detail is its own later item

The per-bone far meshes from the study exceed the far triangle cap (`src/core/generate.ts`,
`FAR_LOD_HALF_BLOCK_TRIANGLE_CAP`). The cap is a cross-mob draw-cost rule (`PROJECT.md`,
"Design boundaries"), so the fix belongs to all mobs, not the acid zombie, and it is a
separate item the lead mints after the Deadvox round.

Far meshes stay per-bone for every mob, each bone getting a cheaper far mesh that fits the
cap. That is the direction that keeps working as new mobs are added: the crowd renderer
draws per bone and sizes itself from the bone count, so any skeleton uses the one render
path and severing still shows at distance. A per-mob far budget in content is a possible
later refinement within that direction, not a decision here.

Until that item lands the acid zombie draws its near mesh at distance. That is acceptable
only because labs hold few of them (`deadvox/docs/acid-zombie.md`, "Spawning").

## Rounds

Each round is one PR. They run in order because each one depends on the contract the one
before it lands.

1. **Core contracts and migration.** Existing plans retain their validation budgets through
   plan-owned hooks; see `src/mob/budgets.ts`, `heightHeadBudgets`. Core fixture coverage is in
   `test/materials.test.ts` and `test/budgetHooks.test.ts`. Keep existing validation and
   Deadvox model-load checks passing without budget or fixture loosening when extending these
   contracts. Shape probes exclude forced marrow and ownership repair because either would disguise
   flesh discontinuities; see `src/core/voxelize.ts`, `rasterizeFeatures`.
2. **Acid body plan and template** (hard coder). Add the plan, template and
   measurement module as `comparison-only`, with the probe fixtures, identity properties and
   gated sweeps, plus a viewer entry. Its parameter ranges vary breadth, never height.
   Done when: the viewer shows the approved body; a property over the covering array holds
   the body's height to the shambler's while its breadth varies; the default run asserts no
   seeded output; and `consumableTemplate` refuses it.
3. **Acid poses, gait and gaze** (hard coder). Add the idle, walk, attack and wind-up,
   hit-reaction and death poses, the look-at profile, and the mouth anchor. Done when: the
   viewer plays each pose within joint limits with feet on the ground, and a gaze test turns
   the skull.
4. **Deadvox consumption and effects** (hard coder). Add plan-owned region bones with the
   sac under torso, disposition-driven severing, the cosmetic death burst, the emissive
   glow with the sac-only wind-up brightening and its borrowed-slot light, the falling drips and the death splash as
   presentation in `deadvox/src/render/acidEffects.ts`, `AcidEffects`, the `acid` model id
   and the content switch off the placeholder shambler body, and flip readiness. The effects
   ship in this round so the mob ships with them. Done when: Deadvox validates and loads it;
   a shot on the sac counts as a torso hit, severs follow the dispositions and drop the
   shambler's severed-part items, and death removes the sac and plays the splash without
   changing any simulation outcome, in a browser smoke flow extended (not added) per
   `AGENTS.md`, "Tests"; the drips play without changing any simulation outcome; the nearest acid zombies light
   their surroundings through the shared light slots; it stands
   at a shambler's height beside one; saves round-trip; and PR #832 is closed.

The far level of detail follows as its own item, cross-mob, with an owner the lead routes.

## PR #832

It stays open and unmerged as a reference until round 4 lands, then closes. Its per-actor
glow and drip work is the reference round 4 builds against, but none of its code merges:
its body reused the humanoid builder, while the approved body is built from the ground up,
and its Deadvox wiring targets the humanoid skeleton and the old palette, both of which
round 1 replaces.

Two ideas carry over as design. Mobgen marks what glows and Deadvox drives the brightness
per actor through the crowd texture, which is the glow line in "What Deadvox needs". Drips
falling from the jaw are Deadvox presentation, not voxels, which is round 4. Its acid body
design doc is superseded by this plan.
