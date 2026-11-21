---
read_if:
  - you author or change a townhouse scene, a scene slot, an aftermath pose or a room-purpose loot table
  - you author or change an exterior door variant or a window bay variant
  - you change how boards, the sheet panel or a curtain cover a window
  - you change how a player boards up a door or covers a window
  - you place furniture, disorder or shambler markers inside a Gauntlet townhouse room
  - you decide how long ago the chaos happened in a scenario
  - you tag a variant as aftermath or tune how often a place shows boarded, broken, dilapidated or messy variants
  - you change the building beat cap
---

# Aftermath

The Gauntlet's houses show what their people did before they left or died. Authors give a
building a few scene slots; the world picks one scene per slot by location, so the same house
reads the same on every visit and different houses read differently.

## Scene slots

A building type names scene slots. A scene slot is a weighted choice of scene pieces. A piece
is a map piece: a palette of furniture with optional loot overrides, shambler markers and a
loot context. It carries no slots. Every slot resolves per building location by the slot seed
the city plan uses (`packages/engine/src/core/cityPlan.ts`, `buildCityPlan`), so variation is
stable without a runtime simulation. A mod replaces
one slot's piece or pool by id and leaves the building geometry alone.

Scene pieces are authored data, not generated at run time, so the content that ships is the
content that is checked. The checks cover each piece on its own, one compile of each assembly
(one choice per slot) and anchor routes through every alternative of every slot. They do not
cover container reach or spawn clearance in each assembled alternative, so keep scenes inside
the placement rules below, which hold for every alternative by construction. See
`mods/skelly.deadvox.scenario.gauntlet.city/gauntlet-city-scenes.libsonnet`, `scenes` and `slot`;
`packages/engine/src/core/mapKit.ts`, `mapKitFitIssues`; `test/cityKitRoutes.test.ts`; and
`mods/skelly.deadvox.scenario.gauntlet.city/aftermath.libsonnet`, `pieces` and `slot`, which offers disorder poses as
separate slots.

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
  inside furniture is stuck.
- **Loot tables use existing items.** Each table is tied to a room purpose, and each piece's
  loot context makes the table admissible.

### How many beats

A beat is a scene that tells a story or holds a threat. A room holds at most one beat, a
building at most a few, and about a third of rooms are quiet. Aftermath odds rescale
scene weights, so weights alone cannot hold the cap: the building cap holds by construction
instead. The content compile counts each slot at its worst alternative and refuses a building
whose sum can pass the cap, so no weight or odds can draw more, and a mod retunes the mix
without code. See `mods/skelly.deadvox.scenario.gauntlet.city/gauntlet-beat-cap.libsonnet`,
`cap`; the scene library asserts that no scene counts more than one beat.

### Furniture a person could move

A scene uses only furniture one person could have dragged, in places they could have dragged it
to. A barricade is a wardrobe, a shelf or a chair against a door or window, never something
that would need a crane. This keeps rooms legible: players read the story from the furniture
because it obeys the same limits they would.

### How long ago

How long ago the chaos happened belongs in per-scenario content, never in a code constant,
because one scenario can sit years after the chaos and another only days. No scenario value
carries it and nothing reads one, so a value added for it lives in content; the Gauntlet's is
months.

## Door variants

An exterior door slot is a doorway slot (`docs/building-pathway.md`, "Doorways") with a weighted
choice of door pieces: intact, missing and boarded from outside. Each owns exactly the opening it
fills, so the shell is unchanged and any variant fits the slot; a missing door leaves the opening
as air a body may walk through.

Boarding is state on a real door, not a door kind of its own. The boarded variant hangs the
intact variant's leaf with boards on its street face, so it breaks, sounds and repairs as that
leaf does, and the doorways rule can trust the way through it. A boarded door refuses opening
from either face with the ordinary boarded-up refusal. Boards nailed across a doorway hold its
leaf shut from both sides; a door that must still open is fortified instead, a later feature.
The boards belong to the leaf and swing with it, so their explicit side remains its look rather
than an opening rule. Breaking the leaf with blows opens the way, and the broken leaf keeps its
boards (`packages/deadvox/DESIGN.md`, "Breach by strength"). Boards are door state beside the
lock, so a save keeps them.

Authored and player-built boarding obey that one rule. A door has one boarded side and no bar
beside it, and player boarding work names its side explicitly, so where the builder stands never
decides which face the planks show on.

See `mods/skelly.deadvox.scenario.gauntlet.city/gauntlet-city-doors.libsonnet`, `mapPieces`;
`packages/engine/src/core/blockEntities.ts`, `doorRefusal` and `boardableDoor`;
`packages/engine/src/core/worldPlacement.ts`, `openingRefusal`; `test/locks.test.ts`, "boarded doors";
and `test/cityKitPlan.test.ts`, "gauntlet door openings".

## Window variants

A window bay draws its window whole, broken or boarded over from the street, so a street shows
which houses someone held. Covering a window is the same state as boarding a door, on the real
window: one boardings content kind serves both, each cover naming the opening it fits, so a
tuning of a cover or of the window reaches every bay that hangs it. The boarded variant hangs the
broken window, since boards go up over glass that is already gone.

A window takes one cover on one face, chosen by the builder as for a door: wooden boards, a sheet
metal panel standing on timber battens, or a textile curtain. Boards and the panel protect: they
hold the sash shut, so they go up only on a shut window, refuse opening from either face, and
block passage, sight and light even with the pane gone, because they cover the frame. A blow aimed
at the glass from inside still breaks it, but an unaimed blow, such as a shambler's, lands on the
cover as the window's own damage, so a horde must beat the whole window down. A window beaten to
its durability is ruined and leaves the bay open.

A curtain only hides: closed, it stops sight and light through the frame but never a body, and it
neither holds the sash nor takes a blow, so the defence choice between protection and darkness
stays legible. It hangs on an open or shut window and starts closed. Use opens a closed curtain
before it works the sash, and the held use closes an open curtain before it works the latch, so
every operation stays on the window's two inputs.

See `tools/jsonnet/lib/window-slots.libsonnet`; `packages/engine/src/core/blockEntities.ts`,
`boardingFits`, `boardingRefusal` and `windowRefusal`; `packages/engine/src/game/windowAction.ts`,
`windowOperation`; `packages/engine/src/core/windowImpact.ts`, `blowLandsOnPane`; and
`test/windows.test.ts`, "boarded windows" and "window curtains".

## Aftermath odds

Anything not in its default state, such as a boarded window or a toppled chair, is aftermath, and
how much of it a place shows must be tunable. Each such variant is tagged on its definition
(piece, assembly or style), and a scenario, site, layout building or assembly sets
`aftermathOdds`, one multiplier per tag on the weights of tagged alternatives. Tuning by tag lets
one knob tell a whole place's story, a calm suburb or a looted street, without editing every
slot's weights. The innermost setting wins per tag, so a building keeps its own story inside a
run-down town. Odds of 0 remove a variant. A slot left with no alternative is an error, because
a silent fallback would hide a contradiction in the content. Assemblies that offer only aftermath
alternatives, such as the lab service's yard, pin their odds so a scenario's odds cannot empty
them. Tags and odds keys must name a declared aftermath tag. See
`packages/engine/src/core/aftermathOdds.ts`, `aftermathWeight` and `aftermathIssues`; and
`mods/skelly.deadvox.buildings/aftermath-tags.jsonnet`.

Police stations carry no aftermath variants; their rooms are designed whole.
