// The refuse truck with a motor behind its gearbox and a pack under the rails for stop-start collection rounds. The
// exhaust becomes a small stack behind the cab, because the pack and motor fill the height the long pipe runs at.
local kit = import '../vehicle-kit.libsonnet';
local powertrain = import '../vehicle-powertrain.libsonnet';
local t = import 'packages/thing-authoring-tool/vehicles/truck-cab.libsonnet';
local s = t.spec(import 'packages/thing-authoring-tool/vehicles/refuse_truck.spec.libsonnet');
local derived = powertrain.hybrid((import 'refuse_truck.libsonnet').blueprint, {
  id: 'hybrid_refuse_truck',
  name: 'Hybrid refuse truck',
  motor: { part: 'traction_motor_large', at: [1.89, s.railBottom + 0.02 - 0.25, 0], on: ['gearbox', 'chassis'] },
  inverter: { part: 'inverter_large', at: [1.03, s.railBottom - 0.24, 0.9], on: ['chassis'] },
  pack: { part: 'traction_pack_van', at: [0.33, s.railBottom - 0.16, 0] },
});
{
  items: [],
  blueprint: derived {
    fittings: [f for f in derived.fittings if f.id != 'exhaust'] + [
      kit.fitting('exhaust', 'exhaust_stack_small', [s.cabBack - 0.1, s.railTop, 0.52], ['engine', 'chassis']),
    ],
  },
}
