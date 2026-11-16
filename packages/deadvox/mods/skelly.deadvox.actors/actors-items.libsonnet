// Severed parts: per cut point of each zombie type, its whole part and one for each set of cut points below it already
// gone, as the asset release cuts them.
local severed = import 'tools/jsonnet/lib/severed-parts.libsonnet';
// A whole part's inventory cells, width then length, by the bone a cut starts at, either side: it carries every bone
// below it.
local cells = {
  head: [2, 3], skull: [2, 3], maw: [2, 1],
  upperArm: [1, 7], arm: [1, 7], forearm: [1, 5], fore: [1, 5], hand: [1, 2],
  thigh: [2, 9], shin: [1, 5], foot: [1, 3],
};
local cellsOf(bone) =
  local kind = std.split(bone, '.')[0];
  assert std.objectHas(cells, kind) : 'author inventory cells for the part cut at ' + bone;
  cells[kind];
// A part is as long as its whole part less each part already cut away below it.
local sizeOf(part) =
  local whole = cellsOf(part.bone);
  local length = whole[1] - std.sum([cellsOf(gone)[1] for gone in part.without]);
  assert length > 0 : 'author inventory cells that leave the part cut at ' + part.bone + ' a length without ' + std.join(', ', part.without);
  [whole[0], length];

{
  items: [
    {
      id: part.model.id,
      name: severed.title(part.model.id),
      category: 'misc',
      model: part.model.id,
      size: sizeOf(part),
    }
    for part in severed.parts
  ],
}
