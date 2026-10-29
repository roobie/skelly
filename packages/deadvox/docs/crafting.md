---
read_if:
  - you change recipe authoring, browsing taxonomy, workstation, disassembly or salvage rules
  - you change craft ownership, progression, reading or save behavior
  - you change reachability validation or the repair-corner scenario and its authored stock destinations
---

# Crafting ownership and planning

Crafting shares the item-tree, reach, option and long-action owners. This document keeps the constraints behind those boundaries; implementation lives in `src/core/crafting.ts`, `src/core/itemTree.ts` and `src/core/longAction.ts`.

## Ownership

Inventory owns item trees, moves, splits, consumption and escrow. Work items own their recipe or disassembly payload, progress and exact inputs; the reserved second hand is not a second owner. Quickbar and selected-light references remain non-owning UIDs. Restoration validates ownership before exposing live inventory, and a saved reference is not silently repaired.

The planner is pure and disposable. Commands obtain current reach and plan again. Component alternatives can compete for stock, so allocation must find a feasible combination. Tools stay in place, may provide multiple qualities, and cannot also be consumed as components. Filled containers are not stock. Player preferences never silently fall back.

Gathering uses ordinary handling costs; work time follows recipe content, station bonuses and character skill. A partial retrieval is one handling operation. Choosing a smaller stack when retrieval costs tie uses leftovers first. See `src/core/crafting.ts`, `planCraft`, and `src/core/clock.ts`, `simToGameHours`.

## Recipe browsing

Recipe classification is independent of item categories and skill gates so repairs and
future world results can share navigation without pretending to be inventory items.
A tree gives each recipe one browsing home; tags express overlapping properties without
duplicating branches. Content owns the labels and search terms so packs can extend or
translate the catalogue without a code registration. See `src/core/schema.ts`,
`RecipeSchema`, and `src/core/content.ts`, `checkRecipeCategories` and `checkRecipe`.

Browsing is inspection, not admission: filtering must not spend stock, grant knowledge or
change a running job. Unknown recipes remain hidden, including their exclusive branches
and tags, because navigation must not disclose knowledge the character lacks. Selection
clears rather than silently choosing another recipe when a query hides it. See
`src/ui/recipeBrowser.ts`, `recipeBrowser`.

## Work and progression

A craft requires both hands free; stowing is the player's decision. The work item escrows inputs so nothing else can consume them mid-craft. Losing a tool or station stops work without losing progress; the same work can resume when requirements return. Finishing consumes escrow once and creates the result. Cancellation returns exact input identities.

Disassembly snapshots yield when work starts, so stopping, skill changes or tool changes cannot alter its promised output. Repair recipes improve an existing target and are not disassembly results. Craft completion awards practice; take-apart does not. Recipe knowledge is explicit, and books add knowledge without changing item ownership. Books teach recipes; practice may come from any activity. See `src/core/disassembly.ts`, `planDisassembly`, and `src/core/character.ts`, `Character.awardPractice`.

Blades already dull with use, so each wearing blade has two sharpening repairs: a grind at a grinding wheel found in garages and workshops, and a weaker hone with a carried whetstone. A fixed wheel at a base and a weaker field stone make keeping an edge a trip-or-carry decision. See `src/core/wear.ts`, `wearMeleeWeaponOnHit`, and `src/content/base/recipes.libsonnet`, `sharpenRecipes`.

Reading a recipe book progresses only while its page is open. Closing the page pauses work and preserves progress; movement closes it and passes through. Readable-only notes and signs do not create a timed job. See `src/core/bookReading.ts`, `bookReadingHooks`, and `src/game/play.ts`, `stopReadingOnClose`.

## Long actions

Long actions are saved data, not closures. Each retains its own stop/cancel/wake behavior. An emitted interruption drops compression; proximity alone does not refuse or interrupt work, leaving the player to judge safety. Rest/sleep and crafting share the core action owner, but their progress belongs to their respective saved state.

## Appliances and stations

Appliance behavior comes from components, not ids: containers own pockets, controls issue commands, workstations provide qualities, processes run without the player, and power joins the electricity graph. A process catches up when its chunk loads. Settle state at every rate change before applying the new rate; inside the block around the player, test catch-up against ordinary ticking, including a mid-run rate change; beyond it, test that the coarse result is deterministic (`docs/decisions/0008-deterministic-world.md`, "Decision"). Appliance controls, processes and power are Slice 5 work.

Cooking uses a lit station for recipes that require heat. Losing it stops the player craft; an appliance-owned process does not occupy hands or require compression.

## Reachability and tests

The test-house repair stock demonstrates reachable plans rather than pinning a stock catalogue. Keep derivation separate from authored destinations so recipe changes do not require maintaining a second stock list: content names the building whose containers receive the stock, and game logic derives what goes in. A repair that needs a workstation is stocked only when that station stands in the building, so the stock never promises a repair the player cannot do there. See `src/game/testHouseRepair.ts`, `repairStockRecipes`, and `src/content/base/layouts-test-house.jsonnet`, `repairStock`.

`checkReachability` proves recipes reachable from world sources and skips demo layouts, because debug stock must not make a recipe look reachable in normal play. The test house is a demo layout, so its stock is tested by planning each repair with live reach from a stand point inside the building, beside a damaged target. That also proves the containers and the station are within reach of each other. See `src/core/reachability.ts`, `checkReachability`, and `test/repairCorner.test.ts`, `planFromBuilding`.
