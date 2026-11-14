---
read_if:
  - you're planning or implementing Holding ground construction, electricity or fire
  - you're deciding Slice 5 scope, BR gates, technical spikes or play acceptance
  - you're integrating base appliances, door bashing, its decision-code ownership or unattended simulation
  - you're implementing bear traps, data-driven events or the playtest waves
  - you're authoring the base-building playtest's composed site, supply asks, distance weights or anchored wave schedule
---

# Slice 5 — Holding ground

**Status: the power network core, the placed-entity store, the first appliance
process, world repair work and the first wave rule are built; player placement,
take-apart, structural collapse, fire and exposure, and the integration proofs are
open.** See `packages/engine/src/core/powerGraph.ts`, `PowerGraph`;
`packages/engine/src/core/power.ts`, `PowerNetwork`; `packages/engine/src/core/blockEntities.ts`,
`BlockEntities`; `packages/engine/src/core/batteryChargers.ts`, `BatteryChargers`;
`packages/engine/src/core/craftCommands.ts`, `CraftCommands.repairEntity`; and
`packages/deadvox/mods/skelly.deadvox.scenario.holdout/waves.libsonnet`, `rules`. The bear trap is
built (`INTERACTIONS.md`, "Traps"). No fire or smoke model exists in
`packages/engine/src/core`. The question from `EPIC.md`, "Slices", is: **Is a base worth building and
defending?**
This plan separates settled intent from choices that must precede dependent work.
The slice process is in `EPIC.md`, "How each slice runs".

## The smallest useful loop

The candidate loop is to claim a shelter, scavenge construction and electrical
supplies, improve its defences, connect useful appliances, and choose how much
light to expose at night. Leave it working, return to consequential resource use,
and decide whether to defend, repair or abandon it after a breach or fire.
The playtest is a scenario whose first wave arrives after three elapsed scenario
days and whose later waves never stop coming, growing harder through an authored
list and then holding at its last row, so preparation and defence receive a
deliberate and then an enduring pressure test.
Data-driven event rules author the waves; this does not select an authored
shelter-and-supply route. Every wave day is a content tunable, not an engine
constant. The value of staying must compete with the cost of attracting attention,
supplying machines and risking stored goods.

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
`INTERACTIONS.md`, "Crafting", and `packages/engine/src/core/crafting.ts`, `planCraft`.
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
`packages/engine/src/core/agent.ts`, `AgentController.updateObstacleContact`.
Boarding already has directional opening semantics; player-built boarding must
not silently turn an inside-openable leaf into an immovable wall. See
`docs/aftermath.md`, "Door variants", and `packages/engine/src/core/blockEntities.ts`, `doorRefusal`.

### Related issues and admission

- **#107, traps:** admitted, starting with a bear trap, to give base defence a
  placed mechanical hazard. Broader alarm sets and heavy payloads are not required.
  Its handling and horizon rules below are bear-trap specific, not defaults for
  every future trap.
- **#276, heavy attacks and stagger:** charged player attacks are admitted to give
  deliberate attack commitment a place in defence; hit-induced shambler stagger is
  admitted so hits can interrupt an approaching threat. Neither is inferred from
  door strength or changes settled tier-2 brute knockback. The rules and the open
  #276 questions are in [charged attacks](docs/charged-attacks.md) and
  [stagger](docs/stagger.md).
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
`packages/engine/src/core/power.ts`, `PowerNetwork`. The integration proofs below use the policies that
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
- **Wave day:** a bounded preparation window gives fortifying a reason without
  scaling pressure to base wealth. The clock is author tuning, not a player pacing
  choice; see `mods/skelly.deadvox.scenario.holdout/holdout-site.libsonnet`, `scenario`.
- **Waves never end:** the intended endurance loop has no victory condition.
  The expanded schedule is finite; exhausting it is the trigger for adding a repeating
  event mechanism, not a reason to put a second clock in the session. Survival time
  is not a pass threshold; see "Playtest questions and exit".
- **Wave gap:** predictable arrivals leave room to plan excursions. Keep timing in
  scenario content so a mod changes one authority; see
  `mods/skelly.deadvox.scenario.holdout/waves.libsonnet`, `rules`.
- **Repeat clock:** the gap counts from one arrival to the next, not from the end of
  a fight. The saved scenario run's calendar then fixes the whole schedule, and no
  rule has to decide when a fight with unloaded zombies has ended. Waves may
  overlap; that is accepted pressure, not a defect.
- **Wave target:** every wave heads for where the player stands when it fires, as
  the first wave does. No shelter identity is needed, so an unattended base is never
  attacked; unattended shelter defence waits on Slice 4b's region work.
- **Escalation:** Jsonnet expands the authored escalation rows, repeating the last
  row as a plateau rather than endless growth. Actor content owns strength; selecting
  actor types avoids a second strength authority in wave effects. The engine receives
  explicit event rows, never a competing wave-index formula. See
  `mods/skelly.deadvox.scenario.holdout/waves.libsonnet`, `rules`.
- **Arrival:** anchors keep placement choices in content while seeded draws let waves
  probe different approaches. Runtime event rules need no knowledge of anchor kinds;
  see `packages/engine/src/core/composeLayout.ts`, `composeLayout`.

### Settled base-building playtest rules

The base-building playtest, the third playtest round, is scoped in #1332.

- **Site:** a composed site lets the base-building playtest grow incrementally
  without inheriting the gauntlet's city, hatch or map pool. Holdout disables authored
  population markers so the forcing pressure is the wave schedule, not incidental
  template occupants; see `mods/skelly.deadvox.scenario.holdout/holdout-site.libsonnet`,
  `scenario`. The mansion stays deferred past this playtest under #1332.
- **Supplies:** the site offers all three sources: rubble and take-apart of what
  stands there, authored stockpiles at a distance, and loot tables. Salvage alone
  starves the loop into dismantling the shelter to fix it, and loot alone makes
  supply random; distant stockpiles give excursions a deliberate target.
- **Supply sites:** #1332 adds independently authored asks for supply affordances,
  rather than a fixed ring of POIs. Redundant sources keep imperfect seeds playable;
  guarantee only source counts, not routes or distances. See
  `packages/engine/src/core/composeLayout.ts`, `guaranteeIssues`.
- **Stockpile distance:** #1332 gives the starter pile a strong near-start weight
  and bulk supplies broader distance weights. Distances are preferences, not bands
  or per-seed certificates, so a distant starter pile is variation rather than a
  placement failure. See `packages/engine/src/core/composeLayout.ts`, `composeLayout`.
- **Bulk stock:** ready-to-use material stock is held in containers and taken out,
  not taken apart: the material is already usable. Take-apart turns assembled or
  built furniture back into its components. Boxed small goods are carried and
  opened like any boxed item. A stock container accepts only its material, not
  unrelated stash: see `packages/engine/src/core/schema/items.ts`, `ContainerSchema`.
  Content-authored shapes shrink in steps by fill share so the player reads how
  much is left at a glance; an empty stack must not look full. See
  `packages/engine/src/core/schema/furniture.ts`, `FurnitureSchema`, and
  `packages/presentation/src/render/stockShape.ts`, `stockShapeStep`.
  Sealed nail boxes show their count in the name, like shell boxes, so the package
  identifies its quantity before opening; see
  `packages/mods/skelly.materials/materials-items.jsonnet`, `nail_box`.
- **Break yields:** every block material and piece yields materials when broken,
  but breaking costs far more time per unit than looting stock, so looting stays
  the efficient path and tearing down walls a slow fallback. The yields per
  material and the time they cost are content under
  `PILLARS.md`, "Content forward compatibility" (repo root).
- **Material loot usage:** building materials get a loot usage of their own, so a
  hardware store or construction site keeps a place-specific promise and the stock
  does not drift into workshop crates.
- **Rubble:** fallen material stays solid until cleared, and clearing is the
  take-apart command applied to rubble, so it waits on that command and adds no
  second destruction verb; see
  `DESIGN.md`, "Damage, destruction and dismemberment".
- **Early session:** a first base-building session runs once world repair,
  take-apart and the first wave work, before fire, power controls and the brute
  land, because the building UI is what blocks this playtest and early feedback on
  it is cheaper than a long wait. Slice exit still needs the whole slice; see
  "Playtest questions and exit".

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

1. **Readiness and decisions: closed, except position triggers.** The construction,
   destruction, wave and playtest choices this slice waited on are ruled; only
   "Remaining event gate — issue #313" stays open, and it blocks no package. Run the
   small spikes below where a package's claim has no owning benchmark yet.
2. **Power network core: built.** Topology, cache invalidation, saved identity,
   split/merge, deterministic restoration, closed-form balance, fuel exhaustion and
   solar by time of day exist; see `packages/engine/src/core/powerGraph.ts`, `PowerGraph`,
   `packages/engine/src/core/power.ts`, `PowerNetwork`, and `test/power.test.ts`. Graph mechanics stay
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
7. **Event rules, scenario waves and region integration.** #313's rules and their
   one-shot state are built; see `DESIGN.md`, "Scenario events". Holdout's expanded
   wave schedule uses seeded arrival anchors so approaches vary without a runtime
   placement policy; see `mods/skelly.deadvox.scenario.holdout/waves.libsonnet`, `rules`.
   Grow the site's content and supplies under "Settled base-building playtest rules".
   Cross the catch-up horizon with a working and
   a burning base. Prove canonical coarse outcomes, persisted damage, traps, processes
   and nearby/background light attention. Exercise preparation, the waves and recovery
   with charged attacks and stagger available; ordinary ambient attention remains
   active but is not the scenario's pressure substitute. Run cross-browser replay
   and the owning weak-GPU performance benchmarks, then the playtest and slice-exit consolidation/deep docs
   pass. Passing a debug fixture is not completion.

### Lanes and the next rounds

The open packages run as four lanes, each one PR per round from main. Within a
lane the order is a dependency; across lanes only the joins named here hold.

- **Destruction.** No BR gate remains, so it starts now. Zombies bash terrain by
  material strength first, so the brute wrecks walls through its strength rather than
  an identity flag and ordinary types break doors only because door pieces sit below
  their strength; see `packages/engine/src/game/session.ts`, `bashObstacle`. Span
  support with surface ground follows, and until collapse lands live play refuses a
  blow whose ruin would leave a block unsupported, a temporary gate whose reason goes
  in `DESIGN.md`, "Damage, destruction and dismemberment", not in a flag. Collapse
  then lands as a separate PR: rubble that keeps its crack fraction, buries bodies to
  be dug out by ordinary strikes and hurts every body, generating terrain on demand
  wherever it reaches, so no region departure-and-return work precedes it; its PR
  reports collapse time at the largest authored roof rather than gating on it. Blast
  by share and breach charges follow, then furniture knock-out and push-off, which
  replace the fall refusal with landing crush; see
  `packages/engine/src/core/furnitureMove.ts`, `fallRefusal`.
- **Construction.** The radial action menu is built (`INTERFACE.md`, "HUD"); every
  hold job (Repair, Take apart, Continue, Fortify) enters through it, on building parts
  as on movable pieces (`DESIGN.md`, "Moving furniture"). Player-facing
  world work, repair and take apart alike, is one design and queues behind the #1469
  crafting view; see `DESIGN.md`, "World repair selection". Engine rounds do not wait:
  bulk-stock pieces and rubble clearing under "Settled base-building playtest rules",
  over the take-apart command (`packages/engine/src/core/craftCommands.ts`,
  `CraftCommands.takeApartEntity`), then cell repair, placement and the kit content.
- **Built systems.** Appliance controls and processes after placement; brute
  knockback and displacement independently, since nothing above needs it; fire last,
  under "Settled fire and exposure rules".
- **Playtest pack.** Holdout grows from independently authored asks so each addition
  can be retuned without city-shape constraints. #1332's supply affordances join the
  construction lane's take-apart command because bulk stock and rubble clearing use
  it; region proofs follow in package 7. Keep site tuning in content rather than
  scenario-specific engine rules. See `mods/skelly.deadvox.scenario.holdout/holdout-site.libsonnet`,
  `scenario`, and `docs/url-mods.md`, "Committed scenarios".

## State and technical proof

Persist construction edits, instance identity and owned contents, interrupted work,
partial door damage, wire endpoints, resource amounts, process progress and rate
boundaries, authoritative fire/smoke/attention state, trap armed/restraint/injury
state, charged-action and stagger timing, and event rules' authoritative one-shot
state. Disarm progress is not resumable after interruption.
Derived connected components, occupancy and rendered lighting are rebuilt from
truth, not independently editable saved totals. Extend `packages/engine/src/core/blockEntities.ts`,
`BlockEntityState`, and `packages/engine/src/core/saveState.ts`, `SaveSnapshot`, at their ownership
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
  `packages/engine/src/core/needs.ts`, `stepNeeds`, demonstrates boundary splitting;
  `packages/engine/src/core/food.ts`, `spoilage`, does not establish refrigeration history. Failure
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
  operation and restore. See `packages/engine/src/core/blockEntities.ts`, `BlockEntities`, and
  `packages/engine/src/core/prying.ts`, `pryPlan`. The smallest proof catches stale occupancy before
  a full building palette multiplies it.
- **Lit-base crowd readability:** compare the same room with open, covered and
  breached windows at night and in daylight. Observe both rendered exposure and
  zombie attention; neither can stand in for the other. See `packages/engine/src/core/lights.ts`,
  `lightSenseSourceFor`, and `packages/presentation/src/render/skylight.ts`, `Skylight`. Existing consumable
  light depletion (`packages/engine/src/core/lights.ts`, `drainBurnLight`) and torch gas spending
  (`packages/engine/src/core/torch.ts`, `spendFuel`) are not a world fire or smoke model.

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
