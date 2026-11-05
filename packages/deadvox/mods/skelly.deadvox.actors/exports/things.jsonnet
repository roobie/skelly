local voxel = import 'tools/jsonnet/lib/voxel-grains.libsonnet';
local severedParts = std.set([
  'shambler_torso', 'shambler_head', 'shambler_left_arm', 'shambler_right_arm', 'shambler_left_leg', 'shambler_right_leg',
]);
[
  {
    id: row.id,
    kind: 'item',
    source: row.id,
    voxel: voxel.of(voxel.item, row),
    options: { mass: row.exportMass },
  }
  for row in (import 'packages/thing-authoring-tool/items.jsonnet').items
  if std.setMember(row.id, severedParts)
]
