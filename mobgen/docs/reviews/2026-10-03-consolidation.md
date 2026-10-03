# Mobgen consolidation survey — r9-3

**Fixed base:** `4c0ea9104871ce0a5606547a487a7fdf6e5e0a2b` (origin/main when work began, 2026-10-03). Detached checkout: `.claude/worktrees/review-r9-3`. Analysis only: no production edits, commits or pushes. Paths below are relative to that checkout. This untracked scratch report is a handoff, not a published repository document; lead should publish it if wanted durably.

**Recommendation:** three bounded improvements, not a new actor framework. Rank **F1 anatomy ownership**, **F2 pure crowd-buffer preparation**, **F3 body-plan validation policy**. All three are the top three; there is no padded fourth finding. F2 is the smallest independent extraction; F1/F3 belong with actual creature/dismemberment work.

**Important negatives:** detailed hit shapes already come from Mobgen voxels, living render/hit posing already shares one Deadvox adapter, and mass assignment already uses Mobgen's template-aware helper. Six-box/player models are intentional alternative representations, not inaccurate copies of the detailed skeleton.

## 0. Inputs and scope

- **Lifespan — DERIVED: will evolve.** `mobgen/PROJECT.md`, “Creature range”: “planned enemies range from rabbit-sized to huge, including ones that are neither humanoid nor proportional.” Both refactoring and knowledge review apply.
- **Next changes — supplied by dispatch, narrowed against docs:** (T1) dismemberment and more zombie types; (T2) shambler detail/rendering/LOD work; (T3) genuinely different body plans or new body-region budgets; (T4) more attacks/hit reactions/pose checks and player swing following. `deadvox/EPIC.md:163` names “crawler, runner, screamer, bloater”; its later-polish section explicitly says **not scheduled**. `mobgen/PROJECT.md` still proposes joint limits and self-overlap. Do not invent a scheduled rewrite or assume a crawler must have a new skeleton.
- **Boundaries — supplied/confirmed:** this review covers Mobgen and its actual Deadvox imports. Mobgen remains independently usable; no reverse Mobgen→Deadvox dependency, no Gungen/common-schema project. The dispatch specifically asks about this existing producer/consumer seam, so Mobgen-owned pure exports to Deadvox are in scope. Three resources stay in their respective projects. `deadvox/test/mobgenBoundary.test.ts:1` states that boundary.
- **Maintainers — DERIVED: both BR and coding agents.** The dispatch is agent work; history records BR authorship and agent co-author trailers. No maintainer preference beyond that is inferred.
- Prior report: `mobgen/docs/reviews/2026-09-29-maintainability.md`; dispositions below. Prior r9 Deadvox/Gungen reports do not turn this into an all-project refactor.

## A. Enforceable checks first

Full executable code is retained in `.agent-mail/scratch/r9-3-contracts.test.mts`, with configuration `r9-3-contracts.config.mjs` and runner `r9-3-run.mjs`. The appendix states the actual assertions and fixture setup. The final run took **0.807 s**, three green checks and two intentionally red future contracts.

| Check | Result at fixed base | What it protects / where it belongs |
|---|---|---|
| **A1 cut-table/topology agreement** | **PASS**: six arm candidates and their containment implications agree; all 18 generated bones occur once across six region groups | Cross-boundary drift not caught by testing Mobgen descendant traversal alone. At F1 extraction, test the public descriptor and consumer selection rather than parsing private declarations. |
| **A2 actual crowd-adapter parity** | **PASS**: position, normal, RGB, owner bone, neighbour bone and index streams agree; 5,080 vertices / 7,620 indices for shambler seed 1 | Direct producer/consumer geometry contract. Tests both real builders, not a third reimplementation; no GPU or pixel claim. Keep one concrete real actor as integration coverage, plus small packing fixtures at extraction. |
| **A3 head-only scaling stays head-only** | **FAIL — proposed future contract**: added torso interval 10..20 becomes **80..160** when only headScale doubles | Independent group policy for the first non-head budget. All current template groups are head groups, so this is not a current shipped-template defect. |
| **A4 plan-independent realization** | **FAIL — proposed future contract**: registered one-bone plan builds and its direct generic validation passes, but realization throws **`genome "r9-3-blob" is missing height or headScale`** | Prevent fake humanoid params in a future body plan. Fixture deliberately bypasses today's `BodyPlan = 'humanoid'` type: runtime extension probe, not proof that a supported public TS input fails. |
| **A5 rig fits gore-mask capacity** | **PASS**: each of the three shipped template rigs has 18 bones, within the 24-bit mask | Small admission check for future larger rigs; do not silently lose gore-mask bits when a rig crosses the format's capacity. Changing the representation is allowed. |

A1 and A3 use `stripTypeScriptTypes` to execute exact private declaration slices without editing production source. These are **survey adapters**, not a recommended permanent source-parsing test convention. Once F1/F3 expose their policy seams, keep the same assertions against those APIs. A4 also documents an expansion of the current type contract. Do not put either red assertion into default CI before implementing/accepting that contract.

**Keep existing checks, rather than adding weaker duplicates:** Mobgen's `boundaries.test.ts`, DOM-free `tsconfig.core.json`, `angles.test.ts`, `dismember.test.ts`, `shamblerFigure.test.ts`, `crowd.test.ts`, `massProperties.test.ts`, and current full/silhouette tests. Deadvox's `mobgenBoundary`, `mobActors`, `zombieRegions`, `zombies`, and `simulationFingerprint` tests guard the real consumer. For F2, also verify a pure RGB-helper edit stays outside the simulation graph while an anatomy/pose edit remains inside; do not blanket-exclude Mobgen from the fingerprint.

### Independent baseline

- Mobgen **300 tests passed, 1 skipped, 18 files; 39.99 s**, default `npm test`.
- Mobgen **typecheck passed**, including `tsc -p tsconfig.core.json`.
- Deadvox selected seam suite **119 tests passed, 5 files; 5.39 s**: `mobgenBoundary`, `mobActors`, `zombieRegions`, `simulationFingerprint`, `zombies`.
- All heavy runs used the shared `skelly-heavy.lock`; timeout 240 s, not a raised product-test timeout.
- No sweep, browser-render/listening, full Deadvox suite, root lint/site or production-build result is claimed. No test deletion or performance improvement is inferred from these counts.

## History and upcoming-change traces

### H. Actual history, not a static-size review

Audit: **52 non-merge Mobgen commits; 45 counted code/input commits, 2026-09-28–10-02**. Excluded Markdown, snapshots, locks and reference assets; no bulk-format subject enters the counted set. Five calendar days: this measures construction and correction, not mature maintenance cost. Files with most counted touches: `gait.ts` 15, `gait.test.ts` 13, viewer `main.ts`/`index.html` 10 each, `generate.ts`/`generate.test.ts` 9 each, `attack.ts`/viewer `stress.ts` 7 each, `humanoid.ts`/`pose.ts`/`stressActors.ts`/CLI `bench.ts` 6 each.

First-parent feature boundaries include milestone #54, stress #64/#66, review fixes #73, Deadvox actors #75, metric heads #81, far LOD #89 and limb physics #97, followed by analytics/test-pool changes. Recorded in `r9-3-merges.txt`; complete messages and audit records in `r9-3-commits.txt`/`r9-3-audit.json`.

- **H1 gait corrections:** `3897678` fixes a stated 40–65° stance/swing snap; `596311a` fixes lateral targets up to 16 cm short. These establish the value of continuity/geometry contracts, not a case to split `gait.ts` by LOC. Earlier angle/cache remedies are now present.
- **H2 sharing succeeded but stopped short:** `821566b` moves texture packing/shader to a pure module explicitly “So deadvox can reuse them without three.js coming from mobgen.” `9792e12` adds neighbouring-bone mesh data and propagates it through crowd construction for dismemberment. F2 finishes that same seam for the remaining array preparation, not shader or resource ownership.
- **H3 detailed hit ownership/pose:** `03d4713` introduces Mobgen `shamblerFigure` and derives melee hits from it. `7151f57` shares living render/hit pose; follow-ups `fb67168` “Restore simulation-backed stance crossfade” and `0da7e15` “Move shambler step smoothing into simulation pose” show why the shared adapter must stay authoritative. Those last three are consumer history inspected beyond the Mobgen-only churn count.
- **H4 LOD policy iterated:** metric face `e0b07de` → `1ec0498` “Fix coarse LOD geometry and budget scaling”; then `d8fea52` silhouette validation → `ee62fc8` requested-resolution budgets → `c14e913` triangle-only far budgets → `c476026` measured cap 400. These messages/diffs show policy discovery, **not four proved regressions**. F3 localizes the remaining anatomy-specific scaling rather than relaxing validators again.
- **H5 prior review repairs:** `2bde72c` exposes composed joint angles; `c2f9ba7` moves memos to actor cache; `62fa228` reuses winning Realized; `efe66d8` checks genomes; `1543803` compiles attack curves. Do not redispatch those completed extractions.

### T. Expected changes and silent break points

| Trace | Likely touched sites | Invariant / silent break point |
|---|---|---|
| **T1 dismemberment / Slice 3 anatomy** | Mobgen `humanoid`, `dismember`, `shamblerFigure`, `templates`; Deadvox `zombies`, `zombieRegions`, `schema`, `saveFormat`, `mobActors` | A bone name/parent can change while simulation's copied containment or cut-root tables remain valid TypeScript but mean the wrong thing. Preserve head-death and arm eligibility as game policy. |
| **T2 detail, gore, crowd/LOD rendering** | Mobgen `mesh`, `scene`, `stressActors`, `crowd`; Deadvox `mobActors` | Correct new mesh attributes can be dropped/mispacked by one adapter without a type error or change in the other project's preview. Shader/texture math already shares an implementation. |
| **T3 first non-head budget / genuinely new plan** | `BodyPlanDef`, template `BodyPlan`, body builder, `generate` budget/recommendation functions, full/silhouette tests | New torso group silently inherits headScale; missing humanoid params instead fail loudly. A new limb naming scheme has no measurable limb in the current recommender. Keep full versus silhouette explicit. |
| **T4 attacks, pose rules, player swings** | Mobgen `attack`, `idle`, `reactions`, `gait`, `pose`; Deadvox `zombiePose` and `render/playerFigure` | Shared living pose already prevents two pose algorithms; layered angle metadata is not the final blended pose. Player view arms/world figure are intentionally different. No new generic pose engine or player→shambler-rig migration justified by the current brief. |

## B. Ranked findings

### F1 ★ 1 — own humanoid anatomy once; leave combat policy in the game

**ID:** `deadvox/src/core/zombies.ts#ARM_PARTS/anatomy-ownership`

```ts
const ARM_PARTS = ['hand.L', 'hand.R', 'forearm.L', 'forearm.R', 'upperArm.L', 'upperArm.R'] as const;
```

**Evidence:** `deadvox/src/core/zombies.ts:310–356` copies the arm candidates, a `CONTAINING_PARTS` table, arm-region→cut roots, and explicit forearm/upper-arm loss checks. Mobgen already defines the parent chain in `mobgen/src/mob/humanoid.ts:236–260`, cut IDs and generic expansion in `mobgen/src/mob/dismember.ts:10–54`, and region membership in `mobgen/src/mob/shamblerFigure.ts:24–31`. `deadvox/src/render/mobActors.ts:499–510` already derives debris membership from that expansion. No current disagreement found: A1 passes.

**Change basis:** T1, H3. The costly repeated concept is anatomical identity/containment, **not** posed hit geometry. `ARM_PARTS` intentionally excludes head: random arm cuts and `headOnKillChance` are different game decisions. Region→cut mapping is currently only for destroyed arms; leg damage has different behavior.

**Target design (3 lines):**
Export a small Mobgen humanoid anatomy description beside the builder: named regions, their bones, supported cut sites, and anatomical roles/cut roots.
Derive containment from the realized `Bone.parent` graph using the existing descendant primitive; Deadvox selects arm candidates and maps damage outcomes through those identities.
Keep HP, head-only death, random-cut probabilities, incapacitation, attack eligibility and save-field validation rules in Deadvox; no universal damage schema.

**Payoff:** a changed shoulder/arm hierarchy or additional creature anatomy stops needing the same facts rewritten in simulation, hit-region descriptions and debris setup. Unblocks dismemberment extensions and Slice 3 body types without replacing already-shared rendering/pose code.

**Risk:** M. Seeds, region keys and severed bone IDs are saved (`deadvox/src/core/saveFormat.ts:300–356`), and simulation imports Mobgen source into its fingerprint. A descriptor extraction may change the hash even if numerically neutral; changed anatomy legitimately changes hit outcomes and old saves can become incompatible. No migration/compat layer owed. Preserve random candidate ordering unless deliberately accepting seeded behavior churn. Do not move head-death/hand-stump attack rules into a supposedly generic skeleton API.

**Size:** M. **Timing:** fold into the next actual dismemberment/creature-anatomy item (T1); importing a list alone is not the whole fix. **Proof:** keep A1, then replace its private-source adapter with descriptor assertions, add one topology-change fixture, and run existing Deadvox sever/damage/debris/pose and save/fingerprint tests. Verify arm candidate policy still excludes head and that an already hidden descendant cannot be selected again. No need for full seed×cut cartesian sweeps.

**Refutation:** NARROWED. Independent reviewer confirmed the copies but emphasized the intentional head exclusion, existing renderer traversal and existing Mobgen region ownership; all corrections are incorporated above. Artifact: `r9-3-refute-F1.txt` (exit 0).

### F2 ★ 2 — finish the pure crowd-buffer seam, not a shared Three renderer

**ID:** `deadvox/src/render/mobActors.ts#buildVariantGeometry/crowd-buffer-packing`

```ts
const buildVariantGeometry = (realized: Realized): BufferGeometry => {
```

**Evidence:** `deadvox/src/render/mobActors.ts:174–238` repeats the shade factors/RGB expansion and merged arrays from `mobgen/src/viewer/scene.ts:35–53` and `mobgen/src/viewer/stressActors.ts:207–251`. Mobgen's stress path **already imports** `vertexColors`; it is not a third color converter. The Deadvox comments explain why direct viewer imports are forbidden: they pull in a different Three instance. A2 calls the two actual crowd adapters and proves their shared data contract agrees now.

**Change basis:** T2, H2. Mesh `neighbourBone` required geometry-side plumbing; tint/mask/shader logic itself is already shared in `mobgen/src/mob/crowd.ts`. Planned AO/detail/LOD can repeat this propagation cost. This is a maintainability proposal, not a measured allocation/FPS defect.

**Target design (3 lines):**
Add a Three-free Mobgen function returning the concrete crowd streams: positions, normals, expanded RGB, boneIndex, neighbourBone and indices.
Move palette expansion into that same pure presentation seam (or a small adjacent helper), consumed by both local adapters.
Keep BufferGeometry/material creation, shadow/fog patches, skinned-mode attributes, instance slots and disposal local; retain the existing shared crowd texture/shader module.

**Payoff:** one geometry data contract for preview and game. A new attribute/color rule is implemented and fixture-tested once rather than copied around the Three boundary. Supports shambler detail/dismemberment presentation and later LOD consumers.

**Risk:** S–M. Offset/index errors or losing the `-1` neighbour sentinel can corrupt gore without changing raw positions. Mutable typed arrays must have explicit ownership: separate adapter wrappers must not unexpectedly share a disposed or mutated geometry. Put render-only helpers behind render-only imports, not a barrel imported by `realize`/simulation. Deadvox excludes its renderer, but hashes transitive Mobgen sources; a “pure” file is not automatically non-simulation. Save shape need not change, while changing a fingerprint-reachable file can still change save identity.

**Size:** S–M. **Timing:** standalone extraction is worthwhile; alternatively first geometry-side AO/gore/LOD change (T2). **Proof:** A2 before/after plus a tiny two-bone packing fixture with nonzero index offset and both empty/owned neighbours; retain crowd-mask/packing tests and both projects' import-boundary checks. Then actual render smoke for gore/shadows. Compare adapters to each other, not byte-identical output against old releases; intentional visual churn is allowed.

**Refutation:** NARROWED. Only raw buffers/RGB should move; shader/gore mask is already shared, and Mobgen stress already reuses scene color expansion. Intentional separate Three dependencies are preserved. Artifact: `r9-3-refute-F2.txt` (exit 0).

### F3 ★ 3 — finish the existing body-plan policy boundary before extending anatomy

**ID:** `mobgen/src/core/generate.ts#budgetsForGenome/body-plan-policy`

```ts
  const { height, headScale } = genome.params;
```

**Evidence:** `mobgen/src/core/generate.ts:132–156` requires height/headScale and applies head-scaled volume to **every** budget group; `:235–264` recognizes only `upperArm|forearm|thigh|shin` names for profile recommendation. Yet `BodyPlanDef` already owns sample/build/param/wound contracts at `:46–55`. `mobgen/src/core/template.ts:13` currently permits only `'humanoid'`, and all shipped groups at `mobgen/src/mob/templates.ts:74`, `:101`, `:127` are head+jaw. Therefore this is safe for supported templates today, not an extant broken crawler.

**Change basis:** T3, H4. A3's hypothetical torso group takes 8× head scaling despite unchanged torso policy; A4's registered alternative body builds but realization assumes human params. The recommender is only advisory; it does **not** override caller-selected `full`/`silhouette`.

**Target design (3 lines):**
Extend the existing BodyPlanDef/template seam with budget resolution and profile-recommendation policy; keep the generic realization pipeline as orchestration.
Move current humanoid height/head/limb calculations into the humanoid policy, with explicit group-specific scaling rather than treating all groups as heads.
Keep named full/silhouette validators, quantization rules, and the measured far-LOD cap; a new body plan supplies its own dimensions instead of fake human params.

**Payoff:** the next torso budget or truly different creature plan is a local domain change, not another patch to a nominally generic core. No benefit is claimed for moving a stable constant merely to shorten `generate.ts`.

**Risk:** M. Validation changes which seeds are accepted; Deadvox's frozen seed pool fails loudly if an exact seed stops being valid. Budgets/proportions can also alter hit geometry and the simulation fingerprint. Keep physical geometry scaling distinct from validation budget scaling. Preserve current 400-triangle half-block policy until deliberately changed with measurements; do not restore far voxel budgets or weaken full-profile foot/attachment checks. Humanoid gait/IK remains explicitly humanoid; this is not retargeting it to quadrupeds.

**Size:** M. **Timing:** fold into the **first non-head group or genuinely non-humanoid body plan**, not automatically every runner/crawler appearance feature. **Proof:** turn A3/A4 green through the new seam, keep current template/LOD contracts and A5, test the new recommender against its own anatomy, and run Deadvox known-seed/hit/fingerprint checks. The future plan fixture should compile without a cast after the BodyPlan type is deliberately extended.

**Refutation:** NARROWED. Generic dispatch already exists; only remaining budget/recommendation policy moves. Current supported plans/groups are not broken and explicit profile selection remains. Artifact: `r9-3-refute-F3.txt` (exit 0).

## Scattered-concept inventory (ownership, not every repetition is debt)

This inventory covers the named seam concepts in production source, including distinct representations that should not be merged. Test occurrences are evidence, not additional owners.

| Concept | Sites | Disposition |
|---|---|---|
| Detailed skeleton/proportions | `mobgen/src/mob/humanoid.ts` `REF`, `jointLayout`, `buildBones`, metric `buildFaceLayout`; `mobgen/src/mob/templates.ts` parameter ranges | Already owned by Mobgen. Do not create Deadvox proportion constants. |
| Cut candidates/ancestry | `mobgen/src/mob/dismember.ts` `SEVERABLE_PARTS`, `severedBoneSet`; `deadvox/src/core/zombies.ts` `ARM_PARTS`, `CONTAINING_PARTS`, `availableArmParts` | F1 residual copies; parent traversal already shared. |
| Region membership versus damage policy | `mobgen/src/mob/shamblerFigure.ts` type and private `REGION_BONES`; Deadvox `zombieRegions.ts` region enumeration / low-poly mapping; `zombies.ts` arm cut roots, arm eligibility, leg/incapacitation/head outcomes | Export identities/roles; game behavior stays game-owned. Region union is already aliased to Mobgen. |
| Region persistence/content | Deadvox `src/core/schema.ts` `ZombieSchema.regions`, `src/content/base/zombies.json`, `src/core/saveFormat.ts` zombie regions; `zombies.ts` spawn/snapshot/restore | Different constraints are intentional (e.g. saved live head positive, limbs may be zero). Reuse identities, not a cross-project universal schema. |
| Figure identity/cache | `shamblerFigure.ts` frozen eight seeds/cache; Deadvox `zombies.ts` selection/restore admission; `zombiePose.ts` per-seed actor cache; `zombieRegions.ts` per-seed centroid cache; `mobActors.ts` variant map | Explicit shambler pool, not generic arbitrary-genome cache. First additional template must widen identity beyond seed alone and update saves, not silently reuse a seed key. |
| Voxel bounds/centres | Mobgen `shamblerFigure.ts` per-bone centers and hit OBBs; `gait.ts` `restExtentsFor`/foot/body extents; `core/massProperties.ts` voxel bounds/COM; Deadvox `zombieRegions.ts` cached centroid/count | Different consumers/margins: hit bounds include 1 mm; gait extents are voxel-cube bounds; rigid corners are COM-relative. Do not blindly substitute one box for another. Centroid/prepared-data export is a possible convenience, not a fourth ranked finding without demonstrated change cost. |
| Prepared walking data | Mobgen viewer `main.ts:328–339`, `stressActors.ts:106–116`; Deadvox `zombiePose.ts:84–119`, `mobActors.ts:400–410` | Repeated assembly uses shared algorithms, not duplicate posing. A future prepared-figure API may hold immutable extents/metadata; **not mutable per-actor gait caches**. No measured startup saving claimed. |
| Living pose selection and clock mapping | Deadvox `zombiePose.ts` `zombiePoseInputFor`, `attackTimeFor`, `posedShambler`; Mobgen `gait`, `attack`, `idle`, `reactions`, core FK | Keep one simulation-driven living pose. Renderer may interpolate root for presentation; no independent attack/stance clock. |
| Clip and joint diagnostics | Mobgen `core/pose.ts:22–61`, `gait.ts` `recordAngles`, `attack.ts` `clipAngles`, `angles.test.ts` | Prior repair exists. Joint-limit work must distinguish walk layer, clip layer, derived feet and final blended pose; metadata is not a complete final-angle solver. |
| Mass, subtree parts and debris | Mobgen `templates.ts` common mass fractions; `core/templateMass.ts` assigned mass, `massProperties.ts` inertia; Deadvox `mobActors.ts:499–531` subtree and body indices | Already correctly separated: template total/fraction, voxel shape, game rigid-body lifecycle. Fractions cover subtrees and are not disjoint partitions to sum. |
| Crowd geometry streams and palette expansion | Mobgen `core/mesh.ts` BoneMesh; viewer `scene.ts` RGB; `stressActors.ts` crowd/skinned adapters; Deadvox `mobActors.ts` RGB/crowd adapter | F2: extract RGB and crowd arrays. Skinned 4-weight attributes are a distinct format. |
| Texture/shader/sever mask | Mobgen `mob/crowd.ts`, consumed by both crowd renderers | Already shared. 24-bit gore-mask limit is separate from generic voxel-owner capacity; A5 guards today's rigs. |
| Old six-box comparison/fallback | Mobgen `viewer/scene.ts:209–245`; Deadvox `core/zombieRegions.ts:15–42` and `render/zombies.ts` `REGION_FOR_PART`/box consumer | A comparison reference and optional blocky renderer, **not** detailed hit skeleton. Keep independence or document frozen reference; no reverse import. |
| Player body/view arms | Deadvox `render/figure.ts` arm subdivisions; `render/playerFigure.ts` world boxes/feet, `FIRST_PERSON_SHOULDER`, rear offset, grip-anchored segments | Actual file is render/, not dispatch's game/. Eye clearance and held-item endpoints differ from world-anatomy proportions. Player-following feature must choose its representation; no evidence requiring a Mobgen humanoid migration now. |
| Generation validation/profiles | `core/generate.ts`, `core/template.ts`, `core/rules.ts`, `core/validate.ts`, `mob/templates.ts`; explicit viewer/CLI consumers | F3 moves anatomy-specific policy only; keep the existing validator pipeline and accepted BR profile distinctions. |

## Previous review dispositions

| Previous ID suffix | Disposition at this base |
|---|---|
| B1 `buildFaceLayout/lod-proportions` | **Fixed:** metric face/height policy (`e0b07de`, `1ec0498`) and coarse-size tests; full-detail body is re-voxelized for silhouette LOD. Do not repeat the old double-size-head claim. |
| B2 `legAndFootRotations/joint-limits-access` | **Fixed for the claimed walk/attack observability gap:** `Pose.angles`/`clipAngles` and recomposition tests (`2bde72c`). Final blended/idle poses intentionally do not promise these diagnostics; future pose rules must account for that. |
| B3 `strideCapCache/identity-keyed-caches` | **Fixed:** memos on GaitCache (`c2f9ba7`), documented per-actor lifetime, explicit callers/fallback. Deserializing once per spawn is not equivalent to cloning every frame; the old broader serialization warning was overstated. |
| B4 `generateValid/duplicated-valid-search` | **Fixed:** winning `Realized` returned and callers reuse it (`62fa228`); direction remains supported. |
| B5 `buildHumanoid/unchecked-genome` | **Fixed for claimed missing/nonfinite params, wound checks and template key mismatch:** `checkGenome` + tests (`efe66d8`, `f6af9d0`). Not a claim that every arbitrary JSON shape is accepted/rejected through a complete public decoder. |
| B6 `golden-record/snapshot-size` | **Still open, deprioritized:** full numeric pose snapshots remain. No fresh mutation/coverage evidence supports replacing them with hashes or deleting cases. Keep diagnostics for upcoming animation changes; hashing alone does not make a changed pose understandable. |
| B7 `sampleVec3/per-frame-allocation` | **Partially fixed; original repeated clip compilation is fixed** (`1543803`): WeakMap compiled curves/touched bones and cached leg length. Re-grounding remains for correctness. Do not apply the old “no leg clip means skip grounding” suggestion without geometric proof; torso/root effects matter. No new performance finding without measurement. |

## C. Knowledge at risk

1. **Milestone/open-question prose is behind implementation.** PROJECT “Status” still says “in progress. Nothing below is built until this section says so”; “How actors get into deadvox” asks “glTF, a compact voxel format, or the genome alone”. Actual game imports `shamblerFigure`, generates a known seed pool, and uses shared poses/crowd shader. Animation beyond walk is also partly settled (keyframed attack plus procedural reactions/idle). Record current choices separately from unscheduled future work; don't infer worker generation or runtime wound persistence already exists.
2. **Copied-box provenance is stale.** `scene.ts:210–211`: “Box sizes and colours copied from deadvox/src/render/zombies.ts's BOXES constant” and “subprojects don't share code across the repo boundary.” Current dimensions live in `zombieRegions.ts` and Deadvox does import pure Mobgen. The comparison copy can stay, but should be called a reference rather than falsely banning the actual import direction.
3. **Far budget prose can cause a reversal of BR's policy.** PROJECT rule table says “Silhouette: total voxel/triangle budgets only”; its fuller decision and `triangleBudget` in rules enforce **triangle-only**, no voxel budgets. `generate.ts:194` still mentions a “fixed 300-triangle cap”, while the exported constant and current decision are **400**. Correct prose/comments, not the 400 cap. “head and jaw together around 50” also trails the 60–130 template budget.
4. **Eye-socket threshold is historical, not current contract.** CHALLENGES §2 says “eye sockets are carved only at 3.5 cm voxels or smaller”; PROJECT says metric sockets/grid-snapped centers and coarse details may disappear. Reconcile the old threshold with the metric implementation rather than restore it.
5. **Save/fingerprint seam is real simulation, not cosmetics.** Deadvox `saveFormat.ts:302` persists `figureSeed`, `:339–356` regions/severed IDs; `simulationFingerprint.ts:212–216` recognizes sibling Mobgen paths and its actual-graph test includes `shamblerFigure`, pose and attack. Geometry/generation can affect melee, so neither appearance changes nor module moves can be presumed save-neutral. Genome-as-future-save-format prose does not describe the entire current Deadvox snapshot.
6. **Representation capacities are part of the next-rig contract.** `crowd.ts:40–59` uses 24 exactly represented bits and silently drops higher severed indices; current rigs have 18. Hiding matrices and gore masks are different mechanisms, so crossing the bound can lose gore marking without necessarily restoring the hidden limb. A5 is an admission guard, not a new current bug claim.
7. **A few old report references remain.** Earlier `87ff18b` repaired the reviewed citations, but newer crowd-packing prose still says “see mobgen's report”. Prefer the named `crowd.test.ts` derivation and committed measurements. Stale Deadvox DESIGN references to `zombies.ts:57`/`saveState.ts:153` should use symbols; line numbers move. This report's lines identify the fixed base only.

## D. Fresh-context agent pitfalls

- Do not “fix” hit shapes by importing FIGURE_BOXES: its file explicitly excludes them from detailed hit tests.
- Do not import Mobgen viewer code into Deadvox to remove duplicate loops. F2 moves pure data preparation, not Three objects. Existing import tests guard this.
- Do not merge combat policy with anatomical membership: losing a hand still allows a grab; head severing and head death have their own rules. Existing zombies/debris tests plus A1 are the guard.
- Do not make GaitCache shared per template during prepared-figure cleanup. Sharing immutable bones/extents is fine; mutable memo lifetimes are distinct.
- Do not run the old head-size or unchecked-genome findings verbatim. Both were repaired and are covered by the green baseline.
- Do not make far LOD pass by weakening full-detail validation or by generating another seed. `realizeLod` consumes an already full-valid source; explicit profile and measured draw budgets are intentional.
- Do not treat `Pose.angles` as the final pose after arbitrary blending/flinch/head overrides. Read its composition/layer contract and recomposition tests.
- Do not generalize player view-space shoulders or the six-box fallback into the detailed humanoid proportions. Their purposes are different.
- No backwards compatibility is owed; deliberate genome/snapshot/fingerprint churn is acceptable. That does not excuse accidentally dropping a live consumer contract.

## E. Method, verification and artifacts

Three claim-only independent refutations received only ID, file, exact quote and claim, without the survey's history/rationale. All returned **NARROWED**, none dropped; all corrections are folded in. All child exits are 0. Refutations did not mutate or run the code; their conclusions are separate from the executable evidence above.

The method's old cross-project-independence blanket would misfire here: there is now an intentional one-way import relationship. Conversely, the dispatch's duplication emphasis could have produced false findings about living pose, masses and hit boxes; reading consumer history refuted them. The old report is a starting hypothesis, not authoritative present state. Five days of construction history and unscheduled polish are not evidence for an immediate architectural program.

**Verification — PASS:** `r9-3-verify.mjs`/`.log` verified three exact quoted lines against their fixed-base files, three fully shaped primary findings with H/T basis, five explicit A statuses and executable tests, three completed refutations, 13 fully qualified file:line citation starts/ranges, and a clean detached checkout. Report changes exist only under the root ignored `.agent-mail/scratch/`. No production tree changes to review.

**Evidence:** `r9-3-audit.mjs`/`.json`, `r9-3-merges.txt`, `r9-3-commits.txt`; `r9-3-claims.json`, `r9-3-refute.mjs`, `r9-3-refute-F1.txt` through `F3.txt` plus `.exit`; `r9-3-contracts.test.mts`, `.config.mjs`, `.log`, `r9-3-run.mjs`; `r9-3-mobgen-baseline.log`, `r9-3-mobgen-typecheck.log`, `r9-3-deadvox-seam.log`.

To reproduce, recreate the exact detached base and install its Mobgen and Deadvox dependencies, then run `node .agent-mail/scratch/r9-3-run.mjs` from repository root. Passing `contracts` runs only the proposed checks; its Vitest log must show the expected A3/A4 failures, not a green exit. The scripts record child exit codes; read them. Retained scripts use the named worktree path, not moving origin/main.

## Appendix — concrete check bodies / setup

The scratch file provides absolute imports of the real modules and Vitest, `root` pointing at the detached checkout, and imports `readFileSync`/`stripTypeScriptTypes` from Node. This is its executable contract logic (logging/cleanup messages omitted below, not the assertions).

```ts
// A1: execute the current private declarations, not a hand-copied reference table.
const source = readFileSync(`${root}/deadvox/src/core/zombies.ts`, 'utf8');
const captured = source.slice(source.indexOf('const ARM_PARTS ='), source.indexOf('type ArmRegion ='));
const { ARM_PARTS, CONTAINING_PARTS } = new Function(
  stripTypeScriptTypes(captured) + ';return {ARM_PARTS,CONTAINING_PARTS};'
)();
const figure = shamblerFigure(1), bones = figure.realized.body.bones;
expect(ARM_PARTS).toEqual(SEVERABLE_PARTS.filter(p => p !== 'head'));
for (const part of ARM_PARTS) {
  const actual = ARM_PARTS.filter(other => other !== part && severedBoneSet(bones, [other]).has(part));
  expect([...CONTAINING_PARTS[part]].sort()).toEqual(actual.sort());
}
expect(Object.values(figure.boxes).flat().map(b => b.bone).sort())
  .toEqual(bones.map(b => b.id).sort());

// A2: actual local adapters, without rendering or unifying Three instances.
const pool = buildPoolRender({ realized: figure.realized } as never, 'crowd');
if (pool.kind !== 'crowd') throw Error('wrong crowd adapter');
const renderer = new MobActorMeshes(0.5, 1, { poolSize: 1 });
try {
  const other = (renderer.group.children[0] as any).geometry;
  for (const key of ['position', 'normal', 'color', 'boneIndex', 'neighbourBone']) {
    expect(Array.from(other.getAttribute(key).array), key)
      .toEqual(Array.from(pool.geometry.getAttribute(key).array));
  }
  expect(Array.from(other.index.array)).toEqual(Array.from(pool.geometry.index!.array));
} finally { renderer.dispose(); pool.geometry.dispose(); }

// A3: exact current scaler, exercised with one new independently scaled group.
const text = readFileSync(`${root}/mobgen/src/core/generate.ts`, 'utf8');
const section = text.slice(text.indexOf('const scaledRange ='),
  text.indexOf('export const FAR_LOD_HALF_BLOCK_VOXEL_SIZE'));
const budgetsForGenome = new Function(stripTypeScriptTypes(section) + ';return budgetsForGenome;')();
const template = { ...shambler, params: { ...shambler.params, height: 1.75, headScale: 1 },
  budgets: { ...shambler.budgets, groups: {
    head: { bones: ['head', 'jaw'], min: 10, max: 20 },
    torso: { bones: ['pelvis', 'spine', 'chest', 'neck'], min: 10, max: 20 }
  } } };
const genome = { ...generate(shambler, 1),
  params: { ...generate(shambler, 1).params, height: 1.75, headScale: 2 } };
const result = budgetsForGenome(template, genome);
expect(result.groups.head).toMatchObject({ min: 80, max: 160 });
expect(result.groups.torso).toMatchObject({ min: 10, max: 20 }); // FAILS today

// A4: future runtime plan registration; the cast explicitly exceeds today's type contract.
const name = 'r9-3-blob';
const body = {
  bones: [{ id: 'root', parent: null, head: [0, 0.1, 0], tail: [0, 0.2, 0] }],
  features: [{ bone: 'root', op: 'add', shape: {
    kind: 'box', center: [0, 0.1, 0], half: [0.1, 0.1, 0.1], round: 0
  }, material: 'skin' }],
  palette: Object.fromEntries(MATERIALS.map(m => [m, [0.5, 0.5, 0.5]]))
};
registerBodyPlan(name as never, { sample: () => ({ params: { radius: 0.1 }, wounds: [] }),
  build: () => body as never, paramOrder: ['radius'], woundBones: [] });
const blobTemplate = { name, description: 'survey body-plan independence fixture', bodyPlan: name,
  voxelSize: 0.05, bodyMassKg: 1, params: { radius: 0.1 }, feet: ['root'], budgets: {
    totalVoxels: { min: 1, max: 1000 }, totalTriangles: { min: 1, max: 10000 }, groups: {}
  } };
registerTemplate(blobTemplate as never);
const blob = generate(blobTemplate as never, 1);
expect(build(blob)).toBe(body);
const voxels = voxelize(body as never, blobTemplate.voxelSize, 1);
expect(validate({ body: body as never, voxels, meshes: meshBones(voxels, 1),
  feet: new Set(['root']), budgets: blobTemplate.budgets }).ok).toBe(true);
expect(() => realize(blob)).not.toThrow(); // FAILS at humanoid budget assumptions

// A5: template admission, not a broad seed sweep (these three rigs have fixed topology).
for (const template of TEMPLATES) {
  expect(build(generate(template, 1)).bones.length, template.name)
    .toBeLessThanOrEqual(CROWD_MASK_MAX_BONES);
}
```
