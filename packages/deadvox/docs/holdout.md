---
read_if:
  - you're designing or implementing Holdout's world, encounters or progression
  - you're changing Holdout's power plant, wave attention or high-ground threats
  - you're authoring Holdout PoIs or deciding what varies between runs
  - you're selecting Holdout phase questions or designing modular plant repair
---

# Holdout

## Design contract

Holdout is an endurance scenario about building a home worth returning to and defending.
These rules own its intended experience, not a claim that the mechanisms are implemented.
The construction playtest belongs to `SLICE-5.md`, "Settled base-building playtest rules";
the composition architecture belongs to `docs/decisions/0010-composed-sites.md`, "Decision".

## A landscape of destinations

The map is a 1 × 1 km square, with one self-contained point of interest wholly inside
each 100 m × 100 m cell. Cell containment gives every part of the map a distinct
destination without letting a large compound consume neighbouring destinations.
A PoI can be a lone shack in the woods with a rusty knife or a large construction
site with abundant materials and enemies. Small discoveries matter alongside ambitious
raids; not every destination needs to be a building complex.

Use a broadly even mix of quiet, moderate and intense sites. Contrast gives exploration
both relief and danger rather than making every supply run the same encounter.
PoIs admit their own occupants according to that mix. Local encounters do not replace
waves: the player can choose which PoIs to approach, but waves arrive regardless.

Keep the same landmark kinds across runs while varying their placement, contents and
approaches. Familiar functions reward learning; changed routes and circumstances keep
that knowledge from becoming a memorised itinerary. The unique power plant remains a
landmark rather than a random substitute for another kind of home resource.

## Supplies and progression

A rich site supplies most essentials in its speciality, not everything the player could
want. Construction sites offer building materials such as brick and planks; advanced
defences require military or laboratory access. Separating bulk essentials from advanced
specialities keeps excursions worthwhile as the home improves. Automated defences are
part of that ambition, not a reason to turn every supply site into a universal stockroom.

The unique thermal electric power plant is the home anchor. It starts broken but is
repairable, making restoration part of progression. Its fixed resource gives the player
an unusually valuable reason to build around it rather than relocate. Repaired, it
provides inexhaustible energy for increasingly ambitious electrical equipment, with
automated laser turrets an end-game example. Inexhaustible energy does not settle output
capacity, repair stages or equipment requirements; those need their own design before
implementation. The value of the installation, not an arbitrary home designation,
makes defending it worthwhile.

The plant is modular, like a vehicle: restoration means finding or crafting a spare
part and fitting it, rather than repairing an independent plant health value. An
assembly has no condition of its own; its condition is its parts' condition, so repair
and failure have the same physical cause. Whether this rule extends beyond installations
to every assembly, including guns and vehicles, remains a P1 decision; it does not yet
mandate converting those item kinds. Lazy part state must satisfy
`docs/decisions/0011-lazy-part-state.md`, "Decision", so inspecting a destination does
not make all its components permanent save data.

## Waves and attention

The plant anchors both the player's investment and wave attraction. Waves remain the
forcing function because they come regardless of optional PoI fights, and the plant
draws them. Arrival and attention are distinct: going quiet stops fresh attention, not
the arrival of groups. Already-alerted groups continue toward the last-known spot.
This lets quiet operation matter without erasing a threat that has already noticed its
target. The plant's detectable emissions must make that cause understandable in the
world. Far noise is required alongside near noise: imprecise perception over long
ranges lets distant activity draw attention without revealing an exact target. World
noise sources need their own loudness, rather than treating all noise as the player's
signature. Extend the perception tiers in `packages/engine/src/core/agentPerception.ts`,
`hearingTier` and `farBearingTarget`. How plant output affects its noise, and how waves
outside hearing range retain a target, remain P2 choices.

Do not confuse this target contract with arrival placement. See
`packages/engine/src/core/eventRules.ts`, `advanceEventRules`, for event execution, and
`packages/engine/src/core/composeLayout.ts`, `composeLayout`, for compiled arrival anchors.

## Contested height

Big verticality must create playable routes and positions, not just tall scenery.
High ground is not very safe against specialised enemies: Brutes break constructions,
while leapers and climbers gain access by other means. Height changes how the
player defends a position rather than granting immunity to pressure. Construction
breaking and alternative access are distinct capabilities; neither implies attacks
through intact floors or damage unrelated to physical reach.

## Phase decisions

Card only the active phase's choices. Earlier play can reshape later questions, so
an up-front card queue for every phase would prematurely constrain the design. P1
restores the plant; P2 turns that investment into a defence loop.

P10's fliers are parked: flying actors need real three-dimensional movement, the
largest cost for the smallest part of the vision. Revisit after P6–P9 establish whether
height is contested enough without flight. This keeps the high-ground goal without
committing to an unnecessary movement system.

Plant UI design waits for the separate parts-and-instruments exploration. Do not card
or brief it before that exploration lands: its gauges must reflect real simulated state,
not constrain that state to an invented display.

## Content ownership

Placement, site mix, loot, repair requirements, power and equipment values, wave pacing
and enemy capabilities belong in content. Code supplies the validated mechanisms rather
than selecting behaviour by Holdout-specific IDs; see `PILLARS.md`, "Content forward compatibility".
For the scenario and wave authoring boundaries, see
`mods/skelly.deadvox.scenario.holdout/holdout-site.libsonnet`, `scenario`, and
`mods/skelly.deadvox.scenario.holdout/waves.libsonnet`, `rules`.
