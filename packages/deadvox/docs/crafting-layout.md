---
read_if:
  - 'you decide or implement the crafting and world-work layout for #1469'
  - you implement the shared requirements rows, target review or world-work entry
  - you prepare a crafting or construction UI look fixture
  - you change recipe catalogue scale, search, category or tag filtering
  - you change crafting keyboard navigation or recipe placement order
---

# Crafting and world-work layout

## Scope and authority

The #1469 crafting tab and world-work view ship together, after their layout is
settled, because shipping world work first would establish a second shape for
crafting to replace. This document owns the layout decisions and remaining
questions, separate from the game's broader rules in `../DESIGN.md`.
Q1, Q2, Q3, Q5 and Q6 are decided. Only Q4 and Q7 offer alternatives; neither has
a selected option. Implementation trims intent into reasons and code cues.

This is the construction-view gate for #1332. Placement picking follows the
shared view and placement engine; see `../SLICE-5.md`, "Lanes and the next rounds".
Inventory item movement, recipe content expansion (#1465) and inventory key
binding choices (#1463) are not reopened by this layout.

## Rulings the layout preserves

- **One surface, two contexts.** Crafting stays in its tab; Repair and Take apart
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
  content cannot select both models for a kind. This does not claim the parts
  mechanism is built. See `../DESIGN.md`, "World repair selection".
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
`InventoryScreen.openRepair` and `InventoryScreen.update`. Choices and dispatch
belong with `packages/presentation/src/ui/craftController.ts`, `mountCraftPanel`;
review with `packages/presentation/src/ui/crafting.ts`, `renderCrafting`, and
`packages/presentation/src/ui/craftReadout.ts`, `craftRows`. A projection must not
become another planner. Commands remain under
`packages/engine/src/core/craftCommands.ts`, `CraftCommands.previewEntityRepair`,
`CraftCommands.repairEntity` and `CraftCommands.takeApartEntity`. Menu entry uses
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

### Q1. Paged catalogue beside one selected review — A

Query and filters remain above compact results; page navigation and result
position stay with that pane. Selection updates the adjacent review without
replacing the catalogue. World work has no recipe catalogue.

**Reason from the option grading:** bounded results and one shared review avoid
a small-catalogue renderer that needs replacing. The accepted cost is less width
for long names and requirements, not a separate navigation trip to compare the
next recipe. Simultaneous expanded-recipe comparison is outside this layout.

### Q2. Persistent commitment strip — A

Time, blockers and Start remain in a fixed strip below scrolling rows. The pinned
name and operation head the review, the turnable world target stays beside its
rows, and material alternatives occupy their fixed side column. Take apart
shows read-only yield rather than editable inputs. Turning inspection never
selects another world target.

**Reason from the option grading:** one shared shell keeps commitment visible
and both contexts aligned, at the cost of row height and possible distance
between a missing input and the refused Start. First look must fit target, rows
and side column together on a narrow screen at enlarged content scale. Failure
returns the layout for revision, not an overlay or hover-switched column.

### Q3. Continue reopens the pinned review — A

The piece's Continue entry opens owned work: work done, time left, saved inputs
or yield, and live blockers. Explicit Continue in the strip closes the screen
and resumes after revalidation. Neither escrow, yield nor target can be edited
into a new job. This is distinct from the interruption prompt.

The reason is that remaining time must be available before recommitting:

> I chose this because I assume the player will want the ability to see how long time is left prior to committing

A second Continue is the accepted cost; there is no one-gesture resume from the
piece's ring.

### Q5. Source detail below rows — B

An explicitly opened detail below the rows lists source vessels and planned
liquid draws; the side column only chooses material alternatives. Automatic
choice reports the planner's actual selection, never the first seemingly
available alternative. A refused explicit choice stays visible.

**Reason from the option grading:** one projection can serve separate material
and source controls without copied planning. This keeps vessel lists from
competing with alternatives for column height, accepting that a material change
can affect a source detail elsewhere in the review.

### Q6. Browse-first facets with search — A

A searchable category browser stays beside results. Text query and searchable
tag picks narrow that branch; the active path, tags and makeable-only toggle
remain visible. Missing requirements hide no recipe unless that toggle is
selected. No favourites, inferred tags, fuzzy matching or field-syntax language
is implied.

**Reason from the option grading:** one query state over authored metadata
avoids category-specific catalogues and copied affordability logic. Visible
browsing supports discovery, accepting the space cost even when the name is
known and the need to clear a visible branch filter before searching elsewhere.

## Open choices

Neither Q4 nor Q7 is selected. Grades use `GLOSSARY.md`, "Tech debt" (repo root):
future shortcut rework is not build cost. Negative space names omissions.

### Q4. Keyboard navigation without Tab traversal

Tab keeps opening/closing the inventory menu, never moving within it. Do not
borrow arrows or plain Enter as though they were free: their inventory actions
can operate on a selected item behind the crafting view. Ownership is
`packages/engine/src/core/inputActions.ts`, `INPUT_ACTIONS`, with authored defaults
in `packages/mods/skelly.controls/controls.jsonnet`, `controls`, resolved by
`packages/engine/src/game/bindingRegistry.ts`, `bindingsFromControls` and
`BindingRegistry`. `packages/presentation/src/presentation/play.ts`,
`activePlayContext`, uses the inventory context for this screen.

The candidate local controls below use PageUp/PageDown and Shift+Enter; B also
uses Home/End. These have no ungated inventory binding in the base controls.
Debug-gated commands retain priority. No control-file binding is changed by
these proposals. They require screen-local focus handling, not pretending that
browser Tab traversal already provides it. See
`packages/presentation/src/presentation/inputBindings.ts`, `KeyboardInput.press`
and `KeyboardInput.unmatchedDown`, and
`packages/presentation/src/ui/inventoryScreen.ts`, `InventoryScreen.onAction`.
Stored rebindings must not be shadowed: the shared input owner checks active
bindings before a local navigation handler. Prove that precedence in the build.

Both schemes keep one focused control, focusable refused commitment, explicit
row entry, and a keyboard-reachable Close alternatives control that returns to
its row. Tab closes the menu even with a chooser open; it is not a chooser-only
exit. Text fields retain caret/editing keys, including Home/End; PageUp/PageDown
can leave the field for the previous/next control and Shift+Enter finishes query
entry without starting work. Start/Continue require their own focused activation.
Inspection turns only through its explicitly focused controls, never through
row movement. The depicted keys are fixed local-control candidates, not a new
inventory binding preset; pointer controls remain available under either scheme.

**A. Page keys step every control.** PageUp/PageDown move focus through category
and query controls, the bounded results page, inspection, rows, alternatives,
source detail and commitment in reading order. Shift+Enter activates the focused
control. Result-page buttons are ordinary stops, not keys that spend materials.
- Tech debt: none inherent with one shared focus owner; a separate world-work
  focus list would be shortcut debt and is excluded.
- Negative space: no fast jump between regions; PageUp/PageDown no longer scroll
  the focused review directly, though focus revelation and wheel scrolling remain.
- WTF (keyboard player): page keys move control focus, and a long result page
  takes many presses before Start; Shift+Enter is less familiar than Enter.
- Build cost: moderate; focus ordering, text-field exit, chooser return and
  active-binding precedence, without region memory.

**B. Home/End change region; page keys move within it.** Outside text entry,
Home selects the previous region and End the next: finding controls, results,
inspection, rows, alternatives, sources and commitment. PageUp/PageDown move
among the focused region's controls; Shift+Enter activates. Returning to a
region restores its focused control by identity, not row position.
- Tech debt: none inherent with one shared region/focus owner; storing a second
  selected recipe or work target in navigation would create drift and is excluded.
- Negative space: more navigation concepts; Home/End cannot also mean the first
  and last control outside text entry. No direct page-key scrolling.
- WTF (keyboard player): Home/End switch regions but move the caret in a query;
  the player must leave text entry before using the region shortcut.
- Build cost: higher; region focus memory and restoration under filtering in
  addition to A's precedence, editing and chooser-return proofs.

### Q7. When does placement choose its destination?

This gates placement picking under #1332, not the joint view shipment. Every
option requires the placement engine, explicit Start after review, a destination
pin without borrowing piece identity, and occupancy revalidation. Kit scope and
the picking gesture remain construction decisions outside this choice.

**A. Destination before review.** Selecting a placement recipe enters picking,
then opens the pinned review.
- Tech debt: none inherent; the review receives complete target context.
- Negative space: no full requirements review before choosing a spot.
- WTF (player): choosing a spot can end in a review showing missing supplies.
- Build cost: moderate; return from picking and cancellation without spending.

**B. Requirements before destination.** Review exposes a destination control;
Start stays refused until a valid pin exists. Picking returns for commitment.
- Tech debt: none inherent; incomplete selection is presentation, not saved work.
- Negative space: no immediate world-first placement from recipe selection.
- WTF (player): the recipe is affordable but Start still needs a destination.
- Build cost: moderate; unpinned/pinned states with focus restoration.

**C. Order authored per placement recipe.** A proposed recipe field,
`placementReviewOrder`, selects `spot-first` or `review-first`; it is not derived
from an ID, category or item name.
A Jsonnet authoring default supplies review-first, while validation requires the
compiled field on every placement recipe. Non-placement recipes do not gain a
meaningless order field. The proposed field is part of the placement contract,
not a claim that `RecipeSchema` already has it; see
`packages/engine/src/core/schema/recipes.ts`, `RecipeSchema`, and
`PILLARS.md`, "Content forward compatibility" (repo root).

Spot-first suits fitting to an existing opening or gap: window boards, a door
barricade or wall fill, where inspecting the place determines whether the work
makes sense. Review-first suits free-standing walls, floors or furnishings,
where the player can weigh inputs and time before hunting for a spot. These are
proposed authoring examples, not an engine classification or an expansion of
the first-session kit. An author may choose either order for any placement
recipe; review-first is the conservative authoring default because requirements
remain inspectable without first committing to a location.
- Tech debt: none inherent with one content selector and the same two flow
  mechanisms; inferring exceptions from recipe identity would be debt and is excluded.
- Negative space: no universal order to learn; no automatic inference or runtime
  fallback for missing recipe metadata.
- WTF (player): one recipe enters the world immediately while another opens
  requirements; the author must make that distinction sensible in play.
- Build cost: higher; schema/admission and authoring default, content assignments,
  both navigation paths, and cancellation/pin/focus proofs for both.

## Build slices after the decisions

These are delivery boundaries, not permission to ship one player view first.
Each needs a testHouse fixture start under `docs/PROCESS.md`, "Reviews by eye and by play"
(repo root), with the reviewer beside the target and carrying the required gear.
This documentation plan itself changes no UI and needs no playable fixture.

- **Joint first look.** Q4 is the remaining layout gate. Show both contexts with
  the decided catalogue beside review, category browser, fixed commitment strip,
  source detail below rows, fixed alternatives and turnable target. Include a
  damaged chair, take-apart crate, competing materials, liquids and a missing
  tool, plus thousands of synthetic known recipes and enough categories/tags to
  test menu search and result paging. Prove retained context, empty results,
  keyboard navigation, hover stability and focusable refusal at narrow and
  enlarged-density layouts. No review scaffolding ships as a second surface.
- **Joint player delivery.** After the look, wire crafting and world work through
  command ownership in one shipment. The fixture offers hand crafting, Repair,
  Take apart and prepared resumable work, plus a controllable interruption, so
  the reviewer need not wait for a paused job. Show work done/time left before
  Continue, pin loss, refused commitment, world-close/crafting-stay-open, yield
  at the feet and save/resume conservation. Extend an owning browser smoke flow.
- **Cell-work integration.** Once #1332's cell repair and rubble-clearing
  contracts exist, extend the same review rather than adding a terrain screen.
  Its fixture starts beside a cracked wall and rubble with supplies; it must
  not fake cells as piece identities while those engine decisions are open.
- **Placement picking.** After the placement engine, joint delivery and Q7,
  join destination picking to the shared rows and commit shape. The fixture has
  a window, doorway, wall gap, kit and occupied destination. If C is selected,
  include one recipe of each authored order and one using the authoring default;
  do not silently implement C while the choice remains open. The picking gesture
  remains a #1332 construction decision; see
  `../SLICE-5.md`, "Lanes and the next rounds".
