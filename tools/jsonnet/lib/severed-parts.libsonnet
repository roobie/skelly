// The parts mobgen cuts each zombie type into, as the asset release bakes them: per cut point, by the actor type and
// the bone a cut starts at, its whole part and one part for each set of cut points below it already gone, so the game
// names no bone and every cut leaves a part that carries no mass another part already took.
local index = import 'packages/skelly-assets/built/skelly.body/severed/index.json';
local titles = {
  [row.id]: row.title
  for row in (import 'packages/skelly-assets/built/manifest.json').models
  if row.kind == 'severed-part'
};
// Every part with its type, the bone it is cut at, the top-most cut points below already gone and its model sidecar.
local parts = std.flattenArrays([
  [{ type: type, bone: bone, without: part.without, model: part.model } for part in index[type][bone]]
  for type in std.objectFields(index)
  for bone in std.objectFields(index[type])
]);
{
  parts:: parts,
  ids:: [part.model.id for part in parts],
  models:: [part.model for part in parts],
  title(id):: titles[id],
  // The items each cut point of `type` leaves, by bone; a type the release cuts into no parts leaves none.
  itemsOf(type):: {
    [bone]: [{ without: part.without, item: part.model.id } for part in parts if part.type == type && part.bone == bone]
    for bone in std.set([part.bone for part in parts if part.type == type])
  },
}
