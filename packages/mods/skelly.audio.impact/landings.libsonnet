// What a small object sounds like when it lands on a receiving surface, from the released impact takes. A receiver
// adds the entries for the released surface it sounds like to its drop table; the surface picks the take and the
// landing item's sound family picks the object.
local built = import 'packages/skelly-assets/built/manifest.json';

// Sound family -> the released object whose takes it plays.
local objects = { brass_case: 'brass_case_9mm' };
// Block material -> the released surface it sounds like; a material left out keeps the any-item drop.
local blockSurfaces = { masonry: 'concrete', metal: 'metal', timber: 'wood', soil: 'dirt' };
// Furniture material -> the released surface it sounds like.
local furnitureSurfaces = { wood: 'wood', steel: 'metal' };

local take(object, surface) =
  local rows = [row for row in built.sounds if row.object == object && row.surface == surface];
  assert std.length(rows) == 1 : 'the release holds no single take of %s on %s' % [object, surface];
  rows[0];

local on(surface) = { [family]: take(objects[family], surface).id for family in std.objectFields(objects) };
local surfaces = std.set(std.objectValues(blockSurfaces) + std.objectValues(furnitureSurfaces));

{
  families:: std.objectFields(objects),
  // Drop entries for a receiver that sounds like the released `surface`.
  on:: on,
  forBlock(material):: if std.objectHas(blockSurfaces, material) then on(blockSurfaces[material]) else {},
  forFurniture(material):: if std.objectHas(furnitureSurfaces, material) then on(furnitureSurfaces[material]) else {},
  // Every take a receiver can name.
  takes:: [take(objects[family], surface) for family in std.objectFields(objects) for surface in surfaces],
}
