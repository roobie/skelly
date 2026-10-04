---
read_if:
  - you change inventory pane sizing or crafting sidebar placement
  - you diagnose an inventory item whose DOM bounds disagree with pointer hit testing
---

# Clickable inventory layout

An item's presence in the DOM does not prove pointer access. Pane clipping can
put its apparent click point in an adjacent pane when content packing changes.
Sharing the screen with the crafting catalogue must not make an ordinary pile
slot inaccessible merely because the item occupies a different column.

This is a layout constraint, not an inventory-selection or use-option exception.
Redirecting selection to compensate would conceal the failed hit test rather
than restore access to the rendered item. Keyboard selection alone does not
verify this constraint.

See `deadvox/src/ui/style.css`, `.inv-body`, for the sizing decision, and
`deadvox/src/ui/inventoryScreen.ts`, `gridTemplate`, for grid footprint ownership.
When changing the layout, check pointer hit testing with the crafting sidebar
visible, not only that the item exists in the DOM.
