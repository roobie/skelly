---
read_if:
  - you change how the character screen groups inventory, skills and crafting
  - you change inventory pane sizing or container-grid scrolling
  - you change floor-pile drop targeting or feedback
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
within one view. For #518, the selected item and both item locations stay
visible together so the player can read its details while seeing where it can
move. On wide screens, the detail panel sits between You and Around you, and
the divider lets the player balance space between those two location panes. At
narrow widths, the panes stack rather than shrinking until their actions are
hidden. Each pane scrolls independently. The handling queue stays across the
bottom because it summarizes work across the whole inventory, not only the
selected item. The Around you pane fills its column.
Its floor and container sections wrap when they do not fit, so the vicinity
uses whatever width the player gives it. A container section has room for its
capped pocket grid and scroll gutter; when it cannot fit beside another
section, it wraps rather than squeezing the grid. Justified wider grids scroll
within the content-owned cap.

Floor piles are displayed packed to the column width in
`src/ui/inventoryScreen.ts`, `InventoryScreen.gridViewModel`. Their stored
positions are save state, and display packing never writes them. A drop onto a
floor pile merges into the item under the pointer when compatible; otherwise
ordinary pile placement uses an available stack or the first free stored spot.
Each pane scrolls independently.
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
through every scrollable ancestor. A wheel scrolls the nearest region with
something to scroll along it, even one already at its edge, so a grid that fits
never swallows the wheel meant for the pane around it. When none has anything to
scroll, the nearest region still takes the wheel, so it reaches neither the page
nor the game. See `deadvox/src/ui/wheel.ts`, `wheelPane`. Routine redraws leave
the player's browsing position alone. The reading consumer stage verifies the
selected note is visible and topmost at its centre.

See `deadvox/src/ui/style.css`, `.inv-body` and `.inv-grid-scroll`, for the
sizing and scroll regions, and `deadvox/src/ui/inventoryScreen.ts`,
`gridTemplate`, for grid footprint ownership. When changing the layout, check
pointer hit testing with the item and nearby container visible at the small
viewport, not only that each item exists in the DOM.
