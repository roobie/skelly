---
read_if:
  - you're changing food creation, serving transformations or exposure ownership
  - you're changing food freshness queries, stack compatibility or saved food history
  - you're changing how transfers, relocation or storage environments settle food aging
---

# Food ownership

Food history belongs to the ordinary item tree because moving, splitting or saving
food must not give it a younger past. Provenance is not freshness: storage can change
future aging without changing when food was made. Functional condition is unrelated.
See `src/core/items.ts`, `ItemFields`, and `src/core/food.ts`, `projectFoodExposure`.

A stack represents a homogeneous cohort. Unequal exposure must remain separate,
not average away rotten food or silently age fresher units, so an unequal cohort
takes another spot or the move is refused when there is none. Splitting carries the
same per-unit history without sharing mutable state. See `src/core/items.ts`,
`ItemFactory.split` and `stackRoom`.

Creation boundaries distinguish authored world stock from production. Inventory
admission is not production and must not refresh found food. A sealed nonperishable
package has no exposed serving history; opening it starts that serving's history.
Repackaging an existing perishable serving must preserve its history, while an
empty vessel must not retain it. See `src/core/inventory.ts`, `Inventory.transform`,
`src/core/craftWork.ts`, `craftActionHooks`, and `src/game/unpacking.ts`, `Unpacking`.

## Environments

An environment is a rate of aging, and it belongs to the root of the item tree. Every
descendant of a cold root shares that root's rate: a bag inside a fridge is in the
fridge, and nesting never multiplies preservation. Deriving the rate from ancestry
means no item stores its parent or environment, so a move cannot leave a stale copy
behind. Rates are whole parts of one fixed denominator, so spans split at any
boundary sum to the same exposure. See `src/core/inventory.ts`, `Inventory.foodRate`.

Each ownership change settles the leaving subtree under its old environment first,
so only later aging changes; `INTERACTIONS.md`, "Ownership", owns that boundary.

## Queries and saves

Queries project exposure without mutating owners, so looking at food cannot change
simulation results. Consumption resolves the actual serving, not its vessel shell.
See `src/core/food.ts`, `servingDef` and `spoilage`, and `src/game/survival.ts`,
`Survival.finishConsuming`.

Snapshots settle the entire inventory forest at one absolute calendar boundary so
restoring needs neither a service journal nor inferred history. They settle the
copy, not the live owner, because capturing must not change live state; see
`src/core/items.ts`, `snapshotItem`. The clock origin
belongs at the conversion boundary, not in elapsed-time integration. Closing the
application adds no simulated time. Missing or corrupt history is refused rather
than repaired; see `src/core/saveState.ts`, `snapshotSession`, `src/core/saveFormat.ts`,
`validateActionReferences`, and `docs/decisions/0002-saves.md`, "Decision".
