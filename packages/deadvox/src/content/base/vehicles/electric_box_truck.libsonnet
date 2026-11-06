// The box truck on a battery: the motor drives the prop shafts from behind the old gearbox, two packs hang under the
// rails between the axles and the inverter takes the fuel tank's bracket, with the charge port on its outer face.
// The packs sit toward the near side, clear of the battery box on the far rail.
local powertrain = import '../vehicle-powertrain.libsonnet';
local t = import 'packages/thing-authoring-tool/vehicles/truck-cab.libsonnet';
local kit = import '../vehicle-kit.libsonnet';
local s = t.spec(import 'packages/thing-authoring-tool/vehicles/box_truck.spec.libsonnet');
local derived = powertrain.electric((import 'box_truck.libsonnet').blueprint, {
  id: 'electric_box_truck',
  name: 'Electric box truck',
  motor: { part: 'traction_motor_large', at: [1.55, s.railBottom - 0.25, 0] },
  inverter: { part: 'inverter_large', at: [s.tankX + 0.15, s.tankY, s.side - 0.34] },
  pack: { part: 'traction_pack_van', at: [-0.22, s.railBottom - 0.16, 0.1] },
  port: { part: 'charge_port', at: [s.tankX + 0.15, s.tankY + 0.04, s.side - 0.34 + 0.21], on: ['inverter'] },
});
{
  items: [
    kit.part('electric_box_truck_front_panel', 'Electric box truck front panel', kit.pileSize, ['protection']),
  ],
  blueprint: derived {
    fittings: [
      if f.id == 'front_panel' then f { part: 'electric_box_truck_front_panel' } else f
      for f in derived.fittings
    ] + [
      kit.fitting('pack_lower', 'traction_pack_van', [-0.22, s.railBottom - 0.32, 0.1], ['pack']),
    ],
  },
}
