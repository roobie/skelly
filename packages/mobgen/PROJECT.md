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
  - "you change the viewer's death preview, shared corpse contact physics or its Rapier build"
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

**A dead body falls as a ragdoll, presentation only.** Authored resting silhouettes cannot cover every body plan, severing state and floor, and exact contact search costs too much on the death frame. The fall must read as caused by the hit: a blow from behind sends the body forwards. Look approval inspects the mechanism and a repeatable seeded sample, not every silhouette. Use the project-owned Rapier f64 build for corpse and vehicle work under `packages/deadvox/docs/decisions/0009-rapier-f64-build.md`, "Decision"; migrate corpses off npm Rapier so both share one binary and API. Vehicles need the same result on every machine even though corpses carry no gameplay. A downed entity remaining in the store must not select a different visual solver; its simulation position still owns reach and handling. A library tether keeps its trunk within handling reach, because an unreachable visual body misleads the player even when physics is presentation-only. Corpse physics and its tuning must not invalidate tester saves. The debug staging configuration belongs outside simulation identity for the same reason; see `packages/deadvox/src/render/ragdollConfig.ts`, `sweepFromUrl`, and `packages/deadvox/test/simulationFingerprint.test.ts`. A corpse that affects play would instead have to satisfy `packages/deadvox/docs/decisions/0008-deterministic-world.md`, "Decision".

The viewer must not approve a fall the game never draws. Sharing the game's contact solver and content gravity prevents preview drift without coupling the generator to the game or forking contact physics and debris support. Keep that dependency confined to the viewer and its tests; see `test/boundaries.test.ts`, `src/viewer/main.ts`, `applyDeathFrame`, `src/viewer/scene.ts`, `buildActor`, `packages/deadvox/src/content/base/player.json`, and `packages/deadvox/src/render/ragdoll.ts`, `RagdollWorld`. Acid retains its burst animation because its death is not a fall.

**Losing a leg must read as a collapse caused by the hit, not a pose swap.** The living fall remains presentation-only so simulation movement and timing never wait for a visual recovery. Reuse corpse contact physics, then catch up to the current crawl pose rather than moving the simulation to the fallen body. See `packages/deadvox/src/render/mobActors.ts`, `MobActorMeshes.beginCrawlFall` and `MobActorMeshes.packCrawlFall`, and `src/mob/ragdoll.jsonnet`, `crawlFall`.

Contact rather than a pose rule should settle an open jaw. Acid bodies burst instead of falling. Limbs and carved flesh share the corpse world so a flying part can land on another body; sinking bodies must stop colliding so later falls cannot land on invisible flesh. See `packages/deadvox/src/render/mobActors.ts`, `MobActorMeshes.startRagdoll`, `MobActorMeshes.finishDownedCorpse` and `MobActorMeshes.packCorpse`, and `packages/deadvox/src/render/ragdoll.ts`, `RagdollWorld`. Flesh has an independent presentation cap so carving cannot evict a corpse or a severed limb. Terrain follows the moving body because launch tuning must not outrun a fixed starting patch. See `packages/deadvox/src/render/amalgamFlesh.ts`, `FleshChunks`, `packages/deadvox/src/render/ragdoll.ts`, `RagdollWorld.buildGround`, and `src/mob/ragdoll.jsonnet`, `flesh`.

Humanoid coarse builds intentionally omit forearm and hand flesh while retaining forced marrow for connectivity. Those bones explicitly declare a marrow material so this omission preserves their appearance without a core skin fallback. See `src/mob/humanoid.ts`, `buildBones`, and `src/core/body.ts`, `Bone`.

## Severing handoff

A cut's surviving boundary needs the severed state of its neighbouring bone to show stump gore; every bone index in a body plan must therefore survive the crowd mask handoff. See `src/mob/crowd.ts`, `packSeveredMask` and `crowdBoneSevered`.
