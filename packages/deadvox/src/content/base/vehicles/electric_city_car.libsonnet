// The city car on a battery: the motor sits where the engine did and the pack lies under the floor pan.
local kit = import '../vehicle-kit.libsonnet';
local powertrain = import '../vehicle-powertrain.libsonnet';
local s = import 'packages/thing-authoring-tool/vehicles/city_car.spec.libsonnet';
{
  items: [kit.part('electric_city_car_front_bumper', 'Electric city car front bumper', kit.pileSize, ['protection'])],
  blueprint: powertrain.electric((import 'city_car.libsonnet').blueprint, {
    id: 'electric_city_car',
    name: 'Electric city car',
    over: { front_bumper: { part: 'electric_city_car_front_bumper' } },
    motor: { part: 'traction_motor_car', at: [s.frontAxle - 0.02, 0.24, 0] },
    inverter: { part: 'inverter_car', at: [s.frontAxle - 0.05, 0.56, 0.05], on: ['motor'] },
    pack: { part: 'traction_pack_car', at: [(s.rearFloorFront + s.cowl) / 2, s.sill, 0] },
    port: { part: 'charge_port', at: [s.rearAxle + 0.05, 0.72, s.side] },
  }),
}
