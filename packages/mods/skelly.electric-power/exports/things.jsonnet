local voxel = import 'tools/jsonnet/lib/voxel-grains.libsonnet';
local owned = std.set(['aa_battery', 'flashlight', 'headlamp', 'night_vision_goggles', 'portable_radio']);
// Hand-held items take the gun grain, so a long thin shape keeps its taper, hook and edge.
local gunGrained = std.set(['flashlight']);
[
  {
    id: row.id,
    kind: 'item',
    source: row.id,
    voxel: voxel.of(if std.setMember(row.id, gunGrained) then voxel.gun else voxel.item, row),
    options: { mass: row.exportMass },
  }
  for row in (import 'packages/skelly-assets/tools/packages/thing-authoring-tool/items.jsonnet').items
  if std.setMember(row.id, owned)
]
