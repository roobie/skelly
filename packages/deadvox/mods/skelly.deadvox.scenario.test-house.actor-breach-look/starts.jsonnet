local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
local layouts = import 'layouts.jsonnet';
local masonry = [
  material
  for material in (import 'packages/mods/skelly.natural-world/block-materials.jsonnet').blockMaterials
  if material.id == 'masonry'
][0];
// A whole masonry breach takes the brute minutes of blows. Its wall ships one point short of breaking, so the
// breach shows in seconds while the strength gate still decides whether a blow lands.
{
  starts: [kit.fixture + {
    id: 'actorbreachlook',
    site: 'testHouseActorBreachLook',
    startTimeGameTimeOfDay: kit.day.noonGameTimeOfDay,
    blockDamage: [{ cell: cell, damage: masonry.durability - 1 } for cell in layouts.bruteFrontCells],
  }],
}
