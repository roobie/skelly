---
read_if:
  - 'you decide the crafting and world-work layout for #1469'
  - you implement the shared requirements rows, target review or world-work entry
  - you prepare a crafting or construction UI look fixture
---

# Crafting and world-work layout

## Scope and authority

The #1469 crafting tab and world-work view ship together, after their layout is
settled, because shipping world work first would establish a second shape for
crafting to replace. This document owns that layout's unresolved choices; it is
separate from `../DESIGN.md` so the decision surface does not bury the game's
settled rules. Questions below are alternatives, not approved designs. Resolve
them before building their dependent surface, then retain the reasons and code
cues rather than an implementation checklist.

This is the construction-view gate for #1332. Placement picking follows the
shared view and the placement engine, not the other way round; see
`../SLICE-5.md`, "Lanes and the next rounds". Inventory item movement, recipe
content expansion (#1465) and inventory key binding choices (#1463) are not
reopened by this layout.

## Rulings the layout preserves

- **One surface, two contexts.** Ordinary crafting stays in Crafting; a chosen
  world piece opens a short-lived vertical in the same character screen. Repair
  and Take apart share it, rather than adding world recipes to the catalogue.
  Both world entries and the turnable target view arrive with the crafting
  layout. See `../DESIGN.md`, "World repair selection", and `../INTERFACE.md`,
  "Layout".
- **Target pin and consent.** The chosen identity, not the crosshair or another
  matching kind, owns the review. Closing or losing the target discards it.
  Review spends nothing; explicit Start revalidates. World Start closes the
  screen; hand crafting keeps it open. See `../DESIGN.md`, "World repair selection", and `../INTERFACE.md`, "Layout".
- **Short rows, fixed alternatives.** Each input group has one row showing the
  chosen alternative's found and needed amounts, its name and the number of
  other options. Click or keyboard entry opens that group's alternatives in a
  fixed side column inside the rows pane. Single-option groups are plain rows;
  hover never switches the column and the column overlays no row. Crafting and
  world work have one owner for it. See `../INTERFACE.md`, "Layout".
- **Reachable refusals.** Refused Start remains focusable, so its reason is
  available without a mouse. The existing screen owns navigation and closing;
  target inspection does not introduce keyboard aiming. See `../INTERFACE.md`,
  "Layout", and `../DESIGN.md`, "World repair selection".
- **World work belongs to the piece.** Running and paused jobs, progress and
  repair escrow live on the piece's work slot, not a pocket or player queue.
  Paused repair and take-apart reserve the piece. Continue belongs on its ring.
  See `../DESIGN.md`, "World repair selection", and `../DESIGN.md`, "Edits persist".
- **Whole or parts, not both.** Whole-piece work is the default; an authored parts
  blueprint selects per-part work and condition. Both use the same review, and
  content cannot select both models for one kind. See `../DESIGN.md`, "World repair selection".
  This layout does not pretend the parts mechanism is already built.
- **Hold and tap retain their meanings.** Every piece with a hold action,
  including building parts, offers the ring; tap retains ordinary use and action
  directions remain stable. See `../DESIGN.md`, "Moving furniture".
- **Progress and interruptions stay shared.** Running work uses the handling
  HUD; paused work does not gain a status panel. A blow stops outright; critical
  needs prompt through the shared Continue/Stop ring with bound accelerators.
  See `../INTERFACE.md`, "HUD", and `../DESIGN.md`, "Long actions".
- **Yield is not hand delivery.** World take-apart yield lands through the drop
  spots at the disassembling actor's feet. Review must not suggest it goes to
  inventory. See `../DESIGN.md`, "World repair selection".
- **A review cannot change the work contract.** Alternatives compete for stock;
  explicit input and source-vessel choices never silently fall back. Resume
  retains progress and snapshotted yield, not a fresh job. See
  `../INTERACTIONS.md`, "Crafting".
- **Knowledge, text and tuning.** Keyboard-first UI exposes only character-known
  facts; the world keeps running. Labels and values are content, control labels
  follow bindings, and precision uses the shared formatter. Density, duration,
  quantities and other tunables stay in content. See `../DESIGN.md`, "UI principles", `../INTERFACE.md`, "Text", and
  `PILLARS.md`, "Content forward compatibility" (repo root).

## Ownership cues

The seams for this work are `packages/presentation/src/ui/inventoryScreen.ts`,
`InventoryScreen.openRepair` and `InventoryScreen.update`, for the target lifetime;
`packages/presentation/src/ui/craftController.ts`, `mountCraftPanel`, for choices
and dispatch; and `packages/presentation/src/ui/crafting.ts`, `renderCrafting`,
with `packages/presentation/src/ui/craftReadout.ts`, `craftRows`, for the shared
review. The relayout must not turn those projections into another planner.
`packages/engine/src/core/craftCommands.ts`, `CraftCommands.previewEntityRepair`,
`CraftCommands.repairEntity` and `CraftCommands.takeApartEntity`, remain command
boundaries. Menu entry belongs with
`packages/engine/src/game/furnitureActions.ts`, `furnitureActionsFor`, and
`packages/presentation/src/presentation/play.ts`, `confirmFurnitureAction`.

A turnable world-target depiction must preserve the pin rather than querying a
new crosshair target. It may not reveal hidden contents. Item illustration rules
are a knowledge constraint, not a claim that an item viewer already renders
world pieces; see `../INTERFACE.md`, "Item pictures".

## Questions for #1469

No option is selected. Tech debt means future rework caused by a shortcut, not
build size; see `GLOSSARY.md`, "Tech debt" (repo root). Negative space names what
an option leaves out. Each question blocks only the build slice that needs it.

### Q1. How does a player choose a crafting recipe?

The world vertical already has a target and operation from the ring; it needs no
recipe catalogue. Both choices below retain that vertical and the shared rows.

**A. Catalogue beside one selected review.** Crafting has a recipe selector and
one review pane; world work uses the review without the catalogue.
- Tech debt: none inherent; selection is presentation state, not a second work owner.
- Negative space: no simultaneous comparison of expanded recipes.
- WTF (player): selecting a recipe is an extra step before reading its inputs.
- Build cost: moderate; selection, focus retention and a catalogue layout.

**B. A scrolling list of expanded recipe reviews.** Each recipe uses the shared
rows; only the actively entered group's fixed alternatives column is populated.
- Tech debt: none inherent if both contexts share the renderer; preserving two
  requirement renderers as a shortcut would create drift and is not admitted.
- Negative space: no compact overview once many recipes are known.
- WTF (player): reaching a later recipe means scrolling past unrelated requirements.
- Build cost: moderate; keeping the active row and fixed column associated while scrolling.

### Q2. Where do target, time, blockers and Start sit?

Both options put the pinned name and operation at the review's head, a turnable
world target beside its rows, and alternatives in their own fixed column inside
those rows. Take apart shows read-only yield instead of editable inputs. The
inspection control turns only the depiction, never selects another world target.

**A. Persistent commitment strip.** Time, the start refusal and Start remain below
the review while the rows scroll; the target depiction remains beside the rows.
- Tech debt: none inherent; one shared shell keeps both contexts aligned.
- Negative space: less vertical space for long rows at large content density.
- WTF (player): a permanently visible refused Start may be far from the missing input.
- Build cost: moderate; independent scrolling and narrow-viewport hit testing.

**B. Document-flow commitment.** Time follows the heading; blockers and Start
follow the rows. The depiction and fixed alternatives column stay beside the rows.
- Tech debt: none inherent; this is a complete layout, not a temporary footer.
- Negative space: Start is not always visible on a long review.
- WTF (player): the last missing requirement and Start may require another scroll.
- Build cost: lower; focus revelation still needs proof across the whole review.

Neither choice may solve width pressure with an overlay or hover-switched column.
The look must fit both the turnable target and the fixed alternatives at the
supported narrow viewport and enlarged content density; failing that look returns
this question for revision, not an unruled responsive layout.

### Q3. What does the piece's Continue entry open?

This is distinct from the already-ruled interruption prompt. Neither option lets
resume edit escrow, reroll yields or choose a replacement target.

**A. Reopen the pinned review.** Show the saved job's inputs or yield, remaining
time and live blockers; explicit Continue resumes and closes the screen.
- Tech debt: none inherent; one review can project either an unstarted plan or owned work.
- Negative space: no one-gesture resume from the piece.
- WTF (player): Continue on the ring leads to another Continue.
- Build cost: moderate; a read-only saved-job projection and remaining-time presentation.

**B. Resume from the ring directly.** Revalidate there; refusal uses the shared
refusal channel and successful work goes straight to the handling HUD.
- Tech debt: none inherent if this uses the same command owner, not a parallel resume path.
- Negative space: no pre-resume review of remaining time and saved yield.
- WTF (player): Start requires a review but Continue does not.
- Build cost: lower; entry wiring and refusal evidence rather than a saved-job review.

### Q4. What is the keyboard path through the review?

Both options keep existing character-screen tab and close bindings. Entering a
group explicitly, not hovering, reveals alternatives; activating a choice updates
the review without starting work. Refused Start remains reachable, with its
reason on focus. Escape from a nested chooser returns to its row before the
ordinary screen-close path; no key rotates or retargets the world piece while
focus belongs to rows. Inspection has an explicit focus stop of its own.

**A. Sequential controls.** Tab and reverse Tab visit recipe choice (if present),
inspection, group controls, alternatives, source controls and Start in reading
order; ordinary activation selects. Arrow keys operate only within a chooser.
- Tech debt: none inherent; standard focus semantics need no parallel navigation model.
- Negative space: no fast row-to-row traversal independent of the number of controls.
- WTF (keyboard player): a source-heavy recipe takes many focus steps to reach Start.
- Build cost: lower; focus restoration and labels rather than a composite grid.

**B. Region navigation.** Tab visits catalogue, inspection, rows, alternatives and
commit controls; arrows move within the focused region and activation enters a
group or selects an option. Reverse navigation returns to the owning row.
- Tech debt: none inherent with one shared focus owner; a separate world-work
  keyboard controller would be shortcut debt and is excluded.
- Negative space: fewer controls in ordinary sequential tab order.
- WTF (keyboard player): arrows navigate a region instead of scrolling the page.
- Build cost: higher; composite focus, announcement and pointer/keyboard parity proofs.

### Q5. Where do liquid source choices live?

The fixed column must list the selected group's alternatives under either option.
Automatic choice must report the planner's actual selection, not invent a choice
from the first affordable alternative. A refused explicit choice stays visible.

**A. Sources beneath alternatives in that column.** A liquid group's source
control opens the column even when it has one material option; its input row
stays plain, with no alternatives-entry affordance.
- Tech debt: none inherent; material and source choices share the group's owner.
- Negative space: alternatives and vessels compete for column height.
- WTF (player): a one-option liquid row has source detail while a one-option solid row does not.
- Build cost: moderate; source focus and column grouping.

**B. Sources as a separate detail below the rows.** The side column only selects
materials; an explicitly opened source detail lists vessels and planned draws.
- Tech debt: none inherent; one projection can feed two controls without copied planning.
- Negative space: input choice and vessel choice are not adjacent.
- WTF (player): changing a liquid alternative affects a source detail elsewhere.
- Build cost: moderate; association, scrolling and focus restoration between the controls.

### Q6. How much recipe finding belongs in the joint shipment?

This does not alter recipe knowledge or input affordability. A missing requirement
must not become a hidden recipe unless the player explicitly requests that filter.

**A. Search only.** Match known recipe names, leaving categories, favourites and
makeable-only filtering for a separate #1469 decision after the joint look.
- Tech debt: none; a bounded complete search is not a throwaway catalogue.
- Negative space: no favourite list, category browsing or makeable-only shortcut.
- WTF (player): remembering a recipe name is easier than discovering an unfamiliar one.
- Build cost: lower; query, empty result and focus retention.

**B. Search plus authored categories and an explicit makeable-only filter.**
- Tech debt: none if categories are content and feasibility comes from the planner;
  deriving a second affordability rule in the UI would be debt and is excluded.
- Negative space: no favourites; categories still need author coverage.
- WTF (player): a recipe disappears from the filtered list when reachable stock changes.
- Build cost: higher; category content/admission and stable focus under live filtering.

### Q7. When does placement choose its destination?

This gates placement picking under #1332, not the joint crafting/world-work
shipment. Both options require the placement engine, retain explicit Start after
review, pin a destination without borrowing a piece identity, and revalidate
occupancy at commitment. Neither chooses the kit's scope or the picking gesture.
Those construction decisions remain outside #1469.

**A. Destination before review.** Selecting a placement recipe enters destination
picking, then opens the shared review with that destination pinned.
- Tech debt: none inherent; the review receives a complete target context.
- Negative space: no full requirements review before choosing a spot.
- WTF (player): choosing a spot can end in a review showing missing supplies.
- Build cost: moderate; return from picking and cancellation without spending.

**B. Requirements before destination.** The recipe review exposes destination
picking as an explicit control; Start stays refused until a valid pin exists.
Picking returns to that review for commitment.
- Tech debt: none inherent; an incomplete presentation selection is not a saved job.
- Negative space: no immediate world-first placement from selecting a recipe.
- WTF (player): the recipe is affordable but Start still needs a destination.
- Build cost: moderate; unpinned and pinned review states with focus restoration.

## Build slices after the decisions

These are delivery boundaries, not permission to ship one player view first.
Each includes a testHouse fixture start built under `docs/PROCESS.md`, "Reviews by eye and by play" (repo root), so the reviewer arrives beside the check with
all required gear, known recipes and world state. This plan itself changes no UI
and needs no playable fixture.

- **Joint first look.** After Q1, Q2, Q4, Q5 and Q6, present both contexts with the
  shared rows, fixed column and turnable target, before full engineering. The
  testHouse fixture includes a damaged chair beside an intact take-apart crate,
  competing input alternatives, liquid vessels and a deliberately missing tool.
  Show narrow and enlarged-density layouts, keyboard entry, hover stability and
  focusable refusal. Any review-only scaffolding is removed in the joint delivery,
  not shipped as a second player surface.
- **Joint player delivery (construction view).** After the look and Q3, wire both
  crafting and world work through command ownership in one shipment. The
  testHouse fixture offers hand crafting, Repair, Take apart and a resumable world
  job, plus a controllable interruption; setup must not make BR wait to obtain
  the paused state. Prove pin loss, refused Start, world close versus crafting
  stay-open, Continue, yield at the feet and save/resume without duplicate inputs.
  Extend an owning browser smoke flow rather than creating parallel stages.
- **Cell-work integration.** When the cell repair and rubble-clearing contracts
  for #1332 exist, extend that same review, not a terrain-specific screen. Its
  testHouse fixture starts beside a cracked wall and rubble with the required
  supplies; BR compares piece and cell work and sees clearing's output. This
  waits on those engine decisions, not on an invented cell-as-piece identity.
- **Placement picking.** After the placement engine and joint delivery, join
  recipe review to the chosen destination using the same rows and commit shape.
  Q7 settles the handoff; the picking gesture remains a construction decision
  under #1332, so this layout grants no new targeting mode. The testHouse fixture has a window,
  doorway and wall gap, the kit and an occupied destination, so BR can place,
  encounter refusal and inspect the result without scavenging. It corresponds
  to the placement-picking dependency in `../SLICE-5.md`, "Lanes and the next rounds".
