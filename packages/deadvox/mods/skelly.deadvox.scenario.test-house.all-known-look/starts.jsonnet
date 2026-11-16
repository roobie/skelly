local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
// The kit's recipes already include the crowbar repair, which stays out of the default Crafting list because no
// crowbar stands in reach, and the sharpening recipes, which start from a held blade. The plank repair is a world
// repair that starts from the damaged wall. All three show in the crafting tab's all-known view
// (`packages/deadvox/DESIGN.md`, "Repair ceiling").
{
  starts: [kit.fixture + kit.notSiteDefault + {
    id: 'allknownlook',
    site: 'testHouse',
    startTimeGameTimeOfDay: kit.day.noonGameTimeOfDay,
    recipes: kit.common.recipes + ['repair_planks'],
  }],
}
