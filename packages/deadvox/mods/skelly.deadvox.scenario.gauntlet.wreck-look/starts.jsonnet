local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
// The wreck look's start: on the fixture street at noon, every skill at its top, no gear to check but eyes.
{
  starts: [kit.fixture + kit.notSiteDefault + {
    id: 'gauntletwrecklook',
    site: 'gauntletStreetWrecks',
    startTimeGameTimeOfDay: kit.day.noonGameTimeOfDay,
  }],
}
