---
read_if:
  - "you're changing mobgen's core, authoring or body-plan boundaries"
  - "you're changing the crawler's body-plan or gait constraints"
  - "you're changing the dog shambler's body plans, paw supports, poses or gait constraints"
  - "you're reviewing the amalgam's visual quality pass in #378"
  - "you're changing the Mobgen/Deadvox boundary or the amalgam movement-cost trade-off in #574"
  - "you're marking a template ready or comparison-only"
  - "you change the crowd gore-mask encoding"
---

# mobgen — procedural voxel actors

Mobgen keeps body construction independent of feasibility rules and rendering so body plans can be tested and viewed without baking in a particular anatomy or renderer. The generated figure can then serve the viewer and game without duplicating geometry rules. See `src/core/generate.ts`, `src/core/rules.ts` and `src/viewer/main.ts`.

## Design boundaries

- Keep authored content declarative and feasibility algorithms in TypeScript; duplicating the rules in a content language would let them drift. See `../docs/jsonnet.md`, `src/core/template.ts` and `src/core/generate.ts`.
- Templates include bodies beyond human proportions. Shared rules must use declared supports and template-defined mass rather than assuming humanoid feet or density-true anatomy. See `src/core/template.ts`, `src/core/rules.ts` and `src/core/templateMass.ts`.
- One bone owns each voxel so part topology remains useful for severing; rigid ownership accepts visible seams at bent joints. Thin anatomy can vanish under sampling, so preserving skeletal connection matters more than retaining every sub-voxel feature. Ordinary bodies keep in-place joint repair because coarse-foot and far-LOD contracts depend on its grid snapping; overlap reservation handles compound contacts. See `src/core/voxelize.ts`, `repairJointAdjacencyInPlace`, `repairOverlappingJointAdjacency`, `src/core/mesh.ts`, `meshBones`, and `src/mob/dismember.ts`, `severedBoneSet`.
- Facial proportions should survive a change in voxel resolution. Dimensions follow body scale while the voxel grid controls sampling, so coarse LOD may lose small details without changing the intended metric shape. See `src/mob/humanoid.ts`, `buildFaceLayout`, and `src/core/generate.ts`, `realizeLod`.
- Full validation remains the default for gameplay detail. Silhouette validation is an explicit far-LOD choice: coarse ownership and voxel counts are poor proxies for draw cost, while a stable outline and triangle budget preserve what matters at distance. See `src/core/generate.ts`, `realizeLod`, `recommendedProfileFor`, and `src/core/rules.ts`, `SILHOUETTE_RULES`.
- Actor mass is a template choice, not a consequence of voxel density; stylized creatures need not share realistic density. See `src/core/templateMass.ts`, `templatePartMassProperties`.
- Keep the look stylized and voxel-coloured rather than anatomically or medically exact, and model only what serves the game rather than building a general character creator. The intended read is sickly and fleshy, not swamp-like; extra colour variation must justify the mesh fragmentation it can cause. See `src/mob/humanoid.ts`, `src/core/voxelize.ts`, `voxelize`, `src/core/mesh.ts`, `meshBones`, and `src/mob/templates.ts`.

## Body-plan constraints

The crawler is a distinct prone creature, not a humanoid gait variant: its arm-drag silhouette and trailing leg stumps define its identity. Other proposed forms need their own body plans. See `src/mob/crawler.ts`, `crawlerPose`, `crawlerGaitPose`, `crawlerHitPose`, and `test/crawler.test.ts`.

The dog quadruped is its own body plan for the same reason: a horizontal torso, dog legs and a muzzle are not a humanoid gait either. Its generated supports are the four flat paw soles it actually stands on, resolved through the declared-support rules, and every other bone must stay clear of the ground row. It samples on a finer grid than the humanoid mobs because a dog-sized body at their voxel size reduces the muzzle and ears to a voxel or two, and the look is meant to read at game distance. See `src/mob/quadruped.ts`, `buildQuadruped`, `QUADRUPED_SUPPORT_BONES`, `src/mob/dogTemplate.ts`, `dogTemplate`, and `test/quadruped.test.ts`.

The quadruped's poses layer over one grounded standing pose and every layer re-grounds against the paw supports the template declares. A cut that takes a leg leaves the body standing on its remaining contacts rather than suspended by the pose. See `src/mob/quadrupedPose.ts`, `quadrupedPose`, `groundQuadrupedPose`, `src/mob/dismember.ts`, `severedBoneSet`, and `test/quadruped.test.ts`.

The quadruped's walk is driven by the ground distance the body advances, and its opposite-corner pairs (fore-left with hind-right, fore-right with hind-left) share one phase with the opposite pair half a cycle off: over a stance a pair's paws sweep exactly the ground its step promises, so each step covers the ground the stride suggests. A walk clocked by wall time, or a stance that keeps a leg's standing rotations, decouples the legs from the travel and the planted paws slide; rolling or dipping the trunk does the same to the paws hanging off it, so the shamble's lurch lives in the uneven diagonal steps, the swing lifts and the head, neck and tail instead. See `src/mob/quadrupedPose.ts`, `quadrupedStrideLength`, `quadrupedGaitPose`, `solveLeg`, `src/viewer/main.ts`, `advanceWalk`, and `test/quadruped.test.ts`.

The dog shambler's earlier build is its own body plan for the same reason (body plan `dog`): four paws, a hanging head and a limping diagonal gait whose opposite-corner pairs (fore-left with hind-right, fore-right with hind-left) define it. The four paws are the declared supports. The two builds are kept side by side as templates (`dog` and `dog-m3`) only while their results are being compared; each is registered under its own name so the viewer can show both at once. Both templates are `comparison-only` (`src/core/template.ts`, `TemplateStatus`): kept to compare gaits against other quadrupeds, not fit for a player to meet, and so never shipped. Consumers refuse them through `consumableTemplate` and the viewer labels them. See `src/mob/dog.ts`, `buildDog`, `dogPose`, `dogGaitPose`, `dogHitPose`, `src/mob/dogTemplate.ts`, `dogM3Template`, and `test/dog.test.ts`.

A template's readiness is a contract, not a naming convention: a comparison-only model may be generated, validated and viewed like any other, but it must not be spawned or exported. Every path that chooses a model for a consumer resolves it through `consumableTemplate`: the Deadvox spawn boundary (`src/mob/shamblerFigure.ts`, `zombieFigure`), the amalgam realization (`deadvox/src/core/amalgamFigure.ts`, `amalgamFigure`) and the `generate` export CLI (`src/cli/generate.ts`). The tag therefore refuses a comparison-only model by itself rather than relying on its absence from a list. The viewer and the dev CLIs are not consumers: the viewer opts a comparison-only template into its own list (`src/mob/viewerTemplates.ts`, `VIEWER_TEMPLATES`) and labels it so it stays available to compare, while the dev CLIs work from the shipped `TEMPLATES`. See `src/core/template.ts`, `TemplateStatus`, `consumableTemplate`, `src/viewer/main.ts`, `src/cli/stats.ts`, `src/cli/view.ts`, `src/cli/bench.ts`, and `test/dog.test.ts`.

The playtest apex enemy must read as one grotesque fusion, not several unrelated actors. Complete shambler members remain severable subtrees beneath a non-severable shared core; members may hang or turn in any orientation, while support comes from actual ground contacts. The core's spreading lower mass should read as flesh rather than a platform or extra limbs. Its member count is a visual choice, not a budget ceiling. See `src/mob/amalgam.ts`, `amalgamManifest`, `src/core/generate.ts`, `resolveSupportBones`, and `test/amalgam.test.ts`.

A cut's surviving boundary needs the severed state of its neighbouring bone to show stump gore; every bone index in a body plan must therefore survive the crowd mask handoff. See `src/mob/crowd.ts`, `packSeveredMask` and `crowdBoneSevered`.

Mobgen supplies the generated body used by Deadvox collision, hit regions and rendering; sharing that figure keeps gameplay contact tied to the visible anatomy. The amalgam template stays outside the ordinary `TEMPLATES` list so regular actor consumers opt into the boss explicitly. See `src/mob/amalgamTemplate.ts`, `amalgamTemplate`, `src/mob/viewerTemplates.ts`, `VIEWER_TEMPLATES`, `deadvox/src/core/amalgamFigure.ts`, `amalgamFigure`, and `deadvox/test/simulationFingerprint.test.ts`.

The dog templates stay outside that list too, until their Deadvox feature: deadvox spawns from `TEMPLATES` and `HUMANOID_TEMPLATES` alone, and a body with no collision, AI or hit regions there would be a promise the game cannot keep. Until then they register for the viewer only. See `src/mob/dogTemplate.ts`, `dogTemplate`, `dogM3Template`, `src/mob/viewerTemplates.ts`, `VIEWER_TEMPLATES`, and `src/viewer/main.ts`, `applyLiveFrame`.

The Mobgen viewer keeps the amalgam static because arbitrarily oriented member heads have no single humanoid gaze target. Do not enable its gaze solver until it can resolve each member's head transform. See `src/viewer/main.ts`, `applyLiveFrame`, `src/mob/amalgam.ts`, and `src/mob/lookAt.ts`, `lookAtPose`.

Issue #378 tracks the open visual-quality pass; the approved body remains a proposal for that judgment, not a fixed gameplay or encounter rule. Issue #574 tracks the remaining movement-cost question for the generated shape in snug corridors. See `deadvox/src/core/amalgamShape.ts`, `AmalgamShape`.

Population-quality assertions belong in explicit sweeps because they measure distributions, not an individual actor's contract. See `test/sweeps.ts`, `sweepGroup`, `test/generate.test.ts` and `src/cli/stats.ts`.
