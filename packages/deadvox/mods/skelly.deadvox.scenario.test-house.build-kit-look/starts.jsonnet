local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
// The build kit by eye: the room in `layouts.jsonnet`, `test_house_build_kit`, stands every built piece around the
// spawn at noon. The common kit already knows the construction and repair recipes, and the fixture's top skills
// mean no recipe refuses for skill.
{
  starts: [kit.fixture + kit.notSiteDefault + {
    id: 'buildkitlook',
    site: 'testHouseBuildKitLook',
    startTimeGameTimeOfDay: kit.day.noonGameTimeOfDay,
  }],
}
