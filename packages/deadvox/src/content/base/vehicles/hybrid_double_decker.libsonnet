// The double decker with a motor on its rear axle and a pack on the roof, because its low floor leaves no room beneath.
local powertrain = import '../vehicle-powertrain.libsonnet';
local s = import 'packages/thing-authoring-tool/vehicles/double_decker.spec.libsonnet';
{
  items: [],
  blueprint: powertrain.hybrid((import 'double_decker.libsonnet').blueprint, {
    id: 'hybrid_double_decker',
    name: 'Hybrid double decker',
    motor: { part: 'traction_motor_large', at: [-1.7, 0.24, 0], on: ['rear_axle'] },
    inverter: { part: 'inverter_large', at: [-3.4, 0.46, -0.46] },
    pack: { part: 'traction_pack_roof_small', at: [0, s.roof, 0] },
  }),
}
