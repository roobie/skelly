// The SUV with a motor ahead of its engine and a small pack under the rear floor, beside the prop shaft.
local kit = import '../vehicle-kit.libsonnet';
local powertrain = import '../vehicle-powertrain.libsonnet';
local s = import 'packages/thing-authoring-tool/vehicles/suv.spec.libsonnet';
{
  items: [kit.part('hybrid_suv_front_bumper', 'Hybrid SUV front bumper', kit.pileSize, ['protection'])],
  blueprint: powertrain.hybrid((import 'suv.libsonnet').blueprint, {
    id: 'hybrid_suv',
    name: 'Hybrid SUV',
    over: { front_bumper: { part: 'hybrid_suv_front_bumper' } },
    port: { part: 'charge_port', at: [s.rearAxle - 0.2, s.archTop + 0.05, s.side] },
    fittings: kit.pair('badge', 'hybrid_badge', [s.cowl - 0.25, s.waist - 0.2, s.side], kit.on(['shell']))
              + [kit.fitting('rear_badge', 'hybrid_badge_rear', [s.rear + 0.05, 1.0, 0.4], ['shell'])],
    motor: { part: 'traction_motor_car', at: [1.8, 0.55, 0], on: ['engine'] },
    inverter: { part: 'inverter_car', at: [1.8, 0.85, 0], on: ['motor'] },
    pack: { part: 'hybrid_pack', at: [-0.4, s.sill, -0.38] },
  }),
}
