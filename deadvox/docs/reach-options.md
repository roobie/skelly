---
read_if:
  - you change inventory reach, wield preferences or quick-move admission
  - you change delayed item use or battery selection
  - you change the quick-action gate or inventory binding labels
  - you change quickbar hand displacement or automatic item-stow behavior
---

# Inventory reach and options (Slice 2.1)

`src/core/reach.ts` owns inventory admission: 2 metres, inclusive. Piles retain
unrounded player-feet to floor/horizontal-middle geometry; furniture retains the
1-metre chest point to the nearest cell of the whole furniture box. `blockSize`
converts block coordinates to metres. Gaze/LOS, bed proximity, and firearm-case
aggregation are not inventory admission; case aggregation uses `pilesInRadius`.

A cached `reach(player)` contains carried items and recursively accessible nearby
pile/container contents, locations, ordinary handling times, and nearby furniture.
Unsearched furniture is visible for Search but exposes no contents. Workstation
reach uses the same furniture geometry; see `src/core/reach.ts`, `reach` and
`furnitureInReach`. Inventory/entity revisions, precise position and
scale invalidate the cache. Runtime light switching/draining also advances the
inventory revision; the screen keys redraws on precise origin as well as revisions.
The view is derived, never saved or authority for a delayed command. Moves and
battery swaps recheck current ownership, reach and search at completion.

Reach and option admission affect simulation identity, unlike the menu-pointer
adapter's presentation. See `tools/simulationFingerprint.ts`, `SIMULATION_ENTRIES`
and `SIMULATION_EXCLUSIONS`, for that boundary rather than a copied hash.
Exact-version save refusal prevents changed rules from silently reinterpreting
an actor's work; no migration is owed before the compatibility milestone.

`src/core/options.ts` supplies move/use plans, labels, refusal reasons and times.
Survival retains registered queue actions and effects, not separate eligibility.
The ordinary best-pocket command chooses the quickest pocket; ordinary to-hands
and drop ordering are retained. Quick move uses hold T and click in the default
profile, as described in `CONTROLS.md`. Its rebindable gate is declared
in `src/game/inputBindings.ts`, `INPUT_BINDINGS`, and read by
`src/ui/inventoryScreen.ts`, `InventoryScreen.pointerDown`; no browser modifier
selects the quick move.
The binding only queues the ordinary whole-stack handling move, never transfers
immediately or invokes use/eat/drink/switch.

## Explicit alignments

- Wielded follows the dominant role, matching primary action dispatch; the
  off-hand item remains carried for quick-move policy. Physical slots do not
  change when the actor's preference changes. See `src/core/character.ts`,
  `dominantSide` and `offSide`, and `src/core/options.ts`, `quickMove`, for
  role resolution and placement admission. Refusal must preserve ownership.
- Ordinary `toHands` in `src/core/options.ts`, `toHands`, drops other carried
  items, including worn containers, exactly at the feet. Quickbar takes have a
  separate best-effort stow rule and never drop items automatically. Ground-grid
  placement permits filled containers, with contents intact; pocket/furniture
  nesting still requires an empty bag. This also enables the corresponding
  ordinary drop, previously refused by the blanket empty-bag check.
- External items stow with that same priority, never into hands. A directly
  floor-lying wearable container wears if its slot is free and other wear rules
  permit it; otherwise it follows stow priority.
- Dead lights consider compatible charged spares from carried inventory, nearby
  ground containers and searched furniture, fullest first. The selected light is
  the light being used, even if the other hand holds another compatible light.
  The swap revalidates reach/search and consumes no battery on refusal. Swap first,
  then a separate next use switches the light on, as before.

Tests protect each quick-move rule, locked-menu pointer queue binding, searched/nested
reach, delayed revalidation and scalar invalidation. Absolute boundary tests fail
when the 2-metre constant is mutated to 2.1 and pass after restoring 2.
