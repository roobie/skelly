local voxel = import 'tools/jsonnet/lib/voxel-grains.libsonnet';
local owned = std.set(['canned_beans', 'canned_soup', 'opened_beans', 'opened_soup', 'empty_can', 'beans', 'soup', 'soda_can', 'opened_soda', 'empty_soda_can', 'soda', 'crackers', 'chocolate_bar', 'water_bottle', 'juice_carton']);
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
