---
read_if:
  - you add a composed-site ask, anchor or population mechanism
  - you add or change a link that joins two asks with a road
  - you decide whether a world feature belongs in the city planner or authored layout
  - you change supply guarantees or the boundary between wave content and runtime events
  - you change Holdout's starting building or decide whether it should force a base location
  - you change the relationship between Holdout PoI occupants and waves
---

# 0010 Composed sites compile content asks into the authored layout

## Decision

Compile scenario asks into the authored layout before rendering. The layout schema is
the shared output format and the target that grows: new world features belong there,
not in city-only extensions. This keeps one terrain consumer and leaves city cores as a
future ask kind rather than committing to parallel site systems. See
`packages/engine/src/core/composeLayout.ts`, `composeLayout`;
`packages/engine/src/core/schema/layouts.ts`, `SiteLayoutSchema`; and
`packages/engine/src/core/authoredSite.ts`, `AuthoredSite`.

> A's real limit is "whatever the layout schema can express". That is a growth path, not a wall:

> Long term this merges the two site systems into one: the layout schema becomes the shared
> output format and the city generator becomes one ask kind. B would keep two systems forever.

Incremental composition tolerates imperfect seeds because redundant affordances are
cheaper to retune than per-seed correctness certificates. Source count is the hard supply
rule; distance curves express preferences. Do not introduce distance bands or route
certificates as admission gates. See `packages/engine/src/core/composeLayout.ts`,
`guaranteeIssues` and `composedSiteIssues`.

> The engine just samples the curve and never knows what a band means.

> What stays a hard guarantee is the count (each material class has at least 2 sources), not where they are.

Anchors and wave clocks belong to content so mods choose placement kinds and pacing.
The compiler resolves arrivals before the session, keeping event execution independent
of world generation. Actor types own strength rather than wave-specific overrides.
See `packages/engine/src/core/schema/scenarios.ts`, `ComposedSiteSchema`;
`packages/deadvox/mods/skelly.deadvox.scenario.holdout/waves.libsonnet`, `rules`; and
`packages/engine/src/core/eventRules.ts`, `advanceEventRules`.

> Anchors are content, and the engine only resolves them.

> A wave effect names an anchor (or a list of them to draw
> from), never a cell.

A link joins two placed asks with one authored road: each end names a walk gate whose
`type` names one shared road profile, and a transition assembly mates both gates, its
route bending the road between them. Fitting rides the destination ask's retry loop —
a candidate counts only once the gates mate, the transitions stand clear of the bounds,
the buildings and every other reservation, and the track connects — and the ask the road
leaves is itself retried when its gate cannot host the transition or lead the road away,
because no later placement can unblock a source. When every attempt fails, the refusal
names the link, the profile and the transition, so a blocked road is attributable rather
than silently dropped. A link joins exactly two gates: loops and roads passing through a
compound are not expressible yet. The transitions are authored pieces and the stretch
between them is a layout track, so terrain, vegetation and paper maps treat the whole
road as one surface. See `packages/engine/src/core/schema/scenarios.ts`, `SiteLinkSchema`;
`packages/engine/src/core/composeLayout.ts`, `planLink` and `fromExitFits`; and
`packages/engine/src/core/templates.ts`, `portsMate`.

Composed population does not inherit city street pressure: local occupants belong to
the authored sites, not an unrelated street population. Holdout PoIs admit their own
occupants, scaled by the quiet, moderate and intense site mix. Waves remain the forcing
function because they arrive regardless of which optional encounters the player chooses,
and the power plant draws them. Local danger and wave pressure serve different purposes;
see `docs/holdout.md`, "A landscape of destinations", and
`docs/holdout.md`, "Waves and attention".
For population admission and scenario authoring, see
`packages/engine/src/game/worldSetup.ts`, `SCENARIO_SITES`, and
`mods/skelly.deadvox.scenario.holdout/holdout-site.libsonnet`, `scenario`.

Holdout's start should feel like a good place with potential, not a forced base. Reuse
an ordinary house with authored damage so useful enclosed space and familiar furnishings
invite repair, while breaches leave a reason to improve it or choose another location.
Keep this treatment in content rather than adding a scenario-specific ruin mechanism.
See `packages/deadvox/mods/skelly.deadvox.scenario.holdout/holdout-house.libsonnet`, `house`,
and `packages/deadvox/mods/skelly.deadvox.scenario.holdout/holdout-site.libsonnet`, `scenario`.

## Growth constraints

> 1. Asks are a union keyed by `kind`, so a new ask kind is one entry.
> 2. Reservations are one plain list of rectangles that every ask, nested generators
>    included, reads and adds to.
> 3. Route checks run on the composed layout, not on city-only route code.
> 4. The ADR names the layout schema as the target that grows; new world features go there,
>    not into the city.
> 5. Asks form a tree: an ask may own an area and child asks. Holdout's flat list is the
>    shallowest case; nesting need not be built yet, only not ruled out.
> 6. Template eligibility (settlement kinds) is passed down the tree, not ignored, so a
>    borough's kind narrows which templates fit in it.

Nesting, cover designations and route diagnostics need their own mechanisms; these
constraints keep their extension points open without pretending they are implemented.
The event count safety bound and player-position horde target remain engine constraints;
move their tuning to content when adding the corresponding budget and target mechanisms.

## Rejected alternatives

Compiling asks reuses authored rendering without inheriting city shape or making
correctness certificates the cost of each retune.

> **B** (extend the city scenario) loses woods, tracks and terrain, which are what make the
> shell choice a real trade-off, and keeps the forced hatch and map pool.

> **C** (asks on authored layouts) needs per-seed validation of every layout, the
> correctness burden Holdout explicitly does not want.
