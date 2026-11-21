local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
local placement = import 'placement.jsonnet';
// The common kit already knows the construction recipes, so the by-eye look can drive the real kit's orders too;
// the fixture's own quick recipes let a browser stage finish a build without waiting on the kit's minutes.
{
  starts: [kit.fixture + kit.notSiteDefault + {
    id: 'placementlook',
    site: 'testHousePlacementLook',
    startTimeGameTimeOfDay: kit.day.noonGameTimeOfDay,
    recipes+: [recipe.id for recipe in placement.recipes],
    kit+: [
      { id: 'placement_planks', item: 'wooden_plank', count: 18, destination: { kind: 'pile', pos: [-20, 42, 32] } },
      { id: 'placement_nails', item: 'nails', count: 100, destination: { kind: 'pile', pos: [-20, 42, 32] } },
      { id: 'placement_hammer', item: 'hammer', destination: { kind: 'pile', pos: [-20, 42, 32] } },
      { id: 'placement_saw', item: 'hand_saw', destination: { kind: 'pile', pos: [-20, 42, 32] } },
    ],
  }],
}
