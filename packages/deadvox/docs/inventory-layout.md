---
read_if:
  - you change inventory grouping, pane sizing or container scrolling
  - you change floor-pile drop targeting or item hit testing
  - you diagnose an inventory item's DOM bounds or selection visibility
  - you change the inventory find field or the item keywords it matches
---

# Clickable inventory layout

Inventory layout must preserve pointer access as content changes: an item's DOM presence does not prove its apparent click point lands inside its pane. Keep the selected-item details between the two item locations, and let it yield space before the panes are squeezed. The nearby pane must fit a cap-wide container without horizontal scrolling. See `src/ui/inventoryScreen.ts`, `splitBounds` and `InventoryScreen.syncSplitterToLayout`, and `src/ui/style.css`, "#inventory .inv-body[data-tab-panel=\"items\"]".

Display packing must not change saved pile positions. A drop onto a displayed item maps back to its stored cell for compatible merges or swaps; otherwise it uses ordinary free-space placement. The replayable inventory command remains the authority for move outcomes. See `src/ui/inventoryScreen.ts`, `targetForPackedFloorDrop`, and `src/core/inventory.ts`, `Inventory.plan` and `Inventory.move`.

Container grids render at full height and never scroll on their own; the pane around them is their one vertical scroller. An inner scroller hides contents and makes the player scroll twice. A grid wider than its section scrolls the pane sideways. Selection must be revealed through every scrollable ancestor, and the wheel belongs to the nearest region with content to scroll. See `src/ui/inventoryScreen.ts`, `InventoryScreen.scrollSelectedItemIntoView`, and `src/ui/wheel.ts`, `wheelPane`.

The find field dims the items its words miss rather than hiding them, so grid positions, drop targets and pointer access stay as they were. A word matches part of an item's name or of a content keyword, ignoring case and accents; every word must match. The query is runtime UI state and clears when the screen closes. See `src/ui/inventoryFind.ts`, `matchesFind`, and `src/core/schema.ts`, `ItemSchema`.

Tab selection and split position are runtime UI state, not save or replay state. Keep inventory tabs one key away from movement so movement can continue; the keys are deliberately not mnemonics. See `src/game/inputBindings.ts`, `inventoryTabForAction`. When changing the layout, test actual pointer hit testing with an item and nearby container visible at a narrow viewport; DOM presence alone is not sufficient.
