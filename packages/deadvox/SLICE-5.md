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
The playtest gate below decides the setting and pressure; this is not an approved
encounter script. The value of staying must compete with the cost of attracting
attention, supplying machines and risking stored goods.

## Scope and boundaries

The slice includes craft-placed walls, floors, doors, barricades and furniture;
locks and zombie door bashing, including the tier-2 brute; generators, solar,
batteries, wires, lights and appliances; and material burning, neighbouring spread,
smoke, light and molotovs. Lanterns, fixed lamps and window covering make lighting
a base decision. These are the scope in `EPIC.md`, "5. Holding ground", not a
settled catalogue or construction grid.

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
script engine into Slice 5. Slice 4b's region simulation is the integration
prerequisite; an authored test room can prove a mechanism, not complete the slice.

Door forcing retains material/tool requirements and irreversible lock destruction.
Bashing needs actor and obstacle strength, not an inference from movement or the
brute silhouette. The authored brute shambler is not automatically the tier-2
brute. See `DESIGN.md`, "Base building and electricity", and
`src/core/zombies.ts`, `ZombieSystem.updateObstacleContact`.
Boarding already has directional opening semantics; player-built boarding must
not silently turn an inside-openable leaf into an immovable wall. See
`docs/aftermath.md`, "Door variants", and `src/core/blockEntities.ts`, `doorRefusal`.

### Related issues and admission

- **#107, traps:** a candidate addition, not committed Slice 5 scope. Basic alarms
  and slowing fit defence, but the issue leaves scheduling and offscreen behaviour
  open. Its admission gate below must close before any trap implementation.
  Heavy payloads are not a prerequisite for defending a base.
- **#276, heavy attacks and stagger:** not required by Slice 5's settled scope.
  Door strength does not settle charged attacks, knockdown or player knockback.
  Its admission gate keeps those decisions independent of bashing.
- **#313, scripted dynamic events:** not required for ordinary appliance commands.
  Keep scriptability and position-triggered events out unless BR explicitly admits
  the issue; powered appliances do not implicitly authorise a scripting language.

## Implementation gates: questions for BR

Each bold question is a separate decision within the named decision item. Options
are alternatives, not recommendations. Debt grades compare ongoing coupling and
future replacement cost, not implementation time; negative space says what remains
unbuilt. Unanswered gates block only their dependent work.

### Construction gates — decision item d576

- **Placement grain:** What grid should constructed things use? A: terrain-cell
  placement for blocks and anchored entities — low debt, leaves fine placement
  open but unproved. B: cell blocks with finer entity placement — medium debt from
  multiple occupancy consumers, leaves arbitrary structural geometry open.
  C: freely placed assemblies — high debt across collision, reach and saves,
  leaves structural stability and a building editor separately undecided.
- **First build vocabulary:** Which things must the first loop place? A: a bounded
  repair-and-fortify kit covering the slice's categories — low debt, leaves broad
  catalogue and novel structures open. B: a general recipe-driven building palette
  across those categories — medium debt from validation and placement breadth,
  leaves structural physics open. Neither option drops walls or floors from exit.
- **Support and removal:** Is placement supported by a simple local rule, or a
  persistent support graph? A: local placement checks — low initial debt but medium
  extension cost for collapse; leaves collapse unimplemented. B: authored support
  dependencies — medium debt and destructive cascades to prove; leaves physical
  stress simulation open. Decide contents and interrupted deconstruction outcomes
  before either can remove occupied structures.

### Breach gates — decision items #273 and #800

- **Strength and damage (#273):** Does strength gate entry before cumulative door
  damage, or determine a continuous damage rate? A: minimum strength plus cumulative
  damage — low debt, leaves richer material deformation open. B: strength/material
  damage per strike without a hard threshold — medium debt in tuning and actor
  modifiers, leaves distinct forcing tools intact. Both must allow every door to
  yield to sufficient strength and save partial damage.
- **Player breach (#800):** Does the player share the zombie bash resolution through
  a repeated action, or use a timed forcing action backed by that same strength
  rule? A: repeated strikes — medium debt in input/combat integration, leaves heavy
  attacks separate. B: long-action forcing — low debt in job ownership but medium
  cost if later unified with strike combat, leaves charged attacks separate.
- **Brute consequences (#273; #276 for combat effects):** Is the first tier-2 brute
  distinguished by breach capability and combat tuning alone, or also by knockback?
  A: breach without knockback — low debt, leaves displacement combat open.
  B: add knockback — medium debt in collision and body response, leaves general
  heavy attacks and enemy knockdown undecided. Resolve this before the brute look.

### Power and appliance gates — decision item d576

- **Deficit policy:** What happens when supply and storage cannot meet demand?
  A: stable content priorities and whole-consumer admission — low debt, leaves
  player priorities and partial-power appliances open. B: player-set priorities —
  medium debt in controls and persistence, leaves proportional operation open.
  C: proportional allocation — medium debt across every process's rate semantics,
  leaves minimum-start loads and priority management open. Define tie handling and
  restart behaviour with the selected policy; do not let insertion order decide.
  D: all consumers off during deficit — low allocation debt, leaves partial service
  open and needs a restart rule that avoids charge/shutdown oscillation.
- **Battery allocation:** How do stores share charging and discharge? A: stable
  priority order — low debt, leaves balanced utilisation open. B: proportional to
  available capacity/charge — medium numerical-boundary debt, leaves player-directed
  priorities open. Neither is settled by topology.
- **Storage realism:** Are transfers unlimited and lossless, or content-rate-capped
  and lossy? A: ideal storage — low debt, leaves constraints open for later balancing.
  B: caps and efficiencies — medium event-integration debt, leaves chemistry open.
- **Generator idling:** Burn continuously while running, even with no useful demand,
  or throttle fuel to useful output? A: continuous burning — low debt, leaves
  automatic control open. B: demand-following fuel use — medium dispatch debt,
  leaves start-up costs and minimum running load open.
- **Solar output:** Which content curve describes production over the world day?
  A: piecewise constant — low integration debt, leaves smooth dawn/dusk open.
  B: piecewise linear — medium boundary-solving debt, leaves weather and panel
  orientation open. Both use the existing world day-cycle authority, not an
  electrical day length; see `src/core/dayPhase.ts`, `DayCycle`. Approve phase
  mapping before solar integration; time-of-day dependence does not choose a curve.
- **Wire electrical limits:** Ideal links, capacity limits, or length-dependent
  losses too? A: ideal — low debt, leaves routing economics open. B: capacity limits
  — medium network-flow debt, leaves losses open. C: losses and limits — high
  flow/integration debt, leaves voltage and protection modelling open. This decision
  is separate from visible wire placement.
- **Electrical agreement tolerance:** What absolute resource error may near-player
  tick/catch-up comparison accept? A: exact equality through a shared canonical
  integrator — medium implementation debt, leaves alternative numerical methods
  open only if they reproduce it. B: an absolute bound in each resource's units,
  selected from the integration spike — medium validation debt, leaves algorithm
  flexibility but requires BR's approval of the measured bound before acceptance.
  No numeric tolerance is settled in the cited docs. Neither option weakens exact
  cross-browser agreement for the same simulation path.
- **Wire placement:** Are wires logical links with visible endpoints or spatial
  runs that can be obstructed and damaged along their length? A: links — low debt,
  leaves routing gameplay open with later placement rework. B: spatial runs —
  medium debt in editing, ownership and destruction, leaves electrical resistance
  and circuit protection open. The graph core need not choose either presentation.
- **Useful appliance proof:** Which process makes electricity worth maintaining?
  A: refrigeration — medium debt in rate-history ownership, leaves automated
  production open. B: unattended processing plus powered workstation requirements —
  medium debt in inputs, outputs and interruption, leaves refrigeration open.
  C: both — higher integration debt and broader evidence, leaves more elaborate
  thermal and production chains open. Lights alone cannot prove process catch-up.

### Fire and exposure gates — decision item d576

- **Fire grain:** Does burning live per terrain cell or in coarser patches that
  resolve local material cells? A: cells — medium debt in bounded work and lighting
  invalidation, leaves fluid fire open. B: patches — higher reconciliation debt
  against destruction and local exposure, leaves subpatch behaviour open. Both
  must preserve material-driven neighbouring spread and a shared ignition path.
- **Smoke effects:** Is smoke initially visible and sight-obscuring, or also a
  transported harmful volume? A: bounded visual/sight field — medium debt to keep
  visibility and presentation coherent, leaves breathing and ventilation open.
  B: transported harmful volume — high debt in enclosure, body effects and catch-up,
  leaves detailed chemistry open. Pure cosmetic smoke would leave sensory smoke
  explicitly unimplemented, rather than establishing safety indoors.
- **Fire suppression:** Can players directly extinguish a burning base or only
  contain spread by removing fuel and retreating? A: containment — low debt, leaves
  extinguishing tools open. B: direct extinguishing — medium debt in application,
  resources and persistence, leaves detailed water/heat transport open.
- **Lit-base attention:** What attracts zombies: visible emitters or illuminated
  exposed surfaces as well? A: emitter visibility through uncovered openings — low
  debt using existing light-source attention, leaves diffuse glow recognition open.
  B: sampled illuminated surfaces — higher debt in simulation exposure and occlusion,
  leaves volumetric glow open. In both cases, decide whether distant regional hordes
  receive the stimulus or only local/background actors; local-only has lower debt
  but leaves regional attraction open, regional influence has higher persistence
  debt but makes unattended crowd formation part of the proof. Rendering residency
  cannot decide what zombies perceive.

### Admission and acceptance gates

- **Traps (#107):** Include a bounded alarm/slowing set or defer the issue? Inclusion
  has medium debt in mechanism triggers, disarming and offscreen outcomes, leaves
  heavy payloads open; deferral has low debt and leaves all trap gameplay open.
  Inclusion needs separate rulings on enemy awareness, disarming risk/recovery,
  self-trigger consequences and offscreen firing from the issue before coding.
- **Heavy attacks (#276):** Admit charged attacks and stagger or keep them separate?
  Admission has medium debt in input, hit response and saved timing, leaves further
  combat abilities open; deferral has low debt and leaves ordinary strikes and
  independently decided brute knockback sufficient for this slice's breach work.
- **Dynamic events (#313):** Keep explicit appliance commands, admit data-driven
  trigger/condition/effect rules, or admit a script language? Those have low,
  medium and high debt respectively. Commands leave general authored events open;
  rules leave language tooling open; scripts leave sandboxing and mod authority to
  settle before implementation. Neither admission settles position triggers.
- **Playtest (d576):** Use an authored shelter-and-supply route followed by a regional
  return, or a wholly regional shelter choice? The authored route has low authoring
  debt but medium risk of hiding site-selection problems; it leaves procedural
  variety open. The regional loop has medium world-content debt; it leaves a curated
  teaching route open. Separately choose natural attention pressure or an authored
  initial threat population: natural pressure has low special-case debt but leaves
  encounter pacing variable; an initial population has low engine debt but medium
  content-maintenance debt and leaves emergent arrival pacing unproved. Neither
  choice permits scripted waves without the #313 gate.

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
   solar integration wait for the power gates, then must prove conservation and
   exhaustion under the selected rules. Keep graph mechanics separate from wire
   presentation and appliance content. Any provisional policy is a fixture, not a
   BR rule. Topology edits must settle old-network time before reassignment so energy
   cannot be created by rewiring.
3. **Construction and persistent placement.** After the construction gates, extend
   crafting/disassembly to world destinations. Prove occupied-placement refusal,
   interrupted work, completion-time revalidation, preserved contents and no duplicate
   inputs or outputs across save/load. Show doors, floors and a barricade in use,
   not only a ghost preview. BR approves placement and covering-window readability.
4. **Usable electricity and processes.** Join d577-1 to built instances and the
   selected appliance loop. Show fuel/charge ownership, connect/disconnect controls,
   blackout and restart under the selected deficit rule. Compare ordinary ticking
   with catch-up across daylight, fuel exhaustion, switching and rewiring. Save during
   an unattended process, leave, and return to the same consequence. BR checks that
   players can diagnose why a useful load is not working.
5. **Breach and defence.** After #273/#800 decisions, add persistent damage and
   material/strength resolution at the obstacle-contact boundary. Prove blocked
   actors cannot path through an intact leaf, a broken leaf invalidates obstruction,
   noise attracts through ordinary senses, and boarding keeps its directional
   contract. Show the tier-2 brute rather than silently upgrading the cellar guard.
   BR approves the breach look and any admitted displacement effects.
6. **Fire, smoke and light.** After fire/exposure gates, prove ignition and spread,
   material exhaustion, actor consequences, obstruction and light invalidation.
   Molotovs and wood cutting must enter the same fire owner; sufficient torch fuel
   remains a prerequisite, not a source of free ignition. Lanterns and powered fixed
   lamps expose light consistently to rendering and attention. Show a window cover
   changing the selected exposure rule. BR approves flame/smoke readability and
   what the player can do about a burning shelter.
7. **Region integration and play acceptance.** Cross the catch-up horizon with a
   working and a burning base. Prove canonical coarse outcomes, persisted damage,
   processes and attention without dependence on stream arrival. Exercise the chosen
   defence loop with the region's threats and supplies. Include admitted issue work
   only after its gates close. Run cross-browser replay and the owning weak-GPU
   performance benchmarks, then the playtest and slice-exit consolidation/deep docs
   pass. Passing a debug fixture is not completion.

## State and technical proof

Persist construction edits, instance identity and owned contents, interrupted work,
partial door damage, wire endpoints, resource amounts, process progress and rate
boundaries, and authoritative fire/smoke/attention state selected by their gates.
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
  win that makes the room permanently dark. This precedes fire-grain commitment.
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
performance and visual first looks are independent gates. Update the owning design
and challenge reasons at closure, and trim completed intent into code cues; leave
unadmitted #107, #276 and #313 work in their decision items, not implied promises.
