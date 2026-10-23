---
read_if:
  - you're planning or implementing Holding ground construction, electricity or fire
  - you're deciding Slice 5 scope, BR gates, technical spikes or play acceptance
  - you're integrating base appliances, door bashing or unattended simulation
  - you're implementing bear traps, data-driven events or the playtest wave
---

# Slice 5 — Holding ground

**Status: the power network core is built; construction, fire and exposure,
appliance controls and processes, and the integration proofs are open.** The wire
graph, its cache invalidation, saved identity, closed-form away-time balance and
refuelling exist; see `src/core/powerGraph.ts`, `PowerGraph`, and `src/core/power.ts`,
`PowerNetwork`. The bear trap is built (`INTERACTIONS.md`, "Traps"). No player
construction, placed-entity store, fire or smoke model, or appliance process exists in
`src/core`. The question from `EPIC.md`, "Slices", is: **Is a base worth building and
defending?**
This plan separates settled intent from choices that must precede dependent work.
The slice process is in `EPIC.md`, "How each slice runs".

## The smallest useful loop

The candidate loop is to claim a shelter, scavenge construction and electrical
supplies, improve its defences, connect useful appliances, and choose how much
light to expose at night. Leave it working, return to consequential resource use,
and decide whether to defend, repair or abandon it after a breach or fire.
The playtest is a scenario with a scripted wave after three elapsed scenario days,
so preparation and defence receive a deliberate pressure test. Data-driven event
rules author the wave; this does not select an authored shelter-and-supply route.
The day is a content tunable, not an engine constant. The value of staying must
compete with the cost of attracting attention, supplying machines and risking
stored goods.

## Scope and boundaries

The slice includes craft-placed walls, floors, doors, barricades and furniture;
locks and zombie door bashing, including the tier-2 brute's knockback; generators,
solar, batteries, wires, lights and appliances; and material burning, neighbouring spread,
smoke, light and molotovs. Lanterns, fixed lamps and window covering make lighting
a base decision. These are the scope in `EPIC.md`, "5. Holding ground", not an
exhaustive catalogue. The first palette is a bounded repair-and-fortify kit;
terrain blocks use cells and entities allow finer placement.

Construction is crafting that places blocks and block entities; taking it apart
is disassembly. Existing reach, escrow, completion revalidation and single item
ownership apply, rather than a parallel building inventory. See
`INTERACTIONS.md`, "Crafting", and `src/core/crafting.ts`, `planCraft`.
Appliances derive behaviour from components, not content identity. Player crafting
and appliance-owned processes stay distinct: a process runs without occupying
hands or requiring compression. See `INTERACTIONS.md`, "Appliances".

Electricity is a wire graph. Wiring changes invalidate connected components;
power ticks balance supply, storage and demand per network. Away-time calculation
is closed form, including fuel exhaustion and then empty storage. Solar depends on
time of day. Deficit allocation is not settled by that graph contract. See
`DESIGN.md`, "Base building and electricity".

Fire is shared world behaviour, not a molotov-only visual effect: material burn
rates, spread, smoke and light must also serve Slice 7's hot zombies. Slice 7 also
needs electricity for powered doors. This does not bring the lab roster or a
script language into Slice 5. Slice 4b's region simulation is the integration
prerequisite; an authored test room can prove a mechanism, not complete the slice.

Door forcing retains material/tool requirements and irreversible lock destruction.
Bashing needs actor and obstacle strength, not an inference from movement or the
brute silhouette. The authored brute shambler is not automatically the tier-2
brute; the tier-2 brute's door breaking and player knockback arrive together under
`DESIGN.md`, "Types are data". See `DESIGN.md`, "Base building and electricity", and
`src/core/zombies.ts`, `ZombieSystem.updateObstacleContact`.
Boarding already has directional opening semantics; player-built boarding must
not silently turn an inside-openable leaf into an immovable wall. See
`docs/aftermath.md`, "Door variants", and `src/core/blockEntities.ts`, `doorRefusal`.

### Related issues and admission

- **#107, traps:** admitted, starting with a bear trap, to give base defence a
  placed mechanical hazard. Broader alarm sets and heavy payloads are not required.
  Its handling and horizon rules below are bear-trap specific, not defaults for
  every future trap.
- **#276, heavy attacks and stagger:** charged player attacks are admitted to give
  deliberate attack commitment a place in defence; hit-induced shambler stagger is
  admitted so hits can interrupt an approaching threat. Neither is inferred from
  door strength or changes settled tier-2 brute knockback.
- **#313, scripted dynamic events:** data-driven trigger/condition/effect rules
  are admitted and author the required scenario wave. Reusable rules let authors
  express orchestration without a new code path for every scenario. This does not
  admit a script language; position-trigger permission remains a separate gate.

## Implementation rules and remaining gates

Settled rules below are not questions for BR. Each remaining question is a separate
decision within the named item. Options are alternatives, not recommendations.
Debt grades compare ongoing coupling and future replacement cost, not implementation
time; negative space says what remains
unbuilt. Unanswered gates block only their dependent work.

### Settled construction rules

- **Placement grain:** blocks use terrain cells; entities allow finer placement,
  so furnishings need not inherit structural coarseness. Occupancy consumers must
  agree; arbitrary structural geometry is outside this choice.
- **First build vocabulary:** use a bounded repair-and-fortify kit across the
  slice's categories, including walls and floors, so the defence loop can be proved
  without a general building catalogue.
- **Support:** persist authored support dependencies, so removal can resolve what
  depends on a structure rather than forgetting support after placement. Prove
  destructive cascades; physical stress simulation is not required.
- **Removal contents:** see `DESIGN.md`, "Edits persist".
- **Interrupted deconstruction:** the reservation is in `DESIGN.md`, "Edits persist".
  Keep resumable work and snapshotted yields under `INTERACTIONS.md`, "Crafting";
  cancellation releases ownership without producing the completion yield. Partial
  salvage is not implied.

### Settled breach rules — decision items #273 and #800

- **Strength and damage (#273):** minimum strength gates cumulative door damage,
  so insufficient actors cannot grind through every material merely by waiting.
  Every door must yield to sufficient strength; partial damage persists. Richer
  material deformation is outside this rule.
- **Player breach (#800):** repeated strikes share zombie bash resolution, so
  player and zombie force meet the same material/strength boundary. Charged
  attacks remain a separate admitted combat mechanism, not a prerequisite for
  ordinary strikes.

### Power and appliance ownership

Power policy reasons live with the power implementation, not in a second set of
Slice 5 cards, so allocation and catch-up cannot acquire conflicting authorities; see
`src/core/power.ts`, `PowerNetwork`. The integration proofs below use the policies that
implementation selects; this plan retains only the cross-system obligations.

### Settled fire and exposure rules

- **Fire grain:** burning is per cell, so material destruction, neighbouring spread
  and local exposure share a spatial boundary. Bound simulation work and lighting
  invalidation without changing that grain; fluid fire is not required.
- **Smoke effects:** smoke is a visual, sight-blocking field, so visible smoke has
  a sensory consequence rather than being decoration. Smoke inhalation levels are
  deferred to #1074; reconsider them when a shared body-effect model exists for
  fire and firearm discharge, avoiding a fire-only health shortcut. Transported
  harmful volumes and ventilation are not prerequisites for this slice.
- **Fire suppression:** include direct extinguishing, so players can act on a
  burning shelter rather than only remove fuel or retreat. Application resources
  and persistence need proof; detailed water/heat transport is not required.
- **Light stimulus:** sources visible through uncovered openings attract zombies,
  so covering windows changes exposure through an understandable source-visibility
  rule. Illuminated surfaces and diffuse glow recognition are outside this choice.
- **Light reach:** affect nearby and background actors only. Regional light
  effects are deferred to #1075; reconsider them when regional horde influence and
  its persistence enter scope, rather than expanding the base-light loop. Neither
  is admitted by this plan; local attention must not depend on rendering residency.

### Settled bear-trap rules — issue #107

Mechanism-based triggering remains settled by #107. These rules concern the bear
trap, not a general trap catalogue. Tunable durations, yields and injury values
belong to content under `PILLARS.md`, "Content forward compatibility" (repo root).

- **Trap awareness:** zombies do not deliberately recognise or avoid bear traps,
  so the first mechanical defence does not require trap-aware navigation.
- **Disarming time:** disarming is a non-resumable timed action, so making the
  trap safe requires an uninterrupted commitment. Interruption discards progress;
  another attempt starts its full content-defined duration, not the remaining time.
- **Disarming risk:** a valid disarm attempt never springs the bear trap, so safe
  handling does not introduce chance without a skill model. Revisit this rule when
  #107 gains a trap/device skill; that skill is not admitted by this plan.
- **Disarming tools:** bare hands are allowed, so the first bear trap does not
  require a specialised tool hunt. Revisit the requirement when #107's handling
  design expands to equipment-dependent traps; no tool gate is implied for this one.
- **Trap recovery:** recover a reusable bear trap, transferring it once through
  ordinary item ownership, so a safely recovered defence can be redeployed. This
  does not prescribe other traps' recovery: they may be salvage-only.
- **Self-trigger severity:** a player-triggered bear trap restrains and injures,
  so the owner's placement remains a physical hazard rather than a safe exception.
  Injury values are content-owned; lasting limb complications are not required.
- **Offscreen firing:** outside the near-player block, preserve armed state without
  resolving coarse contacts, avoiding a far-away trap encounter ledger. Far-away
  trap defence is therefore unmodelled. Revisit this rule when #107 expands to
  coarse unattended-defence encounters. Inside the block, simulate contacts whether
  loaded or not; rendering residency never decides firing. Follow
  `docs/decisions/0008-deterministic-world.md`, "Decision".

### Settled event and playtest rules

- **Event authoring (#313):** use data-driven trigger/condition/effect rules, so
  authors can compose events without scenario-specific engine branches. The wave
  uses elapsed scenario time and a persisted one-shot condition; firing records
  completion so save/load cannot duplicate the wave. A script language is not
  admitted. Position-trigger permission remains open below and does not block the
  elapsed-time wave.
- **Wave day:** ship the wave after three elapsed scenario days. The bounded
  preparation window suits the small playable content volume without making
  participants wait through days with little to do. Raise the content value as
  content growth warrants a longer preparation loop; this is author tuning, not
  automatic code-based scaling. Keep the day in scenario content under
  `PILLARS.md`, "Content forward compatibility" (repo root).

### Remaining event gate — issue #313

- **Position triggers.** Context: general event rules are admitted, but elapsed
  time does not require tracking where the player walks. Question: May authored
  event rules trigger on the player's entry into a defined area?
  A: exclude position triggers — low coupling debt; leaves location-driven events
  open while elapsed-time and explicit-interaction rules remain available.
  B: allow authored area-entry triggers — medium spatial-query, boundary and saved
  trigger-state debt; leaves arbitrary scripted spatial predicates and NPC-entry
  triggers open. Prove deterministic entry detection across save/load and horizon
  transitions before use. Neither option is recommended; this gate blocks only
  position-trigger implementation, not the scenario wave.

## Reviewable build order

These are work packages, not new work-item IDs. Every stateful package includes
validation, saves, replay evidence and reason-doc updates, not a later save retrofit.

1. **Readiness and decisions.** Run or explicitly reuse the slice-start consolidation
   surveys from `EPIC.md`, "How each slice runs"; give findings owners and revisit
   dates in the owning tracker. Close dependent gates and run the small spikes below.
   Done when the implementation briefs can distinguish settled rules from blocked
   choices and each performance claim has an owning benchmark.
2. **Power network core: built.** Topology, cache invalidation, saved identity,
   split/merge, deterministic restoration, closed-form balance, fuel exhaustion and
   solar by time of day exist; see `src/core/powerGraph.ts`, `PowerGraph`,
   `src/core/power.ts`, `PowerNetwork`, and `test/power.test.ts`. Graph mechanics stay
   separate from wire presentation and appliance content. Topology edits settle
   old-network time before reassignment so energy cannot be created by rewiring.
3. **Construction and persistent placement.** Extend crafting/disassembly to world
   destinations with cell blocks, finer entities and the repair-and-fortify kit.
   Prove support-graph cascades, occupied-placement refusal, empty-content checks,
   reservation through paused removal, completion-time revalidation and no duplicate
   inputs or outputs across save/load. Show doors, floors and a barricade in use,
   not only a ghost preview. BR approves placement and covering-window readability.
4. **Usable electricity and processes.** Join the power network to built instances
   and the selected appliance loop. Show fuel/charge ownership, connect/disconnect controls,
   blackout and restart under the selected deficit rule. Compare ordinary ticking
   with catch-up across daylight, fuel exhaustion, switching and rewiring. Save during
   an unattended process, leave, and return to the same consequence. BR checks that
   players can diagnose why a useful load is not working.
5. **Breach and defence.** Add persistent cumulative damage behind minimum-strength
   gates and repeated player strikes at the shared obstacle-contact boundary. Prove
   blocked actors cannot path through an intact leaf, a broken leaf invalidates obstruction,
   noise attracts through ordinary senses, and boarding keeps its directional
   contract. Show the tier-2 brute breaking doors and knocking the player back,
   including collision-safe displacement, rather than silently upgrading the cellar
   guard. Add #276 charged player attacks and hit-induced shambler stagger; prove
   charge interruption/save timing and hit-response timing separately from brute
   displacement. #107's bear trap is built; see `INTERACTIONS.md`, "Traps". BR
   approves breach, combat and trap readability.
6. **Fire, smoke and light.** Prove per-cell ignition and spread, material exhaustion,
   direct extinguishing, sight-blocking smoke, obstruction and light invalidation.
   Molotovs and wood cutting must enter the same fire owner; sufficient torch fuel
   remains a prerequisite, not a source of free ignition. Lanterns and powered fixed
   lamps expose light consistently to rendering and attention. Show a window cover
   changing source visibility through the opening. BR approves flame/smoke readability and
   what the player can do about a burning shelter.
7. **Event rules, scenario wave and region integration.** #313's rules and their
   one-shot state are in `DESIGN.md`, "Scenario events". The playtest scenario
   adopts the wave from `src/content/base/holding-wave.libsonnet`, `rule`, with its
   own arrival point. Cross the catch-up horizon with a working and
   a burning base. Prove canonical coarse outcomes, persisted damage, traps, processes
   and nearby/background light attention. Exercise preparation, the wave and recovery
   with charged attacks and stagger available; ordinary ambient attention remains
   active but is not the scenario's pressure substitute. Run cross-browser replay
   and the owning weak-GPU performance benchmarks, then the playtest and slice-exit consolidation/deep docs
   pass. Passing a debug fixture is not completion.

## State and technical proof

Persist construction edits, instance identity and owned contents, interrupted work,
partial door damage, wire endpoints, resource amounts, process progress and rate
boundaries, authoritative fire/smoke/attention state, trap armed/restraint/injury
state, charged-action and stagger timing, and event rules' authoritative one-shot
state. Disarm progress is not resumable after interruption.
Derived connected components, occupancy and rendered lighting are rebuilt from
truth, not independently editable saved totals. Extend `src/core/blockEntities.ts`,
`BlockEntityState`, and `src/core/saveState.ts`, `SaveSnapshot`, at their ownership
boundaries. Do not invent migration promises.

Unloaded is not synonymous with outside the simulation horizon. Follow
`docs/decisions/0008-deterministic-world.md`, "Decision": near-player catch-up must
agree with ticking within each declared system tolerance; outside that block the
coarse model is canonical and must be deterministic. Tolerances must be justified
before acceptance, not enlarged to excuse a failing comparison. Save and settle
at rate changes so refrigeration or a blackout cannot rewrite earlier time.

### Riskiest unknowns and smallest spikes

- **Coupled power/process catch-up:** use a tiny generator, battery, solar and load
  fixture with a mid-run rate change and wire split. Compare partitioned ticking,
  one catch-up and save/resume through depletion. Include the chosen deficit policy.
  `src/core/needs.ts`, `stepNeeds`, demonstrates boundary splitting;
  `src/core/food.ts`, `spoilage`, does not establish refrigeration history. Failure
  blocks appliance integration, not a relaxation of the deterministic contract.
- **Fire cost and light invalidation:** burn a small material boundary beside a
  doorway and then a connected larger surface, with smoke and lamps visible.
  Measure simulation work, mesh/lighting churn and GPU time separately against
  `CHALLENGES.md`, "Lighting", and `CHALLENGES.md`, "Half-metre blocks".
  Vary view/residency without changing simulation outcomes; reject a performance
  win that makes the room permanently dark. Failure blocks per-cell fire integration,
  not permission to switch grain without a decision.
- **Fire catch-up and cross-border spread:** replay the same seeded ignition across
  a region edge, varying load order and player horizon transitions. Test near
  agreement separately from far deterministic coarse results, including save/resume
  during spread. A failed spike blocks fire integration and sends any missing
  canonical coarse rule back to BR rather than using stream timing as an input.
- **Construction and breach occupancy:** place and remove a door beside a populated
  container and a moving actor. Check movement, picking, sight and light after each
  operation and restore. See `src/core/blockEntities.ts`, `BlockEntities`, and
  `src/core/prying.ts`, `pryPlan`. The smallest proof catches stale occupancy before
  a full building palette multiplies it.
- **Lit-base crowd readability:** compare the same room with open, covered and
  breached windows at night and in daylight. Observe both rendered exposure and
  zombie attention; neither can stand in for the other. See `src/core/lights.ts`,
  `lightSenseSourceFor`, and `src/render/skylight.ts`, `Skylight`. Existing consumable
  light depletion (`src/core/lights.ts`, `drainBurnLight`) and torch gas spending
  (`src/core/torch.ts`, `spendFuel`) are not a world fire or smoke model.

## Playtest questions and exit

Can players make a shelter useful without outside instructions? Does a powered
process justify collecting fuel and wire? Can they understand a blackout and
choose what to keep running? Does covering windows change their lighting choice?
Does leaving and returning preserve trust in the world? Does a breach or spreading
fire produce a defence, repair or abandonment decision rather than arbitrary loss?

Exit requires the BR-selected loop in the region, the playtest participation and
local metrics process in `EPIC.md`, "How each slice runs", and BR's assessment of
whether the base was worth its cost. Record chosen actions, abandonment/return,
confusing failures and voluntary feedback, without treating survival time or a
fixed enemy count as a pass threshold. Persistence, cross-browser determinism,
performance and visual first looks are independent gates. The scenario must exercise
its scripted wave, bear-trap defence, charged attacks and stagger; an ambient-only
encounter does not replace this proof. Update the owning design and challenge
reasons at closure, and trim completed intent into code cues. Broader trap catalogues,
script languages, smoke inhalation levels and regional light effects remain outside
the required loop; their absence is not missing slice-exit evidence.
