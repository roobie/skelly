---
read_if:
  - you add a composed-site ask, anchor or population mechanism
  - you decide whether a world feature belongs in the city planner or authored layout
  - you change supply guarantees or the boundary between wave content and runtime events
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

Composed population has no city street pressure because there are no street groups to
populate. Template markers are explicitly admitted or suppressed; Holdout suppresses
them so waves remain the forcing function, independent of shelter-template occupants.
See `packages/engine/src/game/worldSetup.ts`, `SCENARIO_SITES`, and
`packages/deadvox/mods/skelly.deadvox.scenario.holdout/holdout-site.libsonnet`, `scenario`.

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
