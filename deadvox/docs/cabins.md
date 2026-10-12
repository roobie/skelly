---
read_if:
  - you're changing the Beat 3 cabins, their anchors or their fixed loot
  - you're wiring the key, lock or shambler into a cabin
---

# Beat 3 cabins

Dad's cabin is a one-storey building over a cellar. Keep the roof low enough that it does not read as an inaccessible second storey; the template has no stairs to the roof. This is a prototype compromise, not the final building direction; prettier buildings remain tracked by #221. The front-step recess is reserved for the future key placement, so keep it clear until the lock/key integration is authored. See `src/content/base/templates-cabins.json`, `dads_cabin`.

The cellar shelves and crate are deterministic placement anchors for later fixed loot. The gun cabinet is an ordinary container sized for the admitted pump-shotgun footprint; it has no lock or default loot. The hunter's rear room uses an ordinary door, and its shambler belongs to the demo layout rather than the reusable template.

`cabins_demo` is a flat preview site, not the ridge's `hunting_cabins` layout. Keep the reusable cabin template separate from ridge placement and final loot. A sealed ammunition box is wielded and activated to unpack; it is not a searchable container.
