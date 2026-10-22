// Every catalogue row exports under its own id, except older rows deadvox already names differently.
local renamed = { electrical_tape: 'tape_roll', sewing_thread: 'thread_spool', nylon_cord: 'cord_coil' };
// Vehicle parts carry baked collision because a fitting places it on the vehicle.
local vehicleParts = std.set([part.id for part in import '../vehicle-parts.libsonnet']);
// A vehicle part takes the vehicle class, so it matches the vehicle it sits on; every other catalogue row is an item.
// A catalogue row may name its own grain in place of its class's.
local voxel = import 'tools/jsonnet/lib/voxel-grains.libsonnet';
[
  {
    id: std.get(renamed, row.id, row.id),
    kind: 'item',
    source: row.id,
    voxel: voxel.of(if std.setMember(row.id, vehicleParts) then voxel.vehicle else voxel.item, row),
    options: { mass: row.exportMass }
             + (if std.setMember(row.id, vehicleParts) then { collision: true } else {}),
  }
  for row in (import '../items.jsonnet').items
]
