// The parts mobgen cuts each zombie type into, as the asset release bakes them: one model per cut point, by the actor
// type and the bone a cut starts at, so the game names no bone and every cut point has its part.
local index = import 'packages/skelly-assets/built/skelly.body/severed/index.json';
local titles = {
  [row.id]: row.title
  for row in (import 'packages/skelly-assets/built/manifest.json').models
  if row.kind == 'severed-part'
};
{
  // Every part with its type, the bone it is cut at and its model sidecar.
  parts:: std.flattenArrays([
    [{ type: type, bone: bone, model: index[type][bone] } for bone in std.objectFields(index[type])]
    for type in std.objectFields(index)
  ]),
  ids:: [part.model.id for part in self.parts],
  models:: [part.model for part in self.parts],
  title(id):: titles[id],
  // The item each cut point of `type` leaves, by bone; a type the release cuts into no parts leaves none.
  itemsOf(type):: { [part.bone]: part.model.id for part in self.parts if part.type == type },
}
