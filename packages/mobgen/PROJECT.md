---
read_if:
  - "you're changing mobgen's core, authoring or body-plan boundaries"
  - "you're changing the crawler's body-plan or gait constraints"
  - "you're changing the dog shambler's body-plan or gait constraints"
  - "you're changing the skeleton's body plan or deciding its game contracts"
  - "you're reviewing the amalgam's visual quality pass in #378"
  - "you're changing the Mobgen/Deadvox boundary or the amalgam's movement-cost trade-off"
  - "you're marking a template ready or comparison-only"
  - "you change the crowd gore-mask encoding"
  - "you change template materials or coarse skeletal material assignment"
  - "you change the viewer's death preview or shared corpse contact physics"
  - "you're changing how a dead body falls or rests"
  - "you're changing the living leg-loss collapse into crawling"
  - "you're changing severed-limb or carved-flesh physics"
  - "you're deciding whether a mob recipe can support an authored body variant"
---

# mobgen — procedural voxel actors

Mobgen keeps body construction independent of feasibility rules and rendering so body plans can be tested and viewed without baking in a particular anatomy or renderer. The generated figure can then serve the viewer and game without duplicating geometry rules. See `src/core/generate.ts`, `src/core/rules.ts` and `src/viewer/main.ts`.

## Design boundaries

- Keep authored content declarative and feasibility algorithms in TypeScript; duplicating the rules in a content language would let them drift. See `../../docs/jsonnet.md`, `src/core/template.ts` and `src/core/generate.ts`.
- Templates include bodies beyond human proportions. Shared rules must use declared supports and template-defined mass rather than assuming humanoid feet or density-true anatomy. See `src/core/template.ts`, `src/core/rules.ts` and `src/core/templateMass.ts`.
- One bone owns each voxel so part topology remains useful for severing; rigid ownership accepts visible seams at bent joints. Thin anatomy can vanish under sampling, so preserving skeletal connection matters more than retaining every sub-voxel feature. Ordinary bodies keep in-place joint repair because coarse-foot and far-LOD contracts depend on its grid snapping; overlap reservation handles compound contacts. See `src/core/voxelize.ts`, `repairJointAdjacencyInPlace`, `repairOverlappingJointAdjacency`, `src/core/mesh.ts`, `meshBones`, and `src/mob/dismember.ts`, `severedBoneSet`.
- Facial proportions should survive a change in voxel resolution. Dimensions follow body scale while the voxel grid controls sampling, so coarse LOD may lose small details without changing the intended metric shape. See `src/mob/humanoid.ts`, `buildFaceLayout`, and `src/core/generate.ts`, `realizeLod`.
- Full validation remains the default for gameplay detail. Silhouette validation is an explicit far-LOD choice: coarse ownership and voxel counts are poor proxies for draw cost, while a stable outline and triangle budget preserve what matters at distance. See `src/core/generate.ts`, `realizeLod`, `recommendedProfileFor`, and `src/core/rules.ts`, `SILHOUETTE_RULES`.
- Actor mass is a template choice, not a consequence of voxel density; stylized creatures need not share realistic density. See `src/core/templateMass.ts`, `templatePartMassProperties`.
- Keep the look stylized and voxel-coloured rather than anatomically or medically exact, and model only what serves the game rather than building a general character creator. The intended read is sickly and fleshy, not swamp-like; extra colour variation must justify the mesh fragmentation it can cause. See `src/mob/humanoid.ts`, `src/core/voxelize.ts`, `voxelize`, `src/core/mesh.ts`, `meshBones`, and `src/mob/templates.ts`.

Template material tables and their parameter-driven colour choices are authored in Jsonnet so changing a look does not require changing a builder. Material bytes are local to a voxel grid, not a global palette; consumers must use that grid's material names. See `src/mob/materialTemplates.jsonnet`, `src/mob/materials.ts`, `resolveMaterials`, and `src/core/voxelize.ts`, `materialOf`.

A material's emission is self-light: it brightens the part itself and nothing around it. Render paths decode it through their shared shader — the viewer's flesh material and the crowd shader — so a template's glowing parts read as light sources in a dark scene without a per-template material or a placed light. See `src/core/body.ts`, `MaterialDef`, `src/viewer/scene.ts`, `fleshMaterial`, and `src/mob/crowd.ts`, `CROWD_EMISSIVE_FRAGMENT`.

Shared-rig attacks and hit reactions belong to the template rather than its identity, so another template can reuse a clip without a consumer code change. An absent or unknown selection is an authoring error rather than a silent fallback. Distinct body plans retain their own pose mechanics; clip selection must not substitute an upright rig for a prone or non-humanoid one. The viewer's attack selector exists to compare clips beside the content's own choice. See `src/core/template.ts`, `Template`, `src/mob/attack.ts`, `attackClipFor`, `src/mob/reactions.ts`, `flinchClipFor`, `packages/deadvox/src/core/zombiePose.ts`, `withAttackPose`, `withHitFlinch`, and `src/viewer/main.ts`.

**A dead body falls as a ragdoll, presentation only.** Authored resting silhouettes cannot cover every body plan, severing state and floor, and exact contact search costs too much on the death frame. The fall must read as caused by the hit: a blow from behind sends the body forwards. Look approval inspects the mechanism and a repeatable seeded sample, not every silhouette. Choose deterministic Rapier for corpse and vehicle work so one package choice serves both: vehicles need the same result on every machine even though corpses carry no gameplay. A downed entity remaining in the store must not select a different visual solver; its simulation position still owns reach and handling. A library tether keeps its trunk within handling reach, because an unreachable visual body misleads the player even when physics is presentation-only. Corpse physics and its tuning must not invalidate tester saves. The debug staging configuration belongs outside simulation identity for the same reason; see `packages/deadvox/src/render/ragdollConfig.ts`, `sweepFromUrl`, and `packages/deadvox/test/simulationFingerprint.test.ts`. A corpse that affects play would instead have to satisfy `packages/deadvox/docs/decisions/0008-deterministic-world.md`, "Decision".

The viewer must not approve a fall the game never draws. Sharing the game's contact solver and content gravity prevents preview drift without coupling the generator to the game or forking contact physics and debris support. Keep that dependency confined to the viewer and its tests; see `test/boundaries.test.ts`, `src/viewer/main.ts`, `applyDeathFrame`, `src/viewer/scene.ts`, `buildActor`, `packages/deadvox/src/content/base/player.json`, and `packages/deadvox/src/render/ragdoll.ts`, `RagdollWorld`. Acid retains its burst animation because its death is not a fall.

**Losing a leg must read as a collapse caused by the hit, not a pose swap.** The living fall remains presentation-only so simulation movement and timing never wait for a visual recovery. Reuse corpse contact physics, then catch up to the current crawl pose rather than moving the simulation to the fallen body. See `packages/deadvox/src/render/mobActors.ts`, `MobActorMeshes.beginCrawlFall` and `MobActorMeshes.packCrawlFall`, and `src/mob/ragdoll.jsonnet`, `crawlFall`.

Contact rather than a pose rule should settle an open jaw. Acid bodies burst instead of falling. Limbs and carved flesh share the corpse world so a flying part can land on another body; sinking bodies must stop colliding so later falls cannot land on invisible flesh. See `packages/deadvox/src/render/mobActors.ts`, `MobActorMeshes.startRagdoll`, `MobActorMeshes.finishDownedCorpse` and `MobActorMeshes.packCorpse`, and `packages/deadvox/src/render/ragdoll.ts`, `RagdollWorld`. Flesh has an independent presentation cap so carving cannot evict a corpse or a severed limb. Terrain follows the moving body because launch tuning must not outrun a fixed starting patch. See `packages/deadvox/src/render/amalgamFlesh.ts`, `FleshChunks`, `packages/deadvox/src/render/ragdoll.ts`, `RagdollWorld.buildGround`, and `src/mob/ragdoll.jsonnet`, `flesh`.

Humanoid coarse builds intentionally omit forearm and hand flesh while retaining forced marrow for connectivity. Those bones explicitly declare a marrow material so this omission preserves their appearance without a core skin fallback. See `src/mob/humanoid.ts`, `buildBones`, and `src/core/body.ts`, `Bone`.

## Recipe spike

The closed, unmerged [recipe spike PR #1531](https://github.com/roobie/skelly/pull/1531) on branch `ccr-0ef98979-7ftt3n` retains its code. It found that ordered steps can modify a template's base body while its plan retains the rig; stable step ids keep streams independent, and the validator, not an operator, decides feasibility. Grafts remain outside the base hit regions, extra limbs have no motion, and a recipe cannot raise a validation budget.

## Body-plan constraints

The crawler is a distinct prone creature, not a humanoid gait variant: its arm-drag silhouette and trailing leg stumps define its identity. Other proposed forms need their own body plans. See `src/mob/crawler.ts`, `crawlerPose`, `crawlerGaitPose`, `crawlerHitPose`, and `test/crawler.test.ts`.

The dog shambler is a quadruped: four paws, a hanging head and a limping diagonal gait whose opposite-corner pairs (fore-left with hind-right, fore-right with hind-left) define it, so it is its own body plan rather than a crouched humanoid. The four paws are the declared supports, and the template is `comparison-only` (`src/core/template.ts`, `TemplateStatus`): it is kept to compare gaits against other quadrupeds, is not fit for a player to meet, and so is never shipped. Consumers refuse it through `consumableTemplate` and the viewer labels it. See `src/mob/dog.ts`, `buildDog`, `dogPose`, `dogGaitPose`, `dogHitPose`, `src/mob/dogTemplate.ts`, `dogTemplate`, and `test/dog.test.ts`.

The skeleton is its own body plan on the humanoid rig, so the shared humanoid poses drive it without a skeleton-specific animation path. Its thin parts are smaller than the sampling tolerance can preserve, so they snap to voxel rows and columns rather than vanishing or merging with a neighbour. It has no flesh, so its bones declare no marrow material, and its stance width is the template's explicit `stepWidth` rather than a girth-derived body width. It stays `comparison-only` until its game contracts are decided. See `src/mob/skeleton.ts`, `buildSkeleton`, `src/mob/skeletonTemplate.jsonnet`, `src/mob/gait.ts`, `stanceWidthTarget`, and `test/skeleton.test.ts`.

The skeleton's look and attack follow these rulings, each with its reason:

- **Swipe.** The skeleton attacks with a one-armed swipe, not the humanoids' two-armed grab, so it reads as a different threat. The swipe is authored on the shared rig and chosen through the template's `attackClip`, so it needs no skeleton-specific animation path, and a clip added to the content is selectable without a code change. See `src/mob/attackClips.jsonnet`, `src/mob/attack.ts`, `ATTACK_CLIPS`, `attackClipFor`.
- **Middle skull.** The skull is sized between the merged oversized skull and a human-proportioned one. The intent is a compromise between the two proportions; the result still needs judging by eye. See `src/mob/skeleton.ts`, `buildSkull`, `skeletonLayout`.
- **Orange eyes.** The eye sockets keep the merged orange. The colour is the one glowing cue on a pale body, and it is self-light, so it brightens the eyes and lights nothing around them. See `src/mob/skeletonTemplate.jsonnet`, `materials`.
- **Four fingers plus a thumb.** Each hand has five digits so it reads as a hand. The digits are voxel geometry on the hand bone: the rig gets no extra digit bones and a digit cannot be severed on its own, because digit-level animation and loss are outside the dismemberment model. The hand bone stops near the palm and `handLength` sets how far the fingertips reach past it. See `src/mob/skeleton.ts`, `buildHand`, `skeletonLayout`.
- **Five toes.** Each foot has five toes for the same read. The same boundary holds: no toe bones and no independent toe animation or loss, which stay separate scope. See `src/mob/skeleton.ts`, `buildFoot`.
- **No girth, explicit step width.** The skeleton has no bulk to derive a width from, so its stance width is an authored input rather than a hidden code default.
- **Clip choice by content.** Which clip a template plays is its own content choice, so adding an attack never adds a branch on body plan.

### Dog gait

The trot uses a withers-normalized stride rather than increasing cadence to compensate for a short,
rigid leg sweep. Its scale is grounded in observed canine trotting proportions
([biomechanical reference](https://doi.org/10.1371/journal.pone.0278665), including its treadmill-speed
supplement), not a claim to reproduce a healthy dog's speed-dependent gait transitions. Keeping the
cycle distance-driven avoids foot jumps when speed changes. Joint flex and footfall-linked torso
motion must be solved around fixed ground targets, not layered onto planted legs afterwards. The
impaired diagonal retains its relative shortening so increased stride does not erase the shambler's
limp. See `src/mob/dog.ts`, `DOG_TROT`, `dogStepGeometry`, `dogStrideLength` and `dogGaitPose`.

### Template readiness

A template's readiness is a contract, not a naming convention: a comparison-only model may be generated, validated and viewed like any other, but it must not be spawned or exported. Every path that chooses a model for a consumer resolves it through `consumableTemplate`: the Deadvox spawn boundary (`src/mob/shamblerFigure.ts`, `zombieFigure`), the amalgam realization (`packages/deadvox/src/core/amalgamFigure.ts`, `amalgamFigure`) and the `generate` export CLI (`src/cli/generate.ts`). The tag therefore refuses a comparison-only model by itself rather than relying on its absence from a list. The viewer and the dev CLIs are not consumers: the viewer opts a comparison-only template into its own list and labels it so it stays available to compare, while the dev CLIs work from the shipped `TEMPLATES`. See `src/core/template.ts`, `TemplateStatus`, `consumableTemplate`, `src/viewer/main.ts`, `src/cli/stats.ts`, `src/cli/view.ts`, `src/cli/bench.ts`, and `test/dog.test.ts`.

The playtest apex enemy must read as one grotesque fusion, not several unrelated actors. Complete shambler members remain severable subtrees beneath a non-severable shared core; members may hang or turn in any orientation, while support comes from actual ground contacts. The core's spreading lower mass should read as flesh rather than a platform or extra limbs. Its member count is a visual choice, not a budget ceiling. See `src/mob/amalgam.ts`, `amalgamManifest`, `src/core/generate.ts`, `resolveSupportBones`, and `test/amalgam.test.ts`.

A cut's surviving boundary needs the severed state of its neighbouring bone to show stump gore; every bone index in a body plan must therefore survive the crowd mask handoff. See `src/mob/crowd.ts`, `packSeveredMask` and `crowdBoneSevered`.

Mobgen supplies the generated body used by Deadvox collision, hit regions and rendering; sharing that figure keeps gameplay contact tied to the visible anatomy. The amalgam template stays outside the ordinary `TEMPLATES` list so regular actor consumers opt into the boss explicitly. See `src/mob/amalgamTemplate.ts`, `VIEWER_TEMPLATES`, `packages/deadvox/src/core/amalgamFigure.ts`, `amalgamFigure`, and `packages/deadvox/test/simulationFingerprint.test.ts`.

The Mobgen viewer keeps the amalgam static because arbitrarily oriented member heads have no single humanoid gaze target. Do not enable its gaze solver until it can resolve each member's head transform. See `src/viewer/main.ts`, `applyLiveFrame`, `src/mob/amalgam.ts`, and `src/mob/lookAt.ts`, `lookAtPose`.

Issue #378 tracks the open visual-quality pass; the approved body remains a proposal for that judgment, not a fixed gameplay or encounter rule. The generated shape's movement cost is held to the budget in `packages/deadvox/DESIGN.md`, "Exact collision"; see `packages/deadvox/src/core/amalgamShape.ts`, `AmalgamShape`.

Population-quality assertions belong in explicit sweeps because they measure distributions, not an individual actor's contract. See `test/sweeps.ts`, `sweepGroup`, `test/generate.test.ts` and `src/cli/stats.ts`.
