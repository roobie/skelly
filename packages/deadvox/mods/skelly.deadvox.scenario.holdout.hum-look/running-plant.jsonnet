// The thermal plant's own module without its seeded failure, so the look starts with the plant producing and its hum
// heard, not with a restoration.
local authored = [
  blueprint
  for blueprint in (import 'packages/mods/skelly.electric-power/thermal-plant.jsonnet').partBlueprints
  if blueprint.id == 'turbo_generator'
][0];
{
  partBlueprints: [authored + {
    failure:: null,
    slots: [slot + { failed:: null } for slot in super.slots],
  }],
}
