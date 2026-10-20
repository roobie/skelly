---
read_if:
  - you change item, recipe, appliance or handling ownership
  - you change compressed long actions, interruption, reading or save behavior
  - you change work-item escrow, salvage or reachability
---

# Deadvox interactions

This document keeps the reasons and ownership rules behind item use, crafting and appliances. The core/UI boundary is in [ADR 0001](docs/decisions/0001-ui-rendering-with-lit-html.md); the broader game design is in [DESIGN.md](DESIGN.md).

## Ownership

The core decides admission and effects; the UI projects queries and sends commands. Queries change nothing. Delayed commands revalidate when they complete because reach, tools and world state may have changed. Item ownership stays in item trees; quickbar and light selections are non-owning UID references. The quickbar shows only what the player carries, so a binding clears when its item leaves the person by any route, and a saved binding to an item not carried restores empty. See `src/game/quickbar.ts`, `Quickbar.resolve`, and `src/core/inventory.ts`, `Inventory.carriedByUid`. UI selection, drag state and open panels are not saved game state.

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

Craft completion awards practice; take-apart work does not. Recipe knowledge is explicit, and books add knowledge without changing item ownership. Practice is source-agnostic. Any future activity-tier restriction is triggered by #275.

## Long actions and interruptions

Movement and gameplay action input are ignored while resting, sleeping or crafting. Reading is the exception described above: movement closes the page and passes through. Each action keeps its own stop, cancel and wake behavior; an emitted interruption, such as a hit or critical need, drops compression and is handled by the action owner. A nearby or aware hostile alone neither refuses nor interrupts a long action. The player judges whether the area is safe.

Wait stops on movement. Rest can be cancelled through its anchor or its cancel action; movement does not stop it. Sleep starts at sleepable furniture; movement and its cancel action do not stop it, but an emitted interruption wakes the player. Craft uses its cancel action and resumes after interruption. See `src/core/longAction.ts`, `LongActions.syncInterruption`, and `src/core/sim.ts`, `Simulation.checkInterruptions`.

## Appliances

An appliance is a block entity whose behavior comes from components, not its id. Containers own pockets; controls issue commands; workstations provide recipe qualities; processes run without the player; power joins the electricity graph.

A process runs while its chunk is loaded and catches up when it loads again. Settle its state at every rate change before applying the new rate; otherwise unloaded time can disagree with live ticking. Inside the block around the player, test catch-up against ordinary ticking, including a rate change; beyond it, test that the coarse result is deterministic. See [ADR 0008](docs/decisions/0008-deterministic-world.md). Appliance controls, processes and power are Slice 5 work.

Cooking uses a lit workstation when its recipe requires heat. A player craft stops if that requirement is lost; a process owned by an appliance does not occupy the player's hands or require compression.
