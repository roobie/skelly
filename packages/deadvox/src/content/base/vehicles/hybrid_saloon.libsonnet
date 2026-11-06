// The saloon with a motor beside its engine and a small pack under the boot floor.
local kit = import '../vehicle-kit.libsonnet';
local powertrain = import '../vehicle-powertrain.libsonnet';
local s = import 'packages/thing-authoring-tool/vehicles/saloon.spec.libsonnet';
{
  items: [kit.part('hybrid_saloon_front_bumper', 'Hybrid saloon front bumper', kit.pileSize, ['protection'])],
  blueprint: powertrain.hybrid((import 'saloon.libsonnet').blueprint, {
    id: 'hybrid_saloon',
    name: 'Hybrid saloon',
    over: { front_bumper: { part: 'hybrid_saloon_front_bumper' } },
    port: { part: 'charge_port', at: [s.rearAxle - 0.15, s.archTop + 0.05, s.side] },
    fittings: kit.pair('badge', 'hybrid_badge', [s.cowl - 0.25, s.waist - 0.2, s.side], kit.on(['shell']))
              + [kit.fitting('rear_badge', 'hybrid_badge_rear', [s.rear + 0.02, 0.8, 0.4], ['shell'])],
    motor: { part: 'traction_motor_car', at: [s.frontAxle - 0.02, 0.3, 0.38], on: ['engine'] },
    inverter: { part: 'inverter_car', at: [s.frontAxle - 0.05, 0.66, 0.38], on: ['motor'] },
    pack: { part: 'hybrid_pack', at: [s.rearAxle - 0.5, 0.2, 0] },
  }),
}
