// The minibus on a battery (`packages/thing-authoring-tool/vehicles/van-body.libsonnet`, `electric`).
local powertrain = import '../vehicle-powertrain.libsonnet';
local van = import 'packages/thing-authoring-tool/vehicles/van-body.libsonnet';
local s = import 'packages/thing-authoring-tool/vehicles/minibus.spec.libsonnet';
{
  items: [],
  blueprint: van.electric(powertrain, (import 'minibus.libsonnet').blueprint, s, 'electric_minibus', 'Electric minibus'),
}
