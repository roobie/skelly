local voxel = import 'tools/jsonnet/lib/voxel-grains.libsonnet';
local owned = std.set(['rag', 'stick', 'wax', 'nylon_cord', 'nails', 'scrap_metal', 'duct_tape', 'fastener_pack', 'small_spring', 'sewing_thread', 'electrical_tape']);
// These catalogue rows export under the model ids their items already name.
local renamed = { electrical_tape: 'tape_roll', sewing_thread: 'thread_spool', nylon_cord: 'cord_coil' };
[
  {
    id: std.get(renamed, row.id, row.id),
    kind: 'item',
    source: row.id,
    voxel: voxel.of(voxel.item, row),
    options: { mass: row.exportMass },
  }
  for row in (import 'packages/thing-authoring-tool/items.jsonnet').items
  if std.setMember(row.id, owned)
]
