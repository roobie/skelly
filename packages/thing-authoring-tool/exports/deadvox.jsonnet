// Every catalogue row exports under its own id, except older rows deadvox already names differently.
local renamed = { electrical_tape: 'tape_roll', sewing_thread: 'thread_spool', nylon_cord: 'cord_coil' };
// Vehicle parts carry baked collision because a fitting places it on the vehicle.
local vehicleParts = std.set([part.id for part in import '../vehicle-parts.libsonnet']);
// Voxelizing at export is an evaluation: only the rows named here export as voxel meshes, at the grain given in
// metres. The vehicle grain matches deadvox's vehicle voxels; the item grains show small and thin things at finer ones.
local vehicleGrain = 0.03125;
local itemGrain = 0.01;
local fineGrain = 0.004;
local voxelGrains = {
  car_battery: vehicleGrain,
  car_headlamp: vehicleGrain,
  hatchback_battery_tray: vehicleGrain,
  can_opener: itemGrain,
  soda_can: fineGrain,
  fuse: fineGrain,
};
[
  {
    id: std.get(renamed, row.id, row.id),
    kind: 'item',
    source: row.id,
    options: { mass: row.exportMass }
             + (if std.setMember(row.id, vehicleParts) then { collision: true } else {})
             + (if std.objectHas(voxelGrains, row.id) then { voxelGrain: voxelGrains[row.id] } else {}),
  }
  for row in (import '../items.jsonnet').items
]
