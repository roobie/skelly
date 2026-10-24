---
read_if:
  - you build any round of the acid zombie's integration
  - you change the acid body's standing-height fitting or shape measurements
  - you change mobgen's material, budget or carve contracts while the acid zombie lands
  - you add a non-humanoid mob that Deadvox must hit, sever, pose or light
  - you change acid animation, gaze or the spit mouth anchor
  - you change creature-owned severed-part item policy
  - you build the cross-mob far level of detail for per-bone meshes
---

# Acid zombie integration plan

The acid zombie uses a ground-up body because its hunched silhouette and exposed sac
define its identity independently of humanoid variations. Body facts stay separate from
game effects so each boundary can be validated before gameplay consumes it. What the
model must show stays in `packages/deadvox/docs/acid-zombie.md`, "Model", and its behaviour,
including acid immunity and the leg-burning puddle, stays in that doc's other sections.

## Body rules the plan starts from

These are settled, and every round below builds on them:

- **The sac is part of the torso.** It has no hit region of its own, and shooting it is a
  torso hit. It is cosmetic for this tier, and it stays a distinct bone because later tiers
  of the line may give it effects.
- **The sac bursts only on death, and only cosmetically.** No simulation outcome depends on
  it.
- **The wind-up brightens only the sac.** The eyes keep a fixed glow, so the sac alone
  carries the telegraph.
- **Shambler height, brute-like breadth.** Drawing height like a shambler keeps an acid
  zombie in the shambler's height band while keeping the approved body's posture and
  proportion variety. Skeletal tips count as standing support because forced marrow can
  stand above the flesh. Sharing the brute's bulk but not its height keeps the two readable
  apart. See `src/mob/acidTemplate.ts`, `acidTemplate`, and `src/mob/acid.ts`, `buildAcid`.
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
`packages/deadvox/src/render/amalgamFlesh.ts`, `mergeBoneMeshes`. Declarative material dependencies
also enter the generated-body fingerprint; see `packages/deadvox/tools/simulationFingerprint.ts`,
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

Construction stays in TypeScript because anatomy is logic rather than authored tuning
(`PROJECT.md`, "Design boundaries"). See `src/mob/acid.ts`, `buildAcid`.

**Content and logic split.** Authors tune appearance without changing what makes the body
an acid zombie. Keeping that tuning in `src/mob/acidTemplate.jsonnet` lets a later tier
remain a data change (`packages/deadvox/docs/acid-zombie.md`, "Ability, not type"). See
`src/mob/acidTemplate.ts`, `acidTemplate`.

**Measurement.** Shape measurement must be independent of game voxel size and forced
skeletal connectivity. Otherwise repair can disguise a flesh discontinuity. See
`src/core/voxelize.ts`, `rasterizeFeatures`, and `src/mob/acidMeasurements.ts`, `fleshInFrame`.

**Readiness.** The body remains `comparison-only` until Deadvox can hit, sever and pose it,
so the tag never claims more than the game supports (`PROJECT.md`, "Template readiness").
See `src/mob/acidTemplate.ts`, `acidTemplate`, and `test/acidTemplate.test.ts`.

### The study's gates become tests

Known-shape fixtures protect measurement without freezing a generated body
(`AGENTS.md`, "Tests"). The shared-frame joint rule needs mutation proof because a wrong
axis sign can silently preserve apparently continuous flesh. See
`test/acidMeasurements.test.ts` and `src/mob/acidMeasurements.ts`, `jointSections`.

Covering-array properties protect identity and standing height without an exhaustive
product of anatomical choices; see `test/acid.test.ts`. Cost ranges and silhouette spread
are distributions rather than individual actor contracts, so they belong behind the sweep
flag; see `test/acidSweeps.test.ts` and `test/sweeps.ts`, `runSweeps`. The material and carve
fixtures protect shared core contracts rather than an acid-specific appearance; see
`test/materials.test.ts`.

The refitted body needs broad palms to remain distinct from wrists at game resolution,
and a fuller neck base to keep its lengthened back from ending in a ledge. Breadth
variation must remain visible after coarse sampling rather than collapsing into matching
outlines. These are shape changes, not reasons to relax measurement gates; see
`src/mob/acidTemplate.jsonnet`, `geometry` and `params`.

Tuning stays in content rather than test literals. Its release-freeze triggers belong in
`docs/deferred-assertions.md`.

## What Deadvox needs

Deadvox picks a model by id, resolves it through `consumableTemplate` and builds hit boxes
from bones listed per region. See `packages/deadvox/src/core/schema.ts`, `ZOMBIE_MODEL`;
`src/mob/shamblerFigure.ts`, `zombieFigure` and `REGION_BONES`; and
`packages/deadvox/src/core/zombieRegions.ts`. The acid body's bones have their own names (it has a
skull and maw, not head and jaw, and a belly and hips, not spine and pelvis), so the
humanoid lookup would find nothing.

- **Hit regions.** Region membership moves from the humanoid constant into the body plan,
  so each plan says which of its bones form head, torso and limbs. Renaming acid bones to
  humanoid names would hide that it is its own skeleton. The sac's bone is listed under
  torso, so no region or region name is added.
- **Severing.** Severable subtrees come from the bone disposition rather than
  `src/mob/dismember.ts`, `SEVERABLE_PARTS`. The crowd gore mask already sizes itself from
  the widest body (`packages/deadvox/src/render/mobActors.ts` passes the bone count to
  `crowdTextureLayout`), so the acid bone count needs no encoding change. A severed acid
  part follows its creature kind's authored drop policy, independently of bone names.
  See `packages/deadvox/src/core/schema.ts`, `ZombieSchema.severedItems`, and
  `packages/deadvox/src/game/session.ts`, `createSession`.
- **Death burst.** On death the sac's voxels are removed without leaving a severed item and
  without any simulation consequence, so presentation reads death and the sac stays out of
  saves and fingerprints. Keeping it a disposition rather than a Deadvox special case lets a
  later tier attach an effect by data.
- **Poses and gait.** The hunched rig needs its own motion rather than humanoid bone aliases.
  Joint-frame clamping keeps layered actions inside the body's articulated limits; the
  death topple is whole-actor motion at the root, not a hips articulation. Ground fitting
  uses occupied voxel surfaces so protruding skeletal tips also respect the floor. See
  `src/mob/acidPoses.ts`, `acidWalkPose` and `acidDeathPose`, and `src/core/joints.ts`,
  `jointRotation` and `clampJointAngles`. Animation tuning stays with the body content;
  see `src/mob/acidTemplate.jsonnet`, `animation`.
- **Gaze and mouth.** Gaze names its head bone rather than requiring a humanoid name, and
  framed joints clamp the combined action and gaze, not just the gaze correction. See
  `src/mob/lookAt.ts`, `lookAtPose`, and `src/mob/lookAtProfiles.ts`, `LOOK_AT_PROFILES`.
  The mouth anchor belongs to the skull's face opening rather than the hanging jaw or its
  drool, so spit line of sight follows the head through wind-up and gaze. See
  `src/core/body.ts`, `BodyAnchor`, and `src/mob/acid.ts`, `buildAcid`. Round 4 must replace
  the grab-height stand-in in `packages/deadvox/src/core/zombies.ts`, `AcidSpitRelease`,
  with that posed anchor.
- **Materials and glow.** Deadvox reads colour and glow from the body's material table. That
  keeps the glow a content value instead of a Deadvox list of glowing material names. How
  it renders is in "Glow render path" below. The wind-up brightening is per-actor state
  that touches only the sac's material, so it rides the crowd data texture beside the
  severed mask rather than being baked into the mesh. The eyes have no per-actor channel.
- **Scale.** Refitting proportions rather than uniformly scaling the finished figure
  preserves breadth independently of standing height. See `src/mob/acid.ts`, `buildAcid`.

### Glow render path

The sac and eyes use an emissive material: they give off their own light, and the wind-up
raises the sac's emission. The glow also lights the surroundings by borrowing slots from the
renderer's existing point-light pool (`packages/deadvox/src/render/lightPool.ts`, `LightPool`), which
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
storey holds few acid zombies (`packages/deadvox/docs/acid-zombie.md`, "Spawning"), so lighting only the
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
only because labs hold few of them (`packages/deadvox/docs/acid-zombie.md`, "Spawning").

## Rounds

Each round is one PR. They run in order because each one depends on the contract the one
before it lands.

1. **Core contracts and migration.** Existing plans retain their validation budgets through
   plan-owned hooks; see `src/mob/budgets.ts`, `heightHeadBudgets`. Core fixture coverage is in
   `test/materials.test.ts` and `test/budgetHooks.test.ts`. Keep existing validation and
   Deadvox model-load checks passing without budget or fixture loosening when extending these
   contracts. Shape probes exclude forced marrow and ownership repair because either would disguise
   flesh discontinuities; see `src/core/voxelize.ts`, `rasterizeFeatures`.
2. **Acid body plan and template.** Keep body construction separate from tuning so height
   refitting does not erase the approved anatomy's variety. See `src/mob/acid.ts`, `buildAcid`,
   and `src/mob/acidTemplate.ts`, `acidTemplate`. Keep distribution gates out of the fast
   default run; see `test/acid.test.ts`, `test/acidMeasurements.test.ts` and
   `test/acidSweeps.test.ts`. Readiness must remain separate from viewer availability; see
   `src/viewer/main.ts` and `test/acidTemplate.test.ts`.
3. **Acid poses, gait and gaze.** Keep animation independent of gameplay readiness so the
   body can be judged in motion before Deadvox consumes it. See `src/mob/acidPoses.ts`,
   `src/viewer/main.ts`, `applyAcidFrame`, and `test/acidPoses.test.ts`.
4. **Deadvox consumption and effects** (hard coder). Add plan-owned region bones with the
   sac under torso, disposition-driven severing, the cosmetic death burst, the emissive
   glow with the sac-only wind-up brightening and its borrowed-slot light, the falling drips and the death splash as
   presentation in `packages/deadvox/src/render/acidEffects.ts`, `AcidEffects`, the `acid` model id
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
