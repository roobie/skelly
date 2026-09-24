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
| Loops | Milestone 1 only *checks* that loops close; there is no solver yet |

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
- Open: are archetypes (pistol, rifle, shotgun…) hard-coded templates, or do
  they emerge from the part rules?

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
- **Parts** (`src/gun/parts.ts`): receiver, barrel, handguard, grip, magazine,
  stock and sight, built from boxes. The handguard can clamp to the barrel as
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

### Running it

```sh
cd gungen
npm install
npm test               # unit tests plus every fixture
npm run typecheck
npm run validate       # validate all fixtures from the command line
npm run validate -- path/to/assembly.json
npm run dev            # the viewer; add ?fixture=<name> to open a fixture
```

## Open questions

- The solver: hand-rolled iterative constraint solving, or a CSP/SAT library?
  Deferred until generation needs one.
- Archetypes: templates or emergent (§6)?
- Keep-out shapes: are boxes enough, or do we need capsules or swept shapes?
