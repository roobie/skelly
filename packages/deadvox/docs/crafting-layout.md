---
read_if:
  - 'you decide or implement the crafting and world-work layout for #1469'
  - you implement placement picking, its ghost or its hold-ring entries
  - you implement the shared requirements rows, target review or world-work entry
  - you prepare a crafting or construction UI look fixture
  - you change recipe catalogue scale, search, category or tag filtering
  - you change crafting keyboard navigation or recipe placement order
---

# Crafting and world-work layout

## Scope and authority

The #1469 crafting tab and world-work view shipped together, after their layout
was settled, because shipping world work first would have established a second
shape for crafting to replace. This document owns the decided layout, separate
from the game's broader rules in `../DESIGN.md`. All layout choices are settled.

Placement picking under #1332 joins the shared view and the placement engine;
see `../SLICE-5.md`, "Lanes and the next rounds".
Inventory item movement, recipe content expansion (#1465) and inventory key
binding choices (#1463) are not reopened by this layout.

## Rulings the layout preserves

- **One surface, two contexts.** Crafting stays in its tab; Repair and Work on
  share an ephemeral world-work vertical in the same character screen. Both
  world entries and the turnable target view arrive with the crafting layout.
  See `../DESIGN.md`, "World repair selection", and `../INTERFACE.md`, "Layout".
- **Target pin and consent.** The chosen identity owns the review, not the
  crosshair or another matching kind. Closing or losing the target discards it.
  Review spends nothing; explicit Start revalidates. World Start closes the
  screen; hand crafting keeps it open. See `../DESIGN.md`, "World repair selection",
  and `../INTERFACE.md`, "Layout".
- **Short rows, fixed alternatives.** One row per input group shows the chosen
  alternative's found/needed amounts, name and number of other options. Explicit
  pointer or keyboard entry opens alternatives in a fixed side column within
  the rows pane. Single-option groups are plain rows; hover never switches the
  column and it overlays no row. Both contexts share its owner. See
  `../INTERFACE.md`, "Layout".
- **Reachable refusals.** Refused commitment remains focusable with its reason.
  Inspection never introduces keyboard target selection. See
  `../INTERFACE.md`, "Layout", and `../DESIGN.md`, "World repair selection".
- **World work belongs to the piece.** Running/paused work, progress and repair
  escrow live on its work slot, not a pocket or player queue. Paused repair and
  take-apart reserve the piece; Continue belongs on its ring. See
  `../DESIGN.md`, "World repair selection", and `../DESIGN.md`, "Edits persist".
- **Whole or parts, not both.** Whole-piece work is the default; an authored parts
  blueprint selects per-part work and condition. Both use the same review, and
  content cannot select both models for a kind. See
  `../DESIGN.md`, "World repair selection".
- **Slots are the parts review's subject.** A parts piece lists its blueprint
  slots by number and name, each with its fitted part's condition blip or Empty;
  an empty slot never shows a spare's blip. A picked slot shows its one action
  directly: a filled slot its removal, an empty slot its spares, each with
  condition and where it lies. An action choice appears only for a slot that
  offers more than one, because picking a spare and pressing Start already say
  Fit. The strip names the action and the slot. The name belongs to the slot, so
  a housing without slot anchors still lists named slots. A housing with
  anchors also picks slots on the model by socket numbers, which keep the model
  clean while the names stay in the list. Without anchors the screen is the same,
  list only. The model stays beside the rows at every width. See
  `packages/presentation/src/ui/craftController.ts`, `mountCraftPanel`.
- **The screen takes sites, not housings.** The review and its socket picks read
  each slot as a site value: its name, an optional anchor in the model's frame,
  its fitted part or Empty, and its services. A scratch-built vehicle has no
  authored anchors, so a screen that read the housing's furniture content could
  never serve it; with sites, a vehicle producer filling them from the build is a
  new producer beside the housing one, not a rewrite. The site value and the
  screen, its readout and socket projection included, hold no housing type. A
  boundary check refuses any import of the furniture schema, housing or
  part-service modules into them, and any name that reaches those modules
  through a re-export, alias or union. The one exception is the replay command
  a site service starts: the screen forwards it without inspecting its kind, so
  a command union that includes part service gives the screen no housing
  knowledge. Only the housing producer stays outside the check. That makes drift
  between housing and vehicle screens impossible rather than a review item, and
  stops the screen growing anchor logic that works only for housings. The vehicle
  producer arrives with #1949; see `decisions/0011-lazy-part-state.md`, "Scope".
  See `packages/presentation/src/ui/workSite.ts`, `WorkSiteProducer`;
  `packages/presentation/src/ui/housingSites.ts`, `housingSites`; and
  `packages/presentation/tools/work-site-boundary.mjs`.
- **Hold and tap.** Every piece with a hold action, including building parts,
  offers the ring; tap retains ordinary use and directions remain stable. See
  `../DESIGN.md`, "Moving furniture".
- **Progress and interruptions.** Running work uses the handling HUD; paused work
  gains no status panel. A blow stops outright; critical needs use the shared
  Continue/Stop ring with bound accelerators. See `../INTERFACE.md`, "HUD", and
  `../DESIGN.md`, "Long actions".
- **Yield and work ownership.** World take-apart yield uses drop spots at the
  actor's feet, not hand delivery. Alternatives compete for stock; explicit input
  and source choices never silently fall back. Resume retains progress and
  snapshotted yield rather than making a fresh job. See
  `../DESIGN.md`, "World repair selection", and `../INTERACTIONS.md`, "Crafting".
- **Knowledge, text and tuning.** Keyboard-first UI shows character-known facts;
  the world keeps running. Text, quantities, durations and density are content;
  bound-key labels follow bindings and precision uses the shared formatter. See
  `../DESIGN.md`, "UI principles", `../INTERFACE.md`, "Text", and
  `PILLARS.md`, "Content forward compatibility" (repo root).

## Ownership cues

Target lifetime belongs with `packages/presentation/src/ui/inventoryScreen.ts`,
`InventoryScreen.openWorldWork` and `InventoryScreen.update`. Choices and dispatch
belong with `packages/presentation/src/ui/craftController.ts`, `mountCraftPanel`;
review with `packages/presentation/src/ui/crafting.ts`, `renderCrafting`, and
`packages/presentation/src/ui/craftReadout.ts`, `craftRows`. A projection must not
become another planner. Commands remain under
`packages/engine/src/core/craftCommands.ts`, `CraftCommands.previewEntityRepair`,
`CraftCommands.repairEntity`, `CraftCommands.takeApartEntity` and, for an owned job,
`CraftCommands.previewPieceWork`. Menu entry uses
`packages/engine/src/game/furnitureActions.ts`, `furnitureActionsFor`, and
`packages/presentation/src/presentation/play.ts`, `confirmFurnitureAction`.

The turnable world-target depiction preserves the pin and reveals no hidden
contents. Item illustration rules constrain knowledge, not a promise that the
item viewer already renders world pieces; see `../INTERFACE.md`, "Item pictures".

## Catalogue scale

The #1469 catalogue must remain useful with thousands of known recipes. Compact,
bounded result pages show counts and position and retain query/filter context.
Only the selected recipe expands requirements, so catalogue size does not
multiply controls or full craft projections. Page size is content tuning;
unknown recipes remain outside the catalogue.

Search uses result names and authored search terms. Category and tag selections
narrow it; active constraints stay visible and removable. A category branch
includes descendants. Filter menus themselves are searchable and bounded, so a
long recipe list is not replaced with a long filter list. Empty results keep the
controls available. No inferred classification or semantic-search service is
assumed; see `packages/engine/src/core/schema/recipes.ts`, `RecipeSchema`,
`RecipeCategorySchema` and `RecipeTagSchema`.

Metadata narrowing precedes requested makeable-only evaluation; feasibility
uses the shared planner, not a full catalogue scan per repaint. Incomplete work
must not claim an exact makeable count. Reach changes cannot silently start
another recipe or lose the selected review; Start revalidates. See
`packages/engine/src/core/crafting.ts`, `planCraft`, and
`packages/presentation/src/ui/craftReadout.ts`, `craftRows`. Measure large-catalogue
query and feasibility work before promising live counts.

## Decided layout

### Paged catalogue beside one selected review

Query and filters remain above compact results; page navigation and result
position stay with that pane. Selection updates the adjacent review without
replacing the catalogue. World work has no recipe catalogue.

**Reason from the option grading:** bounded results and one shared review avoid
a small-catalogue renderer that needs replacing. The accepted cost is less width
for long names and requirements, not a separate navigation trip to compare the
next recipe. Simultaneous expanded-recipe comparison is outside this layout.

### Persistent commitment strip

Time, blockers and Start remain in a fixed strip below scrolling rows. The pinned
name and operation head the review, the turnable world target stays beside its
rows, and material alternatives occupy their fixed side column. Take apart
shows read-only yield rather than editable inputs. A piece's slots and their
spares are rows of that one review; pressing one, never hovering, points the
strip at it, as a catalogue result points the review at its recipe. Turning
inspection never selects another world target.

**Reason from the option grading:** one shared shell keeps commitment visible
and both contexts aligned, at the cost of row height and possible distance
between a missing input and the refused Start. First look must fit target, rows
and side column together on a narrow screen at enlarged content scale. Failure
returns the layout for revision, not an overlay or hover-switched column.

### Continue reopens the pinned review

The piece's Continue entry opens owned work: work done, time left, saved inputs
or yield, and live blockers. Explicit Continue in the strip closes the screen
and resumes after revalidation. Neither escrow, yield nor target can be edited
into a new job. This is distinct from the interruption prompt.

The reason is that remaining time must be available before recommitting:

> I chose this because I assume the player will want the ability to see how long time is left prior to committing

A second Continue is the accepted cost; there is no one-gesture resume from the
piece's ring.

### Source detail below rows

An explicitly opened detail below the rows lists source vessels and planned
liquid draws; the side column only chooses material alternatives. Automatic
choice reports the planner's actual selection, never the first seemingly
available alternative. A refused explicit choice stays visible.

**Reason from the option grading:** one projection can serve separate material
and source controls without copied planning. This keeps vessel lists from
competing with alternatives for column height, accepting that a material change
can affect a source detail elsewhere in the review.

### Browse-first facets with search

A searchable category browser stays beside results. Text query and searchable
tag picks narrow that branch; the active path, tags and makeable-only toggle
remain visible. Missing requirements hide no recipe unless that toggle is
selected. No favourites, inferred tags, fuzzy matching or field-syntax language
is implied.

**Reason from the option grading:** one query state over authored metadata
avoids category-specific catalogues and copied affordability logic. Visible
browsing supports discovery, accepting the space cost even when the name is
known and the need to clear a visible branch filter before searching elsewhere.

### Page keys step every control

Tab keeps opening/closing the inventory menu, never moving within it. Do not
borrow arrows as though they were free: their inventory actions can operate on a
selected item behind the crafting view. Ownership is
`packages/engine/src/core/inputActions.ts`, `INPUT_ACTIONS`, with authored defaults
in `packages/mods/skelly.controls/controls.jsonnet`, `controls`, resolved by
`packages/engine/src/game/bindingRegistry.ts`, `bindingsFromControls` and
`BindingRegistry`. `packages/presentation/src/presentation/play.ts`,
`activePlayContext`, uses the inventory context for this screen.

A focused control owns the plain Enter or Space its native activation answers;
a bound inventory verb on such a key runs when no control that answers it holds
focus. Not every field or button answers a bound activation key, while every
native control answers its own, so focused-control precedence keeps one
activation everywhere. See `../INTERFACE.md`, "Layout".

Previous control, next control and focused activation become inventory-context
actions with default chords PageUp, PageDown and Shift+Enter in controls content,
like reading-context navigation. Labels follow bindings so rebinding cannot
leave stale key caps; see `../INTERFACE.md`, "Text", and `PILLARS.md`,
"Content forward compatibility" (repo root). These defaults have no ungated
inventory binding collision in the base controls. Ordinary binding resolution
owns precedence, including debug gates and stored rebindings; no separate local
key handler bypasses it. Browser Tab traversal does not provide screen-local focus
handling because Tab closes the menu. See
`packages/presentation/src/ui/inventoryScreen.ts`, `InventoryScreen.onAction`.

Navigation keeps one focused control, focusable refused commitment, explicit
row entry, and a keyboard-reachable Close alternatives control that returns to
its row. Tab closes the menu even with a chooser open; it is not a chooser-only
exit. Text fields retain caret/editing keys, including Home/End and Space;
previous/next control actions can leave the field and Enter finishes query entry
without starting work. Start/Continue start only when focused and activated.
Inspection turns only through its explicitly focused controls, never through
row movement. Pointer controls remain available.

Previous/next control actions move focus through category and query controls,
the bounded results page, inspection, rows, alternatives, source detail and
commitment in reading order. Result-page buttons are ordinary stops, not keys
that spend materials.

**Reason from the option grading:** one shared focus owner avoids separate
world-work navigation and needs no region memory. The accepted costs are no
fast region jump and many presses through a long page. With the default
bindings, page keys no longer scroll the review directly; focus revelation and
wheel scrolling remain. The build must prove focus ordering, text-field exit,
chooser return and active-binding precedence.

### Order authored per placement recipe

Placement order belongs to content rather than an ID, category or name in code:
authors choose whether inspecting a spot or weighing requirements should come
first. See `packages/engine/src/core/schema/recipes.ts`, `RecipeSchema`, and
`packages/mods/skelly.basic-recipes/basic-recipes-construction.jsonnet`, `placementOrder`.
The authoring default keeps requirements inspectable before a location is chosen;
the compiled contract stays explicit under `PILLARS.md`, "Content forward compatibility"
(repo root).

Spot-first suits fitting to an existing opening or gap: window boards, a door
barricade or wall fill, where inspecting the place determines whether the work
makes sense. Review-first suits free-standing walls, floors or furnishings,
where the player can weigh inputs and time before hunting for a spot. These are
content examples, not an engine classification or an expansion of
the first-session kit. An author may choose either order for any placement
recipe; review-first is the conservative authoring default because requirements
remain inspectable without first committing to a location.

Content selects between shared flow mechanisms rather than recipe-ID exceptions.
The accepted cost is no universal order: authors must make the distinction
sensible in play, and both paths need cancellation, pin and focus proofs.

### The picking gesture

Use one gesture for everything the crosshair places, so carried and newly built
pieces do not teach competing controls. Keep the result see-through and tint its
admission from content: the player must judge both the model and the occupied
world behind it. Default fronts and boarding faces point toward the builder so
aiming alone makes the ordinary choice without a separate facing or side control.
See `packages/presentation/src/presentation/play.ts`, `placementDestination` and
`drawPlacementGhost`; `packages/presentation/src/render/placementGhost.ts`, `PlacementGhost`.

The refusal belongs to the placement engine, not a screen's copy of its rules,
and lives in the prompt under the interaction-hint setting so a refused ghost
explains itself without defeating the player's chosen hint visibility. See
`packages/engine/src/core/craftCommands.ts`, `CraftCommands.previewPlacement`, and
`packages/presentation/src/presentation/play.ts`, `interactionHintFor`.

Boarding belongs on the door's or opening's hold ring as well as in crafting,
because the opening is where the need becomes apparent. Entries derive from
known recipes' boarding results so a pack reaches the ring without an engine
edit; see `packages/engine/src/game/furnitureActions.ts`, `furnitureActionsFor`.

A picked destination is not a piece identity: a free spot has no existing piece
to name. Keep pin presence separate from its optional name, and revalidate at
commitment rather than treating the ghost's answer as a reservation; see
`packages/presentation/src/ui/craftReadout.ts`, `placementRow`, and
`packages/presentation/src/ui/craftController.ts`, `placementStart`. One finished
build is one and done so each build is a separate commitment, at the accepted
cost of reopening the recipe instead of queuing spots from one review.

## Build slices after the decisions

These are delivery boundaries, not permission to ship one player view first.
Each needs a testHouse fixture start under `docs/PROCESS.md`, "Reviews by eye and by play"
(repo root), with the reviewer beside the target and carrying the required gear.

The joint first look and the joint player delivery of crafting and world work are
delivered: the look fixtures are
`packages/deadvox/mods/skelly.deadvox.scenario.test-house.crafting-look/starts.jsonnet`, `starts`, and
`packages/deadvox/mods/skelly.deadvox.scenario.test-house.housing-slots-look/README.md`, "Housing-slot look", and
world work starts through `packages/presentation/src/ui/inventoryScreen.ts`,
`InventoryScreen.openWorldWork`, and `packages/presentation/src/ui/craftController.ts`,
`worldStart`. Placement picking uses the same review; its fixture is
`packages/deadvox/mods/skelly.deadvox.scenario.test-house.placement-look/README.md`, "Placement look".
Cell-work integration remains under #1332:

- **Cell-work integration.** Cell repair and rubble clearing exist in the engine
  (`packages/engine/src/core/craftCommands.ts`, `CraftCommands.repairCell` and
  `CraftCommands.takeApartCell`) but reach players only through the debug
  interface. Extend the same review for a looked-at cell rather than adding a
  terrain screen, and never fake a cell as a piece identity. Its fixture starts
  beside a cracked wall and rubble with supplies.
