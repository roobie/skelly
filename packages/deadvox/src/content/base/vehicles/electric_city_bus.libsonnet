// The city bus on a battery: the motor drives the prop shaft from the old gearbox bay and the pack rides on the roof,
// because a low floor leaves no room beneath it. The engine hatch goes with the engine.
local powertrain = import '../vehicle-powertrain.libsonnet';
local s = import 'packages/thing-authoring-tool/vehicles/city_bus.spec.libsonnet';
{
  items: [],
  blueprint: powertrain.electric((import 'city_bus.libsonnet').blueprint, {
    id: 'electric_city_bus',
    name: 'Electric city bus',
    drop: ['engine', 'gearbox', 'radiator', 'fuel_tank', 'exhaust', 'rear_panel'],
    motor: { part: 'traction_motor_large', at: [-4.0, 0.3, 0] },
    inverter: { part: 'inverter_large', at: [-4.8, 0.32, 0], on: ['motor'] },
    pack: { part: 'traction_pack_roof', at: [1.0, s.roof, 0] },
    port: { part: 'charge_port', at: [-4.8, 0.62, s.side] },
  }),
}
