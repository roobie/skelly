# r9-1 — Deadvox consolidation survey

**Read-only base: `2817610` (2026-10-03).** Eight ranked, independently refutation-tested proposals. No production edits, commits or pushes. All citations refer to that exact commit. Production module shorthand (`core/`, `game/`, `ui/`, `render/`, `debug/`) is under `deadvox/src/`; other paths are relative to `deadvox/`. Published from the reviewer's scratch report into `docs/reviews` on 2026-10-03. The executable checks it names are reproduced in Appendix A.

**Do first: F1 reach/options → F3 item ownership/state → F2 compressed long actions.** Fold them into 2.1, preparation for 2.4, and 2.4 respectively rather than imposing a separate architectural rewrite before Slice 2. F3's concrete quickbar defect merits its own small fix, not waiting for that refactor (already reported; lead dispatched d22).

## 0. Inputs, history and next-change traces

| Input | Value and source |
|---|---|
| Lifespan | **DERIVED: will evolve**, therefore refactoring plus knowledge review. `SLICE-2.md:3`: “The second slice on the [road to version 1](EPIC.md).” Nothing calls the existing simulation disposable. |
| Next changes | **DERIVED from approved plan:** reach/options (2.1); recipe/skill content and reachability (2.2–2.3); compressed resumable craft/read/repair/disassembly (2.4–2.7); wear and made lights (2.6/2.9). `SLICE-2.md:19–22`: “reading run in compressed time and can be interrupted and resumed. Crafting and disassembly keep their inputs and progress in a work item; repair and reading keep their target item and progress under the long-action contract (2.4).” |
| Boundaries | **Given:** Deadvox first, gungen/mobgen later; no cross-project consolidation framework. **Observed:** pure `@mobgen` geometry reuse is now intentional and guarded by `test/mobgenBoundary.test.ts`; the older review's blanket sibling-independence observation is no longer literally true. Browser persistence/rendering stay outside pure core; save fingerprint boundaries are explicit contracts, not directory aesthetics. |
| Main maintainer | **Given: BR and coding agents.** This dispatch, AGENTS.md, and the plan's BR approval establish that. No guess from commit authors required. |
| Compatibility | **Given:** none owed; maintainability can justify deliberate visual/test/save churn. Changing a source fingerprint is acceptable. Do not preserve obsolete save formats or freeze inefficient designs merely to retain snapshots. |

### History before code appearance

Audit: `.agent-mail/scratch/r9-1-audit.mjs` and `.json`. Non-merge source touch counts through the fixed base, excluding assets/docs/snapshots/lockfiles and the actual repo-wide Biome commit `2273e55`: `play.ts`93, `zombies.ts`36, debug index33, style28, schema25, saveFormat15, session13, content11. This project history is approximately eight days, so these mostly measure construction, **not demonstrated long-term maintenance expense**. Planned changes carry more weight than counts.

Concrete feature/follow-up evidence, rather than assuming that neighboring merges caused one another:
- Session extraction `df2e8c3` / #71 removed parallel game/test simulation wiring; subsequent tests use the same `createSession`. This is a successful prior consolidation, not a new task.
- Menu-state extraction #80/#83 and stale-resume fixes centralized menu derivation. Later `49973dd` explicitly preserves menu input/autosave contracts. Retain the pure helper and browser behavior checks.
- Melee continuation `8e09544` needed `91cc84a` (“fix saved melee timing and hand pivots”) and `0e6edff` (“preserve melee click phase on restore”). State/timing ownership affects saves as well as animation.
- `7ae147f` (“separate presentation from primary-action fingerprint”) and `d01f8bc` (exclude side-button input helper) demonstrate recurring source-boundary repair, not a theoretical objection to a large file.
- `7151f57` (“Share shambler render and hit pose”) and `0da7e15` (move step smoothing into simulation pose) already addressed the old geometry divergence. Do not propose undoing that seam.

| Planned change trace | Files / invariant or silent break point |
|---|---|
| 2.1 reach/options | `game/session.ts`, `core/inventory.ts`, `core/blockEntities.ts`, `game/targets.ts`, `game/survival.ts`, `ui/inventoryScreen.ts`, `game/play.ts`. Displayed options must use the same admission policy as execution, but execution still revalidates after movement; searched furniture/container accessibility and units must survive. |
| 2.2–2.3 content | `core/schema.ts`, `core/content.ts`, `cli/validate.ts`, `core/hamlet.ts`, `core/site.ts`, `core/loot.ts`. A validated new section must enter the registry; reachable ingredients must come from actually placed template/loot paths, not any table that happens to exist. |
| 2.4–2.7 long work | `game/rest.ts`, `core/sim.ts`, `core/compression.ts`, `core/handling.ts`, `game/session.ts`, `core/items.ts`, `core/saveState.ts`, `core/saveFormat.ts`, `game/play.ts`. One owner for progress and inputs; cancel/continue/restore cannot duplicate components or completion effects. |
| 2.6/2.9 wear/lights | `core/items.ts`, `core/lights.ts`, `game/survival.ts`, `game/primaryAction.ts`, `core/zombies.ts`, `game/play.ts`, `render/flashlight.ts`. Condition eligibility and per-contact wear agree; per-item burn state survives drop/load while render pools stay derived. Made-light zombie perception remains out of Slice 2. |

## A. Enforceable checks first

These are executable scratch Vitest tests, not production edits. **A1 protects an existing contract; A2/A3/A5 deliberately propose stronger future boundaries.** Their red status is not four current user-facing bugs. Exact test/config source is included in Appendix A; helper/runtime source remains under `r9-1-prior/`.

| Check | Today at2817610 | Specific behavior / why it earns a place |
|---|---|---|
| A1 quickbar UID after consuming bound beans | **FAIL**, `Missing quickbar item 63` | Real `Survival.use` → queue completion → inventory removal → session snapshot/restore. Existing integrity defect, not synthetic malformed input. Snapshot API reproduction, not an independently exercised browser save UI. |
| A2 light toggle invalidates state-sensitive options | **FAIL**, version1→1 | A proposed cache contract for 2.1/2.6. Current UI explicitly invalidates after use and flashlight rendering reads every frame; this does **not** demonstrate current stale rendering or broken structural reach. A separate scalar-state revision is also a valid future implementation; adapt the assertion to that chosen public contract. |
| A3 equal picker state, differing playback acceptance, equal simulation noise | **FAIL**, vocalNoiseId1 versus0 | Proposes one-way presentation admission. Today the boolean intentionally couples content/picker/bundle admission to simulation. This is not a claim that mute, suspended WebAudio, or later decode failure affects hearing. |
| A4 every schema section reaches the registry | **PASS** | Current base has entries in every section. A consumed source mutation removing only the `figures` merge makes it **FAIL**, so this detects silent section loss that schema validation alone misses. Future sections need a representative fixture. |
| A5 HUD wording leaves simulation fingerprint unchanged | **FAIL** | Actual fingerprint walker, actual Vite resolution, one consumed HUD-only edit (`fps   seed`→`FPS / seed`). Hash changes `7ad2d5…`→`b96016…`; establishes F7's seam, not permission to exclude gameplay wiring. |

Run from the recreated detached tree:
```sh
cd .claude/worktrees/review-r9-1/deadvox
npx vitest run --config ../../../../.agent-mail/scratch/r9-1-prior/vitest.config.mts \
  ../../../../.agent-mail/scratch/r9-1-prior/contracts.test.mts \
  ../../../../.agent-mail/scratch/r9-1-prior/fingerprint.test.mts
```
Expected current result: four failures/one pass, 2.81s. Logs: `r9-1-contracts-final.log`, `r9-1-section-mutation.log`. Do not land intentionally red future-contract tests before the corresponding refactor.

Existing focused baseline: **113 tests / 8 files PASS** (`importBoundary`, `coreIsPure`, `menuState`, `inventory`, `useItems`, `rest`, `content`, `simulationFingerprint`). No full suite/build/browser claim for this survey. Retain these guards rather than adding near-duplicate scanners or a lines-of-code ratchet. Additional per-finding acceptance tests below are proposed work, **not tests run by this survey**.

## Prior-survey disposition

### 2026-09-29 maintainability report

| Prior ID | Status at2817610 |
|---|---|
| A1 sibling boundary | **Implemented, policy evolved.** `importBoundary.test.ts` exists; `@mobgen` pure reuse has its own `mobgenBoundary.test.ts`. Do not reinstate a blanket ban on that approved edge. |
| A2 core purity | **Implemented.** `coreIsPure.test.ts` protects DOM/Three/Lit boundary. Keep it. |
| A3 zombie `model` validation | **No longer relevant:** current zombie schema no longer has that old `model` field. Not an unimplemented missing-figure bug. |
| A4 optional LOC ratchet | **Not adopted; not recommended here.** Structural behavior/boundary checks are more discriminating than length. |
| A5 existing guards | **Retained/evolved.** Fingerprint classification/exclusions, save exactness and sound-ID guards remain; inventory Lit port is now done, so its old exception is obsolete. |
| B1 presentation fingerprint | **Partly fixed:** menu-pointer extraction is done; HUD/render orchestration still shares `play.ts` with gameplay. Residual is F7, not another pointer extraction. |
| B2 parallel snapshot wiring | **Fixed** by production/test `createSession` (#71). Current persistence probe failures do not revive the old duplicate-wiring claim. |
| B3 menu state | **Fixed** by `ui/menuState.ts` and tests (#80/#83). Do not build another menu state machine. |
| B4 render-only hit geometry | **Fixed/superseded:** core region and posed-figure geometry now shared. Blocky `FIGURE_BOXES` is an intentional alternate presentation, not evidence to replace the shared mobgen hit pose. |
| B5 browser harness split | **Still partly open (not independently re-refuted this round):** `tools/ui-browser-contract.mjs` retains custom CDP/synthetic pointer behavior; `test/browser/firefox-first-click.mjs` uses real Playwright input. New save contracts are already browser-parameterized. Do not re-propose “unify all browser tests” without preserving real activation and the distinct scenarios. Lower priority than the eight ranked items. |

Prior C/D: the old AI20Hz, key bindings/pause, rest/spawning, asset location, saved-world status and fingerprint documentation are substantially corrected in current `DESIGN.md`, `PROJECT.md` and ADR0002. Old point-hit geometry/“Continue absent” facts are superseded. Blocks/metres, noise lifetime and snapshot-field obligations still matter; see C/D below. The 2026-09-29 report is a historical snapshot: its old line references should not be rewritten to pretend it reviewed today's code.

### Persistence material

`deep-review-deadvox-persistence.md` is a **brief/questions**, not a completed findings report. Replayed its supplied probes after adapting them to current `createSession` and schema5; originals untouched. `r9-1-prior.log`: 8 pass/3 fail (11 tests).

- Five crafted-save probes **pass by asserting unsafe acceptance**, not by proving safety: mismatched simulation/scheduler time; a lagging cursor causing >30,000 physics ticks in one frame; pockets on a noncontainer; missing bag pocket grids; an out-of-grid pile item. These gaps remain. The pocket cases motivate F3's registry-aware restore contract; the time/cursor cases need a focused persistence follow-up, not a new universal serializer. No claim these payloads arise through ordinary current gameplay.
- Walking differences are footstep cadence/picker state. With cadence-derived fields excluded, the walk control passes. ADR0002 explicitly permits player footstep/landing resets because their hearing is disabled; the old whole-state assertion alone cannot establish a current save bug. The zombie cadence check passed in its selected scenario.
- Sprint's held-input trace differs in body position/stamina at the winded threshold. Continue deliberately drops held input; the harness does not compare with an equivalent pause/release on the uninterrupted side. **Unresolved contract/control question**, not counted as a proven corruption finding. Match that control before filing a bug.
- Ten simulated hours accumulate maximum cursor drift `3.93e-7` and two coincident-order flips, first5162.950s. That identifies a scheduler ordering policy question, **not demonstrated save/load or cross-platform nondeterminism**. No wall-clock timer rewrite recommended.

## Scattered-concept inventory — consolidate policy, not every similar number

Complete named-symbol source hit list: `r9-1-concept-sites.txt` (66 definition/use hits). The table adds the non-name-equivalent policy sites; tests and observers are clients, not separate authorities.

| Concept | Sites and adjudication |
|---|---|
| Inventory reach/access/origin | `game/session.ts:59–61,201–210,276,474–488`; `core/inventory.ts:114–116,289–291,309–359,443–476,509–537`; `core/blockEntities.ts:281–303`; `game/play.ts:366–378`; `game/targets.ts:17–107`; `game/survival.ts:92–109,172–186`; `ui/inventoryScreen.ts:372–484,553–576,650–657`. **F1:** common inventory/action view and admission, not identical geometry. |
| Distances that must stay distinct | `game/play.ts:83,756–793` gaze/occlusion uses `USE_REACH`; `core/furniturePick.ts:66,92,151–159` picks actual visible cells/panels. `session.ts:203–208` is feet→pile block middle versus chest→nearest furniture AABB. Bed comfort (`session.ts:276`, `blockEntities.ts:298`) and posed melee contact are different questions. `game/firearmHandling.ts:136` finds spent-case piles within20m for its debug behavior, not player loot access. `render/hands.ts:182` is arm IK. None should become a generic “2m reach” call merely because they use distance. |
| Time | **Already canonical:** `core/clock.ts:23–34` owns calendar/ratio conversions; `core/sim.ts:83,146`, `game/survival.ts:215`, `game/play.ts:553`, `ui/saveController.ts:26` consume them. `core/scheduler.ts` owns tick cursors and `core/compression.ts` owns compressed advance. Rest completion/progress policy is the scattered part (F2), not duplicate clock arithmetic needing a new clock service. |
| Handling / long action | `core/handling.ts:48–59,107–109,152–164`; `game/rest.ts:11–106`; `core/sim.ts:43–45,81–86`; `game/session.ts:453–465`; `game/play.ts:527–612,640–643`; `game/doorAction.ts:25–47`; `game/survival.ts:48–71,92–146`; `game/targets.ts:17–107`. Tagged real-time queue already exists. Resumable compressed work requires F2, not persistence of every queued short action. |
| Item shape / lookup / ownership | `core/items.ts:8–88,114–151`; `core/inventory.ts:138–220,258–266,520–537,638–678`; `core/saveFormat.ts:231–268,953–985,1035–1077`; `game/quickbar.ts:7–34`; `game/survival.ts:55–80`; `core/handling.ts:192–224`. **F3:** shared traversal and reference integrity. `ui/inventoryScreen.ts:320,502–503,619,708,845–853` is a legitimate render-local lookup, not a second authoritative inventory. `core/blockEntities.ts:116` indexes a different entity domain. `game/playtestObserver.ts` merely consumes those APIs. |
| Condition / usable item | `core/items.ts:14,40,60,76,126–142,172–195`; `ui/inventoryScreen.ts:625,647`; `game/primaryAction.ts:28–64`; `game/play.ts:803–826`; `core/zombies.ts:1517–1619`. Today condition labels/stack equality exist, but future ruin eligibility is not yet a single capability rule. Fold it into F3/F6, not a UI-string predicate. |
| Light / “is lit” | `core/lights.ts:22–74,90`; `game/survival.ts:42–84,157–222`; `core/items.ts:16–24,61–63`; `core/saveState.ts:30,95`; `game/session.ts:325–326,513`; `render/flashlight.ts:114–130`; `game/play.ts:956,1094`; `core/zombies.ts:395–397,551`. **F5:** burn/state and projections. Player perception's daylight-or-flashlight `isLit` is not render illumination and must not acquire made-light sensing in Slice2. |
| Noise / sound | `game/session.ts:99–107,240–257,292–310,344–351,577–582`; `game/audio.ts:190–213,289–294`; `core/soundPicker.ts:87–103`; `game/audioPresentation.ts:11–45`; `game/doorAction.ts:25–47`; `core/zombies.ts:423–459,504–531,1088–1099,1544,1580,1608–1609`; `core/sim.ts:13–16`. **F4:** separate simulation admission from output playback. Continuous movement hearing, discrete vocal stimuli, audible effects and compression interrupts are not interchangeable “noise.” |
| Loot rolls / world source | **Already one algorithm:** `core/loot.ts:42–52`. `core/site.ts:74` uses position-keyed generation RNG; `game/session.ts:372` uses position-keyed death RNG. `game/worldSetup.ts:149` test-house furniture versus session column-generated site furniture is deliberate scenario wiring, not duplicate hamlet loot logic. 2.3 must trace placed templates/loot for reachability, not merge these seeds and reroll existing loot. |
| Content section metadata | `core/schema.ts:507–530`; `core/content.ts:50–80,146–155,199–251,389–407`; `cli/validate.ts:63–73`. **F8:** section keys/map setup/merge coverage; preserve special block IDs and model/sound origins. |

## B. Ranked proposals (eight)

### 1. TOP 3 — F1: One inventory reach snapshot and option contract
**ID:** `deadvox/src/game/session.ts#createSession/reach-policy`
```ts
  inventory.canReach = (pos) => pileDistance(pos) <= LOOT_REACH;
```
**Evidence:** `game/session.ts:209` and all reach/access sites in the inventory above; plan `SLICE-2.md:203–234` explicitly replaces `LOOT_REACH`, `pilesNear`, `containersNear`, `Survival.findBattery`, and absorbs current item move/use options. This is a planned-change finding, not proof that every distance call is duplicated incorrectly.

**Target (3 lines):** A pure core `reach()` produces the accessible item/container view, with documented origin, units and searched/visibility policy. Core `options()` derives action availability from that view and item state; UI renders options rather than independently deciding eligibility. Commands revalidate against the same policy at completion; a cached option is never authorization.

**Payoff/timing/size:** **M; fold into2.1**, before planner2.4/workbench2.8. Removes four policy lookups and two layers of option decisions; gives crafting a reliable accessible-material snapshot.

**Risk / saves / fingerprint:** Preserve feet/block-middle versus chest/nearest-box geometry; do not turn gaze/LOS or bed quality into inventory proximity. Position, topology and search status must invalidate reach; F3 supplies state-sensitive option invalidation. No reason to save a derived query/cache, but changed fingerprinted module paths/source deliberately create a new identity. Battery search expansion beyond carried items is an explicit policy decision, not incidental refactor behavior.

**Proof / deliberate changes:** Keep `inventory`, `targets`, `blockEntities`, `useItems` behavior tests; add a focused boundary case for nearest furniture cell versus pile centre, nested searched contents, and moving out of reach between option display and completion. Specify the battery policy. Avoid a full Cartesian distance sweep.

**Refutation: NARROWED.** Inventory moves already enforce reach centrally in `Inventory.plan`/`reachable`; UI move options consume that check. Consolidate snapshot/option policy around it, not another move validator.

### 2. TOP 3 — F3: Item tree, mutations and external UID references share a domain boundary
**ID:** `deadvox/src/core/items.ts#Item/state-contract`
```ts
export interface ItemState {
```
**Evidence:** `core/items.ts:36` and item sites above; `game/survival.ts:143–146` consumes, `core/inventory.ts:638–648` removes/version-bumps, `game/quickbar.ts:10–22` saves unpruned references then throws on restore; session snapshot at `game/session.ts:597`. A1 demonstrates the real dangling quickbar UID. 2.4 introduces component-owning work items; 2.6 adds frequent condition mutation.

**Target (3 lines):** Keep inventory as owner of structural edits; introduce a shared item-tree visitor/location contract reused by runtime and save reference checks. Make removal/reference cleanup and scalar-state invalidation explicit domain operations, while sharing the bounded live/saved item field definition where that removes drift. Validate restored pocket topology against the registry before exposing it to runtime; keep canonical serialization as a separate wire concern.

**Payoff/timing/size:** **M overall, split:** dangling quickbar fix **S standalone now** (d22); tree/reference contract before or within2.4; state-sensitive invalidation during2.1/2.6. Makes work-item escrow, burn/wear, lookup and restore agree about which objects exist.

**Risk / saves / fingerprint:** Structural mutation/versioning already works. Do not replace it with an event bus/DB or add an authoritative UID cache without measured need. UI maps may remain render-local. Work-item ownership changes schema; source extraction changes fingerprint. Preserve UID monotonicity, stack/split behavior, signed-zero/exact-field save guarantees; no legacy migration path. Proposed scalar revision need not reuse the topology counter.

**Proof / deliberate changes:** A1 existing defect, A2 future contract, crafted pocket probes. Retain inventory transfer/split/consume and snapshot tests; add one work-item tree ownership/restore case when work items exist. Saving after bound-item consumption must work without mutating the live session merely to manufacture a valid snapshot. Registry-aware rejection deliberately narrows malformed-input acceptance.

**Refutation: NARROWED; quickbar supplement STANDS.** Multiple walkers and pocket-shape gaps are real. Structural edits are already centralized/versioned; scalar light changes are not evidence of broken structural reach or current stale UI.

### 3. TOP 3 — F2: Generalize rest into the bounded compressed long-action owner
**ID:** `deadvox/src/game/rest.ts#RestController/long-action`
```ts
    this.action = { kind, label: REST_LABEL[kind], rate, startFatigue: this.sim.needs.fatigue };
```
**Evidence:** `game/rest.ts:67`; `game/rest.ts:11–106`, `core/sim.ts:43–45,81–86`, `game/session.ts:222–224,268–281,453–465,572–580`, `game/play.ts:329–348,527–612,640–643`, `core/handling.ts:48–59,107–109,152–164`, `core/saveState.ts:29–33,94–98`, `core/saveFormat.ts:276–286,856–858`. Plan2.4 explicitly moves rest/sleep and resumable work onto one contract.

**Target (3 lines):** Core tagged long-action state owns progress, interruption/continue/cancel and exact-once completion; domain handlers implement rest/craft/read/repair/disassembly effects. Reuse Scheduler and Compression, with UI labels/rendering as projections. Work-item component ownership and retained repair/read target references follow F3, rather than closures or another per-feature controller.

**Payoff/timing/size:** **L; fold into2.4**, before2.5–2.7. One continuation/save contract and UI interruption path instead of repeated implementations for each kind of compressed work.

**Risk / saves / fingerprint:** Ordinary HandlingQueue is already tagged, real-time, skipped during compression and intentionally canceled in the saved copy. Do not simply persist every job or force every short action into the new owner. Rest fatigue hooks/auto-stop and compression danger checks must remain ordered. New saved union/progress/ownership fields change schema/fingerprint deliberately.

**Proof / deliberate changes:** Existing `rest`, `handling`, `compression`, session snapshot tests; add interrupt→save→restore→continue with exact-once consumption/output, plus cancel returning components once. Different rest/craft completion predicates are intentional; save omission of short handling remains until separately changed.

**Refutation: NARROWED.** “No generic tagged action mechanism exists” was false. The required distinction is compressed, resumable work; the approved plan supplies that need.

### 4. F7: Extract view/HUD/render lifecycle, not all of `play.ts`
**ID:** `deadvox/src/game/play.ts#startPlay/presentation-fingerprint`
```ts
  const hudText = (looking: string): string => {
```
**Evidence:** `game/play.ts:965`, HUD/prompt `965–1005`, render handling `1013–1095`, frame wiring `1136–1235`, disposal wiring `267–269`; `tools/simulationFingerprint.ts:42–57,60–99,360`; `test/debugIsolation.test.ts:66–68`. A5 and follow-ups `7ae147f`/`d01f8bc` establish actual boundary cost. Upcoming crafting panel/light output touches this closure again.

**Target (3 lines):** Move read-only HUD/view-model construction and presentation lifecycle into explicit renderer/UI modules excluded with a documented reason. Keep input sampling, action selection and simulation effects in the fingerprinted session/gameplay boundary. Replace exact render-source spellings in tests with observable routing/lifecycle tests while retaining fail-closed import/fingerprint guards.

**Payoff/timing/size:** **M; standalone before2.4 panel/2.9 lighting**, or a tightly scoped preparatory commit in those milestones. Reduces large-closure coupling and makes cosmetic work independent of simulation identity; not motivated by preserving old saves at any cost.

**Risk / saves / fingerprint:** Extraction itself changes identity. `play.ts` still chooses gameplay effects; blanket exclusion would silently accept incompatible saves. Disposal implementation under excluded `render/` is already safe; only wiring co-located in `play.ts` contaminates the hash. Do not redo the successful menuPointer/menuState/session extractions or overlap incoming d18 audio presentation work.

**Proof / deliberate changes:** A5 turns green only after the specific HUD source moves; a gameplay-constant mutation must still change hash. Retain menu/primary-action browser contracts and disposal checks. Document changed source-test expectations instead of preserving old spellings as a compatibility layer.

**Refutation: NARROWED.** Some action orchestration is already extracted; renderer disposal edits do not all change identity. The remaining seam is precise, not a mandate to split every large function.

### 5. F4: Simulation owns admitted sound/noise; playback is one-way
**ID:** `deadvox/src/game/session.ts#playPlayerSound/sound-noise-boundary`
```ts
    if (!playWorldSound(event, position, time, { emittedAsNoise })) {
```
**Evidence:** `game/session.ts:244`, plus sound/noise inventory above; adapter wiring `game/play.ts:130–135,174–178`; sound definitions `src/content/base/sounds.json:32–43,236–268,348–375`. `SessionAudio.play` explicitly says its boolean gates noise. 2.12's positional-sound scenario gate will need a clear emission contract.

**Target (3 lines):** Decide admission, seeded variant/cooldown and hearing stimulus in the simulation-owned path once. Emit the resulting event to a one-way playback adapter that cannot undo simulation admission because an asset is unavailable. Keep acoustic categories/positions and separate continuous movement hearing explicit rather than promoting every audible effect into a noise stimulus.

**Payoff/timing/size:** **M; fold into or precede2.12**, coordinated with incoming audio work. Tests can assert a simulation emission and its positional presentation independently; fewer fingerprint exceptions need to encode output-device details.

**Risk / saves / fingerprint:** Preserve SoundPicker RNG/cooldown/lastVariant state and event ordering. Moving admission or changing missing-asset behavior deliberately changes the simulation fingerprint. Present code returns false for missing definitions/no pick/unbundled files; locked/unavailable context and later decode failures still return/admit true. Doors/melee/footsteps are currently content noise-disabled; movement hearing is separate. 2.12 is not blanket approval to change these gameplay policies.

**Proof / deliberate changes:** A3 proposed invariant; retain soundPicker/noise/perception tests. Scenario asserts one admitted event yields one correctly positioned adapter call; output-disabled control keeps the same simulation state. Explicitly approve missing-asset admission semantics. Do not assert that40 overlapping source starts imply40 audible attacks.

**Refutation: NARROWED.** The problem is synchronous content/picker/bundle coupling for noise-enabled player events, not general WebAudio success or all sound categories.

### 6. F5: Per-item burn state with derived light projections
**ID:** `deadvox/src/game/survival.ts#lit/active-light-ownership`
```ts
  lit: Item | undefined;
```
**Evidence:** `game/survival.ts:43` and light inventory above; `SLICE-2.md:427–463` changes held-only lighting, introduces carried/dropped made lights, persists lit/burn fields and explicitly excludes their zombie sensing.

**Target (3 lines):** Establish one per-item lit/burn state and a domain enumeration for sources that continue consuming fuel while carried/dropped. Derive the held flashlight pointer and renderer light pool from item/ownership state, or explicitly validate that pointer as an index—not a second independent truth. Keep beam optics, point-light rendering and the existing player-flashlight perception rule separate.

**Payoff/timing/size:** **M (larger with the feature); fold into2.9**, after F3's ownership/state boundary. Avoids copying `Survival.lit` into a second made-light controller/list with diverging save rules.

**Risk / saves / fingerprint:** Current single handheld flashlight and switching the previous one off are deliberate Slice1 policy, not bugs. Item `on` and saved `lightUid` currently coexist; define the invariant before expanding it. New burn representation changes schema/fingerprint; render pool capacity stays presentation state. Do not accidentally implement made-light zombie sensing or fire spreading.

**Proof / deliberate changes:** Existing lights/useItems and save tests preserve flashlight swap/off-on-put-away semantics unless explicitly changed. Add one burning-light drop/save/load case and fuel-exhaustion invariant; assert renderer removal does not extinguish a simulation source. Keep perception scope unchanged. Specify extinguish/relight rules from the plan.

**Refutation: NARROWED.** No claim of currently supported multiple dropped burning lights or one universal `isLit` field for every consumer.

### 7. F6: Player combat continuation separate from zombie AI, coherent capability selection
**ID:** `deadvox/src/core/zombies.ts#ZombieSystem/player-combat-ownership`
```ts
  private meleeAction: MeleeActionState | null = null;
```
**Evidence:** `core/zombies.ts:567`, player cooldown/state `563–568,609–645`, restore/hand validation `744–805`, tick `1432–1437`, selection/contact/damage `1496–1619`; `game/primaryAction.ts:28–64`, `game/play.ts:797–855,1079–1094`, `game/melee.ts:14–31`, `core/saveFormat.ts:96–103`. History `91cc84a`/`0e6edff` and planned per-hit wear2.6 make this more than a file-size preference.

**Target (3 lines):** Put player melee continuation/timing and held-item/aim snapshot ownership in a small core player-combat module. Give capability selection and weapon/profile/hand mapping a coherent result consumed by action start; zombie system supplies hit queries/damage, not player action ownership. Reuse existing `core/meleePose` and posed region geometry.

**Payoff/timing/size:** **M–L; fold into2.6** rather than block2.1. One place for ruined-item eligibility, contact-time wear and continuation cancellation. Does not require rewriting zombie AI or rebuilding the shared pose system.

**Risk / saves / fingerprint:** Existing `primaryAction` dispatch and `meleeSelection` are different stages, not identical duplicate functions. Preserve fist alternation, hand-UID cancellation, exact contact moment, cooldown/stamina on misses and mid-swing restore. Moving state changes schema location/fingerprint; no compatibility adapters. Avoid deriving “ruined” from display text.

**Proof / deliberate changes:** `meleeAction`, `primaryAction`, posed reach/hit tests and mid-swing snapshot tests remain. Add condition0 eligibility and exact-once wear on authoritative contact. Legacy immediate `ZombieSystem.swing` has many test callers but no production caller found; migrate geometric callers to the shared resolver only if their damage/region coverage remains, and retain action-level tests for timing/costs. It is not dead code safe to delete blindly.

**Refutation: NARROWED.** Shared pose geometry and stamina wrapper already exist. Extract ownership/selection, not every combat function.

### 8. F8: Exhaustive local content-section metadata
**ID:** `deadvox/src/core/content.ts#SECTIONS/parallel-content-tables`
```ts
const SECTIONS: readonly ContentSection[] = [
```
**Evidence:** `core/content.ts:70`; all section sites above. `ContentSection = keyof ContentFile` constrains names but `readonly ContentSection[]` does not enforce exhaustiveness. A4 proves current parity and detects a removed merge. Recipes/skills2.2/2.5 add real sections; future omissions could validate then silently disappear.

**Target (3 lines):** Derive section keys and ordinary registry-map initialization/merge from one local schema/descriptor boundary, with a compile-time exhaustive mapping. Keep block numeric-ID/AIR handling explicit and preserve model/sound origin tables. Use Valibot inference and native maps—not a new content/schema DSL.

**Payoff/timing/size:** **S–M; fold into2.2**, carry through2.5. Adding a section should not require remembering schema, diagnostic iteration, map constructor and merger independently; keeps2.3 validation trustworthy.

**Risk / saves / fingerprint:** Every current section already merges correctly. Qualities are item subfields, workstations furniture components; don't promote them into top-level sections just to justify the abstraction. Preserve ordered override/conflict diagnostics and block runtime mapping. Source hash changes; base-content identity must remain canonical. No general save-codec rewrite bundled here.

**Proof / deliberate changes:** A4 and its figures-merge mutation; retain content/validateCli tests for duplicate IDs, references, reserved air and origin tracking. New recipe/skill fixture must survive validation and registry lookup. No promised byte-identical exported representation needed.

**Refutation: NARROWED.** Future top-level section drift is the finding; no present unmerged section or universal-map claim remains.

## C. Knowledge at risk / deliberate non-findings

- **No-compat policy versus comments:** `core/zombies.ts:182,186` says “optional for backward-compatible saves”; AGENTS.md says “We owe no backwards compatibility”. Correct the rationale when touching these fields, but do **not** erase all optional behavior: `hitFlinchTime = undefined` actually means an inactive animation (`zombies.ts:1074–1076`, `zombiePose.ts:195`), and stance has live initialization/default behavior (`zombies.ts:1380`, `zombiePose.ts:171`). No standalone compatibility framework removal justified by a comment alone.
- **Condition label versus future rule:** `core/items.ts:182` labels every value below0.1 “ruined”; `SLICE-2.md:378` says “A ruined item (condition 0) stays an item.” Align wording and capability at2.6. Today this is a future contract decision, not proof current attacks violate an already-implemented wear system.
- **Handheld light scope:** current Survival header says only a light in the hands shines and put-away lights go off; plan2.9 deliberately changes the rule for made lights. Document that as a scoped feature transition, not a cleanup regression.
- **Audio scope:** current content explicitly disables noise for doors/melee/footsteps while long-term DESIGN discusses their noise. 2.12 needs an emission matrix and an explicit policy decision, not a test that silently makes every acoustic effect a hearing stimulus.
- **Stale live line link:** `SLICE-2.md:86` points to `src/core/zombies.ts:396` for `isLit`; it happens to be correct at this base. Many prior-review links point into the old snapshot. Prefer symbol links in living plans; don't report historically correct citations as present bugs. This survey found no additional verified stale live line-reference requiring a new ranked task.
- **Already solved:** central clock conversions, one loot-roll algorithm, shared posed hit/render geometry, pure menu state, production/test session wiring. More modules or shared frameworks would not improve these merely because multiple consumers exist.

## D. Fresh-context agent pitfalls

1. Flatten all “reach” into one scalar and change LOS, chest/feet origin or debug case collection. Prevent with F1's policy distinctions and the named-symbol inventory.
2. Treat `inventory.version` as covering every scalar item field today. It covers structural mutations; current UI has explicit use invalidation. Define the future options-cache revision contract before caching.
3. Persist all HandlingQueue jobs to implement2.4. ADR0002 and `saveFormat.ts:856` deliberately reject that; long compressed work needs its own bounded saved contract.
4. Exclude `play.ts` or `audio.ts` wholesale to make a fingerprint test green. A5 is solved by extraction; A3 needs admission ownership first. Gameplay must remain hashed.
5. Rewrite the save validator using content-schema convenience and lose exact-field/finite-number/canonical encoding guarantees. Reuse representation/traversal where justified, not blindly one validator for all purposes.
6. Delete `swing` or optional pose fields because comments say “legacy/compat”. Existing geometry tests and inactive-state semantics are real; preserve their behavior through a deliberate replacement.
7. Take crafted-save “PASS” as proof validation is safe, or a reset-sensitive old timeline failure as proven corruption. Read assertions and ADR exceptions; use the controls documented above.
8. Duplicate the quickbar bug work or incoming audio refactor. d22 and d18 are coordination inputs after the fixed base; this report neither assumes them merged nor reviews their changes.

## E. Method notes, refutation and verification

- All eight B claims went to separate read-only `pi` reviewers with **only ID, quote and claim**, not my rationale. `r9-1-refute-F1.txt` through `F8.txt`: all **NARROWED**. Corrections are incorporated above. Supplemental quickbar ownership-chain refutation `F3b`: **STANDS**. No refuted broad claim is retained as if it had stood unchanged. No unrefuted extra ranked candidates were needed to reach an arbitrary quota.
- Independent refutation mattered: the initial wording overgeneralized distance policy, overlooked existing tagged handling/structural mutation, conflated audio adapter failures, and treated current flashlight limits as accidental. Evidence constrained the design, rather than eight agreeable votes blessing it.
- Young-project churn and old review prose can mislead. Explicitly excluded the actual Biome adoption commit, not every commit mentioning “format” (which would wrongly remove save-format development). Old persistence material was a brief with probes, not an authoritative findings list.
- **Inner-platform check:** native wall timers/promises cannot provide deterministic compressed simulation progress and snapshot continuation; a small long-action domain contract is justified, using the existing Scheduler/Compression rather than a second workflow engine. Native Maps and current inventory APIs suffice for lookup; no custom DB/event bus. Existing Valibot/schema inference suffices for content descriptors; no universal schema platform.
- Full source quotes and focused tests are evidence; broader future acceptance lists are explicitly not claimed as executed. No sanitizers/fuzzing/browser/full-suite run belongs to this proposal-only survey's result.
- Final mechanical verification: eight quoted first lines checked verbatim against fixed-base files; eight B entries each grounded in history or the traced Slice2 changes; all five A checks have executable code and current status; detached checkout clean. The scratch report and probes are the only new artifacts. Verification script/log: `r9-1-verify.mjs` / `r9-1-verify.log`.

## Appendix A — exact executable proposal checks

The following blocks are copied from the executed scratch files, not pseudocode. They use the retained `r9-1-prior/harness.mts` (production `createSession`, deterministic content/terrain) and absolute/relative paths for the detached review checkout. Recreate that checkout at2817610 and install Deadvox dependencies before rerunning after cleanup. All evidence lives outside the worktree.

<!-- exact-scratch-code -->

### `r9-1-prior/contracts.test.mts`

```ts
import {describe,it,expect} from 'vitest';
import {createRuntime,capture,registry} from './harness.mts';
import {ContentFileSchema} from '../../../.claude/worktrees/review-r9-1/deadvox/src/core/schema.ts';
import {buildRegistry} from '../../../.claude/worktrees/review-r9-1/deadvox/src/core/content.ts';
import {Inventory} from '../../../.claude/worktrees/review-r9-1/deadvox/src/core/inventory.ts';
import {HandlingQueue} from '../../../.claude/worktrees/review-r9-1/deadvox/src/core/handling.ts';
import {Simulation} from '../../../.claude/worktrees/review-r9-1/deadvox/src/core/sim.ts';
import {Survival} from '../../../.claude/worktrees/review-r9-1/deadvox/src/game/survival.ts';
import {readFileSync,readdirSync} from 'node:fs';
const base='/home/jani/devel/skelly/.claude/worktrees/review-r9-1/deadvox/src/content/base';
describe('r9 proposal executable checks',()=>{
 it('A1 persisted quickbar contains no dangling UID after consuming its bound item',()=>{
  const r=createRuntime(), inv=r.session.inventory;
  const item=inv.create('canned_beans');expect(inv.add(item,{kind:'hand',side:'right'})).toBe(true);
  r.session.quickbar.assign(0,item);expect(r.session.survival.use(item)).toBeUndefined();
  r.session.queue.tick(3.1);expect(inv.itemByUid(item.uid)).toBeUndefined();
  expect(()=>createRuntime(capture(r))).not.toThrow();
 });
 it('A2 toggling a light invalidates inventory-dependent options',()=>{
  const inv=new Inventory(registry),sim=new Simulation({seed:1});
  const survival=new Survival(sim,inv,new HandlingQueue(inv),{feet:()=>({kind:'pile',pos:[0,0,0]}),notice:()=>{}});
  const lamp=inv.create('flashlight');expect(inv.add(lamp,{kind:'hand',side:'left'})).toBe(true);
  const version=inv.version;expect(survival.use(lamp)).toBeUndefined();expect(lamp.on).toBe(true);
  expect(inv.version).toBeGreaterThan(version);
 });
 it('A3 playback adapter rejection cannot change admitted player noise',()=>{
  const a=createRuntime(undefined,{playbackAccept:true}),b=createRuntime(undefined,{playbackAccept:false});
  a.session.playPlayerSound('player_strain',5);b.session.playPlayerSound('player_strain',5);
  expect(a.audioPicker.snapshotState()).toEqual(b.audioPicker.snapshotState());
  expect(a.session.playerAudio).toEqual(b.session.playerAudio);
 });
 it('A4 each schema section survives runtime registry merging',()=>{
  const sources=readdirSync(base).filter(n=>n.endsWith('.json')).sort().map(n=>({source:n,data:JSON.parse(readFileSync(`${base}/${n}`,'utf8'))}));
  const {registry:r,issues}=buildRegistry(sources);expect(issues).toEqual([]);
  for(const key of Object.keys(ContentFileSchema.entries)){
   const incoming=sources.flatMap(s=>s.data[key]??[]);expect(incoming.length,`${key} needs a fixture`).toBeGreaterThan(0);
   const ids=new Set(incoming.map(d=>d.id));const actual=key==='blocks'?new Set(r.blocks.map(b=>b.id)):new Set(r[key].keys());
   expect([...ids].every(id=>actual.has(id)),key).toBe(true);
  }
 });
});

```

### `r9-1-prior/fingerprint.test.mts`

```ts
import {it,expect} from 'vitest';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {resolveConfig} from 'vite';
import {fingerprintSimulationSources,SIMULATION_ENTRIES,SIMULATION_EXCLUSIONS} from '../../../.claude/worktrees/review-r9-1/deadvox/tools/simulationFingerprint.ts';
it('A5 presentation-only HUD wording leaves simulation fingerprint unchanged',async()=>{
 const root='/home/jani/devel/skelly/.claude/worktrees/review-r9-1/deadvox';
 const config=await resolveConfig({configFile:false,root,logLevel:'silent'},'build');const vr=config.createResolver();
 const host={resolve:(s,i)=>s.startsWith('@mobgen/')?Promise.resolve(resolve(root,'../mobgen/src',s.slice(8))):Promise.resolve(vr(s,i)),readFile:f=>readFile(f,'utf8')};
 const options={exclude:SIMULATION_EXCLUSIONS},file=resolve(root,'src/game/play.ts');
 const source=await host.readFile(file);const mutated=source.replace('fps   seed','FPS / seed');expect(mutated).not.toBe(source);
 const before=await fingerprintSimulationSources(SIMULATION_ENTRIES,root,host,options);let reads=0;
 const after=await fingerprintSimulationSources(SIMULATION_ENTRIES,root,{...host,readFile:f=>{if(f===file){reads++;return Promise.resolve(mutated);}return host.readFile(f);}},options);
 expect(reads).toBe(1);console.log('HUD mutation',before,after);expect(after).toBe(before);
});

```

### `r9-1-prior/vitest.config.mts`

```ts
import {defineConfig} from '/home/jani/devel/skelly/.claude/worktrees/review-r9-1/deadvox/node_modules/vitest/dist/config.js';
const root='/home/jani/devel/skelly/.claude/worktrees/review-r9-1';
export default defineConfig({root:root+'/deadvox',resolve:{alias:{'@mobgen/':root+'/mobgen/src/'}},test:{include:['/home/jani/devel/skelly/.agent-mail/scratch/r9-1-prior/**/*.test.mts'],maxWorkers:1,testTimeout:30000}});

```

### `r9-1-prior/mutation.config.mts`

```ts
import config from './vitest.config.mts';
export default {...config,plugins:[{name:'missing-section-control',enforce:'pre',transform(code,id){if(id.endsWith('/src/core/content.ts')){const anchor="      ['figures', registry.figures],";if(!code.includes(anchor))throw Error('Mutation anchor missing');console.log('MUTATION CONSUMED remove figures merge');return code.replace(anchor,'');}}}]};

```
