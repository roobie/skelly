# Beat 3 cabins

`templates-cabins.json` defines Dad's cabin, the hunter's cabin and the woodshed in
half-metre template blocks. Dad's cabin has a ground storey and a cellar; the cellar
is reached through the stair opening described by its `access` data. The north wall's
`dad_front_door` is an ordinary openable door, not locked in this content. Its
outside key placement anchor is `dad_front_step_key_spot` at local block position
`[11, 6, 1]` (metres `[5.75, 3, 0.75]` from the template origin). This recess is
beside the front step; keep it clear until lock/key integration.

The cellar has two shelves near its north wall and a crate near its south wall, each
with the deterministic empty `d41_empty` loot table. They are placement anchors for
later fixed shell, food and water loot. The
gun cabinet is ordinary container furniture with a 4×12 pocket, sized for the
pump shotgun's admitted inventory footprint. It has no lock or default loot. The
hunter's rear room is closed by an ordinary door; the demo layout, not the template,
places the shambler at the named design spot (template-local `[8.5, 1, 10.5]`).

The separate `cabins_demo` layout is a flat preview site, not the ridge's
`hunting_cabins` layout. Final loot, the key/lock, ridge placement and the shotgun
and ammunition items are authored in later integration work. Ammo packaging follows
BR's ruling: a plain box is wielded and activated to unpack; it is not a container
that is searched or loaded directly.
