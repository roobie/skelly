// Vehicle parts carry baked collision because a fitting places it on the vehicle.
local vehicleParts = std.set([part.id for part in import 'packages/thing-authoring-tool/vehicle-parts.libsonnet']);
// A vehicle part takes the vehicle class, so it matches the vehicle it sits on; a hand-held item takes the gun class;
// every other catalogue row is an item. A catalogue row may name its own grain in place of its class's.
local voxel = import 'tools/jsonnet/lib/voxel-grains.libsonnet';
// Hand-held items take the gun grain, so a long thin shape keeps its taper, hook and edge.
local gunGrained = std.set(['flashlight']);
local moved = std.set([
  recipe.source
  for recipe in (import 'packages/mods/skelly.body/exports/things.jsonnet')
                + (import 'packages/mods/skelly.materials/exports/things.jsonnet')
                + (import 'packages/mods/skelly.medicine/exports/things.jsonnet')
                + (import 'packages/mods/skelly.hand-tools/exports/things.jsonnet')
                + (import 'packages/mods/skelly.structures/exports/things.jsonnet')
                + (import 'packages/mods/skelly.basic-foods/exports/things.jsonnet')
                + (import 'packages/mods/skelly.packaged-foods/exports/things.jsonnet')
                + (import 'packages/mods/skelly.wearables/exports/things.jsonnet')
                + (import 'packages/mods/skelly.fuel/exports/things.jsonnet')
                + (import 'packages/mods/skelly.containers/exports/things.jsonnet')
                + (import 'packages/mods/skelly.flame-tools/exports/things.jsonnet')
                + (import 'packages/mods/skelly.light-sources/exports/things.jsonnet')
                + (import 'packages/mods/skelly.basic-recipes/exports/things.jsonnet')
                + (import 'packages/mods/skelly.melee/exports/things.jsonnet')
]);
[
  {
    id: row.id,
    kind: 'item',
    source: row.id,
    voxel: voxel.of(
      if std.setMember(row.id, vehicleParts) then voxel.vehicle
      else if std.setMember(row.id, gunGrained) then voxel.gun
      else voxel.item,
      row,
    ),
    options: { mass: row.exportMass }
             + (if std.setMember(row.id, vehicleParts) then { collision: true } else {}),
  }
  for row in (import 'packages/thing-authoring-tool/items.jsonnet').items
  if !std.setMember(row.id, moved)
]
