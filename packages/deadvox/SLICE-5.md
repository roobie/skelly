---
read_if:
  - you're planning or implementing Holding ground construction, electricity or fire
  - you're deciding Slice 5 scope, BR gates, technical spikes or play acceptance
  - you're integrating base appliances, door bashing or unattended simulation
---

# Slice 5 — Holding ground

**Status: planning; BR decision gates remain open.** The question from
`EPIC.md`, "Slices", is: **Is a base worth building and defending?**
This plan separates settled intent from choices that must precede dependent work.
The slice process is in `EPIC.md`, "How each slice runs".

## The smallest useful loop

The candidate loop is to claim a shelter, scavenge construction and electrical
supplies, improve its defences, connect useful appliances, and choose how much
light to expose at night. Leave it working, return to consequential resource use,
and decide whether to defend, repair or abandon it after a breach or fire.
The playtest is a scenario with a scripted wave after a content-selected number
of days, so preparation and defence receive a deliberate pressure test. This does
not select an authored shelter-and-supply route or a general event engine. The
value of staying must compete with the cost of attracting attention, supplying
machines and risking stored goods.

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
  The bear-trap gates below must close before its implementation; admission does
  not decide awareness, safe handling or outcomes outside the near-player block.
- **#276, heavy attacks and stagger:** charged player attacks are admitted to give
  deliberate attack commitment a place in defence; hit-induced shambler stagger is
  admitted so hits can interrupt an approaching threat. Neither is inferred from
  door strength or changes settled tier-2 brute knockback.
- **#313, scripted dynamic events:** the scenario's scripted wave is required;
  whether authors get explicit commands alone or general data-driven rules remains
  open. Appliances and the wave do not authorise a script language or position
  triggers. The event gate below decides the mechanism, not the wave's admission.

## Implementation rules and remaining gates

Settled rules below are not questions for BR. Each remaining question is a separate
decision within the named item. Options are alternatives, not recommendations. Debt grades compare ongoing coupling and
future replacement cost, not implementation time; negative space says what remains
unbuilt. Unanswered gates block only their dependent work.

### Settled construction rules — decision item d576

- **Placement grain:** blocks use terrain cells; entities allow finer placement,
  so furnishings need not inherit structural coarseness. Occupancy consumers must
  agree; arbitrary structural geometry is outside this choice.
- **First build vocabulary:** use a bounded repair-and-fortify kit across the
  slice's categories, including walls and floors, so the defence loop can be proved
  without a general building catalogue.
- **Support:** persist authored support dependencies, so removal can resolve what
  depends on a structure rather than forgetting support after placement. Prove
  destructive cascades; physical stress simulation is not required.
- **Removal contents:** require empty contents at start and completion, so removal
  cannot lose, duplicate or silently relocate stored items. Automatic unloading is
  outside this rule.
- **Interrupted deconstruction:** reserve the structure against use while work is
  pending, including pauses, so resumed work retains exclusive ownership. Keep
  resumable work and snapshotted yields under `INTERACTIONS.md`, "Crafting";
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

Power decisions belong to d577, not a second set of Slice 5 cards. Keep policy
reasons with that implementation so allocation and catch-up cannot acquire
conflicting authorities. Use its selected policies for the integration proofs below;
this plan retains only the cross-system obligations.

### Settled fire and exposure rules — decision item d576

- **Fire grain:** burning is per cell, so material destruction, neighbouring spread
  and local exposure share a spatial boundary. Bound simulation work and lighting
  invalidation without changing that grain; fluid fire is not required.
- **Smoke effects:** smoke is a visual, sight-blocking field, so visible smoke has
  a sensory consequence rather than being decoration. Smoke inhalation levels are
  deferred: they need a shared body-effect model for fire and firearm discharge,
  not a fire-only health shortcut. Transported harmful volumes and ventilation are
  not prerequisites for this slice.
- **Fire suppression:** include direct extinguishing, so players can act on a
  burning shelter rather than only remove fuel or retreat. Application resources
  and persistence need proof; detailed water/heat transport is not required.
- **Light stimulus:** sources visible through uncovered openings attract zombies,
  so covering windows changes exposure through an understandable source-visibility
  rule. Illuminated surfaces and diffuse glow recognition are outside this choice.
- **Light reach:** affect nearby and background actors only. Regional light
  effects are deferred to keep distant horde influence and its persistence outside
  the base-light loop; local attention must not depend on rendering residency.

### Bear-trap gates — issue #107

Mechanism-based triggering remains settled by #107. These cards concern only the
first bear trap, not a general trap catalogue. Options are not recommendations.
All tunable durations, risks, yields and severity values belong to content under
`PILLARS.md`, "Content forward compatibility" (repo root).

- **Trap awareness.** Context: avoidance changes whether a visible bear trap can
  defend a doorway. Question: Do zombies recognise and avoid an armed bear trap?
  A: no deliberate recognition — low AI debt; leaves trap-aware navigation open.
  B: visible-trap recognition using authored actor perception — medium perception
  and pathfinding debt; leaves learning and hidden-trap discovery open.
- **Disarming time.** Context: making a trap safe can occupy the player's hands.
  Question: Is bear-trap disarming immediate or a resumable timed action?
  A: immediate — low action-state debt; leaves time pressure while disarming open.
  B: resumable content-duration action — medium ownership/save debt; leaves staged
  dismantling open. Tool requirements and failure risk are separate cards.
- **Disarming risk.** Context: safe handling need not follow from its duration.
  Question: Can an otherwise valid bear-trap disarm attempt spring the trap?
  A: no — low resolution debt; leaves handling accidents open.
  B: content-defined seeded failure chance — medium resolution/replay debt; leaves
  a skill progression system open. Any failure uses the selected self-trigger
  outcome; save/load must not reroll an attempt.
- **Disarming tools.** Context: scavenged equipment can gate safe handling.
  Question: Does bear-trap disarming require a tool quality?
  A: bare hands allowed — low reach/validation debt; leaves equipment gating open.
  B: content-declared tool quality required — medium reach/revalidation debt;
  leaves specialised tool catalogues open. This does not decide time or risk.
- **Trap recovery.** Context: a safely disarmed trap needs an ownership-preserving
  recovery result. Question: Does recovery return a reusable bear trap or salvage?
  A: intact reusable trap — low item-transfer debt; leaves wear and breakage open.
  B: content-defined parts — medium yield/escrow debt; leaves intact reuse open.
  Either result transfers once through ordinary item ownership.
- **Self-trigger severity.** Context: the owner's feet are not exempt from the
  mechanism. Question: Does a player-triggered bear trap restrain only or also injure?
  A: restraint until released — medium movement/action debt; leaves trap injury open.
  B: restraint plus content-defined injury — medium body-effect/persistence debt;
  leaves lasting limb complications open. Neither choice makes the owner immune.
- **Offscreen firing.** Context: defending an unattended base must not depend on
  streaming. Question: Outside the near-player block, does the coarse bear-trap
  model resolve contacts or preserve the armed trap without contacts?
  A: deterministic coarse contacts and spent-state outcomes — higher encounter
  ledger debt; leaves fine combat choreography open.
  B: preserve armed state without coarse contacts — lower simulation debt; leaves
  far-away trap defence unmodelled. Both must simulate contacts inside the block,
  loaded or not, and obey `docs/decisions/0008-deterministic-world.md`, "Decision".

### Event and playtest gates

- **Event authoring.** Context: the required scripted wave needs an authoring path,
  but does not itself require a general event engine. Question: Keep explicit
  appliance commands or admit data-driven trigger/condition/effect rules (#313)?
  A: explicit commands — low coupling debt, with extension cost for each new
  orchestration mechanism; leaves general authored events open. Examples: an
  appliance control issues a door-open command; a scenario schedule issues a
  one-shot spawn-wave command after X elapsed days; a control starts a processor.
  The scenario schedule is a bounded mechanism with content-owned timing, not a
  hard-coded scenario ID or general rule interpreter.
  B: data-driven trigger/condition/effect rules — medium interpreter, validation
  and saved-rule-state debt; leaves script-language tooling open. Examples: a
  control-use trigger opens a linked door if powered; an elapsed-days trigger,
  conditioned on an unfired scenario flag, spawns the playtest wave and marks it
  fired; a fuel-empty trigger switches off a linked lamp.
  Neither option admits a script language. If general rules are admitted, a separate
  position-trigger permission card must precede any position-trigger implementation;
  the elapsed-time wave does not need that permission. No option is recommended.
- **Wave day.** Context: the scenario needs a shipped preparation window, not an
  engine constant. Question: After how many elapsed scenario days should the
  playtest wave arrive?
  A: 3 — low content debt; leaves a long preparation window untested and risks
  players reaching the wave before using the appliance loop.
  B: 5 — low content debt; leaves both shortest and longest preparation extremes
  untested and requires a longer session than A.
  C: 7 — low content debt; leaves early-pressure response untested and increases
  the participation burden. No option is recommended. Store the selected value in
  scenario content under `PILLARS.md`, "Content forward compatibility" (repo root).
  The day choice can be carded independently of event authoring; wave implementation
  depends on that answer, while its required scope does not.

## Reviewable build order

These are work packages, not new work-item IDs. Every stateful package includes
validation, saves, replay evidence and reason-doc updates, not a later save retrofit.

1. **Readiness and decisions.** Run or explicitly reuse the slice-start consolidation
   surveys from `EPIC.md`, "How each slice runs"; give findings owners and revisit
   dates in the owning tracker. Close dependent gates and run the small spikes below.
   Done when the implementation briefs can distinguish settled rules from blocked
   choices and each performance claim has an owning benchmark.
2. **Power network core — d577-1.** This can proceed in parallel with planning from
   the settled wire-graph contract: topology, cache invalidation and saved identity.
   Prove split/merge and deterministic restoration there. Allocation, fuel use and
   solar integration use d577's policies and must prove conservation and
   exhaustion under the selected rules. Keep graph mechanics separate from wire
   presentation and appliance content. Any provisional policy is a fixture, not a
   BR rule. Topology edits must settle old-network time before reassignment so energy
   cannot be created by rewiring.
3. **Construction and persistent placement.** Extend crafting/disassembly to world
   destinations with cell blocks, finer entities and the repair-and-fortify kit.
   Prove support-graph cascades, occupied-placement refusal, empty-content checks,
   reservation through paused removal, completion-time revalidation and no duplicate
   inputs or outputs across save/load. Show doors, floors and a barricade in use,
   not only a ghost preview. BR approves placement and covering-window readability.
4. **Usable electricity and processes.** Join d577-1 to built instances and the
   selected appliance loop. Show fuel/charge ownership, connect/disconnect controls,
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
   displacement. After the bear-trap gates close, add #107's bear trap and prove
   mechanism contacts, handling/recovery ownership, player triggering and selected
   coarse outcomes across save/load. BR approves breach, combat and trap readability.
6. **Fire, smoke and light.** Prove per-cell ignition and spread, material exhaustion,
   direct extinguishing, sight-blocking smoke, obstruction and light invalidation.
   Molotovs and wood cutting must enter the same fire owner; sufficient torch fuel
   remains a prerequisite, not a source of free ignition. Lanterns and powered fixed
   lamps expose light consistently to rendering and attention. Show a window cover
   changing source visibility through the opening. BR approves flame/smoke readability and
   what the player can do about a burning shelter.
7. **Scenario wave, region integration and play acceptance.** After event authoring
   is decided, implement the scripted scenario wave with its selected day in content.
   Prove one-shot scheduling across save/load and horizon transitions without stream
   arrival deciding whether it fires. Cross the catch-up horizon with a working and
   a burning base. Prove canonical coarse outcomes, persisted damage, traps, processes
   and nearby/background light attention. Exercise preparation, the wave and recovery
   with charged attacks and stagger available; ordinary ambient attention remains
   active but is not the scenario's pressure substitute. Run cross-browser replay
   and the owning weak-GPU performance benchmarks, then the playtest and slice-exit consolidation/deep docs
   pass. Passing a debug fixture is not completion.

## State and technical proof

Persist construction edits, instance identity and owned contents, interrupted work,
partial door damage, wire endpoints, resource amounts, process progress and rate
boundaries, authoritative fire/smoke/attention state, trap state selected by its
gates, charged-action and stagger timing, and the wave's one-shot scheduling state.
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
  during spread. A failed spike blocks fire integration and exposes any missing
  canonical coarse rule to d576 rather than using stream timing as an input.
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
