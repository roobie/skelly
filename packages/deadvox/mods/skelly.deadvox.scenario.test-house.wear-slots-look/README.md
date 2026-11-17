---
read_if:
  - you review content-defined wear-slot inventory layout or self-view masking
---

# Wear-slot look

Open `/?start-mod=skelly.deadvox.scenario.test-house.wear-slots-look#{debug:true}`.
The fixture equips its own slots at the test house in daylight, so no inventory
setup or waiting is needed. See `starts.jsonnet`, `starts`, and
`wear-slots.jsonnet`, `wearSlots` and `items`.

At a narrow window, open inventory and click each fixture garment and the item
inside the pack. Check that headers and selected-item details use the authored
slot labels, selection stays visible, and the player pane scrolls without a
second scroller inside the pack. Removing and wearing the pack should hide and
restore its occupied-only section; the empty spare section should remain.

Compare the harness in the debug third-person view with the first-person view
while looking down. It must remain attached and visible outside but disappear
from self view, without hiding the clothing beneath it. The pack retains normal
frame masking. This deliberately tests a torso attachment: head-frame masking
must not make the hidden-slot check pass accidentally. The fixture reuses the
ordinary garment models so the comparison exercises slot policy, not new art.
