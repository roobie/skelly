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
Tracked in roobie/skelly#109: data first, then geometry, viewer and export. The
data format is described in `cartridges/README.md`.

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
| Assemblies | JSON files: part instances plus connections (§7) |
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
  and keeps us within the Level 2 boundary.

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
- A gallery of known-good seeds, plus snapshot tests of their assembly graphs.

### 10. Making it reusable beyond guns

Keep the port, constraint, keep-out and graph machinery free of gun-specific
logic, and put everything gun-specific in data. The same core should later
drive other skelly domains, such as rigging, where a joint is just a port that
can rotate.

## Milestone 1: validator and debug viewer

**Goal:** take a hand-written assembly file, place its parts, check it against
the rules, and show the result in a viewer. When a build fails, the output says
which rule broke and where. No generator yet: the validator comes first, so
the generator later has something independent to be tested against (§9).

**Status:** done.

### What was built

- **Conventions** (`src/core/conventions.ts`): +X forward (toward the muzzle),
  +Y up, +Z right; right-handed. The bore line is the X axis through the
  origin, and the root part sits at the origin. Lengths are in u, an abstract
  unit that sets proportions only, on a 0.25u grid. Size classes are S/M/L;
  each part family maps them to u in its own tables.
- **Schemas** (`src/core/schema.ts`): ports, keep-out volumes (boxes, optionally
  refined by convex extruded-polygon profiles), box and convex extruded-polygon
  solids, parts, part families, domains, and the JSON assembly format.
- **Placement** (`src/core/resolve.ts`): walks connections out from the root.
  A connection whose two parts are both already placed closes a loop and is
  checked, not solved. Connections support rail slots and 90° roll.
- **Rules** (`src/core/rules.ts`), each with an id and a readable message:

  | Rule id | Checks |
  | --- | --- |
  | `port-compat` | Mount types match, genders are opposite, sizes match, and no port or slot is used twice |
  | `axis-alignment` | Bore axes lie on the bore line; sight axes are parallel to it |
  | `solid-overlap` | Solids don't overlap. Direct connections use a mount-specific allowance (0.75u fallback) |
  | `connection-contact` | Solids on connected parts touch or are within 0.25u (one grid step) |
  | `keep-out` | No solid is inside another part's keep-out volume, except parts attached at an allowed port or from an explicitly allowed family |
  | `required-ports` | Every required port has something attached |
  | `loop-closure` | Connections that close a loop actually meet |

  The contact rule checks minimum Euclidean separation between the connected
  parts' convex solids; overlap remains solely governed by `solid-overlap`.
  A separated pair is covered in `test/fixtures/broken-connection-contact.json`.
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

The generator and grammar (§6), the human rig (§5; the trigger-finger volume
stands in for now), final meshes and merging (§7), the metrics in §9, and
more archetypes.

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
    bolt handle sweep on the right), `pump` (forend-driven) or `revolver`
    (cylinder frame). Each adds its own keep-out volumes. Pistols use their own
    frame and slide families, not receiver actions.
  - `feed`: `box` (magazine through the lower), `top` (loading port above the
    action), `tube` (tube magazine port underneath), or `cylinder` (revolver;
    added in Milestone 2.2).

  The grip and magazine hang from a **lower** under it, whose `layout` param
  sets where they go:
  - `conventional`: magazine ahead of the grip.
  - `bullpup`: grip ahead of the magazine, with the butt built in.
  - `trigger`: trigger with an optional grip anchor; used by tube-fed, top-fed
    and revolver designs.
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
| `archetype-ak` | AK-pattern rifle | AK block front sight with open ears, 2.5u behind the muzzle |
| `archetype-battle-rifle` | FAL/FNC-like battle rifle, conventional layout | auto/box receiver, conventional lower, pistol grip, straight stock, clamped handguard |
| `archetype-smg` | Submachine gun | Same layout as the battle rifle at small bore, with a short barrel and stock and a long magazine |
| `archetype-bolt-rifle` | Bolt-action rifle, loaded from the top | bolt/top receiver, sporting stock, full-length handguard, sight on the handguard ahead of the loading port |
| `archetype-bolt-rifle-box` | Bolt-action rifle, detachable box magazine | bolt/box receiver, pistol grip, sporting stock, sight over the action |
| `archetype-pump-shotgun` | Pump-action shotgun | pump/tube receiver at large bore, tube magazine plus forend, trigger-only lower, sporting stock |
| `archetype-pistol` | Semi-automatic pistol | integrated frame/grip, hollow slide, internal barrel with 1u crown, grip magazine |
| `archetype-revolver` | Revolver | cylinder feed, top-strapped frame, barrel/cylinder loop and separate grip |

Scale anchor: the STANAG top depth of `5.5u` is about 63mm, so `1u ≈ 11.5mm`.
The lengths below remain abstract units on the existing grid.

- Grip S/M/L lengths are `7.5/8.5/9.5u` along the grip axis, including the
  integrated pistol-frame grip.
- Magazine S/M/L body lengths by profile are: standard, SMG, and pistol
  `6/10/16u`; AK-74 curved `6/10/16.5u`; AKM curved `6/10/19.25u`; STANAG
  curved `6/10/15.75u`. The curved L values follow the traced reference
  lengths: AK-74/AKM ratios and STANAG 30-round, with STANAG 20-round anchoring
  M near `10u`. Ordinary S begins at the plausible 10-round length (`6u`).
- The detachable-box bolt rifle alone has compact `5-round`/`10-round` lengths
  `4.5u/5.5u`, seated in a recessed well. Their floorplates protrude `0.25u`
  and `1.25u` below the well/stock line respectively. The top-loaded bolt rifle
  is not a box-magazine user; other archetypes do not offer this exception.
- Every barrel profile uses a regular octagonal X-axis extrusion at the
  former square's flat-to-flat width; bounds and ports are unchanged. Pump tubes
  and cap lugs are regular octagonal; the support band is an eight-sided prism
  clipped to its existing rectangular bounds. The AK gas cylinder is a regular
  octagon with 0.5u flat-to-flat width, matching its former 0.5u height; its
  lateral extent narrows from 1u to 0.5u to fit. Its corner setback is 0.14645u
  at 45° (vertex offset 0.10355u from the centreline). The gas block is now an
  octagonal barrel collar with a bore-scaled riser: its fore face rakes back as
  it rises, and its rear vertical face mates the cylinder's full front end face.
- Standard and free-float AR handguards occupy 65% of exposed barrel length;
  the fixed AR handguard ends at the rear face of the A2 collar. AK handguards
  use compact S/M/L bands and their gas block clears the handguard by about 10%
  of its length. The AR front sight is at the standard gas-port station; its
  muzzle distances are 6.25/9.25/12u for S/M/L. The AK post is 2.5u behind the
  muzzle. Tilted magazine seating is declared per lower layout: conventional
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

| Family/profile | S (u / mm) | M (u / mm) | L (u / mm) | Measurement basis |
| --- | ---: | ---: | ---: | --- |
| Grip | 7.5 / 86 | 8.5 / 98 | 9.5 / 109 | Hand-sized bands, along grip axis; pistol-integrated grip uses the same bands |
| Standard, SMG, pistol magazine | 6 / 69 | 10 / 115 | 16 / 184 | Abstract length bands; STANAG top depth anchors 1u ≈ 11.5mm |
| AK-74 curved magazine | 6 / 69 | 10 / 115 | 16.5 / 190 | Pixel-traced body centreline ratio, `br-ref-ak74-mag.jpg` |
| AKM curved magazine | 6 / 69 | 10 / 115 | 19.25 / 221 | Pixel-traced body centreline ratio, `br-ref-akm-mag.jpg` |
| STANAG curved magazine | 6 / 69 | 10 / 115 | 15.75 / 181 | 30-round trace; 20-round reference anchors M, `br-ref-stanag-20-30.png` |
| Standard and free-float AR handguard | 17 / 196 | 23.5 / 270 | 30 / 345 | 65% of S/M/L exposed barrel lengths (26/36/46u), snapped to the grid |
| Fixed AR handguard | 18.75 / 216 | 25.75 / 296 | 33 / 380 | Rear face meets the A2 collar at the existing gas-port station |
| AK handguard | 8 / 92 | 14 / 161 | 22 / 253 | Compact bands; gas block clears its end by 10%, snapped to the grid |

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
| `broken-bolt-sight-over-loading-port` | `keep-out` | On a top-loaded action, a sight over the receiver blocks the loading port |
| `broken-pump-tube-mismatch` | `loop-closure` | The tube magazine's cap misses the barrel lug |

### Known gaps

- **Feed type and lower aren't cross-checked.** A box-fed receiver on a
  trigger-only lower has no magazine, and nothing flags it. A tube-fed
  receiver on a conventional lower is only caught because the lower happens
  to hit the loading port. *(Fixed in 1.2.)*
- **The SMG differs from the battle rifle only in proportions and bore.** Nothing
  models what makes an SMG distinct, such as a simpler action.
- **The forend can overrun the shortest tube.** With an S barrel and 50% tube,
  the tube ends at x=13 while the fixed forend reaches x=17.6. This is currently
  allowed; decide later whether forend length should scale with tube coverage.
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

- **Templates** (`src/core/template.ts` for the schema, `src/gun/templates.ts`
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
- **Generator** (`src/core/generate.ts`): `generate(template, domain, seed)`
  is deterministic. It uses a seeded RNG (`src/core/random.ts`, mulberry32),
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
  - Snapshots of three known-good builds per template
    (`test/__snapshots__/`). A snapshot change means generation changed: look
    at the new builds in the viewer before updating with `vitest -u`.

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

- Added cylinder feed and a six- or eight-sided extruded cylinder prism below
  and parallel to the bore. Its selected chamber axis must be collinear with
  the bore; a misindexed-cylinder fixture exercises `axis-alignment`.
  `feed-match` accepts cylinder feed without a magazine well and rejects
  mismatched revolver-action/feed combinations.
- Added a revolver receiver/frame with a cylinder window and top strap, built
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

- Added a dedicated AK receiver with a removable dust-cover solid and no
  receiver rail. Its rear-top corner is cut 2u forward and 1.5u down (a 36.9°
  slope toward the stock), removing 30% of the receiver's 5u height at the rear
  while retaining the stock port on the rear face and the flat dust-cover seat.
  Its right-side bolt handle uses the existing `action: bolt` travel keep-out.
  A leaf rear sight mounts on a receiver sight-block port.
- The gas cylinder runs from the receiver's gas-cylinder port under the rear
  handguard to the gas block. The octagonal collar seats on the barrel at the
  declared gas-port station; its asymmetric riser meets the gas cylinder's
  top flat and mates the full front end face at its vertical rear face. Its fore
  face is slanted back. The
  cylinder axis is checked parallel to the bore. The AK front sight uses its
  own style with the post 2.5u behind the muzzle, consistent with the gas-block
  position.
- Added an `ak` lower layout with a flat face seat and no magazine-well walls.
  The curved AK magazine has seat kind `face` and zero insertion depth; its
  conservative rock-in keep-out starts at the front hook point. This swept box
  is not an arc-aware motion simulation.
- The `ak-curved` magazine is three convex prisms: a slanted-bottom upper
  section, a trapezoidal middle section and a forward-turned lower section.
  Their joint faces match exactly. The middle prism has parallel grip-facing
  and barrel-facing sides of different lengths; its top interface is slanted
  5° and its size-derived lower bend is 10°/12°/15°. The lower prism meets its
  angled end face without arbitrary X-axis compensation. Added an intermediate dropped-stock style.
- A passing fixture and a missing-gas-cylinder fixture exercise the layout. At
  1000 seeds, AK is 100% valid with 32 distinct builds. Individual rounds,
  magazine latching and the actual rock-in motion are not simulated.

**Known risks and open questions:** the current `auto` charging-handle
keep-out sits on the left; the `bolt` handle keep-out is on the right. The
existing `rifle` name has been renamed to `battle-rifle`; there is no
compatibility alias.

Each new archetype requires a passing fixture, a broken fixture for every new
rule with readable failure text, snapshots of three known-good seeds, and
before/after generator stats. Review generated builds in the viewer before
updating snapshots. Report milestone results with viewer links; visual
proportions await BR's judgment.

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
  (`deadvox/src/core/schema.ts:197-212`). Its renderer uses only the grip and
  the flashlight's `lens` anchor today (`deadvox/src/render/models.ts:50-52`).
  The `muzzle` anchors in `models-firearms.json` are accepted but unused.

Already in place: the parameter panel (param edits, optional parts, URL
overrides, connections dropped when a port disappears), fixtures (a hand-made
assembly is already a JSON file), the validator, and the bevelled mesh module
(`src/core/mesh.ts`, no three.js).

Current limits the plan works within:

- An assembly records values only. It has no format version, no locks and no
  prefab identity (`src/core/schema.ts#Assembly`). The panel infers "set by
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

**3.0 Contracts**, in two steps, both owned by lane A:

- **3.0a Freeze:** types and this document only, no behaviour. It releases
  lanes B and C.
- **3.0b Implement:** parsing, anchors for every archetype, and the palette
  migration. Done (2026-09-29, see "3.0b (implemented)"). B and C didn't
  wait for it.

Core stays free of gun data: every core function takes what it needs as
explicit inputs, and the gun domain supplies them. The core `Domain` has no
template registry (`src/core/schema.ts#Domain`), so functions that need a
template take the resolved `Template`, and the export takes the anchors and
palette as arguments.

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
- **Appearance.** The viewer and exporter share `src/core/appearance.ts`'s
  domain-agnostic resolver. Callers pass a variant explicitly; assembly display
  names are never parsed as archetypes. Precedence is solid material, part
  material, design finish, variant finish, then role material. Missing palette
  material ids remain absent from metadata rather than being fabricated. Legacy
  family/special/fallback colours still support generic domains.
- **Export metadata** (frozen here for lane B), per port: stable id
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

Types only; 3.0b supplies parsing and values. The contracts live in
`src/core/design.ts` (`Design`/`DesignFormat`/`DesignStatus`, `DesignOrigin`,
`DesignLocks`, `DesignIssue`, `DesignLoadError`/`DesignLoadResult`,
`AnchorFrame`, `PartAnchorDeclaration`/`PartAnchorDeclarations`/
`ResolveAnchors`, `ResolvedAnchors`/`SelectedAnchors`/`AnchorSelectionError`,
`Palette`, `PartPortId`/`ExportPortMetadata`, `DeadvoxModelFile`/
`DeadvoxModelEntry`/`GlbAssetIdentity`, `GlbExportInput`/`GlbExportResult`/
`GlbExportError`/`ExportGlb`, and `EffectiveSuggestionLocks`/
`SuggestionResult`/`Suggest`). `PartInstance.prefab` uses the core
`PrefabReference` in `src/core/schema.ts`; the gun catalogue types are
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
  `support`, and `muzzle` are gun-only names.
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

#### 3.0b (implemented)

Merged into `gungen/m3-contracts` (2026-09-29). Every 3.0a signature now has
an implementation except the ones that belong to later packages (`Suggest`,
`ExportGlb`).

**Parsing and loading.**

- `src/core/parseAssembly.ts`: `parseAssembly(value)`, `parseAssemblyJson(text)`
  and `parseAssemblyOrThrow(text, source)` (for fixtures and tests) return
  `{ ok: true, assembly }` or `{ ok: false, error: { path, message } }`;
  `formatParseError` renders `path: message`. Every field is checked and the
  result is rebuilt from the checked fields, so unknown keys are dropped and a
  `__proto__` part id stays an own property. It has no error codes, only a
  path and a message. The helpers `parseRecord`, `parseStringArray` and
  `parsePrefabReference` are exported for the loader. The CLI, the viewer and
  the fixture tests read files through it.
- `src/core/designLoader.ts`: `loadDesign(text, inputs)` and
  `loadDesignValue(value, inputs)` return the frozen `DesignLoadResult`.
  `inputs` is `{ domain, template, prefabs }`, all explicit, so core imports no
  gun data; `DesignPrefabEntry` is the shape a `PrefabCatalogueEntry` fits.
  Neither function throws on bad input.
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

- `src/core/anchors.ts`: `resolveAnchors(resolved, declarations)` runs each
  placed part's declaration with its resolved param values and transforms the
  frames to assembly space. Declarations are keyed by `PartInstance.family`.
  Unplaced parts, parts with no built definition and parts with no declaration
  are omitted. Core knows no anchor names.
- `src/gun/anchors.ts`: `selectGunAnchors(resolved, declarations, policy)` with
  `GUN_ANCHOR_POLICY`. For `hold` it takes the candidates of the best rank
  (`grip`, then `firing-grip-stock`); two candidates of one rank return
  `ambiguous-anchor` with the candidate part ids, and no candidate returns
  `missing-required-anchor`. For `support` and `muzzle` there may be several
  candidates; the one on the lowest part id (plain string sort) wins, so the
  choice is deterministic, and the name is left out when there is none.
- Anchor data is in `src/gun/anchorData.ts` (`GUN_ANCHORS`), not in `parts.ts`.
  `hold` is declared by `grip`, `frame` (the integrated pistol grip) and
  `stock` (only when the stock carries `FIRING_GRIP`); `support` by
  `handguard` and `forend` (underside of the `bottom` solid); `muzzle` by
  `barrel` (its `muzzle` port). Frames are computed from the built part, so
  they follow params.

**Palette.** `src/gun/palette.ts`: `GUN_PALETTE`, `createPalette` (throws on a
channel that isn't finite or lies outside [0,1]), `solidColor(palette, role,
solidId)` (special colour by solid id, then role colour, then the fallback),
and `hexToSrgb`/`srgbToHex`. The viewer's old colours are reproduced
bit-identically for every role that had one. Six roles that used to render as
the `#888888` fallback now have colours (below).

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

**Note for lane B (3.4 export).** Hold frames follow the grip's own lean: the
`grip` and `frame` frames use the grip's local axes, so once the part is
placed the frame is tilted with the grip, and a `grip.turn` derived from it
reflects that tilt. Lane B must decide whether deadvox wants the tilted frame
or an upright one. The anchor data doesn't decide it.

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

Known issue (BR, 2026-09-29; noted, not yet addressed): `stanag-20` is built as
`profile: stanag-curved` at length M, a shortened curved magazine. A real
20-round STANAG is straight; only the 30-round one is curved. Fixing it means a
straight STANAG profile (or `standard`, if its section matches) and a decision
on the AR design's magazine, which references `stanag-20` today: a straight
20, a curved `stanag-30`, or its current curved M without a prefab.

- Designs are files in `gungen/designs/`. Fixtures stay test cases; designs
  are the curated product.
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
  `src/viewer/scene.ts#displaySolids`) and the shared palette, with colours converted
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
(`deadvox/src/core/schema.ts:202-204`).

**3.4 (implemented, lane B).**

- API. `src/core/glb.ts#exportGlb` is the frozen `ExportGlb`; it also exports
  `partNodeName` and `srgbToLinear`. `src/gun/exportGlb.ts#exportGunGlb(assembly,
  asset)` resolves, selects the gun anchors and applies `GUN_PALETTE`; it
  returns the writer's result, or the `AnchorSelectionError` for a missing or
  ambiguous `hold`. Units and axes are in `src/core/exportFrame.ts`. The frozen
  types didn't change.
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
- Materials: one per distinct colour, `baseColorFactor` in linear space
  (standard sRGB transfer function), metallic 0, roughness 0.85. The writer has
  its own copy of the special, role, fallback lookup, since core can't import
  `src/gun/palette.ts#solidColor`; a test checks the two agree.
- Units: `METRES_PER_UNIT = 0.0115` (1u = 11.5 mm, from the STANAG top depth
  of 5.5u = 63 mm). Vertices are `mesh.ts` positions times that; normals are
  unscaled. `conventions.ts` still says "roughly a centimetre" for `u`; the
  export uses 11.5 mm.
- Axes. gungen is right-handed, +X forward, +Y up, +Z right; glTF is
  right-handed Y-up; deadvox's held model is +x forward, +y up. So the file
  keeps gungen's axes (`FILE_FROM_GUNGEN`, identity) and `grip.at` and the
  anchors are the assembly positions times `METRES_PER_UNIT`, with no swap.
- **Grip orientation (BR ruling, 2026-09-29).** `grip.turn` does not include
  the grip's rake. The hold frame's orientation (which leans with the grip) is
  not used for `turn`. `turn` is only the fixed rotation from the file's axes to
  deadvox's held axes, from `src/core/exportFrame.ts#gripTurn`: the Euler XYZ
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
`rifle_assault` now uses the curated `archetype-ar` export; `debug_rifle_assault`
spawns it with G under `?debug=1` for inspection in hands and piles. The model
entry keeps the original id and asset path, with export-derived grip and anchors;
`grip.turn` is `[0, 0, 0]` per BR's +x-forward/+y-up ruling. Reproduce the checked-in
GLB and sidecar from the `gungen/` directory with:

```sh
npm run export:glb -- designs/archetype-ar.json --out ../deadvox/src/content/base/assets/models --entry-out /tmp/gungen-rifle-assault-entry --id rifle_assault
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
  existing stock styles stay unchanged. It is a constant-width side profile
  using the current extruded-polygon solid:
  - **stock — done** (reference `.agent-mail/scratch/br-ref-stock-taper.png`,
    an 870-style wood stock): a narrow wrist at the receiver that widens to a
    tall butt; the comb line drops toward the butt while the belly line runs
    down to the toe;
  - **pistol grip — deferred** (reference `.agent-mail/scratch/br-ref-grip-slant.png`,
    AR-style): raked, with slanted front and back faces rather than a
    constant-width slab.
  Keep port positions, `hold` anchors, magazine-well clearance, the stock's
  `FIRING_GRIP` role, and every existing rule passing. Tapering in width (narrower
  at the wrist from above) would need a new convex solid kind and is not asked for;
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
  the carrier face above the magazine path. Revolver receivers have no ejection
  keep-out and remain solid; the pistol frame/slide are separate parts.
  Candidates beyond these three, for BR to choose from: the AR forward assist,
  magazine and bolt releases, and the safety selector;
- **Deferred (BR, 2026-09-30):** revolute `PartMotion` for lifting the bolt handle
  and folding the FAL handle. For now both remain deployed and move linearly (or
  are fixed to the receiver).
- **Deferred (BR, 2026-09-30):** if automatic shotguns are added, reuse the AK-like
  stick/paddle charging-handle style. Pump shotguns remain handle-free.
- per-solid opt-out of bevels and outlines (BR, 2026-09-28; deferred). Some
  shapes are one surface built from many solids, like the curved STANAG and
  AK magazines' runs of ring sectors. Bevelling and outlining each segment
  breaks the curve up; they look best plain and without outlines. Proposed:
  display hints on a solid (no bevel, no outline), set by the part family,
  which the viewer (`src/viewer/scene.ts`, bevel and `EdgesGeometry`) and the
  3.4 export both honour. Collision and the rules ignore the hints. By
  default a solid is bevelled and outlined. The mesh module already accepts a
  zero bevel (`src/core/mesh.ts#meshForSolid`). The export draws no outlines, so for
  the export "no outline" needs nothing. Generic rendering hints can live in
  the core schema, as `displaySolids` already does. Display hints are assigned
  by the generated part family; they are runtime `Solid` metadata, not fields in
  assembly/design JSON. `loadDesign` rebuilds parts from family parameters and
  neither requires nor retains these hints. The viewer honours no-bevel and
  no-outline; glTF export honours no-bevel (it draws no outlines). Collision
  and rule checks ignore the metadata. This changes the
  `Solid` type in `src/core/schema.ts`, so lane A owns it;
- after 3.5: attachments with game properties and port compatibility
  (gungen.2), with the deadvox schema change they need;
- **Bullpup archetype — suspended (BR, 2026-10-01):** part-family geometry remains,
  but the template is excluded from active `TEMPLATES` via `SUSPENDED_TEMPLATE_NAMES`,
  and its curated design and fixtures live byte-identically under `designs/suspended/`
  and `fixtures/suspended/`. Its launcher options, corpus entries, generated snapshots,
  and archetype-specific fixture test are out of the active pipeline. To restore it,
  remove `bullpup` from that one set, move the three JSON files back to their scanned
  directories, restore launcher/corpus references, and regenerate the scoped snapshots.
  The default finish, palette, and `exportFile` variant entries remain as harmless dormant
  data; the family code stays available for restoration.

### Parallel lanes

3.0a (the frozen types) released B and C, and 3.0b is merged, so both lanes
are free to work. 3.0b's anchor data is in `src/gun/anchorData.ts`, not
`parts.ts`, so there is no last `parts.ts` edit to hand over. `parts.ts` stays
A's until A says otherwise, because a parts and rules fix batch is in progress
on A's lane; D starts only after 3.5 and after A says so. After that, the rule
is one writer at a time per hot file:

- `src/viewer/main.ts`, `src/viewer/paramPanel.ts`, `src/viewer/scene.ts`;
- `src/gun/parts.ts`, `src/gun/templates.ts`;
- `src/core/schema.ts`;
- `package.json`, `.github/workflows/gungen.yml`;
- this file (each lane only adds its own subsection).

| Lane | Who | Work | Owns | Starts |
| --- | --- | --- | --- | --- |
| A | coder@gungen | gungen.3, then 3.0a, 3.0b, 3.1, 3.2, and 3.3's viewer strip | viewer, `schema.ts`, the design format, `prefabs.ts`, `designs/`, the palette; `parts.ts` until A says otherwise (a parts/rules fix batch is in progress) | now; 3.0a and 3.0b are merged |
| B | subagent | 3.4 glTF export | new `src/core` export files, its CLI; asks A for `package.json` and CI changes | released by 3.0a; 3.0b is merged |
| C | subagent | 3.3 suggester core | new `src/core/suggest.ts`, tests | released by 3.0a; 3.0b is merged |
| D | subagent | 3.6 vocabulary after 3.5: gungen.7, gungen.6, then the later items | `parts.ts`, `templates.ts` | after 3.5, and after A hands over `parts.ts` |
| E | coder@main | 3.5 deadvox import | `deadvox/` | after saves.2b and 3.4 |

B and C add new files but depend on 3.0a's types. Neither may change
`schema.ts` or the design format; a needed change goes back to lane A.

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
  seed range, and the `known-good seeds` snapshots, which are generator
  output. Tests over `fixtures/`, hand-built assemblies and single fixed
  seeds used as a fixture stay local. A test that mixed both is split: the
  fixture half is local, the sweep half is gated (palette, frame checks in
  `anchors.test.ts`). A skipped snapshot test keeps its snapshot and is not
  reported obsolete.
- **Not gated yet.** The "validator results are unchanged by the mesh
  module" block in `mesh.test.ts` stays as it is; it is deleted with PR #72.

Removal plan, one line per gated sweep:

- (a) **Replaced** by the same property over `fixtures/` plus the published
  `designs/`; the seed loops and their CI gate are deleted. Each new test is
  local (not gated) and iterates `loadCorpus()` in `test/helpers.ts`: every
  fixture except the `broken-*` ones (they exist to break a rule; the
  palette and triangle-budget tests use every fixture, since none of them
  breaks a colour or a budget) plus every design:
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
  - triangle budget (`mesh.test.ts`, "stays under 5000 triangles in every
    fixture and design");
  - frame checks (`anchors.test.ts`, "fixture and design frames are
    unit-length and right-handed; hold frames sit within their part").
- (b) Merge: the two 300-seed loops per template in `generate.test.ts`
  ("never produces a structurally broken file" and "is valid at least half
  the time") go over the same seeds and become one loop.
- (c) Keep as a small CI smoke test for the 3.3 suggester, a few seeds per
  template: "varies with the seed" and the `known-good seeds` snapshot
  (`generate.test.ts`), the AK curve-variant, AK handguard layout, battle
  rifle magazine orientation and free-float mount choices (`ak.test.ts`,
  `battleRifle.test.ts`, `freeFloatHandguard.test.ts`). They check that the
  generator still spans its choices, which is what the suggester reuses.

Golden designs (3.1) become the regression corpus. Each published design
gets a snapshot of its resolved solids (already planned), and property tests
iterate `fixtures/` plus `designs/` instead of seeds.

## Testing

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
- **Removals need a reason.** The commit says what the removed tests protected
  and which remaining test or sample still protects it, ideally with a mutation
  or coverage result as evidence.
- **Timeouts.** A test that takes about 1 s or more and still has the 5 s
  default gets its own timeout, about 5x its measured time, with a comment
  saying why. A sweep is split into smaller tests where it can be; one that
  cannot (`unplacedParts.test.ts`) gets a timeout proportional to its case
  count.

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
