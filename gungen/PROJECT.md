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
  ergonomic reach (§5).

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

## Open questions

- Tech stack and runtime (web? native? both?).
- The format for part definitions (JSON/TOML/code?).
- The solver: hand-rolled iterative constraint solving, or a CSP/SAT library?
- Archetypes: templates or emergent (§6)?
