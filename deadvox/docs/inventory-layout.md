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

Selected-item details stay between the two item locations so the player can
inspect an item while seeing both destinations. On tighter windows, details
yield space before the layout stacks. The nearby pane's floor is derived from
the content's container width cap, plus two scroll gutters: the locker grid's
and the pane's own. A cap-wide locker therefore fits without horizontal
scrolling whatever the cap. No CSS value reports a gutter's width; it is 0 with
overlay scrollbars and about 15px with classic ones, and a browser can hide its
scrollbars yet still reserve a stable gutter. So the screen measures a stable
gutter and publishes it as `--inv-scrollbar-width` (`src/ui/inventoryScreen.ts`,
`scrollbarWidth`). The floors live once, in CSS, as the side panes'
min-widths. The divider's clamp reads them, so the divider and the columns
can't disagree. The divider keeps the player's chosen
split and clamps only what it applies: a window too narrow for that split
shows the nearest one that fits, and widening it again restores the choice.
The handling queue stays below the panes because it summarizes work across
the whole inventory. See `src/ui/style.css`,
`#inventory .inv-body[data-tab-panel="items"]`, and `src/ui/inventoryScreen.ts`,
`splitBounds` and `InventoryScreen.syncSplitterToLayout`.

The floor and container sections wrap when they cannot share a row, so the
vicinity uses its available width without squeezing a capped grid. Justified
wider grids scroll within their content-owned cap. Floor piles are displayed
packed to the column width in `src/ui/inventoryScreen.ts`,
`InventoryScreen.gridViewModel`; stored positions remain save state and display
packing never writes them. Drops onto floor piles merge with the item under the
pointer when compatible; otherwise they use an available stack or the first
free stored spot. See `src/ui/inventoryScreen.ts`,
`InventoryScreen.scrollSelectedItemIntoView`, for selection visibility across
scrollable ancestors.
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
