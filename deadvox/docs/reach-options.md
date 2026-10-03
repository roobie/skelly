# Inventory reach and options (Slice 2.1)

`src/core/reach.ts` owns inventory admission: 2 metres, inclusive. Piles retain
unrounded player-feet to floor/horizontal-middle geometry; furniture retains the
1-metre chest point to the nearest cell of the whole furniture box. `blockSize`
converts block coordinates to metres. Gaze/LOS, bed proximity, and firearm-case
aggregation are not inventory admission; case aggregation uses `pilesInRadius`.

A cached `reach(player)` contains carried items and recursively accessible nearby
pile/container contents, locations, ordinary handling times, and nearby furniture.
Unsearched furniture is visible for Search but exposes no contents. Workstations
are empty until milestone 2.8. Inventory/entity revisions, precise position and
scale invalidate the cache. Runtime light switching/draining also advances the
inventory revision; the screen keys redraws on precise origin as well as revisions.
The view is derived, never saved or authority for a delayed command. Moves and
battery swaps recheck current ownership, reach and search at completion.

`src/core/options.ts` supplies move/use plans, labels, refusal reasons and times.
Survival retains registered queue actions and effects, not separate eligibility.
Ordinary E chooses the quickest pocket; ordinary to-hands and five-spot drop ordering
are retained. Quick move is Ctrl-click, or Cmd-click on macOS; Shift is unchanged.
The binding only queues the ordinary whole-stack handling move, never transfers
immediately or invokes use/eat/drink/switch.

## Explicit alignments

- Wielded means **any right-hand item**, matching primary action dispatch. It stows
  in the worn backpack, other worn bags, then worn clothing pockets. No fit means
  a hint and no move/time. Left-hand items are carried and drop at the feet.
- Other carried items, including worn containers, drop exactly at the feet.
  Ground-grid placement now permits filled containers, with contents intact;
  pocket/furniture nesting still requires an empty bag. This also enables the
  corresponding ordinary drop, previously refused by the blanket empty-bag check.
- External items stow with that same priority, never into hands. A directly
  floor-lying wearable container wears if its slot is free and other wear rules
  permit it; otherwise it follows stow priority.
- Dead lights consider compatible charged spares from carried inventory, nearby
  ground containers and searched furniture, fullest first. The selected light is
  the light being used, even if the other hand holds another compatible light.
  The swap revalidates reach/search and consumes no battery on refusal. Swap first,
  then a separate next use switches the light on, as before.

Tests protect each quick-move rule, actual pointer queue binding, searched/nested
reach, delayed revalidation and scalar invalidation. Absolute boundary tests fail
when the 2-metre constant is mutated to 2.1 and pass after restoring 2.
