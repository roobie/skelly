# Gungen consolidation survey — r9-2

**Fixed base:** `28176107533d78fc3d273ffda42c450abfccc38f` (origin/main when dispatched), 2026-10-03. **Proposal only.** Six independently refutation-tested findings; no production edits, commits or pushes. Report and executable evidence are in root `.agent-mail/scratch/`, not committed documentation. Lead should publish the report alongside the prior review if retained as project knowledge.

**Recommendation:** do **F2 action discovery**, **F1 cartridge/frame sizing**, and **F3 magazine geometry ownership** first, folded into their named features. These remove rediscovery of domain facts, not merely duplicate syntax. F4 replaces name-derived mount semantics; F5 generalizes physical guard validation only when needed; F6 reuses one edited-design evaluation. Do not turn these into a universal part/schema/workflow platform.

## 0. Inputs and scope

- **Lifespan: will evolve — DERIVED.** `gungen/PROJECT.md` describes a designer tool with the generator retained as a variant suggester; ADR0001 proposes multiple cartridge-compatible action frames. Accordingly this survey covers refactoring and knowledge at risk, not a cleanup-only pass.
- **Next changes — PROVIDED by lead/BR:** ADR0001 calibre-driven sizing; g38 AR charging handle; g31c-2 Remington870 pump restyle; modular mounts for Deadvox Slice3; d15-4 re-export. These replace the copied Deadvox/Slice2 examples in the dispatch. None of their unmerged implementations is assumed present at this base.
- **Intentional boundaries — PROVIDED/confirmed:** core is domain-independent, ammo is millimetre-domain data/math, gun owns firearm policy, viewer owns Three/DOM, and Deadvox is an independent file-format consumer. `PROJECT.md:46`: “Pure library in `src/core`, with no rendering dependency; domain-agnostic (§10)”. No shared cross-project implementation module is proposed.
- **Maintainer: both human and coding agents — DERIVED** from AGENTS.md and the dispatch workflow. Prefer explicit contracts and small owned concepts over hidden naming conventions.
- **Compatibility policy — PROVIDED:** no legacy data/export promises. Visual/snapshot/test churn is acceptable when deliberate; gungen must still export something Deadvox validates and loads. Frame rollout may change design vocabulary. No opt-in old export path or byte-identity gate.

Sibling projects and root files were inspected only for the actual handoff, boundaries, tests and history. A separate priority review of d18-3 and another of r5-2 interrupted this survey; their later commits are not silently included in this base.

## 1. History and expected-change traces

### History, not size-at-rest

`r9-2-audit.mjs` audits non-merge history, excluding Markdown, assets, snapshots, lockfiles and the Biome bulk adoption. There are272 non-merge commits touching Gungen,237 with counted TS/MJS/HTML/CSS changes, over **2026-09-24–2026-10-02**. This is nine calendar days of construction, not a mature maintenance-cost sample. Planned-change traces therefore carry more weight than touch counts.

| Code hotspot | Touching counted commits |
|---|---:|
| `src/gun/parts.ts` |101|
| `src/gun/templates.ts` |54|
| `test/parts.test.ts` |40|
| `src/viewer/main.ts` |30|
| `src/gun/rules.ts` |26|
| `src/core/schema.ts` |23|
| `test/boltCarrier.test.ts` |22|
| `src/viewer/scene.ts` |19|
| `src/core/mesh.ts` |18|

Concrete follow-ups, identified from messages/diffs, not mere overlapping hot files:

- **H1: action cycle #154:** `764eca5`, “seat AR carrier and clear buffer tube”, then `32b7a3b`, “enclose AR port around an internal breech”. Changes crossed receiver/carrier geometry, stock, viewer cycle binding and tests. `arLayout.ts` is a useful new seam, not something to discard. → F1/F2.
- **H2: ammo #145:** `4b8476e`, “satisfy ammo export review”, changed magazine centreline/body-clearance logic, column capping, exporter/viewer consumers, calibre slugs and tests. `6eda856` separately fixed magwell anchor emission being tied to optional calibre. → F3 and the handoff check; preserve those fixes.
- **H3: trigger guards:** the prior review documented #59's build/scale/sweep/ratio fixes. The shared grip-front geometry has since been repaired, but the four-box guard predicate remains. → F5, not a repeat of the fixed grip constant bug.
- **H4: recent completed consolidation:** #129 kernel hardening, #144 compatibility cleanup, #120 test streamlining and #153 worker policy already landed. `f2ec6a2` validates keep-out profiles; `ce2a858` makes no-bevel clipped solids explicit. These are not new unfixed findings.

### Trace of the actual next changes

| Change | Main seam and files | Invariant / silent break risk |
|---|---|---|
| **T1 ADR0001 AR pilot** | `gun/arLayout.ts`, `gun/parts.ts`, `gun/units.ts`, `ammo/cartridge.ts`, cartridge JSON, `gun/magazineGeometry.ts`, template/design contract | Cartridge selects smallest eligible ranked frame; chamber/bore remain cartridge-specific; grips/trigger/knob stay human-sized. Hand-copied dimensions can diverge from loaded round geometry. |
| **T2 g38 + d15-4** | `gun/parts.ts` action/carrier helpers, `gun/cycle.ts`, `gun/anchorData.ts`, `gun/exportGlb.ts`, `viewer/cycleView.ts`; Deadvox schema/loader only at handoff | Hand cycle and firing cycle need different handle coupling; viewer and exported mover set must agree. Existing timing and physical-clearance checks must survive. |
| **T3 g31c-2 physical vocabulary** | pump layout/stock/lower portions of `gun/parts.ts`, `gun/rules.ts`, `gun/anchorData.ts`, guard/pump tests | A display-only restyle need not alter collision guards. A physical guard representation change currently fails even with identical occupied volume. |
| **T4 modular mounts / editor** | `gun/mounts.ts`, `gun/optics.ts`, `gun/rules.ts`, `core/schema.ts`, `viewer/main.ts`, `viewer/designEditor.ts`, `core/designLoader.ts` | Generic port compatibility is already separate from optic placement policy. Solid-name changes can reclassify support/body semantics; duplicated evaluation can drift in displayed issues. |

## A. Enforceable checks first

**Executable source:** `r9-2-contracts.mjs` contains A1–A5; `r9-2-handoff.test.mts` and `r9-2-handoff.config.mjs` contain A6. Full exact source is appended below. Run from repo root:

```sh
node --test .agent-mail/scratch/r9-2-contracts.mjs
cd .claude/worktrees/review-r9-2/gungen
node node_modules/vitest/vitest.mjs run --config /home/jani/devel/skelly/.agent-mail/scratch/r9-2-handoff.config.mjs
```

| Check | Today | Meaning / adoption |
|---|---|---|
| **A1 source-derived AR axial estimate** | **PASS** | Temporary drift alarm for the actual5.56 maxima and declared visual ratios. Fold into frame-selector tests when ADR0001 replaces this fixed layout; do not preserve this temporary output forever. |
| **A2 renamed carrier retains action metadata** | **FAIL** | Consistent instance-ID rename still exports geometry but loses optional action metadata. A proposed role-discovery contract for F2, **not a claim current curated templates are broken**. |
| **A3 cyclic polygon representation preserves magazine path** | **FAIL** | Same CCW polygon with a different first vertex changes recovered semantic path. A representation-independence canary for F3, not evidence of a present bad magazine. |
| **A4 identical box/extrusion guard volume is equally valid** | **FAIL** | Existing boxes pass; geometrically identical convex extrusions fail the box-only gate. This intentionally strengthens future guard generality, not today's approved shape policy. |
| **A5 loader builds a direct part once** | **FAIL: receiver2 builds, desired1** | Measured redundant evaluation, not a wall-time claim. Use the report's already-resolved data. A count budget is justified only around one load, not a global cache across edits. |
| **A6 export → real Deadvox registry → real GLTFLoader/prepareModel** | **PASS** | Actual AR GLB and metadata accepted; held/ground geometry prepared; moving node mapped through glTF parser associations. Small consumer-owned handoff canary, no shared production schema package. |

Four failures above are **future contracts explicitly proposed by this report**, not four newly discovered player-facing defects. Existing focused suite is green: **74 tests /8 files,7.67s** (`r9-2-focused-baseline.log`). It covers cycle/cycleView, magazineGeometry, triggerGuard, designLoader, domainUnits, keepOutProfiles and coreAppearance. No full Gungen suite, exhaustive sweeps, whole-project build or lint verdict is claimed for this survey.

Existing guards to retain, not duplicate: `test/m3Contracts.test.ts` already lexes/scans core boundaries transitively and tests dynamic/re-export cases; `test/coreAppearance.test.ts` uses an actual non-gun widget; `test/domainUnits.test.ts` checks export scale/bevel/contact against declared domain units. A bare regex import test or LOC ratchet would be weaker.

## B. Ranked, refutation-tested findings

### 1. F2 ★ — One resolved action description for viewer and exporter

**ID:** `gungen/src/gun/exportGlb.ts#buildActionExport/action-discovery`

```ts
const buildActionExport = (resolved: Resolved, ejection: Vec3 | undefined): GunActionExport | undefined => {
```

**Evidence / every relevant discovery site:** `src/gun/exportGlb.ts:99–137` selects literal `bolt-carrier`, reads raw pattern, gets motion/placement and optional bolt; `src/viewer/cycleView.ts:178–238` repeats carrier/pattern selection, sweep target and mesh binding. `src/gun/cycle.ts:263–271` and `src/gun/anchorData.ts:79–87` both derive the near ejection face. `src/gun/parts.ts:920–977,1748–1871` owns handle/carrier construction. **Grounding: H1,T2.** A2 demonstrates metadata loss under identity-only change; no failure in the present named-template corpus is asserted.

**Target design:** add one small gun-domain resolver returning supported action kind, carrier identity/motion/placement and ejection source. Extend it with explicitly named coupled movers when g38 needs them. Both adapters consume it; `cycle.ts` still owns timing, viewer owns meshes/controls, exporter owns node naming and file-frame conversion.

**Payoff / milestone:** g38 can specify a non-reciprocating charging handle without teaching two consumers independent eligibility/coupling rules; d15-4 consumes one coherent exported description. This is the closest Gungen equivalent of consolidating the four reach lookups.

**Risk / blast radius:** M. Wrong mover coupling or axis conversion could animate a handle during fire, omit a node or corrupt action metadata. Preserve `ejectionDirection`'s deliberately model-frame convention rather than blindly transforming it again. Current AR/AK only promise carrier motion; optional export bolt metadata is not evidence the viewer presently animates a separate bolt. Gungen refactor alone does not change a Deadvox save; changed action metadata on re-export changes downstream content identity, deliberately.

**Timing:** fold into g38, with A6 before d15-4; not a separate animation-framework prerequisite.

**Proof / deliberate changes:** retain cycle endpoint/rpm/hold-open/sweep and cycleView rebind/no-drift tests; add one fire-vs-hand handle-coupling canary when that mover exists. Preserve current ejection anchor and axes; record intentional exported mover changes. A2 should pass under the new role contract without promising arbitrary template-slot renaming in design files.

**Refutation: NARROWED.** Timing/profiles were already correctly centralized; only discovery/ejection facts are duplicated. File-frame serialization and presentation controls remain separate.

### 2. F1 ★ — Make the AR pilot consume one cartridge/frame sizing input

**ID:** `gungen/src/gun/arLayout.ts#AR_ACTION_LAYOUT/cartridge-sizing`

```ts
export const AR_ACTION_LAYOUT = {
```

**Evidence / sizing sites:** `src/gun/arLayout.ts:4–20` repeats5.56 maxima57.4/44.7 found at `cartridges/5.56x45.json:40,241`; `src/gun/parts.ts:335–345,430–562,978–999` combines travel/envelope/axis policy. `src/gun/magazineGeometry.ts:12,99–102` converts loaded cartridge profile dimensions. `src/viewer/ammoLayer.ts:17,71` imports its generic conversion from magazine geometry. `src/gun/antiMateriel/cartridge.ts:5–21` is a separate sourced .50BMG conversion/sizing implementation, **not a duplicate .50 JSON**—no such JSON exists yet. `src/gun/units.ts:1–7` and `src/gun/exportFrame.ts:5–10` already share the canonical0.0115m unit. **Grounding: H1,T1.**

**Target design:** the ADR pilot selects the cartridge once and derives the lowest-ranked eligible family frame. A gun-domain sizing result supplies action/receiver/outer interfaces plus cartridge-specific inner dimensions; family builders consume it. Put simple mm↔u conversion beside units, not in magazine code. Keep visual ratios/source annotations and fixed human-contact dimensions explicit.

**Payoff / milestone:** one change to selected cartridge drives round, bore, action envelope and magazine fit coherently. Frame dimensions become intentional domain data, not another collection of S/M/L branches in the101-touch parts module.

**Risk / blast radius:** L for the actual AR pilot, S for moving conversion helpers. ADR0001 is still proposed; missing7.62×51/.338 source dimensions must not be invented. Changing receiver size moves interfaces/anchors, valid seeds and visual goldens. Design schema/exports may change freely; downstream changed assets/metadata affect Deadvox content identity when re-exported. No save migration or byte-preserving old path.

**Timing:** **fold into ADR0001**, not a cleanup blocking it. The ADR explicitly leaves anti-materiel bespoke until convenient; migrate it only when sourced .50 cartridge/frame data exists. AK/SVD frames remain deferred.

**Proof / deliberate changes:** A1 catches drift now. ADR-specified targeted cases: exact fit, first next-frame cartridge, no fit, single-frame refusal, incomparable envelopes resolved by rank, and attempted hand edit of derived dimensions. Check unchanged human grip/trigger/knob dimensions independently of changed placements. Cover adjustable choices with a measured t-wise sample; full products only behind the sweep flag.

**Refutation: NARROWED.** Current fixed AR envelope is documented and intentional, not a present cartridge-fit defect. The .50 source is Wikipedia inches, not a field to replace with nonexistent JSON or silently equate to NATO maxima.

### 3. F3 ★ — Emit magazine semantics where the geometry is built

**ID:** `gungen/src/gun/magazineCenterline.ts#magazineCenterline/semantic-geometry`

```ts
export const magazineCenterline = (solids: readonly Solid[]): MagazineCenterline | undefined => {
```

**Evidence / every path:** `src/gun/parts.ts:207–240,3151–3220,3222–3330` already derives band/capacity-related dimensions, upper body and arc sectors. `src/gun/magazineCenterline.ts:15–68` recovers meaning from `upper-body`, `body`, `curve-display/sector-N` and fixed profile indices. `src/gun/magazineGeometry.ts:71–84,87–124` supplies nominal capacity policy and recovers separate display/physical centreline data. Shared consumers are `src/viewer/magazineView.ts:43–57` and `src/gun/magazineExport.ts:24–47`; both already pass physical solids separately. **Grounding: H2,T1,T2.** A3 shows same polygon geometry can produce different semantic data.

**Target design:** return typed gun-domain magazine geometry data from its construction seam: physical cross-sections/centreline, display projection if needed, and explicit nominal-capacity policy. Carry it with the built part through a gun-domain accessor. Keep `ammo/layoutColumn` math shared and independent of gun naming; do not duplicate data by authoring a second hand-written centreline table.

**Payoff / milestone:** changing tessellation, solid IDs or profile starting vertex no longer changes capacity/round poses. Cartridge-sized magazines can evolve shape and packing from one construction result; d15-4 exports that result instead of interpreting mesh internals.

**Risk / blast radius:** M. The display path currently helps fit while physical dimensions cap and validate it; do not erase this distinction or accidentally expand capacity. Nominal30 versus dimension-derived capacity is intentional policy. Pose/capacity/export changes need explicit review and affect downstream model content identity; merely moving data ownership does not alter save format.

**Timing:** fold into ADR0001's magazine portion; after or alongside F1, not a requirement to redo every old family first. Keep existing band fallback for non-frame families as the ADR specifies.

**Proof / deliberate changes:** A3 should pass via builder-owned metadata; retain magazineGeometry's actual-width/depth/floor/feed support and round separation tests and actual viewer/export pose agreement. Current STANAG20/30 and compact5/10 labels remain curated choices unless explicitly changed. No new independent packing implementation.

**Refutation: NARROWED.** Viewer/export packing is already shared; physical/display validation already separated. The debt is representation discovery, not absent sharing or demonstrated physical misfit.

### 4. F4 — Declare support/body/contact roles instead of inferring them from names

**ID:** `gungen/src/gun/rules.ts#opticSupportError/mount-capabilities`

```ts
const OPTIC_SUPPORT_ID = /foot|mount|ring-band|base|bridge/;
```

**Evidence / inference sites:** `src/gun/rules.ts:494–502` samples only box solids whose ID ends in `foot`; `:519–540` finds receiver support extents via `rail` and `receiver-` name conventions; `:578–588` classifies optic bodies by excluding the quoted regex. Existing generic fit lives at `src/gun/mounts.ts:23–52` and is already called by `src/gun/rules.ts:547–569`; eye-relief remains its own rule at `:627–665`. **Grounding: T4.**

**Target design:** give built gun attachments explicit support/body membership and contact geometry from their construction data. Rules consume those declarations and existing mount requirements. Keep them gun-domain facts, not core fields named for optics; no string classifier independently deciding what a renamed solid physically does.

**Payoff / milestone:** side/bottom/muzzle accessories can introduce supports without copying optical name conventions. An optic restyle cannot silently turn a renamed support into a permitted loading-mouth body.

**Risk / blast radius:** M. Overbroad “generic mount” cleanup could admit scout/handguard optics or feet across a loading opening that BR explicitly prohibited. Preserve receiver/slide-only policy, eye relief and loading-path rules; expand only a newly specified attachment's capabilities. Usually no export/save impact if capabilities remain internal; future exported mount metadata deliberately changes downstream content identity.

**Timing:** fold into modular weapon mounts before the first non-optic attachment reuses these semantics. It need not block current optics or d15-4's existing gun re-export.

**Proof / deliberate changes:** preserve `test/optics.test.ts`'s unsupported foot/span/pitch/eye-relief/loading cases. Add exactly one renamed-solid capability test and one non-optic attachment case when the feature exists. Deliberately reject unclassified support geometry rather than treating unknown names as a safe body.

**Refutation: NARROWED.** Generic fit and optic policy are already separated functions in the proper domain. The change is explicit per-solid semantics, not a missing generic mount engine or a core layering defect.

### 5. F5 — Separate guard safety from the current four-box representation

**ID:** `gungen/src/gun/rules.ts#triggerGuardGeometryFits/shape-policy`

```ts
  if (![top, rear, front, bottom].every((solid) => solid?.kind === 'box')) {
```

**Evidence:** `src/gun/rules.ts:325–374` requires four named boxes, rectangular seam equalities, symmetric positive X clearance and fixed vertical-wall thickness. `:376–451` separately checks body/grip contact and interference, but only after that gate. `src/gun/parts.ts:383–409` builds that shape. `test/triggerGuard.test.ts:11–35` pins a bit-identical pistol golden and `:37–94` pins the current box construction. Revolver bow validation is deliberately separate in `src/gun/revolver.ts:1604–1663`; this is **not every guard in the domain**. **Grounding: H3,T3; prior B8 remains open.** A4 isolates the representation barrier without changing volume or contact.

**Target design:** describe guard membership and intended contact surfaces, then validate enclosure/clear finger space and the approved contact policy through existing solid geometry operations. Keep curated shape/dimension examples in family-specific tests. Do not substitute a permissive bounding box or invent a general CAD solver.

**Payoff / milestone:** a physical pump guard or future grip restyle can use convex prisms without rewriting a safety rule to recognize its particular recipe. Merely changing display solids needs none of this.

**Risk / blast radius:** M. False acceptance is worse than the current false rejection. Preserve no finger intrusion, no action-path obstruction, body/grip contact and explicitly approved tolerances; do not automatically relax1e-8 contact to the generic0.25u connection allowance. Changed collision geometry/exports warrant visual and behavioural review; tests asserting builder identity must be deliberately replaced, not blanket-updated. No direct Deadvox save schema change.

**Timing:** fold during the first **physical** guard restyle; not a prerequisite for g31c-2 if its approved work is display-only. Existing box families may continue using the simpler shape.

**Proof / deliberate changes:** A4 plus missing-wall, finger-intrusion, grip-gap, detached-top and action-path intrusion canaries. Keep one representative curated-dimension test where it expresses BR's actual art contract; retire bit-identity only when the replacement property catches the prior defect. Preserve revolver's separate semantics until a concrete common requirement exists.

**Refutation: NARROWED.** Not every wall dimension is fixed: X clearance can vary positively/symmetrically and rear placement follows grip contact. Existing safety checks are useful; the shape gate is the limiting portion.

### 6. F6 — Reuse one edited-design evaluation, not a serialization round-trip per panel

**ID:** `gungen/src/viewer/main.ts#load/edited-design-evaluation`

```ts
      activeDesign.loaded = loadGunDesign(saved.text);
```

**Evidence / evaluation sites:** `src/viewer/main.ts:674–704` saves/reloads active design and separately calls validate; `:963–976` saves again and may reload outside activeDesign before building its panel. `src/viewer/designEditor.ts:339–372` resolves while removing implicit values for the saved contract. `src/core/designLoader.ts:364–378` explicitly resolves then calls validate, which itself resolves at `src/core/validate.ts:12–26`. `src/viewer/designEditor.ts:376–389` has an intentional, separate publication check on an already-parsed design. **Grounding: T4 and the30-touch viewer entrypoint.** A5 measures two receiver builds in one loader feasibility evaluation; no wall-time improvement is claimed.

**Target design:** first use `validate(...).resolved` inside loader feasibility checks. Then expose one pure evaluation result containing report and design diagnostics, reusable by the existing designEditor/designViewModel and render adapters after an edit. Parse external files on ingress, serialize at save, and retain the deliberate publication validation at download.

**Payoff / milestone:** modular editing changes one evaluation path rather than keeping loaded-design warnings, assembly report and panel metadata synchronized. This is an incremental extension of existing pure seams, not a new editor framework/store.

**Risk / blast radius:** S for duplicate loader resolve, M for viewer integration. Preserve declared versus effective draft/published status, disconnected-part messages, prefab annotations, locks, override provenance, raw malformed-file errors and downgrade-on-download. An evaluated result is valid only for the same immutable edit; do not introduce stale cross-edit memoization. No direct save/fingerprint effect; accidental design serialization changes can change later exports.

**Timing:** small standalone loader fix now; fold viewer reuse into modular editing. Current `?ammo` cartridge preview is separate from editable design state, so this is not an existing cartridge-selection bug.

**Proof / deliberate changes:** A5 plus existing designLoader/designEditor/designViewModel cases for invalid publication, inherited/implicit params, detached prefab, disconnected parts and reopen/round-trip. Keep download checking `loadDesignValue`, not an unvalidated cached “looks good” flag. Model/view behavior should remain; no byte-identical export obligation is added.

**Refutation: NARROWED.** Existing pure editor/view-model seams already do much of the work. The fallback reload is conditional on no active loaded design; download checks parsed data, not text.

## Scattered-concept inventory and intentional distinctions

This inventory is exhaustive for the named consolidation seams above, not a claim every repeated function name in Gungen is debt.

| Concept | Sites | Keep / change |
|---|---|---|
| Cartridge dimension / conversion | F1 sites, ammo roundProfiles, cartridgeExport millimetre domain | Gun mm↔u boundary once; ammo remains mm. .50 source remains distinct until real data exists. |
| Action eligibility / mover / ejection face | F2 export/viewer/cycle/anchor sites | One resolved action description; keep shared timing, keep export-frame adapter. |
| Magazine body / centreline / nominal capacity | F3 builder, centreline interpreter, geometry policy, viewer/export | Builder emits semantics; retain one ammo column implementation and separate physical/display envelopes. |
| Mount support/body/contact | F4 foot suffix, receiver-name prefix, support regex, mount requirements | Explicit gun capabilities; retain three distinct optic policy constraints. |
| Guard enclosure / contact | F5 builder, shape predicate, contact predicate, family tests | Representation-independent constraint when needed; do not weaken exact artistic contact by accident. |
| Edited design / report / panel | F6 loader, validate, save canonicalization, main/panel/viewmodel | Share one edit evaluation, not one durable cache or universal state machine. |
| Appearance resolution | `core/appearance.ts`, gun palette adapter, scene/glb consumers | Already centralized; role colours and material finishing remain live uses, not removable legacy solely because a comment says “legacy”. |
| Display grouping | `core/display.ts#displayItems`, scene, glb, mesh-stats | Already shared; not three independent union implementations. |
| Family registry identity versus built role | schema PartInstance/PartDef, anchors/prefabs versus rules/palette | Intentionally distinct. Document role/key at boundaries, do not merge them into one enum by renaming AK to generic receiver. |
| Unit/grid/bevel/main axes | Domain.units, gun units/exportFrame, core conventions | Actual non-gun tests pass. Canonical assembly axes are not an illicit core import of firearm policy. |
| Generator random stream | `core/generate.ts#generate`, template order, known-good seeds | Sequential stream remains; churn is allowed. No keyed-RNG project without a concrete local-reroll feature need. |
| Model-entry shape across projects | gun export types versus Deadvox runtime schema/prepareModel | Intentional independent implementations; enforce A6 at the boundary rather than create shared production schema ownership. |

The large parts module should be split along F1/F3/F5's owned construction concepts as those change—receiver/action layout, magazine shape/semantics, human-contact geometry—not by arbitrary line budget. Existing antiMateriel and revolver modules demonstrate that family-local ownership is already possible. I did not elevate size alone to a seventh finding.

## C. Knowledge at risk and previous findings

### Disposition of the 2026-09-29 review

| Old finding | Status at this base |
|---|---|
| B1 duplicated grip-front constant | **Fixed:** `parts.ts:378–382,411–416` uses shared `GRIP_MOUNT_PROFILE`. Do not re-report literal1.5 duplication. |
| B2 mesh test pins unrelated validator counts | **Fixed:** `4de91e0` removed fragile snapshot and registered connection-contact. |
| B3 three family names | **Partly addressed, residual documentation:** registry-key anchor ownership explicit; built family still acts as role. Preserve distinction, document it at `PartDef.family`; no demonstrated current wrong-prefab failure. |
| B4 fault values offered to designers | **Fixed:** `schema.ts:174` fault metadata and dedicated fault tests. |
| B5 no shared runtime loader | **Fixed:** parseAssembly and loadDesign paths exist; F6 concerns redundant evaluation, not absent validation. |
| B6 palette gaps / divergent lookup | **Fixed:** palette roles and shared resolveAppearance; non-gun widget test passes. |
| B7 sequential RNG | **Still present, deprioritized:** no implemented suggester found; byte/seed churn is not prohibited. Reconsider local reroll only with that feature, not to preserve obsolete snapshots. |
| B8 box-specific guard rule | **Still open, narrowed as F5.** |

### Kernel brief/probes are not a findings report

The prior scratch brief asks questions and lists already-known cr-g24 items; its probe scripts include assertions of the old behavior, not just correctness assertions. They were read, **not mechanically replayed and relabelled** after APIs/contracts changed.

Verified current consolidations: core `displayItems` feeds viewer/export/metrics; `resolve` validates keep-out profiles with reported conservative fallback; clipped solids require explicit no-bevel; collinear consecutive profile vertices now fail validation; rules use AABB lower-bound culls; carrier cavities derive from shared carrier envelopes. Domain-unit and non-gun appearance probes passed. Existing `resolveMotionSources` rotates the motion axis into the owner before measuring extent; do not re-report the old X-only claim. This survey did not independently re-prove every prior kernel numerical/topology case or generalize nonzero motion starts/revolute joints. Those are outside the ranked claims.

### Documentation and integration facts to repair

1. **Sweep execution contradicts current policy.** PROJECT.md says at1525: `npm run test:sweeps    # the generator seed sweeps too; CI runs them`. Current `.github/workflows/gungen.yml` runs `npm test`, not test:sweeps. Issue#113's latest owner ruling explicitly **defers CI sweeps** until Gungen settles; local before-push sweeps remain required. Fix the prose, do not silently undo that ruling.
2. **Palette paragraph contradicts itself.** PROJECT.md:1059 says “Magazine follows furniture because it is a polymer/wood exterior component” and later “Magazines default to the metal slot”. The latter matches the current palette policy; the AK-74 furniture-matching variant is explicitly deferred below. Preserve that distinction in one current policy paragraph.
3. **Historical line references drift.** PROJECT.md:715–716 points to Deadvox `schema.ts:197–212` and `models.ts:50–52`; the current actual model schema starts later and preparation spans a function. `:1178` likewise cites old schema lines. Cite `ModelSchema`, `prepareModel` and the anchor contract by symbol. Do not preserve old line-number tests as the goal.
4. **glTF node name is not Three's Object3D.name.** A6 first used naive `getObjectByName(action.node)` and failed after a successful parse: Three sanitizes names containing `:`. The metadata explicitly names the exact **glTF** node. The corrected passing test uses `parser.json.nodes` and `parser.associations`. Tell d15-4 to retain this mapping; do not change the export contract just to accommodate a guessed lookup.
5. **“Legacy” does not imply dead code.** `Palette.familyColors/specialColors` and colour-only core palettes remain live (`core/design.ts:120–142`, `core/appearance.ts:35–46`, non-gun appearance tests). Role inspection and generic colour-only consumers justify them. No speculative deletion list is offered.

### Issue#113: measured test stewardship, not test-count reduction

Read the issue and all captured comments (`r9-2-issue113*.json`). #120 already moved heavy products to a measured default sample; #125 addressed ammo duplicates. The later sampled mutation report used52 mutants/module and partial corpus coverage; it explicitly does **not** justify deleting entire corpus files. Stryker10's Vitest5/TS7 integration had “0 tests completed” and preprocessor failures; adoption is deferred, analysis-only until toolchain support is proven. This survey performed no new suite-wide mutation analysis and proposes no speculative deletion based on overlapping coverage. A golden is removable only when a remaining/replacement assertion is shown to catch the defect it guarded.

## D. Fresh-context agent pitfalls

- Start from the fixed base; neither an in-flight pump screenshot nor an approved g38 idea is merged source.
- Do not use S/M/L bore bands as a cartridge identity. ADR0001 separates ranked frame eligibility, cartridge-specific internals, adjustable dimensions and human-sized contacts.
- Do not merge core/gun/viewer or Gungen/Deadvox merely because both hold a Vec3 or a schema-like type. Existing boundaries and A6 do different jobs.
- Do not classify “support” from a prettier solid name, or calculate a semantic centreline from whichever tessellation looks smoothest.
- Do not equate `PartInstance.family` registry key with the built role; anchors/prefabs and rules/palette consume different identities.
- Do not replace exact guard contact policy with the generic connection tolerance without a design decision.
- Do not call four proposed red contracts four current bugs. Controls demonstrate the present supported representation works.
- Do not update every snapshot blindly. List intentional geometry/metadata/capacity changes, visually review them, retain physical invariants, and validate/load the new export.
- Do not infer animation readiness from `getObjectByName(exportedNodeName)`; use original glTF identity mapping.
- Run exhaustive sweeps locally before a Gungen push, but do not claim current CI ran them. Do not claim Stryker survivors mean untested behavior until the runner actually executed tests.

## E. Method, refutation and verification

Six isolated claim-only readers received the ID, exact quote and claim, without this report's reasoning. All returned **NARROWED**, none STANDS unqualified or DROPPED. Full corrections are incorporated above; evidence is `r9-2-refute-F1.txt` through F6, all process exits0. Important narrowing: anti-materiel JSON does not exist, packing/timing/mount-fit are already shared, guards have distinct family policies, and current ammo preview is not editor state.

Method limitations: very young history; hot parts reflect construction as well as coordination cost. Some prior documentation records old decisions and current decisions in the same paragraph. A static duplication hunt would wrongly flag the already-shared kernels and erase deliberate physical/display distinctions. A numerical kernel audit or full performance benchmark was not repeated. Scratch probes intentionally reveal refactoring constraints, not an expanded release-blocker list.

**Independent execution:**74 focused current tests pass; A1/A6 pass; A2–A5 fail only their declared stronger contracts. Native Node A1–A5 run ~0.65s. Handoff test passes in~1s. No full-suite/sweep/build/browser performance claim. Two scratch setup corrections are not findings: the JSON maximum is `overallLength.max.value`, and glTF names must be mapped through parser associations.

**Verification:** exact quote presence, six-finding cap, explicit grounding/target/risk/size/timing/proof and six executable check statuses are verified by `r9-2-verify.mjs`; its log also checks citations and clean worktree. No tracked report was written because the dispatch forbids repository edits. Remove the clean detached worktree after sending; recreate2817610 and install dependencies to rerun retained probes.

## Appendix — exact executable checks

The following sources are appended verbatim from the retained scratch files; their absolute/worktree imports are review harness paths, not proposed production dependencies.

### A1–A5 source

```js
import{test}from'node:test';import assert from'node:assert/strict';import{readFileSync}from'node:fs';import{resolve as path}from'node:path';
const root=path('.claude/worktrees/review-r9-2/gungen');
const {resolve}=await import(`${root}/src/core/resolve.ts`);
const {gunDomain}=await import(`${root}/src/gun/domain.ts`);
const {exportGunGlb}=await import(`${root}/src/gun/exportGlb.ts`);
const {triggerGuard}=await import(`${root}/src/gun/rules.ts`);
const {magazine}=await import(`${root}/src/gun/parts.ts`);
const {magazineCenterline}=await import(`${root}/src/gun/magazineCenterline.ts`);
const {loadDesignValue}=await import(`${root}/src/core/designLoader.ts`);
const {ar}=await import(`${root}/src/gun/templates.ts`);
const {AR_ACTION_LAYOUT}=await import(`${root}/src/gun/arLayout.ts`);
const {GUN_UNITS}=await import(`${root}/src/gun/units.ts`);
const fixture=name=>JSON.parse(readFileSync(`${root}/fixtures/${name}.json`,'utf8'));
test('A1 current AR axial estimate follows the source cartridge maxima',()=>{
 const c=JSON.parse(readFileSync(`${root}/cartridges/5.56x45.json`,'utf8'));
 const snap=mm=>Math.ceil(mm/(GUN_UNITS.metresPerUnit*1000)/GUN_UNITS.grid-1e-9)*GUN_UNITS.grid;
 assert.deepEqual(AR_ACTION_LAYOUT,{receiverLengthU:snap(3.2*c.overallLength.max.value),barrelExtensionLengthU:snap(.55*c.case.length.value),carrierFaceLengthU:snap(c.case.length.value)});
});
test('A2 proposed action role discovery survives consistent instance-ID rename',()=>{
 const a=fixture('archetype-ar');const asset={id:'review_ar',file:'assets/models/review-ar.glb'};
 const before=exportGunGlb(a,asset,{});assert.equal(before.ok,true);assert.ok(before.modelEntry.action);
 const b=structuredClone(a);b.parts.carrierRenamed=b.parts['bolt-carrier'];delete b.parts['bolt-carrier'];
 b.connections=b.connections.map(c=>({...c,from:c.from.replace(/^bolt-carrier\./,'carrierRenamed.'),to:c.to.replace(/^bolt-carrier\./,'carrierRenamed.')}));
 const after=exportGunGlb(b,asset,{});assert.equal(after.ok,true);assert.ok(after.modelEntry.action,'geometry exports but action metadata must not silently disappear');
});
test('A3 proposed magazine semantic path is invariant under cyclic CCW profile representation',()=>{
 const def=magazine.build({length:'L',profile:'ak-curved',orientation:'straight',variant:'akm'});
 const solids=def.displaySolids??def.solids;const before=magazineCenterline(solids);assert.ok(before);
 const after=magazineCenterline(solids.map(s=>s.kind==='extruded-polygon'?{...s,profile:[...s.profile.slice(1),s.profile[0]]}:s));
 assert.deepEqual(after,before);
});
test('A4 proposed guard constraint accepts the identical occupied volume represented as convex extrusions',()=>{
 const resolved=resolve(fixture('archetype-pistol'),gunDomain);assert.deepEqual(triggerGuard.check(resolved),[]);
 const defs=new Map([...resolved.defs].map(([id,d])=>[id,{...d,solids:d.solids.map(s=>{
  if(s.kind!=='box'||!s.id.startsWith('trigger-guard-'))return s;
  const {center:c,half:h}=s.box,x0=c[0]-h[0],x1=c[0]+h[0],y0=c[1]-h[1],y1=c[1]+h[1];
  return{id:s.id,kind:'extruded-polygon',profile:[[x0,y0],[x1,y0],[x1,y1],[x0,y1]],z:[c[2]-h[2],c[2]+h[2]],axis:'z'};
 })}]));
 assert.deepEqual(triggerGuard.check({...resolved,defs}),[]);
});
test('A5 proposed loader evaluation builds each direct part only once',()=>{
 const assembly=fixture('archetype-ar');let builds=0;
 const family=gunDomain.families.receiver;
 const domain={...gunDomain,families:{...gunDomain.families,receiver:{...family,build(params){builds++;return family.build(params);}}}};
 const result=loadDesignValue({format:1,template:'ar',assembly,locks:{params:{},optionalParts:[]},status:'draft'},{domain,template:ar,prefabs:[]});
 assert.equal(result.ok,true);console.log('loader receiver builds:',builds);
 assert.equal(builds,Object.values(assembly.parts).filter(p=>p.family==='receiver').length);
});
```

### A6 source and Vitest configuration

```ts
import {readFileSync} from 'node:fs';
import {expect,it} from '../../.claude/worktrees/review-r9-2/gungen/node_modules/vitest/dist/index.js';
import {exportGunGlb} from '../../.claude/worktrees/review-r9-2/gungen/src/gun/exportGlb.ts';
import {buildRegistry} from '../../.claude/worktrees/review-r9-2/deadvox/src/core/content.ts';
import {prepareModel} from '../../.claude/worktrees/review-r9-2/deadvox/src/render/models.ts';
import {GLTFLoader} from '../../.claude/worktrees/review-r9-2/deadvox/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
it('A6 current AR export is accepted by actual Deadvox registry and held/ground preparation with action node present',async()=>{
 const assembly=JSON.parse(readFileSync('fixtures/archetype-ar.json','utf8'));
 const result=exportGunGlb(assembly,{id:'review_ar',file:'assets/models/review-ar.glb'},{});
 expect(result.ok).toBe(true);if(!result.ok)throw Error(result.error.message);
 const {registry,issues}=buildRegistry([{source:'review/models.json',data:{models:[result.modelEntry]}}]);
 expect(issues).toEqual([]);const def=registry.models.get('review_ar');expect(def).toBeDefined();
 const gltf=await new GLTFLoader().parseAsync(result.glb.slice().buffer,'');
 const prepared=prepareModel(def!,gltf.scene);
 expect(prepared.groundParts.length).toBeGreaterThan(0);
 expect(prepared.held.children.length).toBeGreaterThan(0);
 for(const action of Object.values(result.modelEntry.action!.parts)){
  const index=gltf.parser.json.nodes.findIndex((node:{name?:string})=>node.name===action.node);
  expect(index).toBeGreaterThanOrEqual(0);
  const object=[...gltf.parser.associations].find(([,association])=>association.nodes===index)?.[0];
  expect(object).toBeDefined();
  console.log('action GLTF node / actual Three object name',action.node,object!.name);
 }
});
```

```js
export default {test:{include:['/home/jani/devel/skelly/.agent-mail/scratch/r9-2-handoff.test.mts'],maxWorkers:1}};
```
