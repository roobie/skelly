---
read_if:
  - you change recipe authoring, workstation, disassembly or salvage rules
  - you change craft ownership, progression, reading or save behavior
  - you change reachability validation or the repair-corner scenario
---

# Crafting ownership and planning

Crafting shares the item-tree, reach, option and long-action owners. This document keeps the constraints behind those boundaries; implementation lives in `src/core/crafting.ts`, `src/core/itemTree.ts` and `src/core/longAction.ts`.

## Ownership

Inventory owns item trees, moves, splits, consumption and escrow. Work items own their recipe or disassembly payload, progress and exact inputs; the reserved second hand is not a second owner. Quickbar and selected-light references remain non-owning UIDs. Restoration validates ownership before exposing live inventory, and a saved reference is not silently repaired.

The planner is pure and disposable. Commands obtain current reach and plan again. Component alternatives can compete for stock, so allocation must find a feasible combination. Tools stay in place, may provide multiple qualities, and cannot also be consumed as components. Filled containers are not stock. Player preferences never silently fall back.

Gathering uses ordinary handling costs; work time follows recipe content, station bonuses and character skill. A partial retrieval is one handling operation. Choosing a smaller stack when retrieval costs tie uses leftovers first. See `src/core/crafting.ts`, `planCraft`, and `src/core/clock.ts`, `simToGameHours`.

## Work and progression

A craft requires both hands free; stowing is the player's decision. The work item escrows inputs so nothing else can consume them mid-craft. Losing a tool or station stops work without losing progress; the same work can resume when requirements return. Finishing consumes escrow once and creates the result. Cancellation returns exact input identities.

Disassembly snapshots yield when work starts, so stopping, skill changes or tool changes cannot alter its promised output. Repair recipes improve an existing target and are not disassembly results. Craft completion awards practice; take-apart does not. Recipe knowledge is explicit, and books add knowledge without changing item ownership. Books teach recipes; practice may come from any activity. See `src/core/disassembly.ts`, `planDisassembly`, and `src/core/character.ts`, `Character.awardPractice`.

Reading a recipe book progresses only while its page is open. Closing the page pauses work and preserves progress; movement closes it and passes through. Readable-only notes and signs do not create a timed job. See `src/core/bookReading.ts`, `bookReadingHooks`, and `src/game/play.ts`, `stopReadingOnClose`.

## Long actions

Long actions are saved data, not closures. Each retains its own stop/cancel/wake behavior. An emitted interruption drops compression; proximity alone does not refuse or interrupt work, leaving the player to judge safety. Rest/sleep and crafting share the core action owner, but their progress belongs to their respective saved state.

## Appliances and stations

Appliance behavior comes from components, not ids: containers own pockets, controls issue commands, workstations provide qualities, processes run without the player, and power joins the electricity graph. A process catches up when its chunk loads. Settle state at every rate change before applying the new rate; inside the block around the player, test catch-up against ordinary ticking, including a mid-run rate change; beyond it, test that the coarse result is deterministic (`docs/decisions/0008-deterministic-world.md`, "Decision"). Appliance controls, processes and power are Slice 5 work.

Cooking uses a lit station for recipes that require heat. Losing it stops the player craft; an appliance-owned process does not occupy hands or require compression.

## Reachability and tests

Validation checks recipe references and reachability from known recipes, components, tools and authored sources. The repair corner demonstrates reachable plans rather than pinning a particular stock catalogue. See `src/core/reachability.ts`, `checkReachability`, and `src/game/testHouse.ts`, `populateTestHouseRepairCorner`.
