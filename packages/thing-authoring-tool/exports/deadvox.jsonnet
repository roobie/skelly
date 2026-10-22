// Every catalogue row exports under its own id, except older rows deadvox already names differently.
local renamed = { electrical_tape: 'tape_roll', sewing_thread: 'thread_spool', nylon_cord: 'cord_coil' };
// Vehicle parts carry baked collision because a fitting places it on the vehicle.
local vehicleParts = std.set([part.id for part in import '../vehicle-parts.libsonnet']);
// Voxelizing at export is an evaluation: only the rows named here export as voxel meshes. A vehicle part takes the
// vehicle grain and every other row the item grain; both are content values.
local grains = import 'tools/jsonnet/lib/voxel-grains.libsonnet';
local voxelized = std.set(['car_battery', 'car_headlamp', 'hatchback_battery_tray', 'can_opener', 'soda_can', 'fuse', 'player_bust']);
local voxelGrainOf(id) = if std.setMember(id, vehicleParts) then grains.vehicle else grains.item;
[
  {
    id: std.get(renamed, row.id, row.id),
    kind: 'item',
    source: row.id,
    options: { mass: row.exportMass }
             + (if std.setMember(row.id, vehicleParts) then { collision: true } else {})
             + (if std.setMember(row.id, voxelized) then { voxelGrain: voxelGrainOf(row.id) } else {}),
  }
  for row in (import '../items.jsonnet').items
]
