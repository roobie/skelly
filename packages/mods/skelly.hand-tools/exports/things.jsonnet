local voxel = import 'tools/jsonnet/lib/voxel-grains.libsonnet';
local owned = std.set(['compass', 'crowbar', 'hammer', 'sledgehammer', 'kitchen_knife', 'can_opener', 'whetstone', 'wrench', 'screwdriver', 'adjustable_pliers', 'wire_strippers', 'sewing_repair_kit', 'repair_kit']);
// Hand-held items take the gun grain, so a long thin shape keeps its taper, hook and edge.
local gunGrained = std.set(['crowbar', 'hammer', 'sledgehammer', 'kitchen_knife', 'wrench']);
[
  {
    id: row.id,
    kind: 'item',
    source: row.id,
    voxel: voxel.of(if std.setMember(row.id, gunGrained) then voxel.gun else voxel.item, row),
    options: { mass: row.exportMass },
  }
  for row in (import 'packages/thing-authoring-tool/items.jsonnet').items
  if std.setMember(row.id, owned)
]
