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

The core decides admission and effects; the UI projects queries and sends commands. Queries change nothing. Delayed commands revalidate when they complete because reach, tools and world state may have changed. Item ownership stays in item trees; quickbar and light selections are non-owning UID references. The quickbar shows only what the player carries, so a binding clears when its item leaves the person by any route, and a saved binding to an item not carried restores empty. See `src/game/quickbar.ts`, `Quickbar.resolve`, and `src/core/inventory.ts`, `Inventory.carriedByUid`. UI selection, drag state and open panels are not saved game state.

Liquid service requires an explicit destination: silently choosing another vessel or discarding excess would hide a consequential player choice. Vessels retain their owners so pouring does not masquerade as fitting or moving a container. Each committed increment uses live admission rather than a saved plan, preventing competing requests from spending the same contents. See `src/core/liquids.ts`, `planLiquidTransfer`, and `src/core/inventory.ts`, `Inventory.planLiquidTransfer` and `Inventory.transferLiquid`.

An ownership change is where food can change environment, so it is also where food settles. A leaving subtree first takes its old environment's aging, so a new place changes only later aging and no command can rewrite the past. A refused or cancelled move leaves ownership as it was; aging that is already due is not undone. Relocated, fallen and destroyed furniture settles its pockets before they move. Plans stay pure: merge admission compares projected exposure without settling. See `src/core/inventory.ts`, `Inventory.settleFood` and `Inventory.currentFood`, and `src/core/furnitureMove.ts`, `beforeRelocating`.

Moves, crafting, appliances and quickbar actions share the reach query so they cannot disagree about accessible items. Keep one inventory counter per store; only add per-place counters if Slice 5 profiling shows view-model rebuilding cost needs them, and BR decides whether that evidence warrants the change. See `src/core/reach.ts`, `reach`, and `src/core/options.ts`, `options`.

Handling jobs use real time; long actions use game time and can run compressed. Saved work is plain data, not a closure. Snapshotting projects state without mutating the live session. See [ADR 0002](docs/decisions/0002-saves.md).

Inventory Management improves ordinary transfers and derived gathering, unpacking and search costs, and awards practice after successful completion. Firearms Combat owns firearm readiness, reload, rack, magazine work and attachment fitting/removal. Until Gunsmithing owns attachment work, Firearms Combat improves that work and receives its practice. Inventory Management does not speed or train firearm work.

## Held consumables

Food and drink use their food capability; painkillers use their analgesic capability, one pill per use; treatment uses its treatment capability on a wound it can help. The held item owns its primary action, while quickbar use remains a separate route. See `src/game/survival.ts`, `Survival.use` and `Survival.useFromQuickbar`.

## Crafting

A craft requires both hands empty; stowing items is the player's choice. The core plans from reachable components and tools, then escrows inputs in one owned work item. Tools and workstation remain live requirements and are rechecked while the action runs. Losing one stops work without losing progress. The work item owns progress and exact input subtrees, so a stopped craft can travel and resume without a reservation table.

Recipes are content. Alternatives may compete for the same stock, so planning must find a feasible allocation rather than choose each group independently. Tools stay where they are and cannot also be consumed as components. A player's preference may choose among alternatives, but it never silently falls back. Filled containers are not component stock.

The planner is a disposable view. Commands obtain current reach and plan again; editing a returned plan cannot change later results. See `src/core/crafting.ts`, `planCraft`, and `src/core/longAction.ts`, `LongActions`.

Reading a recipe book is a long action only while its page is open. Closing it pauses work and retains progress; moving closes the page and lets movement proceed. Progress belongs to the action, not to the authored text. Readable-only notes and signs have no timed job. See `src/game/play.ts`, `stopReadingOnClose`, and `src/core/bookReading.ts`, `bookReadingHooks`.

Finishing a craft consumes escrow once and creates the result; cancellation returns the exact input identities. Disassembly snapshots its yield when work begins, so stopping and resuming cannot change the promised output after a skill or tool change. Repair recipes improve an existing target and are not disassembly results. See `src/core/disassembly.ts`, `planDisassembly`.

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
`src/game/session.ts`, `createSessionPower`. Settlement at the snapshot barrier
prevents a save from keeping power at one time and cell energy at another; see
`src/core/saveState.ts`, `snapshotSession`.

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
