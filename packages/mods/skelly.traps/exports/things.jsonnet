local voxel = import 'tools/jsonnet/lib/voxel-grains.libsonnet';
local owned = std.set(['bear_trap']);
[
  {
    id: row.id,
    kind: 'item',
    source: row.id,
    voxel: voxel.of(voxel.item, row),
    options: { mass: row.exportMass },
  }
  for row in (import 'packages/skelly-assets/tools/packages/thing-authoring-tool/items.jsonnet').items
  if std.setMember(row.id, owned)
]
