---
read_if:
  - you author map pieces, assemblies or intended site routes
  - you change template ownership, circulation, descent lids or deterministic selection
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
Keep arrangements fixed rather than introducing general grammars or search. The one
exception is a pool quota (`atLeast`): when a fill ends short, it retries the site forcing
every short row, plus those forced before, into the earliest slots where they fit. It stops
when the quotas are met or a retry would force no new row, so there is at most one retry per
quota row, and it aborts naming the pool, the choice and the site if a quota is still unmet.
The retry is bounded and loud so a plan stays a deterministic function of its seed and a
content error cannot hide.
See `packages/deadvox/docs/content.md`, "Curated kits".

Every cell is unclaimed, owned solid or owned air. Air excavates; unclaimed cells leave
terrain alone. Children stay inside their delegated slots. Siblings never overwrite each
other, even when their materials agree. Collision diagnostics identify both owners and the
cell. Stairs and excavation use the same authority rather than a privileged post-pass.
Reserved cells are owned air that body proofs may rely on; other owned air only
excavates. An ownership layer must agree with the literal blocks and with every delegated
child's footprint so a mark cannot promise space that a child fills. See
`packages/deadvox/src/core/templateOwnership.ts`, `compileOwnership`.

Reserve walking volume, support and connector mouths before attaching rooms or clutter.
Role palettes separate structural meaning from material choice: interior flooring must
not silently become shell treatment. Final supported body traversal, including furnished
return routes, establishes reachability rather than graph connectivity alone.

Resolve choices from sorted candidates with random streams keyed by world seed, site
identity and slot path before requesting any chunks. Determinism means equal inputs,
not unchanged worlds after content edits. Overrides by later packs require consumer
revalidation; field patches follow `docs/decisions/0007-typed-field-patches.md`,
"Decision", and live updates remain deferred.

Extend the existing template compiler and city plan rather than creating another stamping
engine. Compiled ownership and provenance travel with the geometry so diagnostics can
explain both claimed solids and reserved voids. See `packages/deadvox/src/core/templates.ts`,
`compileTemplate` and `stampPlacement`, and `packages/deadvox/src/core/cityPlan.ts`, `buildCityPlan`.

## City storey boundaries

A stair wedge and its reserved air own the opening through the next floor. The room and
floor pieces leave that strip unclaimed; they cannot repaint the stair or its headroom.
Sharing literal storey pieces keeps repeated facades consistent without turning floor
count into a geometry generator. See `packages/deadvox/src/content/base/gauntlet-city-kits.libsonnet`,
`lowerSlots`, `lowerFloorClaims` and `middleFloorClaims`.

Furnishing choices preserve the circulation contract but can still add obstacles and
loot outside it. Reachability witnesses must use the final furnished assembly in both
directions; material ownership alone does not establish a usable flight.

## Lab room boundaries

Repeated room pieces reserve their thresholds and central circulation separately from
furnishing bays. A room substitution may change equipment inside a bay without changing
its supported routes or borrowing space from a connector. Mouth clearance should enclose
the walking body, not adjacent equipment: declaring an unnecessarily deep mouth would
turn a valid furnishing bay into a circulation conflict. See
`packages/deadvox/src/content/base/gauntlet-lab-rooms.libsonnet`, `room`.

A descent shaft owns its ladder column, body clearance and opening through the upper
floor. The receiving room leaves the shaft volume unclaimed; the departing room leaves
its floor opening unclaimed. Furnishing beside the column still needs a final climb
certificate: exclusive ownership prevents overlapping writes, not a body obstruction in
an adjacent cell. See `packages/deadvox/src/content/base/gauntlet-lab-descents.libsonnet`, `shaft`,
and `packages/deadvox/test/labDescentKit.test.ts`.

Production storeys compose literal circulation strips and furnished room assemblies.
Equipment bays belong to their room, while descent shafts and floor openings belong to
connectors. Closed descent lids support both side cells of the opening, so crossing an
upper room cannot silently become a drop route. Opening the lid deliberately admits the
climb. See `packages/deadvox/src/content/base/gauntlet-lab.libsonnet`, `storey`,
`packages/deadvox/src/content/base/gauntlet-lab-equipment.libsonnet`, `furnished`, and
`packages/deadvox/src/content/base/gauntlet-lab-descents.libsonnet`, `mapPieces`.

The service facade and underground campus share one owned assembly rather than a second
copy of the lab geometry. Portal anchors address finished furniture positions, not source
palette characters, because markers belong to individual pieces. The final city-site
witness walks closed descent lids, opens them, descends and returns through ordinary
session commands. See `packages/deadvox/src/content/base/gauntlet-service.libsonnet`,
`mapAssemblies`, `packages/deadvox/src/core/scenarioPortal.ts`, `portalPieces`, and
`packages/deadvox/test/fixtures/scenarioCertificate.ts`, `traverseScenario`.

## Consequences

Curated kits cost authoring and seam review effort, but substitutions remain understandable
and composition defects fail at their source. Visual quality and interesting play still
need operator judgment; ownership and reachability cannot establish them.

Issue #712 owns the first city and lab migrations and their debug witnesses. Unrelated
map migrations remain outside that slice. Do not treat a literal transcription of an
entire generated lab, or renamed partition helpers, as a reusable curated kit.
