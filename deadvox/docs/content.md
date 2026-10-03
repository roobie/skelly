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
Recipes are data only, not a crafting runtime, knowledge system or reachability
solver. No save change. The simulation fingerprint changes with the schema/core
source and base-content changes, intentionally accepted pre-alpha. Old saves with
the earlier simulation/content identity are refused; no migration is provided.
