---
read_if:
  - you change how the character screen groups inventory, skills and crafting
  - you change inventory pane sizing or container-grid scrolling
  - you diagnose an inventory item whose DOM bounds disagree with pointer hit testing
---

# Clickable inventory layout

An item's presence in the DOM does not prove pointer access. Pane clipping can
put its apparent click point in an adjacent pane when content packing changes.
Sharing the screen with the crafting catalogue must not make an ordinary pile
slot inaccessible merely because the item occupies a different column.

The character screen groups Items, Skills and Crafting into tabs so the game,
notably on a small zoomed screen, has room for each view. Character inventory
and nearby piles or containers stay together on Items so drag and drop remains
within one view. The divider between You and Around you starts at the midpoint,
giving each column half the available width; dragging lets the player favor
either view without collapsing the other. The Around you pane fills its column,
and its nearby floor and container sections wrap as the divider moves. Container
sections retain their content-owned width cap. Floor positions are saved state,
so the display re-packs them independently in `src/ui/inventoryScreen.ts`,
`InventoryScreen.gridViewModel`, leaving `src/core/inventory.ts`,
`Inventory.snapshotState`, unchanged. Each pane scrolls independently.
Tab selection and the split are runtime UI state, not save or replay state.
G, V and B open the character screen on Items, Skills or Crafting, or switch to that tab
while it is open; Tab reopens the last tab. The keys sit beside WASD so movement can
continue, and the letters are not mnemonics. See `src/game/inputBindings.ts`,
`inventoryTabForAction`, and `src/ui/inventoryScreen.ts`, `InventoryScreen.openOnTab`.

Container grids scroll within bounded regions so a tall container cannot expand
the nearby pane and push other useful contents out of view. The content-owned
width cap applies to visible grid cells: an ordinary cap-wide grid fits without
horizontal scrolling, while a justified wider container can scroll horizontally.
The pane scrolls among its contents, and the Items body can also scroll to bring
its pane rows into view on short screens. Since this leaves nested
scroll regions, `deadvox/src/ui/inventoryScreen.ts`,
`InventoryScreen.scrollSelectedItemIntoView`, reveals a newly selected row
through every scrollable ancestor. Routine redraws leave the player's browsing
position alone. The reading consumer stage verifies the selected note is visible
and topmost at its centre.

See `deadvox/src/ui/style.css`, `.inv-body` and `.inv-grid-scroll`, for the
sizing and scroll regions, and `deadvox/src/ui/inventoryScreen.ts`,
`gridTemplate`, for grid footprint ownership. When changing the layout, check
pointer hit testing with the item and nearby container visible at the small
viewport, not only that each item exists in the DOM.
