// Severed parts: one per cut point of each zombie type, as the asset release cuts them.
local severed = import 'tools/jsonnet/lib/severed-parts.libsonnet';
// Inventory cells by the bone a cut starts at, either side: its part carries every bone below it.
local cells = {
  head: [2, 3], skull: [2, 3], maw: [2, 2],
  upperArm: [1, 7], arm: [1, 7], forearm: [1, 5], fore: [1, 5], hand: [1, 2],
  thigh: [2, 9], shin: [1, 5], foot: [1, 3],
};
local cellsOf(bone) =
  local kind = std.split(bone, '.')[0];
  assert std.objectHas(cells, kind) : 'author inventory cells for the part cut at ' + bone;
  cells[kind];

{
  items: [
    {
      id: part.model.id,
      name: severed.title(part.model.id),
      category: 'misc',
      model: part.model.id,
      size: cellsOf(part.bone),
    }
    for part in severed.parts
  ],
}
