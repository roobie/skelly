---
read_if:
  - you change inventory reach, wield preferences or quick-move admission
  - you change delayed item use or battery selection
  - you change quickbar hand displacement or automatic stow behavior
---

# Inventory reach and options

Inventory reach is a geometry-and-ownership query, not gaze or line of sight. It includes carried items, reachable piles and their containers, and searched furniture; unsearched furniture is visible for Search but does not expose contents. Workstation reach uses the same furniture geometry. See `src/core/reach.ts`, `reach` and `furnitureInReach`.

A reach snapshot is derived and may be cached, but it is not saved or authority for delayed commands. Commands recheck current ownership, reach and search state when they complete. The same boundary protects moves and battery swaps from acting on stale plans.

Options provide the available action, its time and any refusal reason. Survival owns registered effects, not a second eligibility policy. Ordinary best-pocket, to-hands and drop behavior remain deliberate; quickbar takes use best-effort stow and never drop items automatically. Quick move queues the ordinary whole-stack handling move; it does not transfer instantly or invoke use. See `src/core/options.ts`, `options`, and `src/game/inputBindings.ts`, `INPUT_BINDINGS`.

The ordinary best-pocket command chooses the quickest eligible pocket; ordinary
to-hands and drop ordering remain unchanged. Quick move queues the ordinary
whole-stack handling move and does not transfer instantly or invoke use. Compatible
stacks take precedence over pocket priority to avoid fragmenting stock into
duplicate stacks, but only when the whole stack fits; otherwise, it moves intact
to a new spot. `inventoryPocket` in
`src/core/options.ts` checks compatible stacks before free spots. See also
`src/game/inputBindings.ts`, `INPUT_BINDINGS`, for the quick-move gate and
`src/ui/inventoryScreen.ts`, `InventoryScreen.pointerDown`, for its queue route.

Dominant/off-hand preferences resolve through the actual character without
changing physical slots. A failed action preserves ownership. Dead lights choose
the fullest compatible charged spare from carried items, nearby ground containers
and searched furniture, then switch on only through a separate use. A refusal
consumes no battery. See `src/core/character.ts`, `dominantSide` and `offSide`,
and `src/game/survival.ts`, `Survival.useFromQuickbar`.
