# Content sections and recipes

The single section descriptor in `src/core/schema.ts` owns native Valibot schemas,
labels and registration order. `CONTENT_SECTIONS`/`CONTENT_SECTION_KEYS` supply
file validation, ordinary registry maps and merging, and CLI section counts.
The content schema is derived from the descriptor; the checked metadata mapping
also fails typecheck if someone independently adds a schema section without an
entry. Blocks keep explicit numeric IDs and reserved AIR handling. Model/sound
origin tables remain explicit. File order, overrides and diagnostic order remain
unchanged. See `npm run validate` for the exhaustive current section/count list,
not a second hand-maintained section table here.

## Recipe format (Slice 2.2)

`recipes` is a list of definitions: `id`, `result: { item, count }`, positive
`time` in **game minutes**, `skills` and `qualities` maps, `components` as groups
of `{ item, count }` alternatives, and optional `workstation` (an id or null).
Counts are positive whole items; each component group has at least one alternative.
Skill requirements are nonnegative whole levels; quality requirements are levels
1–5, matching unchanged item `ToolSchema` levels. A recipe may have at most
**1,024 combinations**, inclusive: the product of its group lengths. Validation
uses exact integer multiplication and reports the count when refusing a file.

- `skills` definitions contain only an id and name; character state is 2.5.
- Quality IDs are keys declared by loaded items' `tool.qualities`, including mod
  keys, not a new top-level section. A missing declaration is an error. Whether
  a reachable item supplies it is the separate 2.3 acceptance check.
- Workstation IDs are minimal `workstation: { id }` metadata on furniture. Plain
  furniture IDs are not workstation IDs. Qualities/speed/reach behavior and the
  placed workbench come in 2.8; there is no workstation registry or runtime here.
- Result, every alternative item, skill, quality and workstation references are
  checked after ordered merging. Broken files are removed whole, including their
  skills/recipes/items, and references are checked again as before.

The initial torch, candle and repair-kit recipes consume whole solid items only.
There are **no millilitre components, partial liquid use, pouring/mixing, new item
storage or save format**. No container is consumed by these recipes. Before any
later recipe uses part of a liquid, its stored quantity-to-ml mapping, saved
partial use and container retention must be approved. Torch/candle result
metadata has no light or burning component yet; those mechanics belong to 2.9.
Recipes are data only, not a crafting runtime or knowledge system. No save change. The simulation fingerprint changes with the schema/core
source and base-content changes, intentionally accepted pre-alpha. Old saves with
the earlier simulation/content identity are refused; no migration is provided.

## Static reachability (Slice 2.3)

`npm run validate` checks the effective merged pack, using the hamlet's actual
`HAMLET_TEMPLATES` and compiled marked furniture/spawns, not every declared
palette entry or every template. Placement loot overrides replace furniture
loot. Nested tables contribute only with positive possible rolls/item counts
(weights are already strictly positive by schema). Zombie loot comes from
positive-chance markers that can fit the population cap, accounting for shuffled
north templates, and roadside wanderers only when a slot can remain.

The least component fixed point starts at found types. A result enters only when
at least one alternative per component group is reachable; unseeded recipe cycles
add nothing. Content acceptance reports **every declared alternative** that is
neither found nor craftable. It is a type closure, not a quantity/consumption,
particular-seed or whole-game solver. It does not invent salvage sources.

Tools are a separate hard check: a second loot-seeded fixed point requires both
components and sufficient tool-quality levels before adding a result. A recipe
cannot bootstrap its own quality, directly or through another tool-dependent
recipe. Independently found or grounded crafted providers are valid.

Knowledge, positive skill requirements, and named-but-unplaced workstations emit
`pending: no source yet` with their owning milestone, plus a pending count. They
**are not accepted**, but do not fail CI yet, by the approved 2.3 policy. Level 0
requires no progression source. Placed workstation declarations are discoverable;
bench behavior stays 2.8. `PENDING_REACHABILITY` and its test pin this temporary
class list. The 2.4/2.5/2.8 hand-offs in SLICE-2.md require promotion to hard checks.

Current base: 33 found types, 36 in the component closure; 36 reachable / 40
defined eligible content types. The explicit `CONTENT_COUNT_EXCLUSIONS` policy
leaves out the current debug-only items, spent case, and severed body-part items;
extend this set when new excluded definitions land. Defined eligible but
unreachable: baseball_bat, fanny_pack, hiking_backpack, utility_vest (2.11 owns
these gaps). Stick and wax each have one weight-1 entry in `junk`, used by placed
crates and nested `shed_tools`; no other material/loot growth is included.
The count does not imply full acceptance of the four pending prerequisites.
Reachability issues use the winning recipe's existing merge origin, preserving
source file and index through ordered overrides/removal. No saved closure/state,
crafting runtime, codec change or migration is added.
