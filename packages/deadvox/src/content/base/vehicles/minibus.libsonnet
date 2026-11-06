// Items and blueprint for the minibus; its panels fit at the origin (`packages/thing-authoring-tool/vehicles/van-body.libsonnet`).
local kit = import '../vehicle-kit.libsonnet';
local van = import 'packages/thing-authoring-tool/vehicles/van-body.libsonnet';
local s = import 'packages/thing-authoring-tool/vehicles/minibus.spec.libsonnet';
local farColumn = -0.46;
local rearRow = s.seatRows[std.length(s.seatRows) - 1];
{
  items: van.items(kit, 'minibus', 'Minibus', s),
  blueprint: {
    id: 'minibus',
    name: 'Minibus',
    // Pairs line the far side so the aisle runs back from the sliding door; the last row spans the body.
    fittings: van.fittings(kit, 'minibus', s) + [
      kit.fitting('seats_' + i, 'bus_seat_pair', [s.seatRows[i], s.floor, farColumn], ['floor'])
      for i in std.range(0, std.length(s.seatRows) - 1)
    ] + [
      kit.fitting('seats_rear', 'bus_seat_pair', [rearRow, s.floor, -farColumn], ['floor']),
    ],
  },
}
