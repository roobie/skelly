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
within one view. Tab selection is runtime UI state, not save or replay state.
Per-tab hotkeys are pending BR's choice on #435.

A wide container grid scrolls inside its own region; it must not widen the
screen or push the character's inventory out of view. This is a layout
constraint, not an inventory-selection or use-option exception. Redirecting
selection to compensate would conceal a failed hit test rather than restore
access to the rendered item. Keyboard selection alone does not verify it.

See `deadvox/src/ui/style.css`, `.inv-body` and `.inv-grid-scroll`, for the
sizing and scroll regions, and `deadvox/src/ui/inventoryScreen.ts`,
`gridTemplate`, for grid footprint ownership. When changing the layout, check
pointer hit testing with the item and nearby container visible at the small
viewport, not only that each item exists in the DOM.
