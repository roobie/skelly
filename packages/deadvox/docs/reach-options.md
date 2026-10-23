---
read_if:
  - you change inventory reach, wield preferences or quick-move admission
  - you change delayed item use or battery selection
  - you change quickbar hand displacement or automatic stow behavior
  - you change where a held item goes when the player wields something else
---

# Inventory reach and options

Inventory reach is a geometry-and-ownership query, not gaze or line of sight. It includes carried items, reachable piles and their containers, and searched furniture; unsearched furniture is visible for Search but does not expose contents. Workstation reach uses the same furniture geometry. See `src/core/reach.ts`, `reach` and `furnitureInReach`.

A reach snapshot is derived and may be cached, but it is not saved or authority for delayed commands. Commands recheck current ownership, reach and search state when they complete. The same boundary protects moves and battery swaps from acting on stale plans.

Options provide the available action, its time and any refusal reason. Survival owns registered effects, not a second eligibility policy. Best-pocket, to-hands and drop stay deliberate player choices; quickbar takes use best-effort stow and never drop items automatically. See `src/core/options.ts`, `options`.

Best-pocket chooses the quickest eligible pocket, because it is the ordinary single-item pocketing and should cost the least handling time. See `src/core/options.ts`, `bestPocket`.

Quick move queues the ordinary whole-stack handling move; it does not transfer instantly or invoke use, so the move stays visible and interruptible. It fills worn storage by its own container priority, and a compatible stack there takes precedence when the whole stack fits, so stock does not fragment into duplicate stacks; otherwise the stack moves intact to a new spot. See `src/core/options.ts`, `inventoryPocket` and `quickMove`; `src/game/inputBindings.ts`, `INPUT_BINDINGS`, for the quick-move gate; and `src/ui/inventoryScreen.ts`, `InventoryScreen.pointerDown`, for its queue route.

A wielded item is one the player wants to keep. Wielding means "this in my main hand", so the new item always goes to the dominant hand, and what that hand held makes way in this order: the player's own carrying, a sling or a pocket; then the empty off hand, when the new item needs only one hand and the held item fits in one; then a free spot in the container the new item came from; then the ground at the player's feet. The player chose to hold that item, so it stays on them, carried first and then in their free hand, before it leaves them for a container or the floor, where it is lost once they walk away. The ground is the last resort that still lets the wield happen. See `src/core/options.ts`, `stowRoom`, `plannedStowTarget` and `toHands`.

Dominant/off-hand preferences resolve through the actual character without
changing physical slots. A failed action preserves ownership. A light never picks
its own battery from reach; the player chooses it (`DESIGN.md`, "Light"). A loaded
light switches on only through a separate use, and a refusal consumes no battery.
See `src/core/character.ts`, `dominantSide` and `offSide`, and
`src/game/survival.ts`, `Survival.useFromQuickbar`.
