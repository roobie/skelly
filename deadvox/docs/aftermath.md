---
read_if:
  - you author or change a townhouse scene, a scene slot, an aftermath pose or a room-purpose loot table
  - you author or change an exterior door variant
  - you place furniture, disorder or shambler markers inside a Gauntlet townhouse room
  - you decide how long ago the chaos happened in a scenario
---

# Aftermath

The Gauntlet's houses show what their people did before they left or died. Authors give a
building a few scene slots; the world picks one scene per slot by location, so the same house
reads the same on every visit and different houses read differently.

## Scene slots

A building type names scene slots. A scene slot is a weighted choice of scene pieces. A piece
holds furniture, disorder slots, loot overrides and shambler markers, and may hold a note slot.
Every slot resolves per building location by the slot seed that `buildCityPlan` already uses,
so variation is stable without a runtime simulation. A mod replaces one slot's piece or pool
by id and leaves the building geometry alone.

Scene pieces are authored data, not generated at run time, because reachability, loot context
and spawn safety are checked on exactly the content that ships. See
`src/content/base/gauntlet-city-scenes.libsonnet`, `scenes` and `slot`;
and `src/content/base/aftermath.libsonnet`, `pieces` and `slot`.

Rules for placement, each with its reason:

- **Every choice in a slot claims the same footprint.** Alternatives must share one ownership
  domain, so cells that any scene furnishes are claimed as shared air by the others.
- **A stairwell cuts one band of a storey off.** The lower storey loses its front band and the
  middle storey its back band, so loot in a band goes only into scenes offered where a body can
  reach that band.
- **Keep the walking lane clear.** The lane between the entry anchor, the stair landings and
  the street door is the only route a body has once the stairs take their cells. Bodies keep a
  cell of margin from solids, so a gap narrower than three cells is not a way through.
- **Keep landings clear.** Furniture on a landing disconnects every storey above it.
- **Place shambler markers with intent.** A marker sits clear of solids, because a body spawned
  inside furniture is stuck. Only the failed-barricade scene places them.
- **Loot tables use existing items.** Each table is tied to a room purpose, and each piece's
  loot context makes the table admissible.

### How many beats

A beat is a scene that tells a story or holds a threat. A room holds at most one beat, a
building at most three, and about a third of rooms are quiet. The cap is enforced by scene
weights as data, not by a runtime counter, so a mod can retune the mix without code. The
library asserts that no scene counts more than one beat.

### Furniture a person could move

A scene uses only furniture one person could have dragged, in places they could have dragged it
to. A barricade is a wardrobe, a shelf or a chair against a door or window, never something
that would need a crane. This keeps rooms legible: players read the story from the furniture
because it obeys the same limits they would.

### How long ago

How long ago the chaos happened is per-scenario content, never a code constant. One scenario
can be months after, another years, another only days.

## Door variants

An exterior door slot is a weighted choice of door pieces: intact, missing and boarded from
outside. Each owns exactly the opening it fills, so the shell is unchanged and any variant fits
the slot. The intact and boarded doors own their leaf cells; the missing door leaves the
opening as shared air, which a body may walk through. Planks stand proud of the leaf on the
street side, so a boarded door is still a door and can be opened from inside. See
`src/content/base/gauntlet-city-doors.libsonnet`, `slot`, and `test/cityKitPlan.test.ts`,
"gauntlet door openings".

Police and curated buildings carry no aftermath slots; their rooms are designed whole.
