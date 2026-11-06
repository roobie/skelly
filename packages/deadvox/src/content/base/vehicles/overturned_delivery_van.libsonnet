local kit = import '../vehicle-kit.libsonnet';
local part = kit.part;
local fitting = kit.fitting;
local origin = kit.origin;
local pile = kit.pileSize;
local s = import 'packages/thing-authoring-tool/vehicles/overturned_delivery_van.spec.libsonnet';
local hubAcross = s.across - s.hub;
local seatAcross = s.across - s.floor;
{
  items: [
    part('overturned_delivery_van_chassis', 'Dented delivery van chassis', pile, ['structure']),
    part('overturned_delivery_van_shell', 'Crushed delivery van shell', pile, ['structure', 'protection']),
    part('overturned_delivery_van_bonnet', 'Buckled delivery van bonnet', pile, ['protection']),
    part('overturned_delivery_van_bumper', 'Torn delivery van bumper', pile, ['structure']),
    part('overturned_delivery_van_engine', 'Dead delivery van engine', pile, ['structure']),
    part('overturned_delivery_van_cab_door_sprung', 'Sprung delivery van door', pile, ['protection']),
    part('overturned_delivery_van_cab_door', 'Scraped delivery van door', pile, ['protection']),
    part('overturned_delivery_van_rear_door_upper', 'Drooping delivery van rear door', pile, ['protection']),
    part('overturned_delivery_van_rear_door_lower', 'Fallen delivery van rear door', pile, ['protection']),
    part('overturned_delivery_van_shelving', 'Bent parcel shelving', pile, ['structure']),
    part('overturned_delivery_van_parcels', 'Spilled parcels', pile, ['structure']),
    part('overturned_delivery_van_seat', 'Torn delivery van seat', [6, 6], ['structure']),
    part('overturned_delivery_van_wheel', 'Delivery van wheel', pile, ['structure']),
  ],
  blueprint: {
    id: 'overturned_delivery_van',
    name: 'Overturned delivery van',
    fittings: [
      fitting('shell', 'overturned_delivery_van_shell', origin),
      fitting('chassis', 'overturned_delivery_van_chassis', origin, ['shell']),
      fitting('bonnet', 'overturned_delivery_van_bonnet', origin, ['shell']),
      fitting('bumper', 'overturned_delivery_van_bumper', origin, ['shell']),
      fitting('engine', 'overturned_delivery_van_engine', origin, ['chassis']),
      fitting('cab_door_up', 'overturned_delivery_van_cab_door_sprung', origin, ['shell']),
      fitting('cab_door_road', 'overturned_delivery_van_cab_door', origin, ['shell']),
      fitting('rear_door_upper', 'overturned_delivery_van_rear_door_upper', origin, ['shell']),
      fitting('rear_door_lower', 'overturned_delivery_van_rear_door_lower', origin, ['shell']),
      fitting('shelving', 'overturned_delivery_van_shelving', origin, ['shell']),
      fitting('parcels', 'overturned_delivery_van_parcels', origin),
      fitting('seat_up', 'overturned_delivery_van_seat', [0.75, s.up + 0.5, seatAcross], ['shell']),
      fitting('seat_road', 'overturned_delivery_van_seat', [0.75, s.up - 0.5, seatAcross], ['shell']),
      fitting('wheel_front_up', 'overturned_delivery_van_wheel', [s.frontAxle, s.up + s.wheelZ, hubAcross], ['chassis']),
      fitting('wheel_rear_up', 'overturned_delivery_van_wheel', [s.rearAxle, s.up + s.wheelZ, hubAcross], ['chassis']),
      fitting('wheel_rear_road', 'overturned_delivery_van_wheel', [s.rearAxle, s.up - s.wheelZ, hubAcross], ['chassis']),
      // Sheared off in the roll, it has rolled clear and fallen flat on the road.
      fitting('wheel_loose', 'overturned_delivery_van_wheel', [3.3, 0.11, 1.5]),
    ],
  },
}
