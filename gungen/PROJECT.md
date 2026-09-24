# gungen — low-poly firearm generator

The first skelly subproject. It generates super-low-poly 3D firearms by working
out how components connect, so every result is a *feasible* assembly.

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

## Decisions

| Decision | Choice |
| --- | --- |
| Language | TypeScript (strict), one language for core and viewer |
| Core | Pure library in `src/core`, with no rendering dependency; domain-agnostic (§10) |
| Gun data | `src/gun`: part families and the gun domain config |
| Viewer | three.js, served by Vite, in `src/viewer` |
| Tests | Vitest |
| Part definitions | TypeScript code: each family is a function from size-class params to a part |
| Assemblies | JSON files: part instances plus connections (§7) |
| Loops | Loops are only *checked* for closure; there is no solver yet |
| Layouts | Data, not code: the receiver is only the action body, and a swappable lower sets where the grip and magazine go |
| Domain rules | Domains add their own rules next to the core ones (`Domain.rules`) |
| Generation | Templates (data) plus a seeded generator. The generator only makes choices; the validator decides what's feasible |
| CI | GitHub Actions (`.github/workflows/gungen.yml`): typecheck, tests, fixture validation, viewer build |
| Hosting | GitHub Pages (`.github/workflows/pages.yml`): every push to `main` is checked, then the viewer is published at <https://roobie.github.io/skelly/gungen/> |
| Params from neighbours | Declared per param (`ParamSpec.from`): an unset param copies a neighbour's param through a named port. Values set in the assembly always win |

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
- **Schemas** (`src/core/schema.ts`): ports, keep-out volumes (boxes only),
  parts, part families, domains, and the JSON assembly format.
- **Placement** (`src/core/resolve.ts`): walks connections out from the root.
  A connection whose two parts are both already placed closes a loop and is
  checked, not solved. Connections support rail slots and 90° roll.
- **Rules** (`src/core/rules.ts`), each with an id and a readable message:

  | Rule id | Checks |
  | --- | --- |
  | `port-compat` | Mount types match, genders are opposite, sizes match, and no port or slot is used twice |
  | `axis-alignment` | Bore axes lie on the bore line; sight axes are parallel to it |
  | `solid-overlap` | Solids don't overlap. Directly connected parts may nest by up to 0.75u |
  | `keep-out` | No solid is inside another part's keep-out volume, except the part attached at the port the volume allows |
  | `required-ports` | Every required port has something attached |
  | `loop-closure` | Connections that close a loop actually meet |

  A file that can't be resolved (unknown family, part, port or param; bad slot
  or roll) is reported under `structure`.
- **Parts** (`src/gun/parts.ts`, since reworked in Milestone 1.1): receiver,
  barrel, handguard, grip, magazine, stock and sight, built from boxes. The handguard can clamp to the barrel as
  well as the receiver, which creates the loop. There are 7 mount types, not
  the 3–4 first planned: each socket needs its own type so a stock can't go
  in a grip socket.
- **Keep-out volumes:** ejection path, trigger finger, magazine insertion
  path, charging handle travel (receiver); sight line (sight); muzzle
  (barrel).
- **Fixtures** (`fixtures/`): one valid assembly and one broken assembly per
  rule. Each file lists the rules it is expected to fail in `expect`, and the
  tests check each one fails exactly those.
- **Viewer** (`src/viewer/`): solids, port frames (normal and up arrows),
  keep-out volumes and the bore line, with failing parts and volumes in red.
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

- **Receiver split.** The receiver is now only the action body, with two
  params:
  - `action`: `auto` (charging handle), `bolt` (bolt travel out of the back,
    bolt handle sweep on the right) or `pump` (driven by the forend). Each adds
    its own keep-out volumes.
  - `feed`: `box` (magazine through the lower), `top` (loading port above the
    action) or `tube` (tube magazine port, loading port underneath).

  The grip and magazine hang from a **lower** under it, whose `layout` param
  sets where they go:
  - `conventional`: magazine ahead of the grip.
  - `bullpup`: grip ahead of the magazine, with the butt built in.
  - `trigger`: trigger only, for tube-fed or top-loaded designs.
- **New and extended parts:**
  - `tube-magazine`: runs under the barrel, with its cap fixed to the barrel's
    lug. That closes a loop, the same way the handguard clamp does.
  - `forend`: slides on the tube, with a slide-travel keep-out volume.
  - `stock` now has a `style`. `straight` puts the comb in line with the bore.
    `sporting` drops the comb below the bolt's travel and adds a wrist to hold.
  - The handguard has a top rail, so a sight can sit ahead of the action.
- **Mount types:** 11 now. `lower`, `tube`, `lug` and `forend` are new.

### Archetype fixtures

Each is valid and passes every rule. Files are in `fixtures/`.

| Fixture | Archetype | Built from |
| --- | --- | --- |
| `archetype-rifle` | Rifle, conventional layout | auto/box receiver, conventional lower, pistol grip, straight stock, clamped handguard |
| `archetype-smg` | Submachine gun | Same layout as the rifle at small bore, with a short barrel and stock and a long magazine |
| `archetype-bolt-rifle` | Bolt-action rifle, loaded from the top | bolt/top receiver, sporting stock, full-length handguard, sight on the handguard ahead of the loading port |
| `archetype-bolt-rifle-box` | Bolt-action rifle, detachable box magazine | bolt/box receiver, pistol grip, sporting stock, sight over the action |
| `archetype-pump-shotgun` | Pump-action shotgun | pump/tube receiver at large bore, tube magazine plus forend, trigger-only lower, sporting stock |
| `archetype-bullpup` | Bullpup | auto/box receiver, bullpup lower (grip ahead of the magazine, butt built in), no separate stock |

On top of one broken fixture per rule, these check constraints specific to an
archetype:

| Fixture | Fails | Why |
| --- | --- | --- |
| `broken-bolt-straight-stock` | `keep-out` | A straight comb sits in the bolt's travel |
| `broken-bolt-sight-over-loading-port` | `keep-out` | On a top-loaded action, a sight over the receiver blocks the loading port |
| `broken-pump-tube-mismatch` | `loop-closure` | The tube magazine's cap misses the barrel lug |
| `broken-bullpup-with-stock` | `solid-overlap` | A stock added where the built-in butt already is |

### Known gaps

- **Feed type and lower aren't cross-checked.** A box-fed receiver on a
  trigger-only lower has no magazine, and nothing flags it. A tube-fed
  receiver on a conventional lower is only caught because the lower happens
  to hit the loading port. *(Fixed in 1.2.)*
- **The SMG differs from the rifle only in proportions and bore.** Nothing
  models what makes an SMG distinct, such as a simpler action.
- **Parts still don't read their neighbours' params.** Barrel length, and the
  handguard or tube length that has to match it, are still matched by hand.
  *(Fixed in 1.2.)*
- **Ergonomics is just "is there a firing grip".** Reach, length of pull and
  cheek weld (§5) are not checked. For a bullpup, the ejection port sits next
  to the shooter's face, and nothing checks that yet.

## Milestone 1.2: feed check and params from neighbours

**Status:** done.

- **`feed-match` rule** (gun domain): the lower under a receiver must suit its
  feed. Box- and top-fed receivers need a lower with a magazine well; a
  tube-fed receiver can't use one. Fixture: `broken-feed-match`.
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
  | handguard | `length` | the barrel on its `front` (clamp) port |
  | tube-magazine | `length` | the barrel on its `cap` (lug) port |

  So changing a barrel's length re-sizes a clamped handguard or tube magazine
  to match. The archetype fixtures now leave those params unset. The broken
  fixtures set them on purpose to create mismatches.
- Every part's final params, and where each came from, are in
  `Resolved.params`. The viewer shows them on hover, e.g.
  `length M ← barrel.length`.

### Still open

- The SMG is still the rifle at a different size and bore. *(Partly
  addressed in 2.1: its magazine now follows its small bore.)*
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
  for the six archetypes). A template lists slots and connections:
  - A **slot** names a part family and, per param, a value or a list to pick
    from. Params it leaves out are default or read from neighbours, so a
    template picks the barrel length and a clamped handguard or tube magazine
    follows.
  - A slot or connection can have a **chance** of being included. That covers
    optional stocks and sights, and handguards that are clamped or floating.
  - A connection's `from` can be a **list of ports** (a sight on the receiver
    rail or the handguard rail), and its `slot` can be **`any`**. The slot
    count is read from the resolved part, so it respects inherited params.
- **Generator** (`src/core/generate.ts`): `generate(template, domain, seed)`
  is deterministic. It uses a seeded RNG (`src/core/random.ts`, mulberry32),
  never `Math.random`. `generateValid` tries seed, seed + 1, … until a build
  passes. The generator never checks feasibility itself.
- **CLI:** `npm run generate` prints one assembly (`--valid` skips to the next
  valid seed; `--out` writes a file). `npm run stats` reports the §9 metrics.
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
| rifle | 80.6% | 959 | 776 | keep-out (sightline) 19.4% |
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

- **A clamped handguard that's too tight passes.** Directly connected parts
  may nest by up to 0.75u (needed for the grip's tilted corner), and a
  handguard clamped to the barrel counts as directly connected. Found while
  writing templates, which avoid the `S` inner size for now. The fix is an
  allowance per mount type instead of one global value.
- **Distinct builds are counted by file, not shape.** Two builds whose files
  differ but look the same count as two, e.g. a clamped and a floating
  handguard of the same length.
- **Retrying is linear** (seed, seed + 1, …). Fine at these valid rates; a
  template with a low valid rate would need smarter search.

## Milestone 2.1: magazines sized by cartridge

**Status:** done.

A box magazine's shape now follows the cartridge it holds, not a fixed box.
That's one of the visible differences between a rifle and an SMG: at small
bore, the magazine is slimmer front to back and narrower, and packs rounds
more tightly.

- **Magazine params:** `bore`, read from the magazine well unless set, and
  `capacity` (S/M/L = 10/20/30 rounds), which replaces `length`.
  - Bore sets the depth (front to back), the width, and how much length each
    round adds.
  - Length = rounds × that per-round pitch.
- **Lower:** gets a `bore` param read from the receiver, so the chain is
  receiver → lower → magazine. Its magazine well is sized by bore again, so a
  magazine for another cartridge fails `port-compat`. Its magazine-path volume
  matches the bore's magazine footprint.

Sizes are scaled up by 20% (tuned by eye against the other parts) and
snapped so every edge stays on the 0.25u grid:

| Bore | Depth × width | Length at capacity S / M / L |
| --- | --- | --- |
| S | 2.5 × 2 | 5 / 9.5 / 14.5 |
| M | 3.5 × 2.5 | 6 / 12 / 18 |
| L | 5 × 3 | 7 / 14.5 / 21.5 |

The rifle's magazine (bore M, capacity M) is 3.5 × 2.5 × 12. The SMG's (bore
S, capacity L) is 2.5 × 2 × 14.5. The magazine well sits at x = −4.5, 0.5u
further forward than before, so the deepest magazine (bore L) stays clear of
the trigger-finger volume. Generator stats are unchanged, because magazines
never caused a clash.

A possible next step for SMGs is a layout where the magazine goes through the
grip, as a new lower `layout`.

## Running it

```sh
cd gungen
npm install
npm test               # unit tests plus every fixture
npm run typecheck
npm run validate       # validate all fixtures from the command line
npm run validate -- path/to/assembly.json
npm run generate -- --template rifle --seed 42          # print a generated assembly
npm run generate -- --template rifle --seed 42 --valid  # skip to the next valid seed
npm run stats          # generator metrics over 1000 seeds per template
npm run dev            # the viewer; ?fixture=<name> or ?template=<name>&seed=<n>
```

The same viewer is live at <https://roobie.github.io/skelly/gungen/>, and the
query parameters work there too, e.g.
<https://roobie.github.io/skelly/gungen/?template=rifle&seed=7>.

## Open questions

- The solver: hand-rolled iterative constraint solving, or a CSP/SAT library?
  Deferred until generation needs one.
- Keep-out shapes: are boxes enough, or do we need capsules or swept shapes?
