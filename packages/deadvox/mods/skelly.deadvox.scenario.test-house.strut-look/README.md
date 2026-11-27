---
read_if:
  - you review diagonal bearing, strut ray passage or strut salvage by eye (#2062)
  - you change the strut fixture, its tools or its load paths
---

# Strut look

Open the [fixture](/?start-mod=skelly.deadvox.scenario.test-house.strut-look#{debug:true}).

The start puts a loaded revolver in the dominant hand and a fuelled blowtorch in the
other hand, with maximum skills. Look up slightly: the steel knee is ahead, the mirrored
timber knee to its right. Their beams have no support except their struts. The separate
unloaded samples behind the player make salvage visible without falling beams burying it.
All members sit above standing head height. Brick backstops catch shots through the gaps.

## Checks

1. Both loaded knees stand before any edit. The members are slim diagonals, not cubes.
2. Shoot through the open part of the steel member's cell: the shot passes and strikes the
   brick behind it. Shoot the member itself: the shot stops on its visible surface.
   The revolver starts loaded; no rack or loading step is needed.
3. Cut the steel member with the blowtorch's hand action. The whole member disappears
   when the cut finishes; its beam falls. Repeat on timber using debug destruction, not
   torch charring. Debug build mode and its destroy action are available through
   `packages/mods/skelly.controls/controls.jsonnet`, "debug.build-toggle" and
   `packages/mods/skelly.controls/controls.jsonnet`, "debug.build-destroy".
4. Turn around and cut the unloaded steel sample, or destroy the unloaded timber sample.
   A loose scrap or offcut pile settles on the pad. No rubble cube or placeable strut item
   replaces the member. A loaded beam's rubble can bury its strut's salvage; taking that
   rubble apart recovers the contents through ordinary clearing.
5. Save and reload after a cut: removed members stay removed and the landed debris stays.
   Restart the fixture for another uncut comparison.

Bodies still reserve a whole strut cell. Do not use these high members to judge exact body
passage. Timber torch charring and loaded-char crumbling are separate work; this check
covers cutting, bearing, ray passage and salvage. Reasons: `packages/deadvox/SLICE-5.md`,
"Support" and "Strut geometry".
