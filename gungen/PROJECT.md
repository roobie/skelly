---
read_if:
  - you change firearm part geometry precision or sight dimensions
  - you change the AK ADS sight alignment
  - you change optic eye-relief validation
  - you change firearm sight metadata or its ADS contract
  - you change the AK receiver's position relative to its centered bore
  - you change the AK archetype's proportions, or map them against its golden photo
  - you change attachment parts, mount slots or their Deadvox export
  - you change firearm design/template calibre or AK magazine selection
  - you change STANAG magazine geometry or its Deadvox export
  - you change default sweep coverage or timeout policy
  - you change Gungen's cross-project typechecking or CI triggers
  - you change the firearm action/ejection export contract with Deadvox
  - you author or change gungen assembly or cartridge content
---

# gungen — low-poly firearm designer

The first skelly subproject. It builds super-low-poly 3D firearms by working
out how components connect, so every result is a *feasible* assembly. It began
as a procedural generator; from Milestone 3 it is a designer tool, with the
generator kept as a variant suggester.

## Aim

"Feasible" can mean one of three levels:

1. **Looks right:** a viewer reads the model as a plausible firearm.
2. **Fits together:** parts line up, nothing overlaps, and moving parts have
   room to move. ← **the aim of this project**
3. **Actually works:** real mechanisms, real tolerances, manufacturable.
   ← **explicitly out of scope**

Level 2 turns feasibility into a set of rules we can check, not a physics
simulation.

### Non-goals

- Internal mechanisms at real-world dimensions.
- Dimensioned, toleranced or printable output. No CAD/STL export for
  fabrication.
- Reproducing specific real-world models or brands.

The output is stylized low-poly models of assemblies. Sizes are expressed as
size classes (see §4), not measurements.

**Exception: ammunition.** Cartridges are modelled at real dimensions in
millimetres and named by their real designations (for example 7.62×39mm). That
amends the real-world-models non-goal and the size-class rule (§4) for
cartridges only. Calibre is a gameplay identity, because ammo must match the
gun, not a brand, and a standard (C.I.P., SAAMI) fixes a cartridge's dimensions
rather than a designer choosing them. Guns keep size classes. Every cartridge
dimension carries its source, and a value that can't be sourced stays empty.
Tracked in roobie/skelly#109: data first, then cartridge solids, viewer and export.
The pump-action clearance model may consume a cited loaded-shell length without
adding shell geometry. The data format is described in `cartridges/README.md`.

## Decisions

| Decision | Choice |
| --- | --- |
| Language | TypeScript (strict), one language for core and viewer |
| Core | Pure library in `src/core`, with no rendering dependency; domain-agnostic (§10) |
| Gun data | `src/gun`: part families and the gun domain config |
| Viewer | three.js, served by Vite, in `src/viewer` |
| Tests | Vitest |
| Lint/format | Biome, repo-wide (`biome.jsonc`): every stable rule on. See the static-analysis pillar in the root README |
| Part definitions | TypeScript code: each family is a function from size-class params to a part |
| Assemblies | JSON files (a Jsonnet source compiles to the JSON beside it): part instances plus connections (§7); see `../docs/jsonnet.md` |
| Loops | Loops are only *checked* for closure; there is no solver yet |
| Layouts | Data, not code: the receiver is only the action body, and a swappable lower sets where the grip and magazine go |
| Domain rules | Domains add their own rules next to the core ones (`Domain.rules`) |
| Generation | Templates (data) plus a seeded generator. The generator only makes choices; the validator decides what's feasible. From Milestone 3 it suggests variants of a design rather than producing the product |
| Design (Milestone 3) | Guns are curated designs, edited through params only. A new archetypal shape is added as vocabulary (a part family or param value) or a prefab, never as free-form geometry editing |
| CI | GitHub Actions (`.github/workflows/gungen.yml`): typecheck, tests, fixture validation, viewer build |
| Hosting | GitHub Pages (`.github/workflows/pages.yml`): every push to `main` is checked, then the viewer is published at <https://roobie.github.io/skelly/gungen/> |
| Params from neighbours | Declared per param (`ParamSpec.from`): an unset param copies a neighbour's param through a named port. Values set in the assembly always win |
| Keep-out shapes | Keep-outs carry a conservative box, with an optional exact convex XY profile extruded through Z |

## Design areas

§1–§3 are the first milestone. Together they form one design: a port schema, a
keep-out volume schema, and feasibility rules written against both. They are
hard to change once parts are authored against them. Everything after that can
change later.

### 1. Feasibility rules

- Every rule must be checkable locally (one connection) or globally (the whole
  assembly). No simulation.
- Every rule has an id and a readable failure message (see §8).
- Starting rule set: port compatibility, bore-axis alignment, no overlap
  between solids, no solid inside a keep-out volume, required ports filled,
  loops close, ergonomic reach (§5). All but ergonomic reach are implemented
  in Milestone 1.

### 2. Ports (how parts connect)

- A port has: position and orientation (a frame relative to its part), a mount
  type, a size class, a direction (which side plugs into which), and whether it
  is required or optional.
- One-to-many: a rail with N slots, or a port that accepts several kinds of
  part.
- **Assemblies are graphs, not trees.** They can form loops. For example, a
  handguard can attach to both the receiver and the barrel. The data model must
  support closed loops, so resolving an assembly needs at least a light
  constraint solver, not just a tree walk.

### 3. Keep-out volumes (the literal negative space)

A lot of feasibility depends on what must *not* be occupied. Each part carries
the keep-out volumes it needs:

- the path spent casings take out of the ejection port
- the path a magazine takes going in
- room for a finger inside the trigger guard
- the travel of the bolt or charging handle, as a swept volume
- a clear line of sight through the sights
- the space in front of the muzzle

A global overlap check against these volumes catches most infeasible builds
cheaply.

### 4. Coordinate frames and scale

- One main reference axis: the **bore line**. Everything is expressed relative
  to it.
- Conventions to fix before writing code: the up axis, handedness, units.
- **Size classes, not exact numbers**: S/M/L with snapping. This fits low-poly
  and keeps us within the Level 2 boundary. Sights alone use a finer sub-grid
  where small notches and posts must remain legible at their authored dimensions.
- Optic cheek-datum validation applies to long-eye-relief optics. Compact optics
  can be mounted on stockless firearms; a handgun has no shoulder cheek datum.

### 5. The person holding it

Grip angle, trigger reach, the length from butt to trigger, and where the cheek
rests are all constraints that come from a body. A simple human rig is what
checks them. This is the first link to skelly's skeleton and rigging work.

### 6. How to generate

- Decision: an archetype **grammar** (templates expand into slots, slots are
  filled with parts) with local port rules, plus a **global validation pass**
  (keep-out volumes, ergonomics).
- Rejected as the main approach: generate-and-test, because most results are
  invalid.
- Decided (Milestone 2): archetypes are hand-written **templates** first.
  Emergent archetypes, found from the part rules alone, can come later on the
  same machinery.
- Decided (Milestone 3, BR 2026-09-28): good-looking blocky guns need curation,
  so gungen becomes a designer. Generation proved what the part vocabulary and
  rules can express; it stays as a variant suggester inside the designer.

### 7. The data format comes first, the mesh second

- The source of truth is the **assembly graph plus a seed**. That gives
  determinism, a save format, and diffs you can read. Meshes are derived from
  it.
- Parts are **parametric families** (for example, a chamfered box whose ports
  move with its size), not fixed meshes. That lets connections adapt.
- Mesh rules: a polygon budget per part and per assembly, flat shading, and a
  rule for merging parts into one mesh.

### 8. Explaining failures

- A failed build reports which rule broke, which parts are involved, and which
  keep-out volume was hit.
- Build debug views of ports, frames and keep-out volumes early, before any
  polished rendering.

### 9. Measuring the generator

- Share of invalid builds, from the generator before validation.
- Variety across seeds.
- A gallery of generated builds, reviewed by hand in the viewer at generator-change time (see `docs/deferred-assertions.md`); generated geometry is not snapshotted.

### 10. Making it reusable beyond guns

Keep the port, constraint, keep-out and graph machinery free of gun-specific
logic, and put everything gun-specific in data. The same core should later
drive other skelly domains, such as rigging, where a joint is just a port that
can rotate.

**Units per domain.** A domain declares `units` (`../engine/src/core/schema.ts#DomainUnits`):
metres per unit, the snap grid and the bevel, all in its own u. The gun domain
declares its values in `src/gun/units.ts#GUN_UNITS`, built from
`METRES_PER_UNIT`, `GRID` and `BEVEL`. The core reads them from
`resolved.domain.units`: the glb export scales by `metresPerUnit`, the
connection-contact rule allows a gap of one `grid` step, and meshes are
chamfered by `bevel` (`../engine/src/core/mesh.ts#displayBevel`). That contact tolerance
is not permission to model a visible gap: the revolver's frame/grip/trigger-guard
junction is a zero-gap shared-solid contract checked by `revolver-grip-joint`.
The shared frame between domains is metres; an assembly belongs to one domain,
so a scene that shows two domains is two assemblies placed in metres, with no
rule checks between them. The generic defaults in
`../engine/src/core/conventions.ts#TOLERANCE` were tuned against Gungen's u-scale;
a new domain should assess their magnitudes against its own units.

**Revolved solids.** `RevolvedSolid` (`../engine/src/core/schema.ts#RevolvedSolid`) is a
third kind of solid: a profile of (axial, radial) points turned about an axis
(`axis`, local Z when omitted, with the same axes as an extrusion). Optional
`origin: Vec3` translates that axis in the part frame (omitted = `[0, 0, 0]`);
mesh positions, collision hulls, bounds and anchor points share this translation.
It exists
for round parts with real detail, such as cartridges, which the box and
extrusion kinds cannot describe.

- Mesh: `../engine/src/core/revolve.ts#meshForRevolved`. Normals are smooth around the
  circumference and hard where the profile bends past `creaseDegrees` (40 by
  default). The facet count is a level of detail chosen when the mesh is built,
  not a field of the solid: `meshForSolid` takes it (default 6), the viewer
  takes `?facets=N` (default 16, 24 for close-ups) and the glb export takes `revolveFacets`.
  The bevel and `display.mergeGroup` do not apply; the viewer draws it
  smooth-shaded and without an edge outline.
- Collision: `../engine/src/core/revolve.ts#revolvedLocalPolyhedron`, the convex hull of
  the turned profile with a fixed 8 facets, whatever the level of detail. It
  ignores grooves and hollows, and its facets are inscribed, so it is at most
  7.6% of the radius smaller than the true solid. Because the hull is solid, a part seated
  inside a hollow revolved part overlaps it; the ammunition domain has to deal
  with that.
- Validation: `../engine/src/core/revolve.ts#revolvedProfileError` reports a bad profile
  as a structure issue when the assembly resolves.

## Milestone 1: validator and debug viewer

**Goal:** take a hand-written assembly file, place its parts, check it against
the rules, and show the result in a viewer. When a build fails, the output says
which rule broke and where. No generator yet: the validator comes first, so
the generator later has something independent to be tested against (§9).

**Status:** done.

### What was built

- **Conventions** (`../engine/src/core/conventions.ts`): +X forward (toward the muzzle),
  +Y up, +Z right; right-handed. The bore line is the X axis through the
  origin, and the root part sits at the origin. Lengths are in u, an abstract
  unit that sets proportions only, on a 0.25u grid. Size classes are S/M/L;
  each part family maps them to u in its own tables.
- **Schemas** (`../engine/src/core/schema.ts`): ports, keep-out volumes (boxes, optionally
  refined by convex extruded-polygon profiles), box, convex extruded-polygon
  and revolved solids (§10), parts, part families, domains, and the JSON
  assembly format.
- **Placement** (`../engine/src/core/resolve.ts`): walks connections out from the root.
  A connection whose two parts are both already placed closes a loop and is
  checked, not solved. Connections support rail slots and 90° roll.
- **Rules** (`../engine/src/core/rules.ts`), each with an id and a readable message:

  | Rule id | Checks |
  | --- | --- |
  | `port-compat` | Mount types match, genders are opposite, sizes match, and no port or slot is used twice |
  | `axis-alignment` | Bore axes lie on the bore line; sight axes are parallel to it |
  | `solid-overlap` | Solids don't overlap. Direct connections use a mount-specific allowance (0.75u fallback) |
  | `connection-contact` | Solids on connected parts touch or are within one grid step of the domain |
  | `keep-out` | No solid is inside another part's keep-out volume, except parts attached at an allowed port or from an explicitly allowed family |
  | `required-ports` | Every required port has something attached |
  | `loop-closure` | Connections that close a loop actually meet |

  The contact rule checks minimum Euclidean separation between the connected
  parts' convex solids; overlap remains solely governed by `solid-overlap`.
  A separated pair is covered in `test/fixtures/synthetic-connection-contact-gap.json`.
  A file that can't be resolved (unknown family, part, port or param; bad slot
  or roll) is reported under `structure`.
- **Parts** (`src/gun/parts.ts`, since reworked in Milestone 1.1): receiver,
  lower, barrel, cylinder, handguard, tube magazine, forend, grip, magazine,
  stock and sight, built from boxes and convex extrusions. A handguard joined
  to the barrel carries a bore-fitted collar so its clamp connection has solid
  contact. The handguard can clamp to the barrel as well as the receiver,
  which creates a loop. There are
  12 mount types: each socket needs its own type so a stock can't go in a grip
  socket.
- **Keep-out volumes:** ejection and slide paths, trigger finger, magazine
  insertion, charging-handle/bolt/hammer travel, cylinder gap/swing clearance,
  loading ports, sight line and muzzle.
- **Fixtures** (`fixtures/`): one valid assembly and one broken assembly per
  rule. Each file lists the rules it is expected to fail in `expect`, and the
  tests check each one fails exactly those.
- **Viewer** (`src/viewer/`): box and extruded-profile solids, port frames
  (normal and up arrows), keep-out volumes and the bore line, with failing
  parts and volumes in red.
  Click an issue to isolate it; hover to name what's under the pointer; open
  your own assembly JSON.

### Out of scope for Milestone 1

The generator and grammar (§6), the human rig (§5; the trigger-finger keep-out
volume stands in until it exists), final meshes and merging (§7), the metrics in
§9, and more archetypes.

## Milestone 1.1: receiver split, domain rules, archetype smoke tests

**Goal:** stop the part library being one rifle layout. Every archetype below
must be buildable from the shared parts, pass every rule, and read as that
archetype in the viewer.

**Status:** done.

### What changed

- **Domain rules.** `Domain.rules` adds rules that run after the core ones.
  Parts can carry free-form `tags` for such rules to look for. The gun domain
  adds one:

  | Rule id | Checks |
  | --- | --- |
  | `firing-grip` | Something for the firing hand: a part tagged `firing-grip` (a pistol grip, or a stock with a wrist) |
  | `pistol-barrel-crown` | A pistol barrel protrudes 0.5–1.5u beyond its slide |

- **Receiver split.** The receiver is now only the action body, with two
  params:
  - `action`: `auto` (charging handle), `bolt` (bolt travel out of the back,
    bolt handle sweep on the right), or `pump` (forend-driven). Each adds its
    own keep-out volumes. Revolvers and pistols use dedicated families, not
    receiver actions.
  - `feed`: `box` (magazine through the lower), `top` (loading port above the
    action), or `tube` (tube magazine port underneath). Revolvers use a
    dedicated cylinder family, not the receiver feed path.

  The grip and magazine hang from a **lower** under it, whose `layout` param
  sets where they go:
  - `conventional`: magazine ahead of the grip.
  - `bullpup`: grip ahead of the magazine, with the butt built in.
  - `trigger`: trigger with an optional grip anchor and no magazine well.
- **New and extended parts:**
  - `tube-magazine`: runs under the barrel, with its cap fixed to the barrel's
    lug. That closes a loop, the same way the handguard clamp does.
  - `forend`: slides on the tube, with a slide-travel keep-out volume.
  - `stock` now has a `style`. `straight` puts the comb in line with the bore.
    `sporting` drops the comb below the bolt's travel and adds a wrist to hold.
  - The handguard has a top rail, so a sight can sit ahead of the action.
- **Mount types:** 12 now. `lower`, `tube`, `lug`, `forend` and `cylinder` are new.

### Archetype fixtures

Each is valid and passes every rule. Files are in `fixtures/`.

| Fixture | Archetype | Built from |
| --- | --- | --- |
| `archetype-ar` | Classic AR-pattern rifle | A2 front-sight block at the gas-port station; the clamped handguard ends at its collar |
| `archetype-ar-free-float` | Free-floating AR-pattern rifle | No fixed barrel block; detachable front post on the forward handguard rail slot |
| `archetype-ak` | AK-pattern rifle | AKM proportions: front sight with open ears just behind the slant brake (the template also offers the AK-74 brake), upper and lower handguards, wooden buttstock |
| `archetype-battle-rifle` | FAL/FNC-like battle rifle, conventional layout | auto/box receiver, conventional lower, pistol grip, straight stock, clamped handguard |
| `archetype-smg` | Submachine gun | Same layout as the battle rifle at small bore, with a short barrel and stock and a long magazine |
| `archetype-bolt-rifle` | Bolt-action rifle, loaded from the top | bolt/top receiver, sporting stock, full-length handguard, sight on the receiver rail |
| `archetype-bolt-rifle-box` | Bolt-action rifle, detachable box magazine | bolt/box receiver, pistol grip, sporting stock, sight over the action |
| `archetype-pump-shotgun` | Pump-action shotgun | pump/tube receiver at large bore, tube magazine plus forend, trigger-only lower, sporting stock |
| `archetype-pistol` | Semi-automatic pistol | integrated frame/grip, hollow slide, internal barrel with 1u crown, grip magazine |
| `archetype-revolver` | Revolver | dedicated top-strapped frame, cylinder/barrel alignment, and separate grip |

Scale anchor: keep the gun-domain unit calibration; the Brownells listing's stated 2.54 in (64.5 mm) STANAG-20 body depth corroborates the authored body depth within one grid step. Its 127 × 66 × 25 mm delivery dimensions are package data, not body data. The listing's other stated body dimensions govern body sizing. Optic references are recorded in `docs/optics.md`.

- Grip S/M/L lengths are `7.5/8.5/9.5u` along the grip axis, including the
  integrated pistol-frame grip.
- The 20-round STANAG body follows the Brownells listing, with each sourced
  dimension snapped to the nearest 0.25u grid step. The 30-round body shares
  its width, while its length and depth follow the HK SA80-compatible steel
  listing and are snapped to the nearest grid step. This is a visible reference,
  not a claim that the 30 is a USGI aluminium magazine. The shared upper and
  feed lips use the same snapped width as both bodies. Both STANAG bodies fit
  the AR magwell as modelled. The AR lower has no well roof, so a seated magazine
  passes up through it into the receiver; the magwell opening and outer frame
  come from `AR_ACTION_LAYOUT`. The 30-round side profile is a visual fit to the
  public paired-magazine photo; the straight 20-round body provides camera-skew
  calibration, and the 30's bend begins a little under halfway down the
  20-round body's length. The calibrated photo makes the 30 appear longer than
  the listing's approximate length, so the listing's length is the model basis;
  the floorplate detail is an estimate. No feed-lip-to-bore dimension is sourced,
  so feed-lip height comes from the modelled bolt-carrier path and barrel
  extension, snapped to the grid. The lower's `magwell` anchor and Deadvox's
  `slots.magazine` frame follow the seat so a fitted magazine remains aligned;
  see `src/gun/parts.ts`, `lower`, `BOLT_CARRIER_ENVELOPES`,
  `BOLT_CARRIER_RUNNING_CLEARANCE_U`, `src/gun/arLayout.ts`, `AR_ACTION_LAYOUT`,
  `src/gun/anchorData.ts`, `frameAt`, `src/gun/exportGlb.ts`, `exportGunGlb`,
  and `deadvox/src/render/itemLook.ts`, `itemLook`. The HK
  listing's approximate empty weight is for steel, so Deadvox uses a gameplay
  mass estimate unless an aluminium STANAG-30 mass is sourced; see
  `deadvox/src/content/base/items-ammunition.json`, `magazine_stanag_30`. See
  `src/gun/parts.ts`, `STANAG20_SOURCED_WIDTH_MM`, `STANAG20_BODY_BOX_U`,
  `STANAG30_CENTERLINE_LENGTH_U`, `STANAG30_BODY_WIDTH_U`, `magazineBodySection`
  and `magazineGeometryFor`.
  Sources: [Brownells 20-round listing](https://www.brownells.se/AR-15-MAGAZINE-20-ROUND-USGI-BROWNELLS-AR-15-STRAIGHT-MAGAZINE-20-ROUND-GRAY-Aluminum-Gra-556-x-45-430110983);
  [HK SA80 30-round listing](https://www.meanandgreen.com/army/British_Army/SA80_5.56mm_30_Round_NATO_Magazine/3850/2876.html);
  [paired STANAG magazine photo](https://upload.wikimedia.org/wikipedia/commons/c/ca/Stanag_mags.jpg).
  Other STANAG capacities are deferred to #414. The AKM curved band is fitted
  to its golden photo (g41-4).
- The detachable-box bolt rifle alone has compact `5-round`/`10-round` lengths
  `4.5u/5.5u`, seated in a recessed well. Their floorplates protrude `0.25u`
  and `1.25u` below the well/stock line respectively. The top-loaded bolt rifle
  is not a box-magazine user; other archetypes do not offer this exception.
- Every barrel profile uses a regular octagonal X-axis extrusion at the
  former square's flat-to-flat width; bounds and ports are unchanged. Pump tubes
  and cap lugs are regular octagonal; the support band is an eight-sided prism
  clipped to its existing rectangular bounds. The AK gas cylinder is a regular
  octagon. The gas block is an octagonal barrel collar whose riser spans from
  the barrel to the cylinder: its fore face rakes back as it rises, and its rear
  vertical face mates the cylinder's full front end face. Their sizes are in
  `src/gun/akProportions.ts`, `AK_PROPORTIONS`.
- Standard and free-float AR handguards occupy 65% of exposed barrel length;
  the fixed AR handguard ends at the rear face of the A2 collar. AK handguards
  end at the gas block. The AR front sight is at the standard gas-port station; its
  muzzle distances are 6.25/9.25/12u for S/M/L. The AK post stands just behind
  the barrel's end, behind the muzzle device (`src/gun/parts.ts`,
  `frontSightPosition`). The AK's barrel, handguard and stock lengths are mapped
  from its golden photo (see "AK" under Milestone 2.3). Tilted magazine seating is declared per lower layout: conventional
  and AR layouts support the standard magazine profile; bullpup, AK, and trigger
  layouts do not. Unsupported combinations are rejected by `magazine-well-axis`,
  not surfaced as contact gaps.
- `handguard.mount` is `clamped` by default. AR templates choose free-float 75%
  of the time; battle-rifle templates choose free-float 50% of the time when the
  optional handguard is present. AK, SMG, and bolt-rifle templates stay clamped.
  A free-float handguard attaches at the receiver only, has no front clamp port,
  and owns an explicit `length` value initialized from the selected barrel band.
  Standard and free-float AR handguards reach 65% of the barrel; the clamped AR
  layout instead ends at the rear face of the A2 sight collar. Free-float rails
  end behind the barrel's front-sight station and muzzle; `free-float-clearance`
  reports contact or an undersized gap.

Pump tubes choose `lengthPercent` from `50`, `75`, or `100`; their reach is that
percentage of the actual barrel span (26/36/46u for S/M/L), snapped to the grid.
A bore-aware drop keeps a 0.5u gap between the tube and barrel. The forward
end has an oversized 2.5u-long octagonal barrel-gray cap that encloses the last
section of the tube; it ends at the selected tube-length station and leaves
0.25u of clearance
below the barrel. 75% and 100% variants also use a separate support spacer at
the 65% station. A local receiver seat supports the lowered tube without moving
the bore or stock interface.

On top of one broken fixture per rule, these check constraints specific to an
archetype:

| Fixture | Fails | Why |
| --- | --- | --- |
| `broken-bolt-straight-stock` | `keep-out` | A straight comb sits in the bolt's travel |
| `broken-bolt-sight-outside-rail-support` | `optic-mount-fit` | A compact optic is attached at an unsupported receiver-rail end slot |
| `broken-bolt-sight-over-loading-port` | `keep-out`, `optic-mount-fit` | A compact foot roofs the loading footprint and lacks physical support; a type-only LPVO swap restores paired feet |
| `broken-pump-tube-mismatch` | `loop-closure` | The tube magazine's cap misses the barrel lug |

### Known gaps

- **Feed type and lower aren't cross-checked.** A box-fed receiver on a
  trigger-only lower has no magazine, and nothing flags it. A tube-fed
  receiver on a conventional lower is only caught because the lower happens
  to hit the loading port. *(Fixed in 1.2.)*
- **The SMG differs from the battle rifle only in proportions and bore.** Nothing
  models what makes an SMG distinct, such as a simpler action.
- **The forend can overrun the shortest tube.** With an S barrel and 50% tube,
  the fixed forend reaches past the tube's end, and no rule refuses it. Whether
  forend length should scale with tube coverage is open in #457.
- **Neighbour params are discrete values, not computed geometry.** A tube's
  percentage and the barrel's size class are resolved across their lugs; each
  part builder must still compute the matching physical station from both.
- **Ergonomics is just "is there a firing grip".** Reach, length of pull and
  cheek weld (§5) are not checked. If the suspended bullpup returns, its ejection
  port will need a face-clearance check.

## Milestone 1.2: feed check and params from neighbours

**Status:** done.

- **`feed-match` rule** (gun domain): the receiver feed must have a compatible
  well. Box- and top-fed receivers need a lower well; a tube-fed receiver
  can't use one. Pistols now have an integral frame magazine well and do not
  use the rifle receiver/lower feed path. Fixture: `broken-feed-match`.
- **Params from neighbours.** A family can declare that a param reads its
  value from the part on one of its ports, when the assembly doesn't set it.
  Resolution needs only the connection list, so it runs before parts are
  built. It handles chains in any order. A param whose source port isn't
  connected takes its default, and parts reading from it get that default.
  Params that read each other in a cycle all take their defaults. A value the
  param doesn't allow is reported under `structure`. Declared so far:

  | Part | Param | Read from |
  | --- | --- | --- |
  | barrel | `bore` | the receiver on its `rear` port |
  | barrel | `tubeLengthPercent` | the tube magazine on its `lug` port (`lengthPercent`) |
  | handguard | `length` | the barrel on its `front` (clamp) port |
  | tube-magazine | `barrelLength` | the barrel on its `cap` (lug) port (`length`) |

  The tube's explicit `lengthPercent` (50/75/100) scales against its inherited
  actual barrel length; the barrel reads that percentage back to place its cap
  lug. This keeps both independently built parts on the same station. The
  archetype fixtures leave these params unset; the broken tube fixture overrides
  the barrel's expected percentage to create a mismatch.
- Every part's final params, and where each came from, are in
  `Resolved.params`. The viewer shows them on hover, e.g.
  `length M ← barrel.length`.

### Still open

- The SMG is still the battle rifle at a different size and bore.
- Ergonomics is still only "is there a firing grip".
- Neighbour-reading copies values as they are. There's no mapping between
  them (e.g. "one size smaller than the barrel"), and a part can't compute
  geometry from a neighbour's actual dimensions.

## Milestone 2: templates and seeded generation

**Status:** done.

The first step that generates anything. Each archetype is a template, and a
seeded generator turns a template plus a seed into an ordinary assembly file.
The validator then judges it like any hand-written fixture.

### What was built

- **Templates** (`../engine/src/core/template.ts` for the schema, `src/gun/templates.ts`
  for the ten current archetypes). A template lists slots and connections:
  - A **slot** names a part family and, per param, a value or a list to pick
    from. Params it leaves out are default or read from neighbours; a pump
    template picks the tube's coverage percentage while the tube derives its
    physical reach from the connected barrel length.
  - A slot or connection can have a **chance** of being included. That covers
    optional stocks and sights, and handguards that are clamped or floating.
  - A connection's `from` can be a **list of ports** (a sight on the receiver
    rail or the handguard rail), and its `slot` can be **`any`**. The slot
    count is read from the resolved part, so it respects inherited params.
- **Generator** (`../engine/src/core/generate.ts`): `generate(template, domain, seed)`
  is deterministic. It uses a seeded RNG (`../engine/src/core/random.ts`, mulberry32),
  never `Math.random`. `generateValid` tries seed, seed + 1, … until a build
  passes. The generator never checks feasibility itself.
- **CLI:** `npm run generate` prints one assembly with explicit appearance
  context metadata (`--valid` skips to the next valid seed; `--out` writes a file).
  `npm run stats` reports the §9 metrics.
- **Viewer:** a Generate panel with a template picker, a seed field, previous
  and next buttons, "skip to the next valid seed", and "Save JSON" to keep a
  generated build as a fixture.
- **Tests:**
  - Same seed, same assembly.
  - Every param value a template can choose exists.
  - No template produces a structurally broken file over 300 seeds.
  - Every template is valid at least half the time.
  - Review representative generated builds in the viewer when generation changes; the manual review gate is recorded in `docs/deferred-assertions.md`.

### First metrics (`npm run stats`, 1000 seeds per template)

| Template | Valid | Distinct builds | Distinct valid | Failures |
| --- | --- | --- | --- | --- |
| battle-rifle | 80.6% | 959 | 776 | keep-out (sightline) 19.4% |
| smg | 100% | 430 | 430 | – |
| bolt-rifle | 76.3% | 308 | 234 | keep-out (loading-port) 23.7% |
| bolt-rifle-box | 100% | 560 | 560 | – |
| pump-shotgun | 100% | 152 | 152 | – |
| bullpup | 100% | 247 | 247 | – |

The failures are the clashes the templates allow on purpose: a wide handguard
under a sight mounted low on the receiver, and a sight over a top-loading
port. The four templates at 100% have no choices that clash. That's fine, but
it also means their variety comes from proportions, not layout.

### Known gaps

- **A clamped handguard that's too tight passes.** *(Fixed in Milestone 2.1.)*
  Interface allowances are now mount-specific: grip is 0.01u for numeric
  tolerance, clamp is 0u, and other mounts retain the 0.75u fallback. The `S`
  inner handguard on a larger barrel is now rejected at the clamp.
- **Distinct builds are counted by file, not shape.** Two builds whose files
  differ but look the same count as two, e.g. a clamped and a floating
  handguard of the same length.
- **Retrying is linear** (seed, seed + 1, …). Fine at these valid rates; a
  template with a low valid rate would need smarter search.

## Milestone 2.1: convex solids and fitted grip interface

**Status:** done.

- `Solid` is a discriminated union of boxes and convex polygons extruded along
  Z. Polygon profiles are checked for finite coordinates, non-zero area,
  counter-clockwise winding, convexity, self-intersection, and non-empty
  extrusion depth. Invalid shapes produce a `structure` issue and are omitted
  from rendering/collision checks. Keep-out volumes remain boxes.
- SAT collision checks handle convex polyhedra while preserving the box fast
  path's signed-overlap result. A 300-pair deterministic randomized test
  compares both paths within `1e-9`.
- The grip is one five-vertex extruded profile; its beveled mating edge follows
  the angled grip mount. The viewer renders it as one Three.js extruded mesh.
- Conventional and bullpup lowers have a one-unit-deep box magazine well with
  0.25u clearance per side and surrounding material. The magazine inserts 0.75u
  into the well, leaving a 0.25u roof; the conventional lower also has a 0.25u
  front wall beyond the well. This is a simple solid model, not a detailed feed
  interface.
- Mount-specific interface tolerance removes the grip's former 0.75u
  dependency and makes an over-tight handguard clamp fail.

Generator valid-rate comparison (`npm run stats`, 1000 seeds/template):

| Template | Before | After | Change |
| --- | ---: | ---: | --- |
| battle-rifle | 80.6% | 80.6% | none |
| smg | 100% | 100% | none |
| bolt-rifle | 76.3% | 76.3% | none |
| bolt-rifle-box | 100% | 100% | none |
| pump-shotgun | 100% | 100% | none |
| bullpup | 100% | 100% | none |

Rates are unchanged: the existing templates use only handguard sizes that
clear the barrel, and the new grip bevel fits without increasing overlaps.

## Milestone 2.2: handguns — pistols, then revolvers

**Goal:** add distinct handgun archetypes without conflating a pistol's grip-fed
magazine with a rifle-style lower or a revolver's cylinder with a magazine.

**Status:** done.

### Pistols (first)

- Reworked the pistol as three mechanically distinct parts: an integral
  frame/grip with the existing material-thickness magazine-well construction,
  a hollow slide with an ejection-port opening and short sight rail, and a
  barrel inside the slide. The frame also carries the trigger-finger keep-out,
  trigger guard, dust cover, and slide rails. The magazine and optional sight
  complete the template.
- Frame, slide, and barrel close a fixed loop; proportions are coupled by
  inherited size classes rather than a solver. Compact uses a 12u barrel and
  11u slide; full uses a 16u barrel and 15u slide. In both, the barrel's
  exposed crown is exactly 1u (bounded by `pistol-barrel-crown` to 0.5–1.5u).
  Visual review found the slide/barrel ports aligned while their solids were
  2.24u apart: the slide's barrel port sat away from its hollow channel. Its
  port and the frame slide rails were repositioned so the barrel now sits in
  the channel and the frame rails touch the slide. The barrel has an optional
  unused muzzle port for a later suppressor or compensator part.
- A named 0.125u half-grid side clearance (less than half the S-bore radius)
  widens with the S/M bore radius. The slide wall is 0.5u thick, and the dust
  cover is no wider than the slide. The magazine well and grip widths are
  unchanged. The trigger guard doubles its X span (2u to 4u about the same
  center) and halves its Z width (2.5u to 1.25u).
- Both pistol and revolver frames now include a static, convex beavertail
  grip-safety tang. This is visual geometry only; activation/movement is not
  simulated. Core `connection-contact` prevents a valid port graph from hiding
  separated solids; its allowed gap is one 0.25u grid step.
- The grip is integral and behind the trigger, under the slide's rear third.
  The frame exposes a direct magazine port at the bottom of its grip well.
  Receiver `action: slide` and lower `layout: pistol` were removed. Sights
  attach to the slide's short rail, not a receiver rail.
- A passing fixture, a broken overlong-crown fixture, geometry/rule tests,
  fail-before evidence on the previous model, and three known-good snapshots
  cover the design. At 1000 seeds, pistol is 100% valid with 24 distinct
  builds: bore S/M × compact/full × grip S/M/L × sight absent/present.

### Revolvers (second)

- Initially represented the revolver cylinder as a generic receiver feed.
  That compatibility path has since been removed: the dedicated cylinder
  family remains below and parallel to the bore, and its selected chamber axis
  must be collinear with the bore; a misindexed-cylinder fixture exercises
  `axis-alignment`.
- Added a dedicated revolver frame with a cylinder window and top strap, built
  from several solids. Frame, cylinder and barrel form a checked loop. Keep-outs
  cover the cylinder gap, swing-out clearance and hammer travel. The frame's
  beavertail grip-safety tang is a static visual part of the backstrap.
- Added a no-well grip, revolver template, passing and broken fixtures, and
  three known-good snapshots. At 1000 seeds, revolver is 100% valid with 24
  distinct builds; pistol remains 100% valid with 24 distinct builds. Existing
  template rates are unchanged. Individual chamber holes and cylinder rotation
  are not modeled; chamber alignment is represented by the bore axis.
- Grip-reach ergonomics (§5) remains unbuilt, so handgun proportions are not
  checked against a hand. The 1u crown and coupled compact/full dimensions are
  fixed model choices, not firearm manufacturing tolerances.

## Milestone 2.3: AR and AK archetypes

**Goal:** distinguish common service-rifle layouts using the shared receiver,
lower and procedural geometry while keeping the current FAL/FNC-like design
explicitly named `battle-rifle`.

**Status:** AR and AK implemented.

### AR

- Added the AR template using the dedicated lower, straight stock, and
  seven-slot flat-top rail. Its magazine-well housing extends 1.5u below the
  receiver underside with four walls; its front wall derives its thickness
  from the well frame's front panel, so the lower extension does not step out
  beyond that panel. It reuses the conventional magazine port and insertion
  keep-out, leaving the magazine path unchanged. The fixed A2 post is at the
  existing gas-port station; the AR handguard layout reaches the rear of its
  collar. Free-float builds omit the barrel block and may carry a detachable
  post on the handguard's forward rail slot. AR gas is not otherwise modelled;
  the port is only the shared station datum. Front sights are explicitly
  allowed in the rear sight's sightline volume.
- The passing fixture and focused part tests cover geometry and placement.
  Fixed AR stem depth is half its former bore-scaled width; its fixed post and
  detachable rail post both measure 0.25u in Z. Fixed and AK sights preserve
  the y=5 axis; the detachable post rises to the rear rail sight axis. The
  remaining optional carry-handle style is not modeled.

### AK

- A dedicated AK receiver with no receiver rail. Its dust cover slopes down at
  the rear to the stock's face (`src/gun/parts.ts`, `AK_REAR_BEVEL`). The
  carrier cavity ends where the slope does, so the rear wall carries the whole
  slope, as on the pump; a cavity running under the slope would open a hole in
  it. Its right-side bolt handle uses the existing `action: bolt` travel
  keep-out. The leaf rear sight sits on the receiver's sight block, without a
  post.
- The gas cylinder runs from the receiver's gas-cylinder port, under the upper
  handguard, to the gas block. The gas block's octagonal collar seats on the
  barrel at the gas-port station, and its riser spans from the barrel to the
  cylinder. The gas piston rides on the cylinder's axis, and the cylinder's axis
  is checked parallel to the bore. The AK front sight uses its own style, its
  post just behind the barrel's end and behind the muzzle device.
- The muzzle device threads on the barrel's `muzzle` port: the AKM's slant
  brake or the AK-74's brake (`src/gun/parts.ts`, `akMuzzleDevice`; sizes in
  `AK_PROPORTIONS`, `muzzleDevice`). BR, 2026-10-06 22:51, verbatim: "since
  we're on it; i'd like also to allow for two different muzzles ; the AKM's
  iconic slanted muzzle as it is on the model currently, but also the
  compensator style seen on the ak 74 - then we have a good basis for making a
  good pool of different looking models". The slant brake keeps v2's shape;
  the AK-74 brake is measured on BR's reference screenshot (2026-10-06),
  scaled by v2's front sight ears.
  - Why a separate part, not a barrel option: both devices thread on the real
    gun's muzzle, as the anti-materiel brake does here. A new device is a new
    style without touching the barrel. The device carries the `muzzle` port on
    to its own front, so the muzzle anchor and the muzzle mount for later
    attachments sit where the shot leaves.
  - The template offers both devices; the archetype designs keep the slant
    brake, as v2 was mapped on an AKM.
- Sight alignment takes its vertical datum from the notch's upper edge, not the
  block seat, so the front-post tip sits at that edge in ADS (d97-6); see
  `src/gun/parts.ts`, `akRearSight`, and `src/gun/exportGlb.ts`, `sightMetadata`.
- The `ak` lower layout is the receiver's lower half: its frame runs the
  receiver's full length and width, down to the receiver's bottom, with a flat
  face seat and no magazine-well walls. The curved AK magazine has seat kind
  `face` and zero insertion depth; its conservative rock-in keep-out starts at
  the front hook point. This swept box is not an arc-aware motion simulation.
- The `ak-curved` magazine is a straight upper section with a slanted bottom,
  then a ring of convex arc sectors whose joint faces match exactly, with a
  finer tessellation for display. Each variant's straight top, top slope, arc
  radius and sweep are in `src/gun/parts.ts`, `CURVED_MAGAZINE_PROFILES`. The
  AKM's are fitted to the golden photo's magazine (g41-4). Its top slope stays
  small because the round column's same-side rounds close up across that
  corner. The AK-74's follow its traced reference.
- The stock is `ak-buttstock`, the AKM's wooden buttstock: a wedge with no
  wrist or grip. Its front is as tall as the receiver's rear face and centred on
  it, but narrower than the receiver. Behind the receiver, its top dips into a
  slim neck's saddle and rises to a level comb, which carries the cheek datum.
  Its bottom runs straight from the receiver's bottom to the toe, with no
  belly (BR 23:19). It widens slightly toward a steel buttplate
  (`src/gun/akButtstock.ts`). It builds on the wood
  helpers it shares with the tapered stock (`src/gun/stockWood.ts`), and it
  replaces the former ak-dropped style.
- A passing fixture and a missing-gas-cylinder fixture exercise the layout. At
  1000 seeds the AK template stays 100% valid (`npm run stats`). Individual
  rounds, magazine latching and the actual rock-in motion are not simulated.

#### Version 2: mapped from the golden photo (g41)

BR, 2026-10-06 21:13, verbatim: "As for the AK, let's do a quality pass / here's
a good image, we can call golden:
https://www.americanrifleman.org/media/caqhmu12/izhmash_akm_right.jpg?width=1920&height=620
/ have the coder do an overlay and try to map it out (let's call it version 2 of
the AK archetype) / actually - a luna coder can't handle this. This must be
issued to an Opus model agent".

The rulings v2 carries, verbatim:

- Receiver, BR 18:36: "the AK still had the rear sight on top of a post / this
  is not how it should be - compare a standard AKM's rear sight / i wanted the
  received as a whole lifted so that the bore in relation to the receiver goes
  down by a margin great enough for the rear sight to align with the front
  without being lifted on a pin".
- Gas cylinder, BR 20:27: "the spacing between barrel and gas cylinder must
  expand (and as such, the gas block will extend too)". On the amount, BR 20:39:
  "(b) but also fix the piston block to accomodate", where the lead's option (b)
  was "Raise it by the full receiver lift, 2u (23 mm)".
- Handguard, BR 20:27: "the handguard must adjust accordingly, among other
  things the prism acting as the bottom of the handguard must become as thin as
  the other walls of the handguard". BR 20:39: "well, the handguard bottom
  should not extend lower than the receiver's bottom".
- Stock, BR 20:34: "so what id like to do is to remove the ak-dropped buttstock
  altogether, and replace it with what we'd call ak-buttstock which should be
  modelled after the bog standard wooden buttstock as seen on the AKM". On
  sharing the tapered stock's helpers rather than copying them, BR 20:39:
  "agreed". After the first look at v2, BR 22:42: "ak v2 overall very nice /
  however, i'd like to try to adjust the following: / 1) the butt stock profile
  -> a bit more slender the first ~decimeter nearest the receiver / 2) the width
  of the buttstock should be less - i propose ~60% of current width". The neck's
  saddle is measured on the golden photo, like the rest of v2. The width is
  about 60% of the earlier receiver-wide stock, snapped so each full width
  stays on the grid (`AK_PROPORTIONS`, `stock`). On the next look, BR 23:19:
  "overall #330 looks really good - the only thing I'm feeling nitpicky about
  is the bottom of the buttstock Screenshot_2026-10-06_23-17-24.png / Our
  current model has a little extra dip (red line) whereas i think it should be
  more "straight" like the blue line)". The photo's stock is a wedge with a
  straight bottom, but the photo reads the receiver's rear bottom lower than
  the model's level receiver, so a bottom fitted to the photo had to bend up
  into the receiver. The bottom now runs straight from the receiver's bottom
  corner to the photo's toe, a little above the photo's wood near the receiver.

Why v2's proportions are what they are: every proportion in
`src/gun/akProportions.ts`, `AK_PROPORTIONS`, is measured part by part on an
overlay of the model on the golden photo and snapped to the grid. The photo is
registered by its barrel: the bore runs through the barrel's measured centres,
the scale comes from the AKM's published overall length (its published sight
radius checks it), and the model's origin is the receiver's front face on the
bore. So the receiver itself sits around the bore as on the AKM, and the rear
sight reaches the sight line on the receiver's sight block, without the
receiver lift or a post. Parts the photo doesn't show follow rules instead: the
dust cover's minimum wall sets the carrier's height, and the piston sits on the
gas cylinder's axis.
The photo and its overlays stay out of the repository; cite the URL above.

BR's answers to v2's two open questions, verbatim:

- Gas cylinder, BR 22:53: "yes, gas cylinder stays where it is - it's
  perfect". It stays at the photo's height rather than the 2u rise of the 20:39
  ruling: that rise answered the receiver lift, and once v2 removed the lift,
  the photo's height lines up.
- Magazine, BR 22:47: "as for the mag question: we should make it so both
  types of mags work with the v2 AK pattern rifle". Both the AK-74 and the AKM
  magazine seat in v2's magwell. `designs/archetype-ak.json` keeps the AK-74
  one, and `designs/archetype-ak-akm.json` shows the AKM one.

The properties BR ruled on are tested in `test/akGeometry.test.ts`,
`test/akStockAlignment.test.ts` and, for the magazines, `test/ak.test.ts`.

**Known risks and open questions:** the current `auto` charging-handle
keep-out sits on the left; the `bolt` handle keep-out is on the right. The
existing `rifle` name has been renamed to `battle-rifle`; there is no
compatibility alias.

Each new archetype requires a passing fixture, a broken fixture for every new
rule with readable failure text, and before/after generator stats. Review
generated builds in the viewer at generator-change time as recorded in
`docs/deferred-assertions.md`. Report milestone results with viewer links;
visual proportions await BR's judgment.

## Milestone 3: the designer

**Goal:** curate good-looking blocky guns by hand, and hand them to deadvox as
models. The generator becomes a variant suggester.

**Status:** planned (BR, 2026-09-28). Revised twice after independent reviews
by another model (gpt-6-astra via Pi); BR accepted the first revision. The
second pass split 3.0 into a type freeze and its implementation, fixed the
change and prefab policies, made anchors frames with precedence rules, and
scheduled vocabulary after 3.5.

BR's rulings:

- **Params only.** A design is edited by choosing part families, param values
  and optional parts, never by moving vertices. When a new archetypal shape
  comes up, it's added as vocabulary (a part family or param value) or as a
  prefab.
- **The generator stays, as a variant suggester.**
- **Export to deadvox.** deadvox reads a model as a `.glb` plus a `grip`
  (position and turn) and named `anchors`, in metres
  (`deadvox/src/core/schema.ts`, `ModelSchema`). Deadvox reads named anchors
  through `deadvox/src/core/heldPose.ts`, `heldAnchorOffset`, and the
  flashlight's lens through `deadvox/src/render/models.ts`, `prepareModel`.

Already in place: the parameter panel (param edits, optional parts, URL
overrides, connections dropped when a port disappears), fixtures (a hand-made
assembly is already a JSON file), the validator, and the bevelled mesh module
(`../engine/src/core/mesh.ts`, no three.js).

Current limits the plan works within:

- An assembly records values only. It has no format version, no locks and no
  prefab identity (`../engine/src/core/schema.ts#Assembly`). The panel infers "set by
  the user" by comparing against the seed (`src/viewer/paramPanel.ts#paramState`),
  so keeping a seed value on purpose looks the same as leaving it alone.
- Adding or removing optional parts needs a template
  (`src/viewer/paramPanel.ts#setSlotPresent`), and opening a file drops the template
  (`src/viewer/main.ts#fileInput`).
- A mounting port is not a hand position: the pistol's grip is built into its
  frame (`src/gun/parts.ts#pistolFrame`), and sporting stocks have no grip part.
- `npm run validate` exits 0 for an invalid file that has no `expect`
  (`src/cli/validate.ts#unexpected`), so it can't gate publishing a design.

### Scope

- **In:** template-backed designs. A design names the template it belongs to,
  and optional parts come from that template's slots. Swapping to a different
  family or rewiring connections outside a template is out of scope.
- **In:** per-part nodes and port metadata in the export, so runtime mods stay
  possible.
- **Deferred:** runtime mods in deadvox, attachment game properties
  (gungen.2), and any deadvox schema change for attachments. These come after
  the static export round trip works (3.5).
- **The goal (BR, 2026-10-01):** modular weapons, where the player chooses mods
  as they find or craft them (deadvox's EPIC, slice 3). So every part a player
  could swap (optics first, then suppressors and other muzzle devices,
  foregrips, tactical flashlights and lasers, magazines, stocks) is built as
  a self-contained part: its own catalog entry, footprint and clearances, a
  stable id that can become a deadvox item, and attachment only through a mount
  interface. Compatibility is data (the mounts a part needs, the mount points a
  gun offers). Every compatible swap resolves and validates, and removing the
  part leaves a valid gun. A template's probability mix only picks the
  defaults for a generated gun.

### Work packages

**3.0 Contracts**, in two steps:

- **3.0a Freeze:** types and this document only, no behaviour, so the export
  and suggester work could build against them.
- **3.0b Implement:** parsing, anchors for every archetype, and the palette
  migration. Done (see "3.0b (implemented)").

The shared engine stays free of firearm vocabulary so other consumers can reuse
its mechanisms without inheriting Gungen concepts. Gungen-specific persisted
fields and export identity belong to the Gungen adapters; see
`src/gun/designLoader.ts#loadGunDesignValue` and
`src/gun/glbWriter.ts#exportGunGeometry`. The rationale for this boundary is in
`../engine/README.md`, `Shared engine`.

- **Design file.** A versioned `format` field, plus:
  - `template`: the template the design belongs to;
  - `locks`: the params and optional parts the designer fixed, stored apart
    from the values. Keeping a seed value on purpose is a lock, even though
    the value is unchanged;
  - prefab references;
  - `status`: `draft` or `published`;
  - optional `origin`: the template, seed and overrides it started from.

  Loading is a runtime parse, not a type assertion. A malformed file fails to
  parse. Unknown format versions are refused. A file that is well formed but
  infeasible loads as a draft; `DesignLoadResult.declaredStatus` preserves the
  status it declared so the publish gate still rejects an invalid published
  design.

  **BR ruling (2026-09-28):** a design stores only chosen values: values set
  by the designer, picked by its template (including a seed pick the designer
  kept), or fixed by a prefab. Inherited params (`ParamSpec.from` and template
  `ParamReference`) and family defaults remain implicit and resolve on load;
  this preserves inheritance during editing and suggesting. A family's
  default or geometry change is guarded by each published design's snapshot
  test of resolved solids, forcing deliberate review. A design whose template
  no longer offers one of its chosen values loads as a draft with issues.
- **Prefab reference.** A part can carry `prefab: { id, version }`.
  - Choosing a prefab copies its params and records the reference.
  - Editing any param the prefab fixes detaches it: the reference is removed.
  - The suggester treats prefab-fixed params as locked.
  - The picker offers only prefabs of the part's family.
  - Loading refuses an unknown prefab id or version. If the stored values
    don't match the prefab's, the design loads as a draft with the mismatch
    listed.
  - Templates don't generate prefabs in this milestone.
- **Hold anchors.** Part families declare named anchors in gun-domain data,
  not in core. Each anchor is a local position, forward direction and up
  direction, later transformed to gungen assembly coordinates so export can
  derive deadvox's `grip.turn`.
  - `hold` (the firing hand) is required; `support` and `muzzle` are optional.
  - Precedence: a separate or integrated grip's `hold` wins over a stock that
    carries `FIRING_GRIP` (`src/gun/parts.ts#FIRING_GRIP`). The stock's own `hold`
    applies only when there is no grip. Equal-rank `hold` anchors are
    ambiguous, and the design cannot be published. `SelectGunAnchors` applies
    this policy before the core exporter receives `SelectedAnchors`.
- **Appearance.** The viewer and exporter share `../engine/src/core/appearance.ts`'s
  domain-agnostic resolver. Callers pass a variant explicitly; assembly display
  names are never parsed as archetypes. Precedence is solid material, part
  material, instance appearance, design finish, variant finish, then role
  material. An instance's own appearance replaces the host's design and variant
  finishes for that part; see `../engine/src/core/glb.ts`, `exportGlb`. Missing palette
  material ids remain absent from metadata rather than being fabricated. Legacy
  family/special/fallback colours still support generic domains.
- **Export metadata** (frozen here for the 3.4 export), per port: stable id
  `<part>.<port>`, mount, gender, optional size, and the full assembly-space
  mating frame (position, normal, up). Rails carry one count/pitch record for
  the whole port and export one node per rail, not per slot. The core exporter
  accepts resolved assembly-space frames only after gun anchor selection. It
  returns an error variant rather than exporting a `Resolved` with structure
  issues or unplaced parts.

Proof: parse and round-trip tests, including a malformed file and every
refused version. Tests for the change policy: a default change, a template
change, and a prefab mismatch. A test that every archetype resolves exactly
one `hold`, including the integrated pistol, a stock-wrist rifle and a grip
plus a `FIRING_GRIP` stock, plus a test that an ambiguous `hold` is refused.
The viewer's rendering is unchanged after the palette moves.

#### 3.0a contracts (frozen)

"Frozen" here, and elsewhere in this file, meant fixed so parallel work could
build against it; it isn't a compatibility promise. Pre-pre-alpha, these
contracts change whenever that makes the code simpler (AGENTS.md, "Project stage").

Types only; 3.0b supplies parsing and values. The contracts live in
`../engine/src/core/design.ts` (`Design`/`DesignFormat`/`DesignStatus`, `DesignOrigin`,
`DesignLocks`, `DesignIssue`, `DesignLoadError`/`DesignLoadResult`,
`AnchorFrame`, `PartAnchorDeclaration`/`PartAnchorDeclarations`/
`ResolveAnchors`, `ResolvedAnchors`/`SelectedAnchors`/`AnchorSelectionError`,
`Palette`, `PartPortId`/`ExportPortMetadata`, `DeadvoxModelFile`/
`DeadvoxModelEntry`/`GlbAssetIdentity`, `GlbExportInput`/`GlbExportResult`/
`GlbExportError`/`ExportGlb`, and `EffectiveSuggestionLocks`/
`SuggestionResult`/`Suggest`). `PartInstance.prefab` uses the core
`PrefabReference` in `../engine/src/core/schema.ts`; the gun catalogue types are
`PrefabCatalogueEntry` and `PrefabCatalogue` in `src/gun/prefabs.ts`. Gun
anchor names and policy are in `src/gun/anchors.ts`, not core. The type test
is `test/m3Contracts.test.ts`; its import-boundary guard uses `es-module-lexer`
to follow relative imports/re-exports transitively, catching direct side-effect
and template-literal imports as well as paths through intermediary modules.
Unresolved dynamic-import globs fail closed.

Decisions where the plan left representation open:

- `format` is numeric literal `1`. Prefab versions are positive integer
  numbers; the loader checks them because the type cannot. Unknown format or
  prefab id/version is a fatal load error. BR's ruling (2026-09-28) is to store
  only chosen values; inherited and default params stay absent and resolve on
  load. Snapshot tests of resolved solids protect defaults and geometry.
- `locks.params` maps part ids to locked parameter names;
  `locks.optionalParts` lists locked template slot ids, with current presence
  kept in the assembly. `origin.overrides` uses the viewer's existing
  `params`/`presence` shape, but has no viewer dependency.
- Non-fatal feasibility, stale-template-choice, or prefab-value issues return
  a non-empty issue list and a draft, even if the file said `published`;
  `declaredStatus` preserves the original status for CI publishing gates.
  Fatal load results also carry the readable declared status, or `undefined`
  when malformed input has none. Invalid syntax/shape is a load error. Clean
  loads have no issues.
- Anchor declarations return family-local frames; core transforms them to
  gungen assembly coordinates in abstract units. `AnchorFrame` and port
  mating frames stay in that space. Gun ranks group an integrated/separate
  grip as `grip`, ahead of `firing-grip-stock`; equal-rank `hold` candidates
  are ambiguous. `SelectGunAnchors` applies this gun policy and returns a
  `SelectedAnchors` (required `hold`, other selected names) or an
  `AnchorSelectionError` for a missing or ambiguous hold. The core exporter
  accepts only that selection; it never chooses gun anchors. `hold`,
  `support`, `muzzle`, `ejection`, and `magwell` are gun-only names.
- Palette RGB channels are normalized sRGB triples; legacy `specialColors` is
  keyed by solid id and wins over `familyColors`, then `fallbackColor` handles
  an unknown family (`#888888` for the current viewer). Export converts sRGB to
  linear space. Types cannot bound finite color channels to `[0,1]`; palette
  construction and export validate them. Solids may declare optional `material`
  and `slot` overrides; design format 1 may declare an optional `finish` map,
  shape-checked generically and material/slot-checked by the gun loader. Export
  and viewer callers pass the design template explicitly. Port metadata ids are
  `<part>.<port>`; frames are in gungen assembly coordinates and units, and a
  rail carries one count/pitch record. `PartPortId` cannot exclude empty
  components or embedded dots, so export validates both ids. The exporter
  receives model id/file explicitly and checks the file name against
  deadvox's `assets/models/<name>.glb` pattern. Its output converts positions
  to metres and deadvox axes (`+x` forward, `+y` up) before emitting `grip.at`
  and optional anchor positions. `grip.turn` is always emitted; deadvox
  `hold` and `roll` are intentionally omitted.
- **Firearm action/ejection export (Deadvox ADR 0006).** All
  additions to `DeadvoxModelEntry` are optional. `anchors.ejection` is a plain
  `[x, y, z]` point in metres in model coordinates (`+x` forward, `+y` up,
  `+z` right). `action.ejectDirection` is a unit `[x, y, z]` vector in the same frame.
  `action.parts` maps roles such as `carrier` and `handle` to `{ node, axis, strokeMetres, modes }`:
  `node` is the exact GLB node name `<part id>:<registry key>`, `axis` is a
  unit travel vector in model coordinates, and `strokeMetres` is the travel
  length in metres. Required `modes` is a nonempty, distinct list of `fire`/`hand`
  timing references: a node follows the corresponding shared timeline, and
  stays home in modes not listed. The AR carrier follows both; its separate
  T-handle follows only `hand`. The AK's handle remains geometry on the carrier
  node and follows both. `action.fire` and `action.hand` each contain
  `durationSeconds`, `rearwardSeconds`, `dwellSeconds`, and `forwardSeconds`,
  all in seconds. `action.ejectAt` is a stroke fraction; `action.holdOpen` is a
  boolean; `action.rpm` is rounds per minute. `action.ejectAt` and
  `action.ejectDirection` are adjacent action fields; there is no top-level
  `ejectDirection`. The rates are sourced where
  available; cycle timing, spring behaviour, forces, and masses are estimates
  for visual tuning, not physical simulation. These fields are emitted only
  when the design declares a supported AK/AR/pump action. The pump has **only**
  `hand`, with both carrier and forend following it; `fire` and `rpm` are absent.
  Its forward leg is hand-driven, not a spring return. Part modes must reference
  declared timelines. No angles are present in
  this contract; any angle added later uses degrees, never radians.
  Node names are exact glTF names, not Three.js `Object3D.name` (which sanitizes
  colons). Match the name in `parser.json.nodes`, then find its loaded object
  using `parser.associations`' node index.
  Gun-owned `resolveGunAction` owns discovery, world travel, coupled roles and
  cycle/ejection data for viewer and exporter, including the pump's manual
  carrier/forend cycle. Its static open-pose pairing remains presentation-only;
  cycle controls hide in that pose, and validation/export geometry stays at rest.
  No pump firing timeline is invented.
  The AR handle is a separate `ar-charging-handle` family. Its thin shaft and
  finger grips are authored on a 0.05u grid; an enclosed upper channel preserves
  the 0.5u roof skin and clears its continuous 6.5u stroke.
- `Suggest` takes `effectiveLocks`, precomputed by the caller from design
  locks plus only the fixed parameter names of referenced prefabs; core does
  not import or need a gun catalogue, and unrelated prefab params remain
  unlocked. It returns draft variants, retains the original `origin` as
  lineage, and preserves locks/prefab references for surviving parts. If it
  removes an unlocked optional part, it removes that part's param locks and
  prefab reference too. Distinctness compares part ids/families/chosen params
  and canonical sorted connections (including slot/roll), excluding name,
  origin, locks and prefab metadata. `exhausted` is true when budget ends
  before `n` variants are found. These signatures are contracts only; this
  package adds no parser, anchor values, palette migration, suggester, or
  exporter implementation.

#### Firearm/ammunition export extension (Deadvox ADR 0006)

The firearm metadata extends the 3.0a `DeadvoxModelEntry`. New metadata fields
are optional in the schema; byte-identical output is not a compatibility
requirement. Structural anchors remain reference points; replaceable geometry
uses item-owned slots so Deadvox can hide a baked node when no item is fitted.
Generated AK magazines remain tied to cartridge identity because receiver
compatibility with both patterns does not imply ammunition interchangeability.
The Gungen design adapter enforces that distinction; see
`src/gun/designLoader.ts#loadGunDesignValue` and `src/gun/templates.ts`, `ak`.

- `calibre?: string` is the exact cartridge-data id (not a display designation;
  e.g. `7.62x39`). Deadvox validates it with the dedicated `CalibreId` syntax,
  rather than its general content `Id` (which deliberately excludes dots).
- `anchors.loading_port?: Point` is the integral tube's single-shell entry,
  in metres at the real underside aperture. Optional `tube?: { capacity: number }`
  describes a gun's integral magazine, excluding the chamber; it requires calibre
  and loading_port, and has no detached-box `capacity`/`rounds` column.
  `src/gun/tubeCapacity.ts#tubeMagazineCapacity` derives fit from actual tube/cap
  geometry and loaded shell length with explicit visual reserve estimates.
  Curated hunting pump, reproducible command and estimates:
  `docs/pump-action-export.md`. Its hand-only viewer is
  `?design=archetype-pump-shotgun&cycle=hand&cycleSpeed=0.1`.
- Replaceable box magazines use `slots.magazine` to identify the baked GLB node
  and its replacement pose. This keeps the magazine's identity with the fitted
  geometry that Deadvox hides or replaces.
- G35 action data adds `anchors.ejection?: Point` (the case exit, in metres) and
  `action.ejectAt?: number` (a dimensionless stroke fraction) plus
  `action.ejectDirection?: [x, y, z]` (a unit vector in model coordinates).
  `ejectDirection` belongs inside `action`, adjacent to `ejectAt`; no top-level
  `ejectDirection` is exported.
- Magazine entries add `capacity?: number` (positive whole rounds) and
  `rounds?: { at: Point; tilt: number }[]`, ordered from the top round down.
  `at` is each round centre in metres in magazine-model coordinates; `tilt` is
  degrees about +z, nose-up positive. Left/right stagger is the sign of `at[2]`.
  Geometry determines the fit, capped to the nominal count for labelled
  5/10-round, STANAG straight M (20), STANAG curved L (30), and AK-curved L (30)
  profiles; other magazine profiles report the dimension-derived fit.
- Round and case cartridge entries carry the same `calibre` and use real-size
  millimetre source dimensions converted to metres for their GLBs. `5.56x45.json`
  cites NATO AOP-4172; where its reference drawing is ambiguous, C.I.P. .223 Rem
  dimensions are explicitly marked as visual-profile proxy estimates, not a
  chamber-interchangeability claim. Bullet length remains unsourced; only the
  rendered generic bullet uses the named seating-depth assumption in
  `src/ammo/roundProfile.ts`. Cartridge GLBs carry `case`, `bullet`, and `primer`
  finish slots, defaulting to brass, copper, and brass; an appearance override
  such as `{ finish: { case: 'steel' } }` selects the steel-case variant.
  Their model ids/files use the injective separator-escaped slug function in
  `src/ammo/calibreSlug.ts` (e.g. `round_7_d_62x39`,
  `round-7_d_62x39.glb`); a test checks every registered id and all accepted
  separator forms. Gungen's internal revolve profiles remain in millimetres.
- Shotshells use that same cartridge export contract and writer. Shared
  `src/gun/shotshellGeometry.ts#shotshellGeometry` supplies loaded and opened
  hull solids to exporter and viewer; known fold/roll closures select their
  presentation. The current source's unknown closure stays null and uses the
  authorised generic roll-crimp visual proxy at the 62.23 mm conservative
  envelope. No primer diameter is invented. Wall/lip/card/material choices and
  Deadvox's 40 g loaded / 5 g fired gameplay mass estimates are explicitly
  labelled in `docs/shotshell-export.md`; none is written back as sourced data.
  `npm run export:cartridges -- <cartridge.json> <model-dir> [entry-dir]` handles
  both kinds; `?ammo=12-gauge-00-buck` shows shell and hull with a proxy label.
- A curated magazine prefab exports detached, with the round column fitted to
  its cartridge (`src/cli/exportMagazine.ts`, `src/gun/magazineExport.ts`,
  `exportMagazineGlb`). Deadvox's magazine items (d114) take their calibre and
  capacity from that model entry, so the geometry that fits the rounds also
  sets how many load: `npm run export:magazine -- <cartridge.json> <prefab-id>
  <model-id> <finish-variant> <model-dir> [entry-dir]`.

#### 3.0b (implemented)

Merged into `gungen/m3-contracts` (2026-09-29). Every 3.0a signature now has
an implementation except the ones that belong to later packages (`Suggest`,
`ExportGlb`).

**Parsing and loading.**

- `../engine/src/core/parseAssembly.ts`: `parseAssembly(value)`, `parseAssemblyJson(text)`
  and `parseAssemblyOrThrow(text, source)` (for fixtures and tests) return
  `{ ok: true, assembly }` or `{ ok: false, error: { path, message } }`;
  `formatParseError` renders `path: message`. Every field is checked and the
  result is rebuilt from the checked fields, so unknown keys are dropped and a
  `__proto__` part id stays an own property. It has no error codes, only a
  path and a message. The helpers `parseRecord`, `parseStringArray` and
  `parsePrefabReference` are exported for the loader. The CLI, the viewer and
  the fixture tests read files through it.
- The engine loader has no firearm data dependency. Gungen applies persisted
  firearm-field checks through `src/gun/designLoader.ts#loadGunDesignValue`,
  reusing the assembly resolution already performed by the engine.
- Fatal errors (`ok: false`, with `declaredStatus` when the file had a readable
  one): `invalid-json`, `invalid-shape` (with a `path`; a missing `format` is
  this code), `unsupported-format` (anything but `1`) and `unknown-prefab`
  (a prefab id or version the catalogue lacks; the first such part is
  reported).
- Draft policy: any issue makes the loaded `design.status` `draft`, whatever
  the file said, and `declaredStatus` keeps the declared one so the publish
  gate can still reject an invalid published design. Issue codes are
  `template-choice` (a different template or root, a part or family the
  template lacks, a chosen value it no longer offers, a param that no longer
  matches its `fromSlot` reference), `prefab-values-mismatch` (wrong family, or
  a fixed param that differs or is unset) and `infeasible` (structure or rule
  failures, with the rule id in the message). A param the template doesn't
  list is a designer choice, not a stale one. A clean load has no issues and
  keeps its declared status. Nothing is materialised on load.
- Unplaced parts: the loader runs domain rules on the placed portions even
  when the assembly has structure issues or unplaced parts; BR ruled these
  non-blocking lint warnings belong alongside the structure issues. Rules must
  tolerate partial placement (the gun rules guard their placement reads), and
  `validate` turns a crashing rule into a `Rule crashed: …` issue. `resolve`
  reports a part not connected to the root as a `structure` issue, unless an
  unfilled required port of that part already explains it. The loader adds
  its own `[structure] … not connected to the root` issue only for parts
  `resolve` didn't name. Editing and saving drafts remain enabled; publishing
  an invalid design saves it as a draft with a notice, and `npm run check:designs`
  remains the hard CI gate for invalid published designs.
- `validate` turns a rule that throws into one `Rule crashed: …` issue for
  that rule, so one bad rule can't take down the viewer or the live linter.
  Tests that call `rule.check` directly still see the throw.
- Prefab lookup uses the registry key (`PartInstance.family`), not
  `PartDef.family`.
- Fault values: `ParamSpec.fault` lists values that exist only for the
  `broken-*` fixtures (handguard `fit`, cylinder `chamber`, lower and frame
  `triggerGuard`). The param panel never offers them as choices. **BR ruling
  (2026-09-29):** a design or prefab may carry a fault value for now; the
  loader and the prefab checks accept them.

**Anchors.**

- `../engine/src/core/anchors.ts`: `resolveAnchors(resolved, declarations)` runs each
  placed part's declaration with its resolved param values and transforms the
  frames to assembly space. Declarations are keyed by `PartInstance.family`.
  Unplaced parts, parts with no built definition and parts with no declaration
  are omitted. Core knows no anchor names.
- `src/gun/anchors.ts`: `selectGunAnchors(resolved, declarations, policy)` with
  `GUN_ANCHOR_POLICY`. For `hold` it takes the candidates of the best rank
  (`grip`, then `firing-grip-stock`); two candidates of one rank return
  `ambiguous-anchor` with the candidate part ids, and no candidate returns
  `missing-required-anchor`. For `muzzle` the frontmost candidate along its
  own forward wins: a muzzle device threaded on a barrel carries the muzzle on
  to its front, and a gun fires from the front of whatever is on its barrel
  (g43). For `support` there may be several candidates; the one on the lowest
  part id (plain string sort) wins, so the choice is deterministic. A name is
  left out when there is no candidate.
- Anchor data is in `src/gun/anchorData.ts` (`GUN_ANCHORS`), not in `parts.ts`.
  `hold` is declared by `grip`, `frame` (the integrated pistol grip) and
  `stock` (only when the stock carries `FIRING_GRIP`); `support` by
  `handguard` and `forend` (underside of the `bottom` solid); `muzzle` by each
  barrel and muzzle device, at its `muzzle` port (`muzzlePortAnchor`). Frames
  are computed from the built part, so they follow params.

**Palette.** Firearm colour tables, material identities and finish mappings live
in `src/gun/palette.ts`; shared colour conversion and role-only lookup live in
`../engine/src/core/appearance.ts`. The viewer and exporter use the same
appearance policy, while each domain supplies its own palette.

**Decided (BR, 2026-09-30): materials + slots + role shade + finishes.** The palette is keyed by material ids with sRGB base colours; roles map to `metal`, `furniture`, or `accent` and apply bounded shade multipliers. Explicit solid material/slot wins, then part-owned material/slot, design finish, variant finish, and role default. Archetype finishes cover every slot; design or part may override. Finish maps survive load, editor save/reopen, viewer rendering, and shipped export. Magazine follows furniture because it is a polymer/wood exterior component. The revolver uses stainless metal with walnut grips; battle rifles use parkerized metal with walnut furniture. Magazines default to the metal slot; the AK's darkened blued-steel magazine reads black, while AR magazines resolve to anodized aluminium. Pump shotguns have no box magazine; their tube magazine is metal. The GLB carries material and slot metadata and shares materials by resolved colour. Role-only colours remain a viewer geometry-check mode. See `test/materialFinishes.test.ts`.

Deferred: generator finish variation; patterned finishes (UVs/textures); per-instance tint (deadvox); splitting slots (e.g. upper/lower metal); material opacity (an optional opacity field with opaque default remains unimplemented).
- AK-74-style magazines match the furniture (e.g. plum or brown polymer). Later as a magazine variant or attachment bringing its own material, not a slot change (BR, 2026-10-01).
- Polymer magazines, including semi-transparent/smoked ones (HK G28 and many modern rifles). Needs material opacity (glTF `alphaMode: BLEND`, a base-colour alpha), and ideally modelled rounds inside so transparency shows the ammo count. Arrives with magazine variants and attachments (BR, 2026-10-01).

**Naming decision (BR, 2026-09-29).** A part has two names:

- the registry key, the key in `FAMILIES` (e.g. `ak-receiver`, `frame`). It
  names the builder recipe and is what `PartInstance.family` holds;
- the role, `PartDef.family` (e.g. `receiver`), which says what the part does.

Rules and port compatibility use the role. Anchors, prefabs and params use the
registry key, because they depend on the recipe. Since the 2026-09-30 material
ruling, the role selects the default slot and shade; the archetype finish picks
the material, so an AK and AR receiver may differ. `PartFamily.name` is only
used for labels. `familyColors` remains the role-only geometry-check palette.

**Palette colours (BR accepted, 2026-09-29):** `frame` #4b4a45, `slide`
#868d97, `cylinder` #4a5566, `front-sight` #363d47, `gas-block` #2f3238,
`gas-cylinder` #545a63. A test requires a colour for every role any family
build can report and fails if any solid of any archetype or template sweep
would use the fallback grey.

**Hold frames and the export.** Hold frames follow the grip's own lean: the
`grip` and `frame` frames use the grip's local axes, so once the part is placed
the frame is tilted with the grip. The 3.4 export doesn't pass that tilt to
deadvox: `grip.turn` carries only the model file's orientation, and the tilted
frame stays in the anchor data for hand posing. See "Grip orientation" under
3.4, and `src/gun/exportFrame.ts`, `gripTurn`.

**Proof tests.**

- parse and round trip: `test/parseAssembly.test.ts` (every fixture round
  trips, malformed JSON, `__proto__`) and `test/designLoader.test.ts` (round
  trip, malformed file, unsupported format, unknown prefab);
- change policy: `test/designLoader.test.ts` (default change, template change,
  prefab mismatch, `declaredStatus` on a published-but-invalid file);
- anchors: `test/anchors.test.ts` (core resolution with no domain names; every
  archetype fixture and every template resolves exactly one `hold`; integrated
  pistol grip; stock wrist without a grip; grip beats a `FIRING_GRIP` stock;
  ambiguous and missing `hold` refused; `support` and `muzzle` selection);
- palette: `test/palette.test.ts` (unchanged colours, role coverage, no
  fallback in any sweep, construction checks, special colour precedence).

The type test and import-boundary guard remain in `test/m3Contracts.test.ts`.
`test/projectDoc.test.ts` fails if a `src/...ts#symbol` citation in this file
names a symbol that isn't in that file.

**3.1 Designs and prefabs.**

**3.1 (done, 2026-09-29):** the archetype designs are in `designs/`, load through
`loadGunDesign`, pass `npm run check:designs`, and have per-design resolved-solid
snapshots. The catalogue contains `stanag-20`, `stanag-30`, `ak74-30`, and
`akm-30`; the AR and AK designs reference `stanag-20` and `ak74-30` respectively.
The viewer opens a design with `?design=<name>`, saves template-backed builds as
versioned design JSON downloads, opens those files again, and provides param and
optional-part locks plus family-filtered prefab pickers. Editing a prefab-fixed
param detaches its reference; loaded mismatches remain marked stale.

The `stanag-20` prefab selects the straight profile at M length. Resolving a
non-M straight profile reports a structure issue that points to #414 for the
deferred capacities. The shared upper preserves feed and magwell fit, and
`stanag-30` uses the curved profile. See `src/gun/prefabs.ts`, `GUN_PREFABS`,
`src/gun/parts.ts`, `magazine`, and `../engine/src/core/resolve.ts`, `resolveParams`.

- Designs are files in `gungen/designs/`. Fixtures stay test cases; designs
  are the curated product.
- `look-*.json` designs are untracked previews for BR looks; corpus tests and
  published-design checks skip them.
- Prefabs are named, curated parts in `src/gun/prefabs.ts`: a family plus
  fixed params. Examples: the STANAG 20 and 30 and the two AK magazines.
  A catalogue test checks every prefab against the domain (family exists,
  every param value is legal, it builds).
- The viewer's design controls save/open design JSON downloads with a user-chosen
  draft/published status. A build without a matching template explains why it
  cannot be saved as a design. Each param and optional-part choice has a lock
  toggle, and each part's prefab picker is restricted to its registry family.

**3.2 The validator as a live linter (done).** Rule failures are non-blocking
warnings shown on the cards of named parts as you edit; part-less warnings go
in the design info panel. Editing and saving drafts work with issues. If a user
requests publishing while issues remain, the viewer saves as draft and explains
why. `npm run check:designs` remains the hard gate: it fails on any invalid
published design and runs in CI.

**3.3 Variant suggester.** `suggest(design, template, domain, effectiveLocks,
seed, n, budget)`, a pure core function. The caller resolves prefab
references and passes design locks merged with only prefab-fixed parameter
names, keeping the core independent of gun catalogue data:

- re-rolls only unlocked params and unlocked optional parts, within the
  template's choices. Prefab-fixed params count as locked;
- returns up to `n` distinct valid **draft** variants that differ from the
  design. `origin` remains the original provenance. "Distinct" compares part
  ids/families/chosen params and canonical sorted connections including slot
  and roll; it ignores names, origin, locks and prefab metadata. Accepting a
  suggestion preserves locks and prefab references on surviving parts. When
  an unlocked optional part is removed, its parameter-lock entry and prefab
  reference are removed with it;
- stops after `budget` attempts and reports whether it ran out;
- respects inherited params and conditional connections.

The viewer strip that shows them comes after 3.1.

**3.4 glTF export.** A pure `src/core` writer for `.glb`, with no three.js,
built on `mesh.ts`:

- the same solids the viewer draws (`displaySolids ?? solids`,
  `../engine/src/viewer/scene.ts#displaySolids`) and the shared palette, with colours converted
  to linear space;
- one node per part, named by part id and family, with the port metadata
  frozen in 3.0a as empty child nodes plus glTF `extras`;
- units in metres (1u ≈ 11.5 mm);
- deadvox's `grip.at` and `grip.turn` from the `hold` frame, and `anchors`
  for `muzzle` and `support` when present;
- all inputs explicit: the resolved assembly, the anchors and the palette;
- a CLI that writes the `.glb` and the matching deadvox model entry.

The mapping between gungen's axes and deadvox's is derived and tested:
deadvox holds a model with +x forward and +y up
(`deadvox/src/core/schema.ts`, `ModelSchema`, its `grip` field).

**3.4 (implemented).**

- API. `../engine/src/core/glb.ts#exportGlb` owns neutral geometry writing.
  `src/gun/exportGlb.ts#exportGunGlb` supplies firearm anchors and palette, while
  `src/gun/glbWriter.ts#exportGunGeometry` keeps the Gungen asset identity and
  `extras.gungen` namespace outside the shared package. Units and axes are in
  `src/gun/exportFrame.ts`.
- CLI: `npm run export:glb -- designs/archetype-ar.json --out <dir> [--entry-out
  <dir>] [--id <model_id>]` writes `<id>.glb` and `<id>.model.json` (the deadvox
  entry); `--entry-out` defaults to `--out`. It takes a design (has `format`) or
  a fixture, and defaults the id to the file name with dashes as underscores.
- Scene layout: a root node named by the asset id, one node per part named
  `<part id>:<registry key>` (placed by its resolved transform, with `extras`
  `part`, `family`, `role`, `solids`), one mesh per part with one primitive per
  drawn solid (`displaySolids ?? solids`; primitive `extras.solid` is the solid
  id), and one empty child node per port named `<part>.<port>` whose `extras.port`
  is the frozen `ExportPortMetadata`. A rail is one port node with a `rail`
  count/pitch record. Port frames in `extras` are assembly space in u, as
  frozen; the node's own transform is part-local, in metres. The root's
  `extras.gungen` records the unit and `metresPerUnit`.
- Materials: the writer and viewer share appearance resolution, so exported
  materials follow the same domain palette and finish choices as the display.
- Units: `METRES_PER_UNIT = 0.0115` (1u = 11.5 mm) is the gun domain's chosen
  calibration; its 5.5u magazine top is 63.25 mm. The Brownells listing's stated
  2.54 in (64.5 mm) STANAG-20 body depth corroborates that scale within one grid
  step; the 127 × 66 × 25 mm delivery dimensions are package data. The writer
  scales by the resolved domain's `units.metresPerUnit`. Vertices are `mesh.ts` positions times that;
  normals are unscaled. `conventions.ts` describes `u` as "roughly a centimetre";
  the export uses 11.5 mm.
- Axes. gungen is right-handed, +X forward, +Y up, +Z right; glTF is
  right-handed Y-up; deadvox's held model is +x forward, +y up. So the file
  keeps gungen's axes (`FILE_FROM_GUNGEN`, identity) and `grip.at` and the
  anchors are the assembly positions times `METRES_PER_UNIT`, with no swap.
- **Grip orientation (BR ruling, 2026-09-29).** `grip.turn` does not include
  the grip's rake. The hold frame's orientation (which leans with the grip) is
  not used for `turn`. `turn` is only the fixed rotation from the file's axes to
  deadvox's held axes, from `src/gun/exportFrame.ts#gripTurn`: the Euler XYZ
  angles (degrees, deadvox's order) of the transpose of `FILE_FROM_GUNGEN`.
  Because the file already has +x forward and +y up, every export gets
  `[0, 0, 0]`. deadvox's existing firearms use `[-90, 0, 0]` only because
  their files are authored Z-up; `gripTurn` gives exactly that for a Z-up
  mapping (tested). `grip.at` is the selected `hold` position. The tilted hold
  frame stays in gungen's anchor data for future hand posing. To reverse the
  ruling, derive the turn from `SelectedAnchors.hold` inside `gripTurn` and
  nowhere else. `SelectedAnchors.hold`'s forward and up are not read by the
  export.
- `anchors` in the model entry are every name in `SelectedAnchors.others`
  (`muzzle`, `support`), positions rounded to a micrometre. `hold` and `roll`
  are omitted, as frozen.
- Errors are checked in this order: structure issues, unplaced parts, part or
  port ids that are empty or contain a dot (reported as `<part>.<port>`), palette
  colours (key `family <role>`, `special <solid>` or `fallback`), then the asset
  file (`assets/models/[a-z0-9_-]+.glb`).
- Validation: Khronos `gltf-validator` is a dev dependency.
  `test/glbValidate.test.ts` validates the export of every design in
  `designs/` with zero errors and zero warnings; it is part of `npm test`, and
  the CI workflow also runs it as its own step.
- Tests: `test/exportGlb.test.ts` (units and axes, node names and counts,
  transforms, port extras, rails, mesh bounds and scale, normals, colours,
  `grip.at`, `grip.turn` and its independence from rake, error variants),
  `test/glbValidate.test.ts`, `test/exportCli.test.ts`.

**3.5 End to end in deadvox (implemented; awaiting BR visual review, 2026-09-29).**
`rifle_assault` now uses the curated `archetype-ar` export; `rifle_assault` spawns
with G under `?debug=1`, or `?debug=1&loadout=ar` holds it, for inspection in hands
and piles. The model
entry keeps the original id and asset path, with export-derived grip and anchors;
`grip.turn` is `[0, 0, 0]` per BR's +x-forward/+y-up ruling. Reproduce the checked-in
GLB and sidecar from the `gungen/` directory with:

```sh
npm run export:glb -- designs/archetype-ar.json --out ../deadvox/src/content/base/assets/models --entry-out "$XDG_RUNTIME_DIR/gungen-rifle-assault-entry" --id rifle_assault
```

The generated sidecar's `grip` and `anchors` are recorded in
`deadvox/src/content/base/models-firearms.json`. The pre-g23 export measured
79.35 cm long × 21.46 cm high vs 69.74 cm × 25.30 cm for the replaced asset;
grip-to-muzzle distance was 57.91 cm vs 37.03 cm, and mesh size was 1,980 vs
4,353 triangles and 173,360 vs 234,384 bytes. G23 regenerates the same curated
design with the redesigned front sight; the current GLB is 201,400 bytes, and
its sidecar retains the grip and muzzle anchors while updating the support
anchor. The pre-g23 length was 4.65 cm below the provided real AR-15 range of
84–99 cm. The muzzle anchor equals the model's forward x bound.
`deadvox/test/models.test.ts` verifies zero turn, muzzle at the forward end, and
forward/upright orientation after the held transform.

**Sight data for 3.7 optics.** BR, 2026-10-07 00:18: “2. the pump shotgun doesn't seem to work with ads (maybe it's missing iron sights? for the shotgun a simple pip at the muzzle would suffice) - when activaing ADS it simply pivots a little”

BR, 2026-10-07 11:13, verbatim: “the shotgun bead is approved” (#345, after g42-5 seated it on its host).

Every published firearm design exports sight metadata from its resolved sight
parts, so ADS has a physical reference and a later optic can replace irons through
the same `src/gun/exportGlb.ts`, `sightCandidate` path. The pump's `front-bead`
part sits on the barrel's front bead port. For g42-5, the bead solid begins at
its connection plane so the barrel port is a true contact datum; any offset
above that plane leaves a visible floating gap. `test/optics.test.ts` checks
contact for every authored design with a bead. `src/gun/exportGlb.ts`,
`frontBeadSightLine` derives the eye point from the
receiver top and bead top, so the sight line reaches from above the receiver to
the bead instead of placing the eye beside the muzzle or aiming down the bore.
The revolver's frame carries the axis for its built-in rear notch; its barrel
supplies the front post. `test/glbValidate.test.ts`
checks sight metadata on each published design export, and
`test/exportGlb.test.ts` checks the pump eye line and sight-line clearance across
valid exports.

A Blender-authored firearm gets a gungen export, with sights, when it becomes a
playable item, and that swap is a BR look.

**3.6 Vocabulary** (the re-scoped queue). Trigger guards are complete:
`test/triggerGuard.test.ts` checks every lower layout, each fixture and published
design, and the broken guard fixture; all archetype templates include the
trigger guard through their lower layout. `test/fixtures.test.ts` also ensures
there is a broken fixture for every gun rule. The thumbhole stock and AWM-type
design are complete (gungen.6). The remaining items are scheduled after 3.5,
not part of the export's acceptance:

- trigger guards on every archetype (gungen.3, done; evidence above);
- octagonal-only barrels (gungen.7, implemented): every barrel profile
  (standard, heavy, pistol, and revolver) is a regular X-axis octagon at the
  former square section's flat-to-flat width; there is no cross-section param
  or octagonal-barrel prefab. Pump tube and cap lug are regular octagonal; the
  support band is an eight-sided prism clipped to its existing rectangular
  bounds. All keep their existing bounds, ports, and contacts.
  The AK gas cylinder is a regular octagon sized to its former 0.5u vertical
  extent, centered on its existing axis; this narrows its width from 1u to
  0.5u. The 45° corner setback is 0.14645u (vertex offset 0.10355u). The
  bracket, handguard, receiver, and gas-block contacts remain valid. No separate
  true-round barrel option is planned.
- a thumbhole stock family plus an AWM-type design (gungen.6, done): a real
  side-profile opening is built from connected convex extrusions; its grip post
  moves forward under the receiver while the buttplate remains 22u from the
  mount on L (16u M, 10u S). The grip post reaches the AR grip's measured
  world bottom y=-12.5475u (8.5475u below the lower), and the butt drops by the
  same 3.3075u; every size is now 11.0475u high. The 4u-long hole and bottom
  bar stay at their previous heights. It retains the stock mount and
  `FIRING_GRIP` hold anchor. The grip post meets the matching lower directly;
  its rear face at x=-16u touches the stock's upper bar across the full
  rear-face height and width. Tests measure both contacts in world space. The
  grip-post-to-trigger-guard gap stays within 0.25u on AWM and the bolt-rifle
  override. A rule rejects a thumbhole stock with a non-thumbhole lower or
  separate grip. `designs/archetype-awm.json` uses the long heavy-barrel
  profile, detachable box magazine, and optic rail;
- trapezoidal side profiles for stocks and pistol grips (BR, 2026-09-28;
  split into gungen.7 stock and deferred grip). The stock family now offers a
  `tapered` style, and the pump-shotgun opts in with M/L lengths; the other
  existing stock styles stay unchanged. The 870 follow-up uses authored curved
  side profiles partitioned into convex extruded-polygon cells, with clipped side
  planes for width taper; no new solid kind is needed:
  - **stock — done** (BR's side-view reference photo of an 870-style wood
    stock, which set this profile): a narrow wrist at the receiver that widens to a
    tall butt; the comb line drops toward the butt while the belly line runs
    down to the toe;
  - **pistol grip — deferred** (BR's side-view reference photo of an AR-style
    pistol grip, which sets this profile): raked, with slanted front and back
    faces rather than a constant-width slab.
  Keep port positions, `hold` anchors, magazine-well clearance, the stock's
  `FIRING_GRIP` role, and every existing rule passing. The follow-up narrows the
  wrist in width as well as height, using those existing clipping planes;
- visible action details (BR, 2026-09-28; three basics done): receivers with
  ejection keep-outs have a real opening; side/rear-top charging handles and
  bolt handles touch the rest face of their travel volumes. The domain's
  `action-handle-rest` rule checks each built-in handle against its own travel
  because the core keep-out rule excludes its owner; `broken-action-handle`
  proves the bad placement is rejected without changing that core exemption.
  `test/actionDetails.test.ts` pins the rest faces and the ejection aperture.
  BR's hollow-shell follow-up (2026-09-30) gives auto/bolt/pump receivers and
  the AK receiver 0.5u (5.75mm) top, bottom, side, and end walls, matching the
  pistol-slide wall thickness. The ejection aperture is only in the near wall
  and its bounds are the bolt-carrier face bounds plus 0.25u on every side; the
  port and ejection keep-out derive from one clearance definition. Pump receiver
  ports follow the lowered carrier face. The far wall closes the cavity, with
  the carrier face above the magazine path. For the pump shotgun, Federal PFC154 00
  is the representative shell; SAAMI's longer rolled-closed length (62.23 mm =
  5.411u at 11.5 mm/u) sizes a 5.5u (63.25 mm) grid-rounded action stroke. The
  port minimum is loaded length plus 0.25u end clearance at both ends (5.911u);
  the carrier-derived aperture is 6.75u wide. BR required receiver elongation,
  not a rear closure patch (2026-10-02). The receiver grows 3.5u forward, moving
  the carrier rest anchor to -3u and its port, barrel, tube and forend together.
  At full stroke the carrier rear is -11.5u, 0.5u ahead of the full-height
  section's -12u rear boundary. The rear transition retains its 4u run and
  1.5u rise; the axial cavity stops ahead of it so the receiver's own rear wall
  closes it without a wedge. The flat rail also starts at -12u, and the stock
  contact stays at [-16, -1, 0]. The 870 restyle (g31c-2) narrows the pump
  section from 4u to 3u and rounds its own roof with three facets. Its port
  uses the section builder's optional 0.5u faceted corners within the existing
  ejection envelope. Sectioned shells mount the tube on their actual front
  wall, without the old hanging box-shell bridge. The lower is a 0.5u trigger
  plate with a 4u-wide, 2u-high faceted loop and a visible trigger. Shared
  `tapered` / `tapered-sawed` stock profiles merge their wood surfaces; the
  full stock is about 1.7 receiver lengths. Its cubic top saddle is 0.5u deep;
  the circular throat has radius 5.55u and a 71.08° sweep, followed by tangent
  cubic rounding into the grip knob and an underside rise into the straight belly.
  The comb drops 6° toward the heel; the shoulder face pitches 4.5°, heel aft of toe.
  Hand geometry stays absolute across S/M/L; butt heights are 10/10.5/11u. Curved
  width transitions and a 1.75u-wide wrist avoid a slab-like neck. Finish merges the
  convex cells; diagnostic colours retain authored component roles. The viewer uses
  Three.js's native 30° crease threshold on this wood to avoid drawing cell facets
  as black seams; metal retains its usual edge threshold. The original 5u–7u
  wrist-front-to-trigger clearance stays 5.5u; the authored palm datum is inside the
  grip, above the index-finger centre, and also within 7u of it. Source and estimated proportions:
  `src/gun/shotgunProportions.ts`; physical/silhouette proof:
  `test/pumpReference.test.ts`, `test/stockErgonomics.test.ts`, and
  `test/receiverSection.test.ts`. AR/AK stock and lower geometry, and the
  approved pump barrel and tube, are unchanged. The forend grows to a photo-derived
  19u maximum length and 2.4u outer radius, capped by available tube length and the
  fixed cap. Barrel grooves and swept support-band pockets provide real clearance;
  an exact axial swept-volume test covers the whole 5.5u stroke against every fixed
  barrel/tube solid. The template uses 100% tubes on short barrels and 75/100% on
  longer barrels to leave room for hand-sized furniture. The pump roof cannot
  go below 1.35u above bore (0.85u cavity roof plus 0.5u minimum skin); it
  stays on the 1.5u grid station, only 0.25u above the L-bore barrel. The 62.23 mm
  figure is a conservative standard envelope, not a claim about Federal's
  unspecified crimp. See `cartridges/12-gauge-00-buck.json` and
  `test/boltCarrier.test.ts`. Revolver receivers have no ejection keep-out and
  remain solid; the pistol frame/slide are separate parts.
  Candidates beyond these three, for BR to choose from: the AR forward assist,
  magazine and bolt releases, and the safety selector;
- **Deferred (BR, 2026-09-30):** revolute `PartMotion` for lifting the bolt handle
  and folding the FAL handle. Both stay deployed and move linearly, or are fixed
  to the receiver.
- **Deferred (BR, 2026-09-30):** if automatic shotguns are added, reuse the AK-like
  stick/paddle charging-handle style. Pump shotguns remain handle-free.
- per-solid opt-out of bevels and outlines (BR, 2026-09-28; deferred). Some
  shapes are one surface built from many solids, like the curved STANAG and
  AK magazines' runs of ring sectors. Bevelling and outlining each segment
  breaks the curve up; they look best plain and without outlines. Proposed:
  display hints on a solid (no bevel, no outline), set by the part family,
  which the viewer (`../engine/src/viewer/scene.ts`, bevel and `EdgesGeometry`) and the
  3.4 export both honour. Collision and the rules ignore the hints. By
  default a solid is bevelled and outlined. The mesh module already accepts a
  zero bevel (`../engine/src/core/mesh.ts#meshForSolid`). The export draws no outlines, so for
  the export "no outline" needs nothing. Generic rendering hints can live in
  the core schema, as `displaySolids` already does. Display hints are assigned
  by the generated part family; they are runtime `Solid` metadata, not fields in
  assembly/design JSON. `loadDesign` rebuilds parts from family parameters and
  neither requires nor retains these hints. The viewer honours no-bevel and
  no-outline; glTF export honours no-bevel (it draws no outlines). Collision
  and rule checks ignore the metadata. This changes the
  `Solid` type in `../engine/src/core/schema.ts`;
- g44: Attachment exports preserve the host pose when a default mod is removed and give Deadvox enough data to reject another item on an already-covered rail notch. `src/gun/attachments.ts`, `attachmentSlots` describes base-firearm interfaces and `attachmentMetadata` derives each item's footprint, including every half-pitch notch cell its solid enters; `src/gun/exportGlb.ts`, `attachmentData` links the fitted node to its host slot. `src/gun/attachmentExport.ts`, `exportAttachmentGlb` preserves authored mount frames in standalone item exports while making their ports optional. Gungen omits female ports on attachment nodes from firearm slots because those parts are not intended as hosts. The magazine replacement slot stays separate from presentation anchors so Deadvox can hide the baked magazine when no magazine is fitted (d114-11, #337); see `deadvox/docs/decisions/0006-firearm-handling.md`.
  Gungen's attachment mass is a geometry/material estimate, not a product specification; d118-3 uses the exported model fact when reconciling inventory weight and attachment handling. BR tunes the cited density and fill assumptions before mass figures become fixed; see `src/gun/attachmentMass.ts`, `attachmentMassKg`, and `docs/deferred-assertions.md`.
  BR, 2026-10-07 11:27, verbatim: “#347 let's stick to 7.62x39 for now” and “but we will add 5.45x39 at some point”; generated AKs stay 7.62x39-only, and 5.45x39 is follow-up #362.
- **Bullpup archetype — suspended (BR, 2026-10-01):** part-family geometry remains,
  but the template is excluded from active `TEMPLATES` via `SUSPENDED_TEMPLATE_NAMES`,
  and its curated design and fixtures live byte-identically under `designs/suspended/`
  and `fixtures/suspended/`. Its launcher options, corpus entries, generated snapshots,
  and archetype-specific fixture test are out of the active pipeline. To restore it,
  remove `bullpup` from that one set, move the three JSON files back to their scanned
  directories, restore launcher/corpus references, and regenerate the scoped snapshots.
  The default finish, palette, and `exportFile` variant entries remain as harmless dormant
  data; the family code stays available for restoration.

### Proof per package

Tests shown failing first, as usual. BR judges every visual result.

- **3.0:** as listed under 3.0.
- **3.1:** every published file in `designs/` parses and validates; save then
  reopen gives the same design, including locks (one of them on an unchanged
  seed value) and prefab references; detaching a prefab on edit; adding and
  removing optional parts still works after reopening; a family the
  template doesn't allow is refused.
- **3.2 (done):** a broken draft still receives domain-rule warnings on its
  placed parts; the view model maps them to those cards (and routes part-less
  issues to design info); an invalid draft can be saved; and the publish check
  fails on an invalid published design while accepting an invalid draft.
- **3.3:**
  - deterministic per seed;
  - never changes a locked param or optional part;
  - each suggestion validates and is distinct;
  - a known reachable case (a design with open choices that have valid
    alternatives) returns a nonempty result;
  - accepting a suggestion keeps the locks and prefab references;
  - a fully locked design and one with only duplicates report "exhausted"
    within the budget.
- **3.4:**
  - the output passes Khronos `gltf-validator`, which is required in CI;
  - bounds, normals and scale after conversion match `mesh.ts` and the
    viewer;
  - colours match the palette;
  - the anchors match the resolved anchors;
  - the model goes through deadvox's own model preparation
    (`deadvox/src/render/models.ts`), not only `GLTFLoader`.
- **3.5:** the exported model shows in first-person hands with the hand at
  `hold` and the muzzle forward, and it looks right in piles.

### Generator tests

BR decided on 2026-09-29 that gungen goes the designer route: the
generator and suggester are a nice-to-have, so the generator "solver" tests
(random seed sweeps across templates) run only in CI and never in a local
`npm test`. Measured before the gate, they were about 34 s of a 34 s run.

- **The gate.** `test/sweeps.ts` exports `sweepGroup` (`describe.runIf`),
  which runs only when `CI` is set (GitHub Actions sets it) or
  `GUNGEN_SWEEPS=1`. A sweep is `sweepGroup(name, () => { it(...) })`; an
  aliased `it.runIf` would trip Biome's `noMisplacedAssertion`. `npm run test:sweeps` runs the whole suite that
  way. `.github/workflows/gungen.yml` runs `npm test` with `CI` set, so CI
  runs them.
- **Split before raising timeouts.** A sweep that is too slow is split into
  smaller tests (per template, per seed range) rather than given a longer
  timeout. A sweep that cannot be split gets a timeout proportional to its
  work (see "Testing"), never a flat generous one. The current generator
  validation chunks are 25 seeds. A 2026-10-01 measurement found them
  unreliable under load: `generate.test.ts` chunks took 5-8 s at load 6-10 on
  6 cores, and 17 timed out at the 5 s default, so the earlier "under 1 s
  locally" claim is unverified. Some sweeps will be removed, so their cost is
  not worth accommodating.
- **What is gated.** Any test that calls `generate` or `generateValid` over a
  seed range. Tests over `fixtures/`, hand-built assemblies and single fixed
  seeds used as a fixture stay local. A test that mixed both is split: the
  fixture half is local, the sweep half is gated (palette, frame checks in
  `anchors.test.ts`).
- **Not gated yet.** The "validator results are unchanged by the mesh
  module" block in `mesh.test.ts` stays as it is; it is deleted with PR #72.

Removal plan, one line per gated sweep:

- (a) **Replaced** by the same property over `fixtures/` plus the published
  `designs/`; the seed loops and their CI gate are deleted. Each new test is
  local (not gated) and iterates `loadCorpus()` in `test/helpers.ts`: every
  fixture except the `broken-*` ones (they exist to break a rule; the
  palette tests use every fixture, since none breaks the relevant property)
  plus every design:
  - handguard within receiver (`handguard.test.ts`, "keeps the handguard
    within its receiver in every fixture and design");
  - trigger guards (`triggerGuard.test.ts`, "guards the trigger volume in
    every fixture and design");
  - anchors (`anchors.test.ts`, "every fixture and design resolves exactly
    one hold without a selection error", which also replaces the `sweep`
    "never errors on a valid generated design" tests);
  - palette no-fallback and old-colour identity (`palette.test.ts`, "never
    needs the fallback for any solid of any fixture or design" and
    "reproduces the old FAMILY_COLORS lookup bit-identically across every
    fixture and design");
  - frame checks (`anchors.test.ts`, "fixture and design frames are
    unit-length and right-handed; hold frames sit within their part").
- (b) Merge: the two 300-seed loops per template in `generate.test.ts`
  ("never produces a structurally broken file" and "is valid at least half
  the time") go over the same seeds and become one loop.
- (c) Keep as a small CI smoke test for the 3.3 suggester, a few seeds per
  template: "varies with the seed", the AK curve-variant, AK handguard layout, battle
  rifle magazine orientation and free-float mount choices (`ak.test.ts`,
  `battleRifle.test.ts`, `freeFloatHandguard.test.ts`). They check that the
  generator still spans its choices, which is what the suggester reuses.

Published designs (3.1) remain the property-test corpus. Their geometry is
not snapshotted; review the viewer gallery at generator-change time as recorded
in `docs/deferred-assertions.md`.

## Testing

When `gungen/test/attachments.test.ts` exercises the registry from `deadvox/src/core/content.ts`, its import graph reaches `deadvox/src/core/amalgamFigure.ts`, `amalgamFigure`, and Mobgen figure code. Keep the Mobgen mapping in `gungen/tsconfig.json` (`paths`) and `gungen/vite.config.ts` (`resolve.alias`), and run Gungen's typecheck and test runner when either imported source tree changes; otherwise the broad Pages build can be the first job to expose a broken integration.

- **Say what a test protects.** Each test, or the comment above a group, states
  the behaviour it guards. Two tests that catch the same bugs are one too many,
  and a sweep earns its size only if its extra cases exercise different
  behaviour.
- **Exhaustive sweeps go behind `GUNGEN_SWEEPS`.** Use `sweepGroup` from
  `test/sweeps.ts`; the default `npm test` keeps a representative sample and CI
  runs everything. Build no cases for a skipped group (`runSweeps ? cases : []`),
  because a skipped group still registers every case.
- **Prefer a covering array to a full product in the default run.**
  `test/coveringArray.ts` generates a fixed-seed t-wise array from a family's
  `params`. `test/parts.test.ts` lists the array-sampled families in one place,
  `ARRAY_SAMPLED_KEYS`; every family not listed gets the full product. Add an
  explicit case for an interaction the array is known to miss.
- **Browser tests.** Viewer browser tests launch managed Chromium through
  `test/chromium.mjs`, `launchChromium`, and the Playwright install shared with
  Deadvox; see `deadvox/TROUBLESHOOTING.md` for the shared launch-boundary rationale.
- **Removals need a reason.** The commit says what the removed tests protected
  and which remaining test or sample still protects it, ideally with a mutation
  or coverage result as evidence.
- **Timeouts.** A test that takes about 1 s or more and still has the 5 s
  default gets its own timeout, about 5x its measured time, with a comment
  saying why. A sweep is split into smaller tests where it can be; one that
  cannot gets a timeout proportional to its case count. Default runs build only
  sampled variants and cull solids outside a part's swept bounds before collision
  checks, so no default case races its timeout; see `test/unplacedParts.test.ts`,
  `defineRuleChecks`, and `src/gun/cycle.ts`, `sweepMovingPart`.

## Running it

```sh
cd gungen
npm install
npm test               # unit tests plus every fixture (no generator sweeps)
npm run test:sweeps    # the generator seed sweeps too; CI runs them
npm run typecheck
npm run validate       # validate all fixtures from the command line
npm run validate -- path/to/assembly.json
npm run generate -- --template battle-rifle --seed 42  # assembly + appearance context
npm run generate -- --template battle-rifle --seed 42 --valid # skip to the next valid seed
npm run stats          # generator metrics over 1000 seeds per template
npm run dev            # the viewer; ?fixture=<name> or ?template=<name>&seed=<n>
```

The same viewer is live at <https://roobie.github.io/skelly/gungen/>, and the
query parameters work there too, e.g.
<https://roobie.github.io/skelly/gungen/?template=battle-rifle&seed=7>.

## Open questions

- The solver: hand-rolled iterative constraint solving, or a CSP/SAT library?
  Deferred until generation needs one.
- Keep-out shapes: are boxes enough, or do we need capsules or swept shapes?
