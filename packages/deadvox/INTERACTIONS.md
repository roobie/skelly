---
read_if:
  - you change item, recipe, appliance, charging, liquid-transfer or handling ownership
  - you change compressed long actions, interruption, reading or save behavior
  - you change work-item escrow, salvage or reachability
  - you change how a trap is set, springs, holds or is disarmed
---

# Deadvox interactions

This document keeps the reasons and ownership rules behind item use, crafting and appliances. The core/UI boundary is in [ADR 0001](docs/decisions/0001-ui-rendering-with-lit-html.md); the broader game design is in [DESIGN.md](DESIGN.md).

## Ownership

Queries must not acquire ownership: inspecting an action is not consent to spend. Commands revalidate at admission and completion because reach, tools and world state can change after inspection. Recorded intents carry identities and choices rather than executable plans, so replay cannot substitute nearby stock or another target. See `src/core/craftCommands.ts`, `CraftCommands.previewEntityRepair`, and `src/game/replayCommands.ts`, `ReplayActionPayload` and `applyReplayActionPayload`.

Non-owning selections cannot extend an owner's authority. A quickbar binding must not reach an item that has left the person, and transient UI state must not become saved simulation truth. See `src/game/quickbar.ts`, `Quickbar.resolve`, and `src/core/inventory.ts`, `Inventory.carriedByUid`.

Liquid service requires an explicit destination: silently choosing another vessel or discarding excess would hide a consequential player choice. Vessels retain their owners so pouring does not masquerade as fitting or moving a container. Each committed increment uses live admission rather than a saved plan, preventing competing requests from spending the same contents. Interruption keeps liquid already moved: cancellation must not undo physical effects or resume an unsaved pour. Explicit endpoint commands make replay independent of nearby stock. See `src/game/survival.ts`, `Survival.pour`, `src/game/replayCommands.ts`, `applyReplayActionPayload`, `src/core/liquids.ts`, `planLiquidTransfer`, and `src/core/inventory.ts`, `Inventory.planLiquidTransfer` and `Inventory.transferLiquid`.

A refused pour must distinguish a burning endpoint, a full receiver and an unheld source: a blanket incompatibility message hides the actionable state and falsely suggests the vessels cannot exchange fuel. See `src/core/options.ts`, `pourRefusal`.

The reservoir card is a transfer target, not an item slot. Keeping the receiver card fixed prevents source selection from changing the destination mid-gesture. Naming the other hand's vessel makes the destination explicit without a picker or nearby-stock search; emptying needs no separate ownership mechanism. The source's authored pour rate governs its flow because the source is the vessel being tipped. Measured contents stay on the opened card to avoid permanent HUD clutter. See `src/ui/inventoryScreen.ts`, `detailsTemplate` and `InventoryScreen.hoverServiceTarget`, and `src/core/options.ts`, `pourRefusal` and `otherHandPour`.

An ownership change is where food can change environment, so it is also where food settles. A leaving subtree first takes its old environment's aging, so a new place changes only later aging and no command can rewrite the past. A refused or cancelled move leaves ownership as it was; aging that is already due is not undone. Relocated, fallen and destroyed furniture settles its pockets before they move. Plans stay pure: merge admission compares projected exposure without settling. See `src/core/inventory.ts`, `Inventory.settleFood` and `Inventory.currentFood`, and `src/core/furnitureMove.ts`, `beforeRelocating`.

Moves, crafting, appliances and quickbar actions share the reach query so they cannot disagree about accessible items. Keep one inventory counter per store; only add per-place counters if Slice 5 profiling shows view-model rebuilding cost needs them, and BR decides whether that evidence warrants the change. See `src/core/reach.ts`, `reach`, and `src/core/options.ts`, `options`.

Handling jobs use real time; long actions use game time and can run compressed. Saved work is plain data, not a closure. Snapshotting projects state without mutating the live session. See [ADR 0002](docs/decisions/0002-saves.md).

Inventory Management improves ordinary transfers and derived gathering, unpacking and search costs, and awards practice after successful completion. Firearms Combat owns firearm readiness, reload, rack, magazine work and attachment fitting/removal. Until Gunsmithing owns attachment work, Firearms Combat improves that work and receives its practice. Inventory Management does not speed or train firearm work.

## Held consumables

Food and drink use their food capability; painkillers use their analgesic capability, one pill per use; treatment uses its treatment capability on a wound it can help. The held item owns its primary action, while quickbar use remains a separate route. See `src/game/survival.ts`, `Survival.use` and `Survival.useFromQuickbar`.

## Crafting

Craft work owns progress and escrows item inputs so interruption cannot lose materials or duplicate spending. Liquid stays in the vessels chosen at begin until completion: switching vessels would spend one the player did not see, and unfinished work holding no liquid means taking it apart loses none. Hands, tools and workstation remain live requirements rather than promises made by a preview. See `src/core/craftWork.ts`, `craftActionHooks`, and `src/core/inventory.ts`, `Inventory.beginWork` and `Inventory.releaseWork`.

Recipes are content. Alternatives may compete for the same stock, so planning must find a feasible allocation rather than choose each group independently. Tools stay where they are and cannot also be consumed as item components. A player's alternative or source-vessel choice never silently falls back. Liquid is material and the vessel is not, so a recipe consumes liquid from reachable vessels while each vessel stays its owner's item. A vessel serving as a tool still supplies liquid because it is not consumed. Filled containers are not component stock, including when fitted to another component. See `src/core/crafting.ts`, `planCraft`, `src/core/items.ts`, `craftComponentEligible`, and `src/core/inventory.ts`, `Inventory.planLiquidDraws`.

The planner is a disposable view. Commands obtain current reach and plan again; editing a returned plan cannot change later results. See `src/core/crafting.ts`, `planCraft`, and `src/core/longAction.ts`, `LongActions`.

Reading a recipe book is a long action only while its page is open. Closing it pauses work and retains progress; moving closes the page and lets movement proceed. Progress belongs to the action, not to the authored text. Readable-only notes and signs have no timed job. See `src/game/play.ts`, `stopReadingOnClose`, and `src/core/bookReading.ts`, `bookReadingHooks`.

Disassembly snapshots its yield so stopping and resuming cannot change the promised output after a skill or tool change; see `src/core/disassembly.ts`, `planDisassembly`.

Repair addresses an existing owner, not a new result: its name must describe the selected piece rather than a recipe's item output. An explicit entity identity prevents mending a replacement at the same position or another matching piece. Inspection grants no reservation or future permission; a refused completion returns escrow rather than silently choosing a different target. Saved work and replay must retain that same ownership boundary. See `src/core/items.ts`, `WorkTarget`; `src/core/craftCommands.ts`, `CraftCommands.previewEntityRepair` and `CraftCommands.repairEntity`; `src/core/craftWork.ts`, `entityRepairRefusal`; and `src/core/inventory.ts`, `Inventory.releaseWork`.

Craft completion awards practice; take-apart work does not. Recipe knowledge is explicit, and books add knowledge without changing item ownership. Practice is source-agnostic. A tiered activity trains a skill only up to its tier, and practice at or above that tier is dropped, so repeating easy work cannot carry a skill upward; see `src/core/character.ts`, `Character.awardPractice`, and `src/content/base/recipes.libsonnet`, `training`.

## Long actions and interruptions

Movement and gameplay action input are ignored while resting, sleeping or crafting. Reading is the exception described above: movement closes the page and passes through. Each action keeps its own stop, cancel and wake behavior; an emitted interruption, such as a hit or critical need, drops compression and is handled by the action owner. A nearby or aware hostile alone neither refuses nor interrupts a long action. The player judges whether the area is safe.

Wait stops on movement. Rest can be cancelled through its anchor or its cancel action; movement does not stop it. Sleep starts at sleepable furniture; movement and its cancel action do not stop it, but an emitted interruption wakes the player. Craft uses its cancel action and resumes after interruption. See `src/core/longAction.ts`, `LongActions.syncInterruption`, and `src/core/sim.ts`, `Simulation.checkInterruptions`.

## Traps

The bear-trap rules and their reasons are in `SLICE-5.md`, "Settled bear-trap rules — issue #107"; this section keeps their ownership.

A set trap is an ordinary item lying in a ground pile, with its armed or holding state on the item. The pile already saves, splits by region and owns the item, so recovery is an ordinary pickup of that same item and no placed-object store is needed until construction places entities (`SLICE-5.md`, "Construction and persistent placement"). A set or holding trap refuses every move, so it cannot be picked up still armed or pulled off a caught leg. The holding state names its victim and how long its jaws still hold; the player's wound and the zombie's leg damage live in their own bodies. See `src/core/bearTrap.ts`, `BearTraps`, and `src/core/inventory.ts`, `Inventory.plan`.

Setting and disarming are handling jobs. Handling jobs are never saved, which makes the disarm non-resumable across a save as the rule requires. A hit, a critical need or movement withdraws a pending disarm instead of pausing it, so the next attempt starts its full duration. Its completion clears the armed state and fires nothing. See `src/game/bearTrapActions.ts`, `interruptDisarm`.

Only traps inside the block of nine regions around the player spring, and the test is positions only, never whether a column is loaded or drawn. See `src/core/worldRegion.ts`, `inPlayerBlock`. Unloaded zombies wait for Slice 4b catch-up without moving, so inside the block an unloaded zombie cannot newly enter a trap's cell; one already standing in it is still caught. See `src/core/zombies.ts`, `ZombieSystemOptions`.

## Appliances

Appliance processes belong to block entities, not the character's hands or long
action. Inputs stay in ordinary pockets so cancellation and destruction need no
second item store. The charging owner uses inventory admission and splitting;
active ownership prevents withdrawal until stopped or complete. See
`src/core/batteryChargers.ts`, `BatteryChargers`, and `src/core/inventory.ts`,
`Inventory.plan`.

Settle old service before changing controls, wiring or ownership so a command
cannot rewrite past work. Rendering residency must not affect an initialized
process. Pause on loss of power; completion releases demand at its boundary,
not at the end of an absence. See `src/core/power.ts`, `PowerWork`, and
`docs/electricity.md`, "Solar and elapsed time".

Authored appliance identity must survive streaming and reload rather than depend
on whichever mesh is visible. See `src/core/sitePower.ts`, `SitePower`, and
`src/game/session.ts`, `createSessionPower`. Every power settlement, from a
scheduled tick or a control, updates charging cells in the same step, so power
and cell energy always share one boundary. A snapshot copies that boundary
without settling it, because settling would make saving change the run. See
`src/core/power.ts`, `PowerNetwork`; `src/core/batteryChargers.ts`,
`BatteryChargers`; and `src/core/saveState.ts`, `snapshotSession`.

Loading and collecting use ordinary handling so the same reach and ownership
checks apply at admission and completion. Starting and stopping do not occupy
hands; an opened inventory surface keeps machine diagnosis local without a
permanent HUD. See `src/ui/chargerPanel.ts`, `chargerPanel`, and
`src/game/session.ts`, `chargerControl`.

Relocation and destruction settle before ownership changes, including pieces
that fall when their support moves, so reserved contents are neither lost nor
duplicated. A relocated charger loses its authored connection rather than carrying
service with it. See `src/core/furnitureMove.ts`, `FurnitureMover`, and
`src/core/batteryChargers.ts`, `BatteryChargers.beforeRemove`.
