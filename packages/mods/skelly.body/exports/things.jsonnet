local voxel = import 'tools/jsonnet/lib/voxel-grains.libsonnet';
local owned = std.set(['player_bust', 'player_arm', 'player_leg']);
[
  {
    id: row.id,
    kind: 'item',
    source: row.id,
    voxel: voxel.of(voxel.item, row),
    options: { mass: row.exportMass },
  }
  for row in (import 'packages/thing-authoring-tool/items.jsonnet').items
  if std.setMember(row.id, owned)
]
