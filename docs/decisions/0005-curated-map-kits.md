---
read_if:
  - you author map pieces, assemblies or intended site routes
  - you change template ownership, circulation or deterministic selection
---

# 5. Curated spaces with exclusive ownership

## Context

A correctly authored facade can become incorrect when a floor slab or excavation
silently wins a later write. Generated partitions also hide the intended inhabited space
behind construction rules. More complicated write precedence does not repair either
boundary.

## Decision

Author structures and negative space as finite curated pieces. Noise remains appropriate
for terrain. Jsonnet is source, never a generated artifact. Constructors may compose
references but must not synthesize architecture. The repository-wide rule belongs in
`docs/jsonnet.md`, "Curated map features".

Pieces own literal geometry, role palettes, anchors and typed connection contracts.
Assemblies delegate named spatial slots, select contract-equivalent alternatives and name
curated transition pieces for joins. Site recipes own placement and intended routes.
Keep arrangements fixed rather than introducing fitting, backtracking or general grammars.

Every cell is unclaimed, owned solid or owned air. Air excavates; unclaimed cells leave
terrain alone. Children stay inside their delegated slots. Siblings never overwrite each
other, even when their materials agree. Collision diagnostics identify both owners and the
cell. Stairs and excavation use the same authority rather than a privileged post-pass.

Reserve walking volume, support and connector mouths before attaching rooms or clutter.
Role palettes separate structural meaning from material choice: interior flooring must
not silently become shell treatment. Final supported body traversal, including furnished
return routes, establishes reachability rather than graph connectivity alone.

Resolve choices from sorted candidates with random streams keyed by world seed, site
identity and slot path before requesting any chunks. Determinism means equal inputs,
not unchanged worlds after content edits. Whole-definition replacement uses ordered packs
and requires consumer revalidation; patch languages and live updates remain deferred.

Extend the existing template compiler and city plan rather than creating another stamping
engine. Compiled ownership and provenance travel with the geometry so diagnostics can
explain both claimed solids and reserved voids. See `deadvox/src/core/templates.ts`,
`compileTemplate` and `stampPlacement`, and `deadvox/src/core/cityPlan.ts`, `buildCityPlan`.

## City storey boundaries

A stair wedge and its reserved air own the opening through the next floor. The room and
floor pieces leave that strip unclaimed; they cannot repaint the stair or its headroom.
Sharing literal storey pieces keeps repeated facades consistent without turning floor
count into a geometry generator. See `deadvox/src/content/base/gauntlet-city-kits.libsonnet`,
`lowerSlots`, `lowerFloorClaims` and `middleFloorClaims`.

Furnishing choices preserve the circulation contract but can still add obstacles and
loot outside it. Reachability witnesses must use the final furnished assembly in both
directions; material ownership alone does not establish a usable flight.

## Consequences

Curated kits cost authoring and seam review effort, but substitutions remain understandable
and composition defects fail at their source. Visual quality and interesting play still
need operator judgment; ownership and reachability cannot establish them.

Issue #712 owns the first city and lab migrations and their debug witnesses. Unrelated
map migrations remain outside that slice. Do not treat a literal transcription of an
entire generated lab, or renamed partition helpers, as a reusable curated kit.
