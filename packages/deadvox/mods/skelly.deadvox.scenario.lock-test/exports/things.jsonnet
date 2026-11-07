local voxel = import 'tools/jsonnet/lib/voxel-grains.libsonnet';
local keys = std.set(['shed_key']);
[
  {
    id: row.id,
    kind: 'item',
    source: row.id,
    voxel: voxel.of(voxel.item, row),
    options: { mass: row.exportMass },
  }
  for row in (import 'packages/thing-authoring-tool/items.jsonnet').items
  if std.setMember(row.id, keys)
]
