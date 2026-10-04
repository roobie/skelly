---
read_if:
  - you add or change content schemas or content validation
  - you change recipe, book or reachability content contracts
---

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
Slice 2.2 introduced recipes as data only. Slice 2.5 adds crafting, progression,
and book knowledge; `src/core/saveFormat.ts`, `SCHEMA_VERSION`, and the simulation
fingerprint require old saves to be refused rather than migrated during pre-alpha.

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

Knowledge is a hard source check: the explicit starting recipes and recipes
listed by found books are the only knowledge sources. An unknown recipe fails at
`.knowledge`, and its result cannot ground another recipe's components or tool
quality. `src/core/reachability.ts`, `checkReachability`, closes reachable
practice sources before accepting positive skill requirements. A recipe that
cannot be learned and completed from reachable sources cannot bootstrap its own
skill. Level 0 needs no progression source. Named-but-unplaced workstations
remain pending until Slice 2.8; `PENDING_REACHABILITY` pins only that hand-off.
`src/core/schema.ts`, `BookSchema`, owns book teaching data; the `paperback` has
no book component and remains inert.

`CONTENT_COUNT_EXCLUSIONS` keeps runtime escrow and the project's debug/case/body-part
policy out of acquired-content totals; `npm run validate` reports the effective
closure and any remaining unreachable content. Content growth beyond the
crafting/books milestone remains with Slice 2.11. Reachability issues use the
winning recipe's merge origin, preserving source file and index through ordered
overrides/removal. `src/core/character.ts`, `Character`, owns live practice and
knowledge; `src/core/reachability.ts`, `checkReachability`, independently proves
that their sources are available from placed loot.
