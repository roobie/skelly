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

Quick move queues the ordinary whole-stack handling move; it does not transfer instantly or invoke use, so the move stays visible and interruptible. Best-pocket chooses the quickest eligible pocket, but a compatible stack takes precedence when the whole stack fits, so stock does not fragment into duplicate stacks; otherwise the stack moves intact to a new spot. See `src/core/options.ts`, `inventoryPocket`; `src/game/inputBindings.ts`, `INPUT_BINDINGS`, for the quick-move gate; and `src/ui/inventoryScreen.ts`, `InventoryScreen.pointerDown`, for its queue route.

A wielded item is one the player wants to keep. Taking something new into the hands stows what they held in the player's own carrying, a sling or a pocket, when there is room. Only when nothing carried has room does it go into the container the new item came from, if that has room, and otherwise it drops at the player's feet. The player chose to hold that item, so a hand action must not quietly give it to the world, where it is lost once the player walks away. Their own carrying keeps it safest, a container beside them is the next-safest place, and the ground is the last resort that still lets the hand action happen.

Dominant/off-hand preferences resolve through the actual character without
changing physical slots. A failed action preserves ownership. Dead lights choose
the fullest compatible charged spare from carried items, nearby ground containers
and searched furniture, then switch on only through a separate use. A refusal
consumes no battery. See `src/core/character.ts`, `dominantSide` and `offSide`,
and `src/game/survival.ts`, `Survival.useFromQuickbar`.
