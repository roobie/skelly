// The panel van on a battery (`packages/thing-authoring-tool/vehicles/van-body.libsonnet`, `electric`).
local powertrain = import '../vehicle-powertrain.libsonnet';
local van = import 'packages/thing-authoring-tool/vehicles/van-body.libsonnet';
local s = import 'packages/thing-authoring-tool/vehicles/panel_van.spec.libsonnet';
{
  items: [],
  blueprint: van.electric(powertrain, (import 'panel_van.libsonnet').blueprint, s, 'electric_panel_van', 'Electric panel van'),
}
