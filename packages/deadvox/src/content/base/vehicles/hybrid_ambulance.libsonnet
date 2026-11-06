// The ambulance with a motor beside its engine and a small pack between the frame rails under the box floor.
local powertrain = import '../vehicle-powertrain.libsonnet';
local s = import 'packages/thing-authoring-tool/vehicles/ambulance.spec.libsonnet';
{
  items: [],
  blueprint: powertrain.hybrid((import 'ambulance.libsonnet').blueprint, {
    id: 'hybrid_ambulance',
    name: 'Hybrid ambulance',
    motor: { part: 'traction_motor_car', at: [s.frontAxle + 0.13, 0.5, -0.45], on: ['engine'] },
    inverter: { part: 'inverter_car', at: [s.frontAxle + 0.13, 0.5, 0.52], on: ['motor'] },
    pack: { part: 'hybrid_pack', at: [-0.35, s.box.panLow - 0.16, 0] },
  }),
}
