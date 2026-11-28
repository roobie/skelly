---
read_if:
  - you're planning or implementing Holding ground construction, electricity or fire
  - you're changing cell-fire ownership, material load crumbling, burn-out support, charred clearing or its fire-look fixture
  - you're deciding Slice 5 scope, BR gates, technical spikes or play acceptance
  - you're integrating base appliances, door bashing, its decision-code ownership or unattended simulation
  - you're implementing bear traps, data-driven events or the playtest waves
  - you're authoring the base-building playtest's composed site, supply asks, distance weights or anchored wave schedule
  - you're relating the construction playtest to Holdout's world and power-plant design
  - you're authoring the shelter plot, its starting block condition or broken panes
  - you're changing stockpile pockets, capacity or their inventory presentation
  - you're changing where Holdout players find building tools or fasteners
  - you're changing collapse displacement, burial, suffocation, continuous-damage audio or buried-player presentation
  - you're changing window clearance, condition feedback, panes, latches, glass impacts or floor-glass ownership
  - you're integrating terrain repair or rubble clearing with the shared world-work review
  - you're changing structure support, bent span reach, cascade landing, buried contents or their clearing
  - you're changing strut geometry, material admission or ray passage
---

# Slice 5 — Holding ground

**Status. Built: the power network core, the placed-entity store, battery charging,
world repair and take-apart with their review, world-destination crafting and placement
picking with the timber kit and window covers, support and collapse with burial
(see "Support"), the saved cell-fire owner, and the first wave rule. Open: fire spread,
suppression, smoke, fire lighting and exposure, and the integration proofs.** See `packages/engine/src/core/powerGraph.ts`, `PowerGraph`;
`packages/engine/src/core/power.ts`, `PowerNetwork`; `packages/engine/src/core/blockEntities.ts`,
`BlockEntities`; `packages/engine/src/core/batteryChargers.ts`, `BatteryChargers`;
`packages/engine/src/core/craftCommands.ts`, `CraftCommands.repairEntity`, `CraftCommands.repairCell`
and `CraftCommands.place`; `packages/presentation/src/ui/inventoryScreen.ts`,
`InventoryScreen.openWorldWork`; and
`packages/deadvox/mods/skelly.deadvox.scenario.holdout/waves.libsonnet`, `rules`. Door and
window covers share one recipe result, a `boardings` cover attached to a standing opening; see
`packages/engine/src/core/schema/recipes.ts`, `RecipeSchema`, and
`packages/engine/src/core/blockEntities.ts`, `BlockEntities.board`. The bear trap is built (`INTERACTIONS.md`, "Traps"). Fire's ownership boundary is in
`packages/engine/src/core/fire.ts`, `Fire`; smoke remains outside that owner. The question from `EPIC.md`, "Slices", is: **Is a
base worth building and defending?**
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
Boarded doors refuse opening from both faces; their explicit boarded face is their look only. See
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
- **First build vocabulary:** the bounded repair-and-fortify kit is a plank wall,
  plank floor, plain improvised wooden door and frame without a lock, movable wooden
  storage shelf, door-attached wooden boarding, fixed wooden window boarding, a fixed
  sheet-metal window panel on timber battens, and an openable textile curtain. The
  existing wooden door bar remains available. There are no additional structural
  material families or dedicated stairs, roofs, fences, traps or appliances in this
  kit; a floor can also serve as a roof. One timber structural family keeps the first
  catalogue bounded; sheet stock gets a direct opening-treatment use without posing
  as a load-bearing steel wall. Both shelf and boarding belong: furniture proves
  placement and movement, while door boarding supplies the defence that players familiar
  with Cataclysm: DDA expect. Boarding moves with its leaf; its explicit face remains a
  look, while the boarded door refuses opening from both faces (`docs/aftermath.md`, "Door variants"). Window covers attach to frame
  openings, not glass or replacement wall cells. Wood and sheet boarding protect the
  opening; a curtain blocks sight and light when closed, not bodies, and can be opened.
  Keeping protection distinct from textile occlusion makes the defence choice legible.
- **Support:** binary gravity support prevents floating walls without claiming to
  simulate physical stress. Bending accommodates corners without a corner-specific
  tunable; refusing merely sideways-held endpoints prevents endless cantilevers.
  Downward bearing preserves memo termination and query-order independence without
  ports or a second support graph. Struts move the bearing point geometrically, not
  by granting a span bonus. Reverse bearing reach matters because losing a diagonal
  foot must invalidate its receiver even when no block stands straight above it.
  Bounded sideways reach keeps cascade invalidation local. See
  `packages/engine/src/core/structureSupport.ts`, `createSupport`, `SupportState.lost`
  and `SupportState.enqueueSideways`.
  A canopy-bearing trunk refuses a blow until felling exists: canopy reduced to rubble
  or left floating both read wrong, and refusal keeps timber yield open. An exhausted
  search has not cleared the trunk; see
  `packages/engine/src/core/terrainStrike.ts`, `strikeTerrain`.
  Authored support stays derived so saves grow with play, not exploration. Player-placed
  blocks need provenance even when they match natural ground; see
  `packages/engine/src/core/structureSupport.ts`, `SupportState`. Placement checks support
  before spending inputs so the player learns why first; see
  `packages/engine/src/core/worldPlacement.ts`, `createWorldPlacement`.
  Falling rubble makes collapse visible rather than leaving rubble suspended where
  structure stood. The view masks a landed rubble cell until its recorded drop lands,
  because cascades otherwise expose their result before the source arrives. A thin member
  instead leaves salvage: a rubble cube would invent a doorway-blocking mass where a slim
  brace fell. Block overrides and material defaults share one failure selection, and yields
  reuse the break planner so falling, cutting and later char failure cannot disagree about
  salvage. Scrap and offcuts remain useful; a placeable strut item waits for player strut
  construction rather than offering an item with no way back into the world. Occupied vehicle
  fittings stop rubble because vehicle impact damage has no owner. Collapse is danger, not
  arbitrary deletion: conserve anything it did not break through the shared ruin and
  buried-content owners; see
  `packages/engine/src/core/terrainStrike.ts`, `fallCell` and `cascadeSupport`.
  Walls stay walls: evacuation through solids would let collapse breach a sealed base
  by teleporting its occupants. Burial and content-owned breathing let collapse kill
  through ordinary damage without inventing a breath meter or an actor-kind exception.
  See `packages/engine/src/core/collapse.ts`, `reachableCollapseExit` and `refreshBurial`,
  and `packages/engine/src/game/session.ts`, `crushBodies`.
  Continuous damage needs a distinct voice so an ongoing condition does not sound like
  repeated blows; see `packages/engine/src/game/session.ts`, `playDamageSound`,
  `packages/engine/src/core/soundPicker.ts`, `SoundPicker.pick`, and
  `packages/engine/src/core/schema/body.ts`, `BodyTuningSchema`.
  Muffled sound and an enclosing visual pulse communicate confinement without taking
  away the view or changing simulation senses; see
  `packages/presentation/src/presentation/play.ts`, `updateBuriedPresentation`,
  `packages/presentation/src/presentation/audio.ts`, `GameAudio.setBuriedCutoff`, and
  `packages/engine/src/core/schema/blocks.ts`, `SupportTuningSchema`.
  Judgements must reflect earlier falls so peers and batch sizes agree. A content-owned
  cell cap spreads work across ticks rather than promising a time bound, and a saved
  frontier preserves interrupted work; see
  `packages/engine/src/core/structureSupport.ts`, `SupportState`, and
  `packages/engine/src/core/terrainStrike.ts`, `cascadeSupport`.
- **Strut geometry:** shape belongs to a construction block, not to a material whitelist,
  so another structural material can reuse the same mechanism. A single load-path field
  keeps support reading one load description rather than competing shape-specific fields;
  see `packages/engine/src/core/schema/blocks.ts`, `BlockSchema`. Content derives oriented
  burn replacements to avoid turning an open member into a cube. The bounded prism keeps
  mesh ownership inside its cell; explicit vertex ownership avoids inferring a cell from
  a sloping face normal. Open members opt out of cube-face cracks in content so damage
  cannot paint their empty gaps; see `packages/presentation/src/render/terrainCracks.ts`,
  `TerrainCracks.sync`. See `packages/engine/src/core/strutShape.ts`, `strutFaces`;
  `packages/engine/src/core/mesher.ts`, `emitStruts`; and
  `packages/mods/skelly.natural-world/struts.libsonnet`.
  Shots and aim use the visible member because stopping a bullet on its empty gap is
  misleading. Sight uses opacity independently. Bodies remain whole-cell because exact
  body contact also needs sweep and step-up work; templates keep members above head
  height rather than adding a temporary player-height placement restriction. Wire keeps
  its existing passage policy pending the shared wire passage work in #2062. See
  `packages/engine/src/core/raycast.ts`, `raycast`; and
  `packages/engine/src/core/blockRay.ts`, `blockRayQuery`.
  The prepared review keeps the check on passage, carrying and salvage rather than
  collecting tools; see
  `packages/deadvox/mods/skelly.deadvox.scenario.test-house.strut-look/README.md`.
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

### Settled window rules

A window is a fitted opening owner, not a door flag: breaking its glass must not
open or remove its frame. The latch belongs to an authored inside face so rotating
or saving the opening cannot swap who may reach it. An intact pane permits latch
access only from inside; a missing pane permits reaching through. Once unlatched,
either face can operate the sash. See `packages/engine/src/core/blockEntities.ts`,
`BlockEntities.operateWindow`, and `packages/engine/src/core/windowParts.ts`, `WindowState`.

Use the door-grain traversal rule: an opened sash is pickable where drawn but does
not stop bodies. An intact closed pane blocks bodies; breaking it allows ordinary
movement only where the remaining frame and rails leave room. Deliberate melee or
bashing breaks glass, not merely touching it. Clear glass must transmit sight and
light independently of body obstruction, so seeing a lamp through a pane does not
make it traversable. Picking and drawing share part geometry; see
`packages/engine/src/core/windowParts.ts`, `windowParts`, and
`packages/engine/src/core/blockEntities.ts`, `BlockEntities.lightBlockingBoxes`.

Body clearance follows the drawn rails rather than rounding a thin frame up to
whole occupied cells: a visually tall aperture must not silently become a low crawl
space. A content-authored head-clearance leeway admits near fits without admitting
a genuinely short opening; changing stance still changes the body that must fit.
The same clearance query serves movement and rising from a lowered stance. See
`packages/engine/src/core/apertureCollision.ts`, `apertureShapes`, and
`packages/engine/src/core/schema/furniture.ts`, `FurnitureSchema`.
Window content owns the leeway rather than actor or door tuning, because ordinary
open doors leave no narrowed aperture to check; see
`packages/engine/src/core/blockEntities.ts`, `BlockEntities.blocks`.

Every hit carries force. Breaking consumes content-authored force and the source
carries only its allowed residual onward; melee carries none. This is a destructible
rule, not a glass exception, so projectile and blast contacts can join the same
owner rather than damage actors through a presentation callback. Thresholds, yields
and sound selections belong to content. See
`packages/engine/src/core/destructibleHit.ts`, `resolveDestructibleHit`, and
`packages/engine/src/core/windowImpact.ts`, `strikeWindowPane`.

Frame remnants belong to the frame; fallen glass belongs to its floor location
from landing onward. Floor glass uses ordinary piled items with an explicit
content hazard selection: one hazard authority, not a window copy. Destroying the
frame therefore cannot sweep the floor, and another broken glass object can use
the same item ownership without a transfer-at-destruction path. Injury, protection
and sweeping belong at the shared traversal/item boundary, not in a window-only
injury callback. See `packages/engine/src/core/inventory.ts`, `Inventory.snapshotState`
and `Inventory.restoreState`, and `packages/engine/src/core/schema/items.ts`, `ItemSchema`.

### Power and appliance ownership

Power policy reasons live with the power implementation, not in a second set of
Slice 5 decision notes, so allocation and catch-up cannot acquire conflicting authorities; see
`packages/engine/src/core/power.ts`, `PowerNetwork`. The integration proofs below use the policies that
implementation selects; this plan retains only the cross-system obligations.

### Settled fire and exposure rules

- **Fire grain:** burning is per cell, so material destruction, neighbouring spread
  and local exposure share a spatial boundary. Bound simulation work and lighting
  invalidation without changing that grain; fluid fire is not required.
- **Fire ownership:** burning belongs to the world, saved whole alongside damage,
  rubble and support, because leaving the view must not pause a burning site or
  erase its remaining burn. See `packages/engine/src/core/world.ts`, `World`, and
  `packages/engine/src/core/fire.ts`, `Fire`.
- **Burnt material:** char holds nothing up or sideways; unloaded, supported char
  stays as consequential remains for take-apart. This is a material fact, not a
  burn event, so other remains can select the same rule. Loaded means held by
  support, and only terrain cells are support load. The support reader denies
  bearing; the terrain landing reader breaks crumbling material through ordinary
  ruin when a falling cell reaches it. One definition of load avoids a second
  predicate disagreeing with support about what a cell carries. See
  `packages/engine/src/core/structureSupport.ts`, `createSupport` and `SupportState.replaced`,
  and `packages/engine/src/core/terrainStrike.ts`, `landingCell` and `fallCell`.
  Placement already asks support whether the proposed block holds, so it refuses
  placement on char as unsupported; overriding that answer for one material would
  create a second path. See `packages/engine/src/core/worldPlacement.ts`, `createWorldPlacement`.
  Whether furniture, piles or bodies on char should break the floor is a separate
  question, outside this terrain-support rule.
  Falling and burning retain separate authored results because gravity and
  exhaustion are different events; see `packages/engine/src/core/schema/blocks.ts`,
  `BlockMaterialSchema`.
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
- **Wave gap:** predictable arrivals leave room to plan excursions. The gap spans
  scenario days, chosen on its grading: a content number with no debt, whose negative
  space is a sitting that never reaches wave two. Keep timing in scenario content so a
  mod changes one authority; the holdout scenario owns it, see
  `mods/skelly.deadvox.scenario.holdout/holdout-site.libsonnet`, `scenario`.
- **Repeat clock:** the gap counts from one arrival to the next, not from the end of
  a fight. The saved scenario run's calendar then fixes the whole schedule, and no
  rule has to decide when a fight with unloaded zombies has ended. Waves may
  overlap; that is accepted pressure, not a defect.
- **Wave target:** Holdout's plant attraction and last-known pursuit contract belongs
  to `docs/holdout.md`, "Waves and attention", so the scenario's reason to defend home
  is not chosen independently by the construction playtest. Target selection belongs
  in content; unattended defence depends on the region integration work. See
  `packages/engine/src/core/eventRules.ts`, `advanceEventRules`, for event execution.
- **Wave size budget:** the horde count bound protects actor and performance limits, so
  it stays as a safety bound, but as a per-pack budget beside the scenario's wave rows
  rather than a schema literal, chosen on its grading: each pack owns the ceiling it can
  afford and validate checks its rows against it; the negative space is no product-wide
  bound. See `packages/engine/src/core/schema/scenarios.ts`, `CityScenarioSchema` and
  `ComposedSiteSchema`, and `packages/engine/src/core/content.ts`, `checkEventRules`.
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
  without inheriting the gauntlet's city, hatch or map pool. Holdout's destinations
  and local encounters follow `docs/holdout.md`, "A landscape of destinations";
  the population boundary belongs to `docs/decisions/0010-composed-sites.md`, "Decision".
  See `mods/skelly.deadvox.scenario.holdout/holdout-site.libsonnet`, `scenario`, for
  scenario authoring. The mansion stays deferred past this playtest under #1332.
- **Shelter condition:** useful remaining structure and deliberate gaps invite both repair
  and rebuilding, rather than only filling holes. Shared architecture and owner-scoped
  condition keep that invitation reusable; see `docs/holdout.md`, "Shelter plot".
  Untouched damage stays derived so exploration does not create permanent damage records;
  see `docs/content.md`, "Template condition". Visual review uses
  `mods/skelly.deadvox.scenario.holdout.condition-look/README.md`, "Shelter condition look".
- **Supplies:** the site offers all three sources: rubble and take-apart of what
  stands there, authored stockpiles at a distance, and loot tables. Salvage alone
  starves the loop into dismantling the shelter to fix it, and loot alone makes
  supply random; distant stockpiles give excursions a deliberate target. Building
  tools and fasteners are found by looting POIs, not carried at start, so obtaining
  the means to build gives excursions a purpose. See
  `mods/skelly.deadvox.loot/loot.jsonnet`, `building_tools` and `building_materials`.
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
  Stockpiles use one pile pocket, shown as a list rather than a grid: players expect
  a pile to act like a pile, and mixed accepted materials must stack together without
  artificial pocket splits. Layout must not create a second set of transfer, handling
  or save rules. Capacity belongs to content, not cell geometry; count, mass and volume
  limits keep the mechanism usable for different kinds of stock. Volume needs authored
  item metadata because a two-dimensional inventory footprint cannot define it. See
  `packages/engine/src/core/schema/items.ts`, `ContainerSchema`,
  `packages/engine/src/core/inventory.ts`, `containerRoom`, and
  `packages/presentation/src/ui/inventoryScreen.ts`, `storageViewModel`.
  Stacking saves records and screen space, not carrying effort or handling time.
  Handling time follows what the hands actually move: a stack that leaves a
  stockpile as single items costs the per-item time once for each single that
  lands, so a hand or worn slot, which takes one, costs one item, not the stack.
  See `packages/engine/src/core/inventory.ts`, `singlesLanding`.
  One drop from a stockpile stack takes one carried stack, the same for every drop
  path: the drop key, the drop-here option and a drag to the ground. One drop moves
  what one carry moves, so dropping and picking up stay symmetric and a single press
  never dumps more than one carry's worth. See `packages/engine/src/core/inventory.ts`,
  `dropCount`, and `packages/presentation/src/ui/inventoryScreen.ts`, `tryQueue`.
  Drops onto a stack must not accidentally take that stack out by swapping it. See
  `packages/engine/src/core/items.ts`, `stackRoom`, and
  `packages/engine/src/core/inventory.ts`, `leavesAsSingles` and `dropsOnStockpileStack`.
  A stock pile is judged by its height in the world, so its authored capacity follows
  the drawn material thickness. A plank's thickness lives in its model, not in content;
  the board stack states the thickness it was drawn with. See
  `packages/mods/skelly.basic-recipes/basic-recipes-furniture.jsonnet`, `plankThickness`.
  Sheet metal is real stock beside scrap: a large and a small sheet, each distinct
  from scrap metal and modelled on Cataclysm: DDA's sheet family; a sheet-metal
  stack holds sheet only. Neither sheet has a model, so the stack's `sheetThickness`
  is an authored drawn value chosen for readability, not a measured one. Taking
  apart sheet-metal furniture yields sheet where that game's equivalent does. Scrap
  and sheet both stay because some items need scrap and some need sheet; see
  `packages/mods/skelly.materials/materials-items.jsonnet`, `sheet_metal`, and
  `packages/mods/skelly.structures/structures-furniture.jsonnet`, `sheetThickness`.
  Sheet cutting accepts either a torch or a metal saw so either tool can serve a
  stock-gathering trip. Metal repair uses scrap, leaving sheet as crafting stock.
  Drawn shapes must reveal depletion at a glance; an empty stack must not look full. See
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
  take-apart command grown to terrain cells, with rubble the first cell kind that
  comes apart, so clearing adds no second destruction verb and fallen material keeps
  one representation, solid for cover and pathing; see
  `DESIGN.md`, "Damage, destruction and dismemberment". A rubble cell is not a damaged
  wall in another coat. It carries conserved buried contents from the collapse;
  broken contents yield parts rather than disappearing, and take-apart digs out what
  was kept, so a collapse loses nothing it did not break. See
  `packages/engine/src/core/rubble.ts`, `SavedRubble`, and `packages/engine/src/core/craftCommands.ts`,
  `takeApartCell`. How rubble reads apart from a
  damaged wall is ruled under "Rubble look".
- **Know-how gates:** mixed. Some recipes are known from the start and others must be
  discovered through manuals and points of interest, because discovered recipes give
  exploring a purpose while known ones keep a player from getting hard-stuck. A start
  row owns what is known and a manual what is found; see
  `tools/jsonnet/lib/start-kit.libsonnet`, `common`, and
  `packages/mods/skelly.manuals/manuals-items.jsonnet`, `book`. The whole
  repair-and-fortify kit starts known, and only recipes outside it, traps and powered
  devices among them, are found, chosen on its grading: content lists with no debt,
  and no tester is hard-stuck before the first wave for want of a book; the negative
  space is that exploring has no construction reward in the first session. The sheet
  cuts (large sheet to small, small to scrap) start known like repair and fortify
  recipes: bulk stock is the base kit's own material, and a player holding sheet but
  not knowing how to cut it is hard-stuck for the same reason.
- **Early session:** a first base-building session runs once world repair, take-apart,
  placement of the whole repair-and-fortify kit and the first wave work, before fire,
  power controls and the brute land, because base building is the point of this
  playtest and early feedback on its UI is cheaper than a long wait. The whole kit,
  free-standing walls and floors included, is in the first session, chosen on its
  grading: it is the settled vocabulary under "First build vocabulary", so it carries
  no debt once built; its cost is that "Support" becomes a prerequisite of the session,
  so no wall floats and no floor hangs in front of a tester. Slice exit still needs the
  whole slice; see "Playtest questions and exit".

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

### Rubble look

- **Rubble look.** A rubble cell stays a full solid cube drawn with a per-material
  rubble texture, and loose fragments spill onto the neighbouring floor cells when it
  falls. Rubble must read apart from a damaged wall so the player picks the right verb
  (take apart for rubble, repair for a cracked wall), and a textured cube with spill
  does that on the existing block path, with no separate render path and no new block
  shape. Fragment instances inside a solid cell remain a possible later render.

## Reviewable build order

Every stateful work package includes validation, saves, replay evidence and
reason-doc updates, not a later save retrofit.

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
   noise attracts through ordinary senses, and boarding refuses opening from both faces.
   Show the tier-2 brute breaking doors and knocking the player back,
   including collision-safe displacement, rather than silently upgrading the cellar
   guard. Add #276 charged player attacks and hit-induced shambler stagger; prove
   charge interruption/save timing and hit-response timing separately from brute
   displacement. #107's bear trap is built; see `INTERACTIONS.md`, "Traps". BR
   approves breach, combat and trap readability.
6. **Fire, smoke and light.** Prove per-cell ignition and spread, material exhaustion,
   direct extinguishing, sight-blocking smoke, obstruction and light invalidation.
   Molotovs and wood cutting must enter the same fire owner; sufficient torch fuel
   remains a prerequisite, not a source of free ignition. Item lights and operating fixed
   lamps are stimuli to attention through the same sense (`packages/engine/src/core/agentPerception.ts`,
   `canSeeLight`; `packages/engine/src/core/lights.ts`, `fixedLightSenseSourceFor`); a switched-off,
   unpowered or obstructed lamp is no stimulus. Show a
   window cover changing source visibility through the opening. BR approves flame/smoke readability and
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

The open packages run as lanes, each one PR per round from main, ordered so the
first base-building session under "Early session" arrives through the fewest rounds.
Within a lane the order is a dependency; across lanes only the joins named here hold,
so rounds in different lanes run in parallel. No BR choice blocks a round, and the
rounds are tracked under #1332.

- **Construction, engine.** Cell and piece repair share one review
  (`packages/engine/src/core/craftCommands.ts`, `CraftCommands.repairEntity` and
  `CraftCommands.repairCell`), entered from the chosen piece or damaged cell under
  "Construction, view". Every breakable material yields its rubble item, and yields and
  clear times are content in `packages/mods/skelly.natural-world/block-materials.jsonnet`
  (`packages/engine/src/core/content.ts`, `checkBlockMaterials` refuses a breakable
  material without one), so the slow fallback under "Break yields" exists. Bulk stock
  is taken out of containers, never taken apart, under "Bulk stock". Rubble clearing is
  take-apart grown to terrain cells under "Rubble"
  (`packages/engine/src/core/craftCommands.ts`, `CraftCommands.takeApartCell`), entered
  from the chosen rubble cell; buried contents follow collapse under "Destruction".
  Placement is built in the engine for the whole "First build vocabulary": the wall, floor,
  door, shelf, door boarding, window boarding, the sheet panel on battens and the openable
  curtain (`packages/engine/src/core/craftCommands.ts`, `CraftCommands.place`;
  `packages/engine/src/core/worldDestination.ts`, `WorldDestination`). How the window
  covers behave is `docs/aftermath.md`, "Window variants". Player picking reaches the shared
  review through `packages/presentation/src/presentation/play.ts`, `confirmPlacementPicking`.
  Support is built under "Support": placement refuses a floating block and a break
  cascades what it held into rubble, ahead of the first session because free-standing
  walls and floors are in it and a wall that floats would be judged before the kit is.
- **Construction, view.** The hold menu offers Repair and Work on, the ring's name for
  take apart (`packages/engine/src/game/furnitureActions.ts`, `furnitureActionsFor`), and opens the
  pinned world-work review (`packages/presentation/src/ui/inventoryScreen.ts`,
  `InventoryScreen.openWorldWork`), whose layout is owned by
  `docs/crafting-layout.md`, "Decided layout"; this plan cues it and does not repeat
  it. Terrain repair and rubble clearing enter that same target-bound review from the
  interaction ring, preserving one surface without disguising cells as pieces. See
  `packages/engine/src/game/cellActions.ts`, `cellActionsFor`, and
  `packages/presentation/src/ui/inventoryScreen.ts`, `InventoryScreen.openCellWork`.
  Placement picking shares that review rather than adding a screen, with its reasons
  in `docs/crafting-layout.md`, "The picking gesture".
- **Playtest pack.** Author shelter and supply asks independently so each can be
  retuned without city-shape constraints; see
  `mods/skelly.deadvox.scenario.holdout/holdout-site.libsonnet`, `scenario`.
  Keep the starting kit and supply-site manuals aligned with "Know-how gates", so
  building has an accessible entry and exploration extends it. Site tuning stays
  in content rather than scenario-specific engine rules; see
  `docs/url-mods.md`, "Committed scenarios". Holdout's wider progression belongs to
  `docs/holdout.md`, "Supplies and progression". The pack, view and construction work
  must meet in the playable session; passing a debug fixture is not completion.
- **Waves as content.** Keep the count budget under "Wave size budget" separate from
  the attraction contract under "Wave target": performance limits do not decide why
  an enemy approaches the plant. Base-building usability remains the playtest's
  prerequisite, while target and unattended-defence work must preserve that contract.
- **Destruction.** The first session does not need the lane, so it runs beside
  construction without joining it. Actors strike terrain through
  `packages/engine/src/game/session.ts`, `bashObstacle` and
  `packages/engine/src/core/terrainStrike.ts`, `strikeTerrain`; pieces remain on
  `packages/engine/src/core/blockEntities.ts`, `BlockEntities.bash`. An actor's
  content-authored terrain blow kind sits beside strength and defaults to blunt, so a type
  selects a material response without coupling obstacle bashing to attack moves. The brute
  wrecks walls through its higher authored strength rather than an identity flag; timber's
  shared material gate stays above a shambler's effective blunt blow, so tools and actors
  share one wall-toughness tuning authority rather than an actor-only scale. A blow that
  leaves cells unheld cascades them
  into rubble under "Support" rather than being refused. Terrain is generated wherever
  collapse reaches, so region departure-and-return is not a prerequisite. Collapse timing
  at the largest authored roof is reported rather than used as a gate. Burial and impact
  harm follow "Support" for both terrain and falling furniture; ruin planning admits the
  fall before damage, so a refused plan cannot hurt or move a victim. See
  `packages/engine/src/core/furnitureMove.ts`, `commitRuin` and `crushFall`.
  Ordinary strikes never clear rubble: take-apart is the one clearing verb and recovers
  what the heap holds. Retained damage is settled: a blow that does not break keeps its
  new total; a break refused for want of room keeps full durability, so the cell stands
  at condition 0 and shows full-reach cracks; an admitted break ends the damage identity
  and the fallen cell is fresh rubble with nothing carried over; repair stops at the
  repair ceiling (`packages/deadvox/DESIGN.md`, "Repair ceiling"), so a repaired cell keeps
  its residual share. No partial residue of a refused or fallen cell is kept, because a
  standing wall that cannot fall should read as at its breaking point and rubble should
  never read as cracked. Blasts strike every solid cell they can see in their radius,
  sharing material strength by distance, while body damage remains separate. Sight
  already limits a blast to the faces it reaches, so a second flood path would repeat
  that boundary; separate strengths let wall-cracking and body harm tune apart as melee
  terrain impulse and body damage do. Fragments strike the first solid cell on each
  existing ray by fragment resistance. Breach charges follow, then furniture knock-out.
- **Built systems.** Switch and charger controls exist
  (`packages/engine/src/game/session.ts`, `powerControl` and `chargerControl`); any
  process beyond charging and lamps, and rewiring, stay under #1184. Brute knockback and
  displacement run independently, since nothing above needs them; fire last, under
  "Settled fire and exposure rules". None joins the first session.

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
- **Fire cost and light invalidation:** the cost spike admits the per-cell owner:
  repeated fire-off/on pairs isolate a small incremental fire cost in the Firefox
  acceptance comparison. Chromium's weak-hardware absolute frame-budget miss also
  occurs with fire off, so attributing that miss to fire would reject the wrong
  mechanism. Independent GPU timing complements the Firefox comparison where its
  timer extension is unavailable. Pooled light per burning cluster avoids making
  each burning face a lighting-bake invalidation source; see
  `packages/presentation/src/render/lightPool.ts`, `LightPool`. This cost gate is not
  acceptance of spread, smoke or integrated fire lighting. View/residency must not
  alter outcomes, and a performance win that leaves the room permanently dark is
  still a failure under `CHALLENGES.md`, "Lighting", and `CHALLENGES.md`, "Half-metre blocks".
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
